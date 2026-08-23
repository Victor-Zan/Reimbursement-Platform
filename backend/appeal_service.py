"""
意见反馈（申诉）服务。

成员对打回结果不认可时提交申诉（可多选被打回的提交，共享一条原因，每条提交一行）；
管理员在 /admin/appeals 查看并裁决（裁决逻辑在 review_service.resolve_appeal）。
"""
from database import get_connection


def create_appeals(user_email: str, submission_zips: list, reason: str) -> dict:
    """批量创建申诉：每个被选中的已打回提交一行。非法项跳过并回报。"""
    if not user_email:
        return {"success": False, "error": "缺少用户邮箱"}
    if not reason or not reason.strip():
        return {"success": False, "error": "请填写反馈原因"}
    if not submission_zips:
        return {"success": False, "error": "请选择需要反馈的提交"}
    conn = get_connection()
    created, skipped = [], []
    try:
        with conn.cursor() as cur:
            for zip_name in submission_zips:
                cur.execute(
                    "SELECT id, status FROM submissions WHERE zip_filename = %s AND user_email = %s",
                    (zip_name, user_email),
                )
                row = cur.fetchone()
                if not row:
                    skipped.append({"zip": zip_name, "reason": "提交不存在"})
                    continue
                sub_id, status = row
                if status != "rejected":
                    skipped.append({"zip": zip_name, "reason": "当前状态不可反馈"})
                    continue
                cur.execute(
                    "SELECT 1 FROM appeals WHERE submission_id = %s AND status = 'pending' LIMIT 1",
                    (sub_id,),
                )
                if cur.fetchone():
                    skipped.append({"zip": zip_name, "reason": "已有待处理反馈"})
                    continue
                cur.execute(
                    """INSERT INTO appeals (submission_id, submission_zip, user_email, reason)
                       VALUES (%s, %s, %s, %s) RETURNING id""",
                    (sub_id, zip_name, user_email, reason.strip()),
                )
                created.append(cur.fetchone()[0])
            conn.commit()
            return {"success": len(created) > 0, "created": len(created), "skipped": skipped}
    finally:
        conn.close()


def list_user_appeals(user_email: str) -> list[dict]:
    """列出成员自己的申诉记录。"""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT a.id, a.submission_zip, a.status, a.reason, a.created_at, s.reimb_type, s.reimb_types
                FROM appeals a
                LEFT JOIN submissions s ON s.id = a.submission_id
                WHERE a.user_email = %s
                ORDER BY a.created_at DESC, a.id DESC
            """, (user_email,))
            return [
                {
                    "id": r[0],
                    "submission_zip": r[1],
                    "status": r[2],
                    "reason": r[3] or "",
                    "created_at": r[4].isoformat() if r[4] else "",
                    "reimb_type": r[5] or "vat",
                    "reimb_types": r[6] if isinstance(r[6], list) and r[6] else [r[5] or "vat"],
                }
                for r in cur.fetchall()
            ]
    finally:
        conn.close()


def list_all_appeals() -> list[dict]:
    """列出所有申诉（管理员端），待处理排前。"""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT a.id, a.submission_id, a.submission_zip, a.user_email, a.reason, a.status,
                       a.admin_email, a.created_at, s.reimb_type, s.reimb_types, s.status AS submission_status
                FROM appeals a
                LEFT JOIN submissions s ON s.id = a.submission_id
                ORDER BY (a.status = 'pending') DESC, a.created_at DESC, a.id DESC
            """)
            return [
                {
                    "id": r[0],
                    "submission_id": r[1],
                    "submission_zip": r[2],
                    "user_email": r[3],
                    "reason": r[4] or "",
                    "status": r[5],
                    "admin_email": r[6] or "",
                    "created_at": r[7].isoformat() if r[7] else "",
                    "reimb_type": r[8] or "vat",
                    "reimb_types": r[9] if isinstance(r[9], list) and r[9] else [r[8] or "vat"],
                    "submission_status": r[10] or "pending",
                }
                for r in cur.fetchall()
            ]
    finally:
        conn.close()
