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

import psycopg2

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from config import (
    UPLOADS_DIR,
    SUBMISSIONS_DIR,
    HOST,
    PORT,
)
from database import init_db
from reimbursement_types import (
    REIMBURSEMENT_TYPES,
    TYPE_MATERIALS,
    material_cfg,
)
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


def _validate_file(file: UploadFile, cfg: dict) -> bytes:
    """按材料配置校验上传文件（扩展名 + 大小），返回文件内容。"""
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in cfg["accept_exts"]:
        raise HTTPException(400, f"{cfg['label']}不支持的文件类型: {ext}")
    content = file.file.read()
    size_mb = len(content) / (1024 * 1024)
    if size_mb > cfg["max_size_mb"]:
        raise HTTPException(400, f"文件过大 ({size_mb:.1f}MB)，限制 {cfg['max_size_mb']}MB")
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


def _strip_pdf_encryption(content: bytes) -> bytes:
    """移除 PDF 的所有者密码加密（如保险公司电子保单，用户密码为空）。

    浏览器审核端对带权限限制的 PDF 会显示受限提示，解密后即为普通 PDF。
    真正需要密码才能打开的 PDF 解密失败时返回原内容。
    """
    if not content.startswith(b"%PDF") or b"/Encrypt" not in content:
        return content
    try:
        import io as _io
        from pypdf import PdfReader, PdfWriter
        reader = PdfReader(_io.BytesIO(content))
        if not reader.is_encrypted or not reader.decrypt(""):
            return content
        writer = PdfWriter()
        for page in reader.pages:
            writer.add_page(page)
        buf = _io.BytesIO()
        writer.write(buf)
        return buf.getvalue()
    except Exception:
        return content


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
    type: str = Form("vat"),
    previous_zip: str = Form(""),
    activity_name: str = Form(""),
    org_name: str = Form(""),
    activity_end_date: str = Form(""),
    reimbursement_date: str = Form(""),
    invoices_json: str = Form("[]"),
    actual_total: float = Form(0.0),
    finance_officer: str = Form(""),
    activity_leader_opinion: str = Form(""),
    alipay_account: str = Form(""),
    invoices_files: list[UploadFile] = File(default_factory=list),
    evidence_files: list[UploadFile] = File(default_factory=list),
    policy_files: list[UploadFile] = File(default_factory=list),
    rider_ids_files: list[UploadFile] = File(default_factory=list),
    itinerary_files: list[UploadFile] = File(default_factory=list),
    payments_files: list[UploadFile] = File(default_factory=list),
    existing_invoices_paths: str = Form("[]"),
    existing_evidence_paths: str = Form("[]"),
    existing_policy_paths: str = Form("[]"),
    existing_rider_ids_paths: str = Form("[]"),
    existing_itinerary_paths: str = Form("[]"),
    existing_payments_paths: str = Form("[]"),
    user_email: str = Form(""),
):
    """
    提交完整报销申请包（支持多发票与多种报销类型）。
    """
    invoices_data = json.loads(invoices_json)

    form = build_form_data({
        "type": type,
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

    # 保存上传文件（已有路径 + 新上传），按类型校验材料
    # 文件校验只作用于新材料与新增类型专属规则；增值税的发票/活动凭证保持现状零校验
    if type not in REIMBURSEMENT_TYPES:
        raise HTTPException(400, f"未知报销类型: {type}")

    grouped_new = {
        "invoices": invoices_files,
        "evidence": evidence_files,
        "policy": policy_files,
        "rider_ids": rider_ids_files,
        "itinerary": itinerary_files,
        "payments": payments_files,
    }
    grouped_existing = {
        "invoices": json.loads(existing_invoices_paths or "[]"),
        "evidence": json.loads(existing_evidence_paths or "[]"),
        "policy": json.loads(existing_policy_paths or "[]"),
        "rider_ids": json.loads(existing_rider_ids_paths or "[]"),
        "itinerary": json.loads(existing_itinerary_paths or "[]"),
        "payments": json.loads(existing_payments_paths or "[]"),
    }
    NEW_MATERIAL_KEYS = {"policy", "rider_ids", "itinerary", "payments"}

    material_paths = {}
    for key in TYPE_MATERIALS[type]:
        cfg = material_cfg(type, key)
        existing = grouped_existing.get(key, [])
        new_files = grouped_new.get(key, [])
        total = len(existing) + len(new_files)

        # 新材料：必传张数 + 上限校验（逐文件校验在保存时进行）
        if key in NEW_MATERIAL_KEYS:
            if total < cfg["min_count"]:
                raise HTTPException(400, f"{cfg['label']}至少上传 {cfg['min_count']} 张")
            if cfg["max_count"] is not None and total > cfg["max_count"]:
                raise HTTPException(400, f"{cfg['label']}最多上传 {cfg['max_count']} 张")
        # 发票：仅新增类型专属规则（增值税/保险保持现状）
        elif key == "invoices":
            if type == "bulk" and total > cfg["max_count"]:
                raise HTTPException(400, f"大量发票报销最多上传 {cfg['max_count']} 张发票")
            if type == "travel" and total != len(invoices_data):
                raise HTTPException(400, f"票据区块数({len(invoices_data)})与票据文件数({total})不一致，请逐一对应")

        paths = list(existing)
        for f in new_files:
            if f.filename:
                if key in NEW_MATERIAL_KEYS:
                    content = _validate_file(f, cfg)
                else:
                    content = await f.read()
                # 带权限限制的 PDF（如电子保单）自动解密，避免审核端受限提示
                if f.filename.lower().endswith(".pdf"):
                    content = _strip_pdf_encryption(content)
                paths.append(_save_upload(content, f.filename, cfg["upload_subdir"]))
        material_paths[key] = paths

    # 对每张发票拼接信息条
    from invoice_annotator import annotate_invoice
    annotated_paths = []
    for idx, inv_path in enumerate(material_paths["invoices"]):
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
            material_groups={**material_paths, "invoices": annotated_paths},
            output_dir=SUBMISSIONS_DIR,
            activity_name=activity_name,
        )
    except Exception as e:
        raise HTTPException(500, f"打包失败: {str(e)}")

    # 保存完整表单数据 + 文件路径到数据库（用于打回后重新编辑）
    # 重传关联：打回重传时前端携带旧 ZIP 文件名（previous_zip）→ 新行 parent_id=旧 id、
    # status='resubmitted'；查不到旧单（如草稿残留过期 previous_zip）则按普通 pending 提交
    full_form = {
        "type": type,
        "activity_name": activity_name, "org_name": org_name,
        "activity_end_date": activity_end_date, "reimbursement_date": reimbursement_date,
        "invoices": invoices_data, "actual_total": actual_total,
        "finance_officer": finance_officer, "activity_leader_opinion": activity_leader_opinion,
        "alipay_account": alipay_account,
    }
    zip_name = os.path.basename(zip_path)
    from database import get_connection as _get_conn
    _conn = _get_conn()
    try:
        with _conn.cursor() as _cur:
            parent_id = None
            if previous_zip:
                _cur.execute("SELECT id FROM submissions WHERE zip_filename = %s", (previous_zip,))
                row = _cur.fetchone()
                parent_id = row[0] if row else None
            _cur.execute(
                "INSERT INTO submissions (zip_filename, user_email, reimb_type, status, activity_name, parent_id, form_data) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s)",
                (zip_name, user_email or "", type,
                 "resubmitted" if parent_id is not None else "pending",
                 activity_name, parent_id,
                 json.dumps({"form": full_form, "invoice_paths": material_paths.get("invoices", []), "evidence_paths": material_paths.get("evidence", []), "material_paths": material_paths}, ensure_ascii=False)),
            )
        _conn.commit()
    except psycopg2.errors.UniqueViolation:
        # 极低概率：packager 已加随机段，UNIQUE 冲突时清理刚生成的 ZIP 并提示重试
        _conn.rollback()
        try:
            os.remove(zip_path)
        except OSError:
            pass
        raise HTTPException(409, "提交冲突，请重试")
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


# ---- 成员统计 ----

@app.get("/api/v1/member/stats")
async def api_member_stats(user_email: str = ""):
    """成员仪表盘统计：历史提交总数、待审核数（含重审）、已通过数。"""
    from database import get_connection as _get_conn
    _conn = _get_conn()
    stats = {"monthly": 0, "pending": 0, "approved": 0}
    try:
        with _conn.cursor() as _cur:
            if user_email:
                _cur.execute("""
                    SELECT COUNT(*),
                           COUNT(*) FILTER (WHERE status IN ('pending', 'resubmitted')),
                           COUNT(*) FILTER (WHERE status = 'approved')
                    FROM submissions WHERE user_email = %s
                """, (user_email,))
                row = _cur.fetchone()
                stats = {"monthly": row[0], "pending": row[1], "approved": row[2]}
    finally:
        _conn.close()
    return {"success": True, "stats": stats}


# ---- 审核 API ----

@app.get("/api/v1/review/stats")
async def api_review_stats():
    """审核仪表盘统计数据（以 submissions 行集为准）。"""
    from database import get_connection as _get_conn
    _conn = _get_conn()
    stats = {"pending": 0, "approved": 0, "rejected": 0, "resubmitted": 0}
    try:
        with _conn.cursor() as _cur:
            _cur.execute("SELECT status, COUNT(*) FROM submissions GROUP BY status")
            for status, cnt in _cur.fetchall():
                if status in stats:
                    stats[status] = cnt
    finally:
        _conn.close()
    return {"success": True, "stats": stats}


@app.get("/api/v1/review/submissions")
async def api_review_list():
    """审核员查看所有提交 + 审核状态（以 submissions 行集为准，文件缺失如实标记）。"""
    from database import get_connection as _get_conn
    _conn = _get_conn()
    files = []
    try:
        with _conn.cursor() as _cur:
            _cur.execute("""
                SELECT s.id, s.zip_filename, s.status, s.reimb_type, s.created_at,
                       ann.reviewer_email, ann.created_at AS reviewed_at
                FROM submissions s
                LEFT JOIN LATERAL (
                    SELECT reviewer_email, created_at FROM review_annotations ra
                    WHERE ra.submission_id = s.id ORDER BY ra.id DESC LIMIT 1
                ) ann ON TRUE
                ORDER BY s.updated_at DESC, s.id DESC
            """)
            for row in _cur.fetchall():
                _, fname, status, rtype, created_at, reviewer_email, reviewed_at = row
                fpath = os.path.join(SUBMISSIONS_DIR, fname)
                if os.path.isfile(fpath):
                    stat = os.stat(fpath)
                    size, modified, file_missing = stat.st_size, datetime.fromtimestamp(stat.st_mtime).isoformat(), False
                else:
                    size, modified, file_missing = 0, (created_at.isoformat() if created_at else ""), True
                files.append({
                    "filename": fname,
                    "size": size,
                    "modified": modified,
                    "status": status or "pending",
                    "reviewer_email": reviewer_email or "",
                    "reviewed_at": reviewed_at.isoformat() if reviewed_at else "",
                    "reimb_type": rtype or "vat",
                    "file_missing": file_missing,
                })
    finally:
        _conn.close()
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
        data.get("material_comments", {}),
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
                "SELECT form_data FROM submissions WHERE zip_filename = %s ORDER BY created_at DESC LIMIT 1",
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
                mp = data.get("material_paths") or {}
                if not mp:
                    # 兼容旧数据（只有 invoice_paths/evidence_paths）
                    mp = {
                        "invoices": data.get("invoice_paths", []),
                        "evidence": data.get("evidence_paths", []),
                    }
                result["material_urls"] = {}
                result["material_paths"] = {}
                for key, paths in mp.items():
                    urls: list = []
                    valid: list = []
                    for p in paths:
                        if os.path.isfile(p):
                            valid.append(p)
                            rel = os.path.relpath(p, UPLOADS_DIR).replace("\\", "/")
                            urls.append(f"/api/v1/uploads/{rel}")
                    result["material_paths"][key] = valid
                    result["material_urls"][key] = urls
            else:
                result["form_data"] = data
                result["material_urls"] = {}
                result["material_paths"] = {}
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
    """列出成员自己的提交（以 submissions 行集为准，文件缺失如实标记）。"""
    from database import get_connection as _get_conn
    _conn = _get_conn()
    files = []
    try:
        with _conn.cursor() as _cur:
            if user_email:
                _cur.execute(
                    "SELECT zip_filename, reimb_type, created_at FROM submissions "
                    "WHERE user_email = %s ORDER BY created_at DESC, id DESC",
                    (user_email,))
                for fname, rtype, created_at in _cur.fetchall():
                    fpath = os.path.join(SUBMISSIONS_DIR, fname)
                    if os.path.isfile(fpath):
                        stat = os.stat(fpath)
                        size, modified, file_missing = stat.st_size, datetime.fromtimestamp(stat.st_mtime).isoformat(), False
                    else:
                        size, modified, file_missing = 0, (created_at.isoformat() if created_at else ""), True
                    files.append({
                        "filename": fname,
                        "size": size,
                        "modified": modified,
                        "reimb_type": rtype or "vat",
                        "file_missing": file_missing,
                    })
            # 无邮箱 = 返回空列表（成员端必须登录）
    finally:
        _conn.close()
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
    按 ZIP 内文件夹名分流各材料（发票/活动凭证/保单/身份凭证/行程单/支付记录），
    返回 base64 数据，以及报销表 Excel 的下载链接。
    """
    import zipfile, base64 as b64, mimetypes
    from reimbursement_types import MATERIALS as _MATERIALS

    fpath = os.path.join(SUBMISSIONS_DIR, filename)
    if not os.path.isfile(fpath) or not filename.endswith(".zip"):
        raise HTTPException(404, "文件不存在")

    folder_to_key = {cfg["zip_folder"]: key for key, cfg in _MATERIALS.items()}
    materials: dict[str, list] = {key: [] for key in _MATERIALS}
    form = None

    with zipfile.ZipFile(fpath, "r") as zf:
        for info in zf.infolist():
            if info.is_dir():
                continue
            data = zf.read(info.filename)
            name = os.path.basename(info.filename)
            folder = info.filename.split("/")[0]
            key = folder_to_key.get(folder)
            if key:
                # 兼容历史提交：加密 PDF 预览时兜底解密
                if name.lower().endswith(".pdf"):
                    data = _strip_pdf_encryption(data)
                mime = mimetypes.guess_type(name)[0] or "application/octet-stream"
                materials[key].append({
                    "name": name,
                    "data_url": f"data:{mime};base64,{b64.b64encode(data).decode()}",
                })
            elif folder == "报销表":
                form = {
                    "name": name,
                    "download_url": f"/api/v1/submissions/download/{filename}",
                }

    return {
        "success": True,
        "materials": materials,
        # 兼容旧字段名
        "invoices": materials["invoices"],
        "evidences": materials["evidence"],
        "form": form,
    }


# ---- 启动入口 ----

@app.on_event("startup")
async def startup():
    init_db()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=HOST, port=PORT)
