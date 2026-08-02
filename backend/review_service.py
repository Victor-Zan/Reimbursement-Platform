"""
审核服务：批注 CRUD、状态管理。
"""
from database import get_connection


def get_review_status(submission_zip: str) -> dict:
    """获取某个 ZIP 的审核状态和批注。"""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT id, submission_zip, status, reviewer_email,
                          invoice_comment, evidence_comment, form_comment, created_at
                   FROM review_annotations
                   WHERE submission_zip = %s
                   ORDER BY created_at DESC LIMIT 1""",
                (submission_zip,),
            )
            row = cur.fetchone()
            if not row:
                return {
                    "submission_zip": submission_zip,
                    "status": "pending",
                    "reviewer_email": "",
                    "invoice_comment": "",
                    "evidence_comment": "",
                    "form_comment": "",
                }
            return {
                "id": row[0],
                "submission_zip": row[1],
                "status": row[2],
                "reviewer_email": row[3],
                "invoice_comment": row[4] or "",
                "evidence_comment": row[5] or "",
                "form_comment": row[6] or "",
                "created_at": row[7].isoformat() if row[7] else "",
            }
    finally:
        conn.close()


def approve_submission(submission_zip: str, reviewer_email: str) -> dict:
    """审核通过。"""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO review_annotations
                   (submission_zip, status, reviewer_email)
                   VALUES (%s, 'approved', %s)
                   RETURNING id""",
                (submission_zip, reviewer_email),
            )
            rid = cur.fetchone()[0]
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
) -> dict:
    """打回并批注。"""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO review_annotations
                   (submission_zip, status, reviewer_email,
                    invoice_comment, evidence_comment, form_comment)
                   VALUES (%s, 'rejected', %s, %s, %s, %s)
                   RETURNING id""",
                (submission_zip, reviewer_email, invoice_comment, evidence_comment, form_comment),
            )
            rid = cur.fetchone()[0]
            conn.commit()
            return {"success": True, "id": rid}
    finally:
        conn.close()


def list_all_reviews() -> list[dict]:
    """列出所有 ZIP 的最新审核状态。"""
    results = {}
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT submission_zip, status, reviewer_email, created_at
                   FROM review_annotations
                   ORDER BY created_at DESC"""
            )
            for row in cur.fetchall():
                zip_name = row[0]
                if zip_name not in results:
                    results[zip_name] = {
                        "submission_zip": zip_name,
                        "status": row[1],
                        "reviewer_email": row[2],
                        "created_at": row[3].isoformat() if row[3] else "",
                    }
    finally:
        conn.close()
    return list(results.values())
