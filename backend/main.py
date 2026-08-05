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
    existing_invoice_paths: str = Form("[]"),
    existing_evidence_paths: str = Form("[]"),
    user_email: str = Form(""),
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

    # 保存上传文件（已有路径 + 新上传）
    saved_invoice_paths = json.loads(existing_invoice_paths) if existing_invoice_paths else []
    for f in invoice_files:
        if f.filename:
            content = await f.read()
            saved_invoice_paths.append(_save_upload(content, f.filename, "invoices"))

    saved_evidence_paths = json.loads(existing_evidence_paths) if existing_evidence_paths else []
    for f in evidence_files:
        if f.filename:
            content = await f.read()
            saved_evidence_paths.append(_save_upload(content, f.filename, "evidence"))

    # 对每张发票拼接信息条
    from invoice_annotator import annotate_invoice
    annotated_paths = []
    for idx, inv_path in enumerate(saved_invoice_paths):
        try:
            inv_data = invoices_data[idx] if idx < len(invoices_data) else {}
            inv_items = inv_data.get("items", [])
            item_names = "、".join(it.get("name", "") for it in inv_items if it.get("name"))
            inv_amount = inv_data.get("reimbursement_amount", 0)
            annotated = annotate_invoice(
                inv_path,
                org_name or "",
                activity_name or "",
                item_names or "未识别",
                f"¥{inv_amount:.2f}",
                SUBMISSIONS_DIR,
            )
            annotated_paths.append(annotated)
        except Exception as e:
            print(f"[标注失败] {inv_path}: {e}")
            annotated_paths.append(inv_path)

    # 生成Excel
    try:
        excel_path = generate_reimbursement_excel(form, SUBMISSIONS_DIR)
    except Exception as e:
        raise HTTPException(500, f"Excel生成失败: {str(e)}")

    # 打包（使用标注后的发票）
    try:
        zip_path = create_submission_package(
            excel_path=excel_path,
            invoice_files=annotated_paths,
            evidence_files=saved_evidence_paths,
            output_dir=SUBMISSIONS_DIR,
            activity_name=activity_name,
        )
    except Exception as e:
        raise HTTPException(500, f"打包失败: {str(e)}")

    # 保存完整表单数据 + 文件路径到数据库（用于打回后重新编辑）
    from database import get_connection as _get_conn
    full_form = {
        "activity_name": activity_name, "org_name": org_name,
        "activity_end_date": activity_end_date, "reimbursement_date": reimbursement_date,
        "invoices": invoices_data, "actual_total": actual_total,
        "finance_officer": finance_officer, "activity_leader_opinion": activity_leader_opinion,
        "alipay_account": alipay_account,
    }
    _conn = _get_conn()
    try:
        with _conn.cursor() as _cur:
            _cur.execute(
                "INSERT INTO submissions_data (zip_filename, user_email, form_data) VALUES (%s, %s, %s)",
                (os.path.basename(zip_path), user_email or "",
                 json.dumps({"form": full_form, "invoice_paths": saved_invoice_paths, "evidence_paths": saved_evidence_paths}, ensure_ascii=False)),
            )
        _conn.commit()
    finally:
        _conn.close()

    return {
        "success": True,
        "message": "报销申请已成功提交",
        "zip_path": zip_path,
        "zip_filename": os.path.basename(zip_path),
    }


@app.get("/api/v1/health")
async def health():
    return {"status": "ok", "engine": type(get_ocr_engine()).__name__}


# ---- 认证 API ----

@app.post("/api/v1/auth/register")
async def api_register(data: dict):
    """注册新用户。"""
    from user_service import register
    result = register(data.get("email", ""), data.get("password", ""))
    if not result["success"]:
        raise HTTPException(400, result["error"])
    return result


@app.post("/api/v1/auth/login")
async def api_login(data: dict):
    """登录。"""
    from user_service import login
    result = login(data.get("email", ""), data.get("password", ""))
    if not result["success"]:
        raise HTTPException(401, result["error"])
    return result


@app.get("/api/v1/auth/me")
async def api_me(token: str = ""):
    """获取当前用户信息。"""
    from auth import decode_token
    payload = decode_token(token)
    if not payload:
        raise HTTPException(401, "无效的 token")
    from user_service import get_user_by_id
    user = get_user_by_id(payload["user_id"])
    if not user:
        raise HTTPException(404, "用户不存在")
    return {"success": True, "user": user}


