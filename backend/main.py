"""
报销自动化平台 — FastAPI 后端入口。

启动方式:
    cd backend
    python main.py
"""
import json
import os
import uuid
from datetime import datetime
from typing import Optional

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from config import (
    UPLOADS_DIR,
    SUBMISSIONS_DIR,
    MAX_INVOICE_SIZE_MB,
    ALLOWED_INVOICE_TYPES,
    HOST,
    PORT,
)
from database import init_db
from draft_service import save_draft, list_drafts, get_draft, delete_draft
from ocr import get_ocr_engine
from ocr_field_mapping import OCRResult, InvoiceItem
from validator import validate_form, build_form_data
from excel_generator import generate_reimbursement_excel
from packager import create_submission_package

app = FastAPI(
    title="报销自动化平台",
    description="香港中文大学（深圳）学生活动经费报销自动化系统",
    version="1.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs(UPLOADS_DIR, exist_ok=True)
os.makedirs(SUBMISSIONS_DIR, exist_ok=True)


def _validate_file(file: UploadFile, allowed_types: set, max_size_mb: int) -> bytes:
    """校验上传文件，返回文件内容。"""
    if file.content_type and file.content_type not in allowed_types:
        raise HTTPException(400, f"不支持的文件类型: {file.content_type}")
    content = file.file.read()
    size_mb = len(content) / (1024 * 1024)
    if size_mb > max_size_mb:
        raise HTTPException(400, f"文件过大 ({size_mb:.1f}MB)，限制 {max_size_mb}MB")
    file.file.seek(0)
    return content


def _save_upload(content: bytes, filename: str, subdir: str) -> str:
    """保存上传文件，返回文件路径。"""
    safe_name = f"{uuid.uuid4().hex}_{filename}"
    filepath = os.path.join(UPLOADS_DIR, subdir, safe_name)
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    with open(filepath, "wb") as f:
        f.write(content)
    return filepath


def _ocr_result_to_dict(result: OCRResult) -> dict:
    """将 OCRResult 转为可序列化的字典。"""
    return {
        "buyer_name": result.buyer_name,
        "buyer_tax_id": result.buyer_tax_id,
        "buyer_name_valid": result.buyer_name_valid,
        "buyer_tax_id_valid": result.buyer_tax_id_valid,
        "invoice_date": result.invoice_date,
        "invoice_total": result.invoice_total,
        "items": [
            {
                "name": item.name,
                "unit_price": item.unit_price,
                "quantity": item.quantity,
                "amount": item.amount,
                "tax_amount": item.tax_amount,
                "total_with_tax": item.total_with_tax,
            }
            for item in result.items
        ],
        "handwritten_activity_name": result.handwritten_activity_name,
        "handwritten_org_name": result.handwritten_org_name,
        "handwritten_item_name": result.handwritten_item_name,
        "handwritten_amount": result.handwritten_amount,
    }


# ============================================================
# API 路由
# ============================================================

@app.post("/api/v1/ocr/invoice")
async def ocr_invoice(file: UploadFile = File(...)):
    """
    上传单张发票，返回OCR识别结果。
    """
    content = await file.read()
    engine = get_ocr_engine()

    try:
        result = engine.recognize_invoice(content, file.filename or "")
    except Exception as e:
        raise HTTPException(500, f"OCR识别失败: {str(e)}")

    filepath = _save_upload(content, file.filename or "invoice", "invoices")

    return {
        "success": True,
        "data": _ocr_result_to_dict(result),
        "warnings": result.warnings,
        "errors": result.errors,
        "invoice_file_path": filepath,
        "engine": type(engine).__name__,
    }


@app.post("/api/v1/ocr/invoices")
async def ocr_invoices(files: list[UploadFile] = File(...)):
    """
    批量上传多张发票，返回所有发票的OCR识别结果。

    POST /api/v1/ocr/invoices
    请求: multipart/form-data, field: files (多个文件)
    返回: {success, data: [OCRResult], saved_paths: [...]}
    """
    engine = get_ocr_engine()
    results = []
    saved_paths = []

    for file in files:
        content = await file.read()
        try:
            result = engine.recognize_invoice(content, file.filename or "")
        except Exception as e:
            results.append({
                "filename": file.filename,
                "success": False,
                "error": str(e),
                "data": None,
            })
            continue

        filepath = _save_upload(content, file.filename or "invoice", "invoices")
        saved_paths.append(filepath)

        results.append({
            "filename": file.filename,
            "success": True,
            "data": _ocr_result_to_dict(result),
            "warnings": result.warnings,
            "errors": result.errors,
        })

    return {
        "success": True,
        "results": results,
        "saved_paths": saved_paths,
        "engine": type(engine).__name__,
    }


@app.post("/api/v1/validate")
async def validate(data: dict):
    """
    校验报销表数据完整性（支持多发票）。
    """
    form = build_form_data(data)
    result = validate_form(form)

    return {
        "success": True,
        "passed": result.passed,
        "errors": result.errors,
    }


@app.post("/api/v1/generate")
async def generate_excel(data: dict):
    """
    生成填好的报销表Excel文件（支持多发票）。
    """
    form = build_form_data(data)

    try:
        filepath = generate_reimbursement_excel(form, SUBMISSIONS_DIR)
    except Exception as e:
        raise HTTPException(500, f"Excel生成失败: {str(e)}")

    return FileResponse(
        filepath,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename=os.path.basename(filepath),
    )


@app.post("/api/v1/submit")
async def submit_package(
    activity_name: str = Form(""),
    org_name: str = Form(""),
    activity_end_date: str = Form(""),
    reimbursement_date: str = Form(""),
    invoices_json: str = Form("[]"),
    actual_total: float = Form(0.0),
    finance_officer: str = Form(""),
    activity_leader_opinion: str = Form(""),
    alipay_account: str = Form(""),
    invoice_files: list[UploadFile] = File(default_factory=list),
    evidence_files: list[UploadFile] = File(default_factory=list),
):
    """
    提交完整报销申请包（支持多发票）。
    """
    invoices_data = json.loads(invoices_json)

    form = build_form_data({
        "activity_name": activity_name,
        "org_name": org_name,
        "activity_end_date": activity_end_date,
        "reimbursement_date": reimbursement_date,
        "invoices": invoices_data,
        "actual_total": actual_total,
        "finance_officer": finance_officer,
        "activity_leader_opinion": activity_leader_opinion,
        "alipay_account": alipay_account,
    })

    # 先校验
    validation = validate_form(form)
    if not validation.passed:
        raise HTTPException(400, detail={
            "message": "表单校验未通过",
            "errors": validation.errors,
        })

    # 保存上传文件
    saved_invoice_paths = []
    for f in invoice_files:
        if f.filename:
            content = await f.read()
            fpath = _save_upload(content, f.filename, "invoices")
            saved_invoice_paths.append(fpath)

    saved_evidence_paths = []
    for f in evidence_files:
        if f.filename:
            content = await f.read()
            fpath = _save_upload(content, f.filename, "evidence")
            saved_evidence_paths.append(fpath)

    # 生成Excel
    try:
        excel_path = generate_reimbursement_excel(form, SUBMISSIONS_DIR)
    except Exception as e:
        raise HTTPException(500, f"Excel生成失败: {str(e)}")

    # 打包
    try:
        zip_path = create_submission_package(
            excel_path=excel_path,
            invoice_files=saved_invoice_paths,
            evidence_files=saved_evidence_paths,
            output_dir=SUBMISSIONS_DIR,
            activity_name=activity_name,
        )
    except Exception as e:
        raise HTTPException(500, f"打包失败: {str(e)}")

    return {
        "success": True,
        "message": "报销申请已成功提交",
        "zip_path": zip_path,
        "zip_filename": os.path.basename(zip_path),
    }


@app.get("/api/v1/health")
async def health():
    return {"status": "ok", "engine": type(get_ocr_engine()).__name__}


# ---- 草稿 API ----

@app.post("/api/v1/drafts")
async def api_save_draft(data: dict):
    """保存草稿。"""
    draft_id = data.get("draft_id")
    did = save_draft(
        activity_name=data.get("activity_name", ""),
        org_name=data.get("org_name", ""),
        current_step=data.get("current_step", 1),
        form_data=data.get("form_data", {}),
        ocr_results=data.get("ocr_results", []),
        draft_id=draft_id,
    )
    return {"success": True, "draft_id": did}


@app.get("/api/v1/drafts")
async def api_list_drafts():
    """列出所有草稿摘要。"""
    drafts = list_drafts()
    return {"success": True, "drafts": drafts}


@app.get("/api/v1/drafts/{draft_id}")
async def api_get_draft(draft_id: str):
    """获取单条草稿完整数据。"""
    draft = get_draft(draft_id)
    if not draft:
        raise HTTPException(404, "草稿不存在")
    return {"success": True, "draft": draft}


@app.delete("/api/v1/drafts/{draft_id}")
async def api_delete_draft(draft_id: str):
    """删除草稿。"""
    ok = delete_draft(draft_id)
    if not ok:
        raise HTTPException(404, "草稿不存在")
    return {"success": True}


# ---- 历史提交 ----

@app.get("/api/v1/submissions")
async def api_list_submissions():
    """列出 submissions 目录下的 ZIP 文件。"""
    files = []
    if os.path.isdir(SUBMISSIONS_DIR):
        for fname in os.listdir(SUBMISSIONS_DIR):
            if not fname.endswith(".zip"):
                continue
            fpath = os.path.join(SUBMISSIONS_DIR, fname)
            stat = os.stat(fpath)
            files.append({
                "filename": fname,
                "size": stat.st_size,
                "modified": datetime.fromtimestamp(stat.st_mtime).isoformat(),
            })
    files.sort(key=lambda f: f["modified"], reverse=True)
    return {"success": True, "submissions": files}


@app.get("/api/v1/submissions/download/{filename}")
async def api_download_submission(filename: str):
    """下载指定的 ZIP 文件。"""
    fpath = os.path.join(SUBMISSIONS_DIR, filename)
    if not os.path.isfile(fpath) or not filename.endswith(".zip"):
        raise HTTPException(404, "文件不存在")
    return FileResponse(
        fpath,
        media_type="application/zip",
        filename=filename,
    )


# ---- 启动入口 ----

@app.on_event("startup")
async def startup():
    init_db()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=HOST, port=PORT)
