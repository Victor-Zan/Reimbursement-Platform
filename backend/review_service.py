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
                          invoice_comment, evidence_comment, form_comment, material_comments, created_at, is_admin
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
                    "is_admin": False,
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
                "is_admin": bool(row[9]) if row[9] is not None else False,
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


def resolve_appeal(
    appeal_id: int,
    admin_email: str,
    decision: str,
    form_comment: str,
    material_comments: dict | None = None,
) -> dict:
    """管理员处理意见反馈：直接决定报销最终结果（approve=通过 / reject=打回）。

    批注行 status 直接写最终结果并以 is_admin=TRUE 标记（不能写伪状态，
    否则启动迁移会把 submissions.status 收敛成未知值）。若成员在申诉后
    已重新提交，沿 parent_id 链把决定落到最新版本，成员端才能看到结果。
    """
    if decision not in ("approve", "reject"):
        return {"success": False, "error": "无效的处理决定"}
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, submission_id, submission_zip, status FROM appeals WHERE id = %s",
                (appeal_id,),
            )
            row = cur.fetchone()
            if not row:
                return {"success": False, "error": "申诉不存在"}
            aid, submission_id, submission_zip, appeal_status = row
            if appeal_status != "pending":
                return {"success": False, "error": "该申诉已处理"}

            sub_status = "approved" if decision == "approve" else "rejected"
            target_id, target_zip = submission_id, submission_zip
            # 成员可能已重新提交：沿 parent_id 链找最新后代行，决定落到成员可见的版本
            if submission_id is not None:
                cur.execute("""
                    WITH RECURSIVE chain AS (
                        SELECT id, zip_filename FROM submissions WHERE id = %s
                        UNION ALL
                        SELECT s.id, s.zip_filename FROM submissions s JOIN chain c ON s.parent_id = c.id
                    )
                    SELECT id, zip_filename FROM chain c
                    WHERE NOT EXISTS (SELECT 1 FROM submissions s WHERE s.parent_id = c.id)
                    ORDER BY id DESC LIMIT 1
                """, (submission_id,))
                top = cur.fetchone()
                if top:
                    target_id, target_zip = top

            cur.execute(
                """INSERT INTO review_annotations
                   (submission_zip, submission_id, status, reviewer_email, form_comment, material_comments, is_admin)
                   VALUES (%s, %s, %s, %s, %s, %s, TRUE)
                   RETURNING id""",
                (target_zip, target_id, sub_status, admin_email, form_comment,
                 json.dumps(material_comments or {}, ensure_ascii=False)),
            )
            rid = cur.fetchone()[0]
            if target_id is not None:
                cur.execute(
                    "UPDATE submissions SET status = %s, updated_at = NOW() WHERE id = %s",
                    (sub_status, target_id),
                )
            cur.execute(
                "UPDATE appeals SET status = %s, admin_email = %s, updated_at = NOW() WHERE id = %s",
                (sub_status, admin_email, aid),
            )
            conn.commit()
            return {"success": True, "id": rid, "submission_status": sub_status}
    finally:
        conn.close()