# ---- 审核 API ----

@app.get("/api/v1/review/submissions")
async def api_review_list():
    """审核员查看所有提交的 ZIP + 审核状态。"""
    from review_service import list_all_reviews, get_review_status
    import os as _os
    from config import SUBMISSIONS_DIR
    from datetime import datetime as _dt

    # 获取所有 ZIP 文件
    files = []
    if _os.path.isdir(SUBMISSIONS_DIR):
        for fname in _os.listdir(SUBMISSIONS_DIR):
            if not fname.endswith(".zip"):
                continue
            fpath = _os.path.join(SUBMISSIONS_DIR, fname)
            stat = _os.stat(fpath)
            files.append({
                "filename": fname,
                "size": stat.st_size,
                "modified": _dt.fromtimestamp(stat.st_mtime).isoformat(),
            })

    # 关联审核状态
    reviews = {r["submission_zip"]: r for r in list_all_reviews()}
    for f in files:
        review = reviews.get(f["filename"], {})
        f["status"] = review.get("status", "pending")
        f["reviewer_email"] = review.get("reviewer_email", "")
        f["reviewed_at"] = review.get("created_at", "")

    files.sort(key=lambda f: f["modified"], reverse=True)
    return {"success": True, "submissions": files}


@app.get("/api/v1/review/annotations/{filename}")
async def api_get_annotations(filename: str):
    """获取某个 ZIP 的审核批注详情。"""
    from review_service import get_review_status
    return {"success": True, "review": get_review_status(filename)}


@app.post("/api/v1/review/approve")
async def api_approve(data: dict):
    """审核通过。"""
    from review_service import approve_submission
    result = approve_submission(
        data.get("submission_zip", ""),
        data.get("reviewer_email", ""),
    )
    return result


@app.post("/api/v1/review/reject")
async def api_reject(data: dict):
    """打回并批注。"""
    from review_service import reject_submission
    result = reject_submission(
        data.get("submission_zip", ""),
        data.get("reviewer_email", ""),
        data.get("invoice_comment", ""),
        data.get("evidence_comment", ""),
        data.get("form_comment", ""),
    )
    return result


# ---- 审核员申请 API ----

@app.post("/api/v1/reviewer/apply")
async def api_apply_reviewer(data: dict):
    """提交审核员申请。"""
    from application_service import submit_application
    result = submit_application(data.get("email", ""), data.get("reason", ""))
    if not result["success"]:
        raise HTTPException(400, "申请失败")
    return result


@app.get("/api/v1/reviewer/applications")
async def api_list_applications():
    """列出所有审核员申请。"""
    from application_service import list_applications
    return {"success": True, "applications": list_applications()}


@app.post("/api/v1/reviewer/applications/{app_id}/approve")
async def api_approve_application(app_id: int):
    """批准审核员申请。"""
    from application_service import approve_application
    result = approve_application(app_id)
    if not result.get("success"):
        raise HTTPException(400, result.get("error", "操作失败"))
    return result


# ---- 草稿 API ----

@app.post("/api/v1/drafts")
async def api_save_draft(data: dict):
    """保存草稿。"""
    did = save_draft(
        activity_name=data.get("activity_name", ""),
        org_name=data.get("org_name", ""),
        current_step=data.get("current_step", 1),
        form_data=data.get("form_data", {}),
        ocr_results=data.get("ocr_results", []),
        user_email=data.get("user_email", ""),
        draft_id=data.get("draft_id"),
    )
    return {"success": True, "draft_id": did}


@app.get("/api/v1/drafts")
async def api_list_drafts(user_email: str = ""):
    """列出草稿（按用户邮箱过滤）。"""
    return {"success": True, "drafts": list_drafts(user_email)}


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


# ---- 提交数据查询（用于打回后重新编辑）----

