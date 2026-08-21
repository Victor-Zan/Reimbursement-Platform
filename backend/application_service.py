"""
审核员/管理员权限申请服务。
"""
from database import get_connection
from user_service import set_reviewer_status, set_admin_status

VALID_ROLES = ("reviewer", "admin")


def submit_application(email: str, reason: str, role: str = "reviewer") -> dict:
    """提交权限申请（审核员或管理员）。"""
    if role not in VALID_ROLES:
        return {"success": False, "error": "角色无效"}
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO reviewer_applications (email, reason, role)
                   VALUES (%s, %s, %s) RETURNING id""",
                (email, reason, role),
            )
            aid = cur.fetchone()[0]
            conn.commit()
            return {"success": True, "id": aid}
    finally:
        conn.close()


def list_applications() -> list[dict]:
    """列出所有申请。"""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT id, email, reason, status, created_at, role
                   FROM reviewer_applications
                   ORDER BY created_at DESC"""
            )
            return [
                {
                    "id": r[0],
                    "email": r[1],
                    "reason": r[2] or "",
                    "status": r[3],
                    "created_at": r[4].isoformat() if r[4] else "",
                    "role": r[5] or "reviewer",
                }
                for r in cur.fetchall()
            ]
    finally:
        conn.close()


def approve_application(app_id: int) -> dict:
    """批准申请：更新申请状态 + 按申请的角色提升用户权限。"""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            # 获取申请
            cur.execute(
                "SELECT email, role FROM reviewer_applications WHERE id = %s",
                (app_id,),
            )
            row = cur.fetchone()
            if not row:
                return {"success": False, "error": "申请不存在"}

            email, role = row
            # 更新申请状态
            cur.execute(
                "UPDATE reviewer_applications SET status = 'approved' WHERE id = %s",
                (app_id,),
            )
            conn.commit()
        # 按申请的权限类型提升用户
        if role == "admin":
            set_admin_status(email, True)
        else:
            set_reviewer_status(email, True)
        return {"success": True, "email": email, "role": role}
    finally:
        conn.close()
