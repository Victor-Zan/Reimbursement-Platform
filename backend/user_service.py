"""
用户服务：注册、登录、查询。
"""
from database import get_connection
from auth import hash_password, verify_password, create_token


def get_email_domain(email: str) -> str:
    """提取邮箱域名。"""
    return "@" + email.split("@")[-1] if "@" in email else ""


def register(email: str, password: str) -> dict:
    """
    注册新用户。
    - @cuhk.edu.cn → is_reviewer = True
    - @link.cuhk.edu.cn → is_reviewer = False
    - 其他域名 → 拒绝
    """
    domain = get_email_domain(email)
    if domain not in ("@cuhk.edu.cn", "@link.cuhk.edu.cn"):
        return {"success": False, "error": "仅支持 @cuhk.edu.cn 或 @link.cuhk.edu.cn 邮箱注册"}

    is_reviewer = domain == "@cuhk.edu.cn"
    password_hash = hash_password(password)

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            # 检查邮箱是否已注册
            cur.execute("SELECT id FROM users WHERE email = %s", (email,))
            if cur.fetchone():
                return {"success": False, "error": "该邮箱已注册"}

            cur.execute(
                "INSERT INTO users (email, password_hash, is_reviewer) VALUES (%s, %s, %s) RETURNING id",
                (email, password_hash, is_reviewer),
            )
            user_id = cur.fetchone()[0]
            conn.commit()

            token = create_token(email, user_id, is_reviewer)
            return {
                "success": True,
                "token": token,
                "user": {"id": user_id, "email": email, "is_reviewer": is_reviewer, "is_admin": False},
            }
    finally:
        conn.close()


def login(email: str, password: str) -> dict:
    """登录验证。"""
    # 硬编码管理员账号（暂不建库行）：admin / admin123
    if email == "admin":
        if password != "admin123":
            return {"success": False, "error": "密码错误"}
        return {
            "success": True,
            "token": create_token("admin", 0, False, True),
            "user": {"id": 0, "email": "admin", "is_reviewer": False, "is_admin": True, "can_choose_role": False},
        }
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, email, password_hash, is_reviewer, is_admin FROM users WHERE email = %s",
                (email,),
            )
            row = cur.fetchone()
            if not row:
                return {"success": False, "error": "邮箱未注册"}

            user_id, email, pw_hash, is_reviewer, is_admin = row
            if not verify_password(password, pw_hash):
                return {"success": False, "error": "密码错误"}

            token = create_token(email, user_id, is_reviewer, is_admin)
            # 判断是否有双重身份
            is_link = get_email_domain(email) == "@link.cuhk.edu.cn"
            return {
                "success": True,
                "token": token,
                "user": {
                    "id": user_id,
                    "email": email,
                    "is_reviewer": is_reviewer,
                    "is_admin": is_admin,
                    "can_choose_role": (is_link and is_reviewer) or (is_admin and is_reviewer),  # 双重身份
                },
            }
    finally:
        conn.close()


def get_user_by_id(user_id: int) -> dict | None:
    """根据 ID 获取用户信息。"""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, email, is_reviewer, is_admin FROM users WHERE id = %s",
                (user_id,),
            )
            row = cur.fetchone()
            if not row:
                return None
            return {"id": row[0], "email": row[1], "is_reviewer": row[2], "is_admin": row[3]}
    finally:
        conn.close()


def set_reviewer_status(email: str, is_reviewer: bool) -> bool:
    """更新用户的审核员状态。"""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE users SET is_reviewer = %s WHERE email = %s",
                (is_reviewer, email),
            )
            conn.commit()
            return cur.rowcount > 0
    finally:
        conn.close()


def set_admin_status(email: str, is_admin: bool) -> bool:
    """更新用户的管理员状态。"""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE users SET is_admin = %s WHERE email = %s",
                (is_admin, email),
            )
            conn.commit()
            return cur.rowcount > 0
    finally:
        conn.close()