@app.get("/api/v1/submission-data/{filename}")
async def api_get_submission_data(filename: str):
    """获取某次提交的原始表单数据 + 文件路径。"""
    from database import get_connection as _get_conn
    _conn = _get_conn()
    try:
        with _conn.cursor() as _cur:
            _cur.execute(
                "SELECT form_data FROM submissions_data WHERE zip_filename = %s ORDER BY created_at DESC LIMIT 1",
                (filename,),
            )
            row = _cur.fetchone()
            if not row:
                raise HTTPException(404, "未找到提交数据")
            data = row[0] if isinstance(row[0], dict) else json.loads(row[0])
            result: dict = {"success": True}
            if "form" in data:
                result["form_data"] = data["form"]
                # 将服务端文件路径转为可访问的 URL
                ipaths = data.get("invoice_paths", [])
                epaths = data.get("evidence_paths", [])
                result["invoice_urls"] = []
                result["invoice_paths"] = []
                result["evidence_urls"] = []
                result["evidence_paths"] = []
                for p in ipaths:
                    if os.path.isfile(p):
                        result["invoice_paths"].append(p)
                        rel = os.path.relpath(p, UPLOADS_DIR).replace("\\", "/")
                        result["invoice_urls"].append(f"/api/v1/uploads/{rel}")
                for p in epaths:
                    if os.path.isfile(p):
                        result["evidence_paths"].append(p)
                        rel = os.path.relpath(p, UPLOADS_DIR).replace("\\", "/")
                        result["evidence_urls"].append(f"/api/v1/uploads/{rel}")
            else:
                result["form_data"] = data
                result["invoice_urls"] = []
                result["invoice_paths"] = []
                result["evidence_urls"] = []
                result["evidence_paths"] = []
            return result
    finally:
        _conn.close()


@app.get("/api/v1/uploads/{subdir}/{filename}")
async def api_serve_upload(subdir: str, filename: str):
    """提供已上传文件的访问。"""
    fpath = os.path.join(UPLOADS_DIR, subdir, filename)
    if not os.path.isfile(fpath):
        raise HTTPException(404, "文件不存在")
    import mimetypes
    mime, _ = mimetypes.guess_type(filename)
    return FileResponse(fpath, media_type=mime or "application/octet-stream")


# ---- 历史提交 ----

@app.get("/api/v1/submissions")
async def api_list_submissions(user_email: str = ""):
    """列出 submissions 目录下的 ZIP 文件（成员只看自己的）。"""
    from database import get_connection as _get_conn
    # 获取该用户的 ZIP 列表（成员只看自己的）
    user_zips = set()
    _conn = _get_conn()
    try:
        with _conn.cursor() as _cur:
            if user_email:
                _cur.execute(
                    "SELECT zip_filename FROM submissions_data WHERE user_email = %s",
                    (user_email,))
                user_zips = {r[0] for r in _cur.fetchall()}
            # 无邮箱 = 返回空列表（成员端必须登录）
    finally:
        _conn.close()

    files = []
    if os.path.isdir(SUBMISSIONS_DIR):
        for fname in os.listdir(SUBMISSIONS_DIR):
            if not fname.endswith(".zip"):
                continue
            if fname not in user_zips:
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


@app.get("/api/v1/submissions/preview/{filename}")
async def api_preview_submission(filename: str):
    """
    解压 ZIP 并返回文件内容供审核员在线预览。
    返回发票图片、活动凭证图片的 base64，以及报销表 Excel 的下载链接。
    """
    import zipfile, base64 as b64

    fpath = os.path.join(SUBMISSIONS_DIR, filename)
    if not os.path.isfile(fpath) or not filename.endswith(".zip"):
        raise HTTPException(404, "文件不存在")

    invoices = []
    evidences = []
    form = None

    with zipfile.ZipFile(fpath, "r") as zf:
        for info in zf.infolist():
            if info.is_dir():
                continue
            data = zf.read(info.filename)
            name = os.path.basename(info.filename)
            ext = os.path.splitext(name)[1].lower()

            if "发票" in info.filename:
                mime = "image/png" if ext in (".png",) else "image/jpeg"
                if ext == ".pdf":
                    mime = "application/pdf"
                invoices.append({
                    "name": name,
                    "data_url": f"data:{mime};base64,{b64.b64encode(data).decode()}",
                })
            elif "凭证" in info.filename:
                mime = "image/png" if ext in (".png",) else "image/jpeg"
                evidences.append({
                    "name": name,
                    "data_url": f"data:{mime};base64,{b64.b64encode(data).decode()}",
                })
            elif "报销表" in info.filename:
                form = {
                    "name": name,
                    "download_url": f"/api/v1/submissions/download/{filename}",
                }

    return {
        "success": True,
        "invoices": invoices,
        "evidences": evidences,
        "form": form,
    }


# ---- 启动入口 ----

@app.on_event("startup")
async def startup():
    init_db()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=HOST, port=PORT)
