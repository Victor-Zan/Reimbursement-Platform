"""
审核服务：批注 CRUD、状态管理。

当前状态以 submissions.status 为准（pending/approved/rejected/resubmitted）；
review_annotations 记录审核动作（append-only，最新一行生效）。
"""
import json

from database import get_connection


def _find_submission_id(cur, submission_zip: str):
    """按归档名（zip 文件名）查 submission 主键，查不到返回 None。"""
    cur.execute("SELECT id FROM submissions WHERE zip_filename = %s", (submission_zip,))
    row = cur.fetchone()
    return row[0] if row else None


def get_review_status(submission_zip: str) -> dict:
    """获取某个 ZIP 的审核状态和批注。无批注行时兜底取 submissions.status。"""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT id, submission_zip, status, reviewer_email,
                          invoice_comment, evidence_comment, form_comment, material_comments, created_at
                   FROM review_annotations
                   WHERE submission_zip = %s
                   ORDER BY id DESC LIMIT 1""",
                (submission_zip,),
            )
            row = cur.fetchone()
            if not row:
                # 新重传行（resubmitted）无批注行：状态兜底取 submissions.status
                cur.execute("SELECT status FROM submissions WHERE zip_filename = %s", (submission_zip,))
                sub = cur.fetchone()
                return {
                    "submission_zip": submission_zip,
                    "status": sub[0] if sub else "pending",
                    "reviewer_email": "",
                    "invoice_comment": "",
                    "evidence_comment": "",
                    "form_comment": "",
                    "material_comments": {},
                }
            return {
                "id": row[0],
                "submission_zip": row[1],
                "status": row[2],
                "reviewer_email": row[3],
                "invoice_comment": row[4] or "",
                "evidence_comment": row[5] or "",
                "form_comment": row[6] or "",
                "material_comments": row[7] if isinstance(row[7], dict) else (json.loads(row[7]) if row[7] else {}),
                "created_at": row[8].isoformat() if row[8] else "",
            }
    finally:
        conn.close()


def approve_submission(submission_zip: str, reviewer_email: str) -> dict:
    """审核通过：写批注动作行 + 同步 submissions.status。"""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            submission_id = _find_submission_id(cur, submission_zip)
            cur.execute(
                """INSERT INTO review_annotations
                   (submission_zip, submission_id, status, reviewer_email)
                   VALUES (%s, %s, 'approved', %s)
                   RETURNING id""",
                (submission_zip, submission_id, reviewer_email),
            )
            rid = cur.fetchone()[0]
            if submission_id is not None:
                cur.execute(
                    "UPDATE submissions SET status = 'approved', updated_at = NOW() WHERE id = %s",
                    (submission_id,),
                )
            conn.commit()
            return {"success": True, "id": rid}
    finally:
        conn.close()


def reject_submission(
    submission_zip: str,
    reviewer_email: str,
    invoice_comment: str,
    evidence_comment: str,
    form_comment: str,
    material_comments: dict | None = None,
) -> dict:
    """打回并批注：写批注动作行 + 同步 submissions.status。material_comments 为新材料批注 {材料key: 批注}。"""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            submission_id = _find_submission_id(cur, submission_zip)
            cur.execute(
                """INSERT INTO review_annotations
                   (submission_zip, submission_id, status, reviewer_email,
                    invoice_comment, evidence_comment, form_comment, material_comments)
                   VALUES (%s, %s, 'rejected', %s, %s, %s, %s, %s)
                   RETURNING id""",
                (submission_zip, submission_id, reviewer_email, invoice_comment, evidence_comment, form_comment,
                 json.dumps(material_comments or {}, ensure_ascii=False)),
            )
            rid = cur.fetchone()[0]
            if submission_id is not None:
                cur.execute(
                    "UPDATE submissions SET status = 'rejected', updated_at = NOW() WHERE id = %s",
                    (submission_id,),
                )
            conn.commit()
            return {"success": True, "id": rid}
    finally:
        conn.close()
