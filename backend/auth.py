"""
认证模块：JWT 签发/验证、密码哈希。
"""
import jwt
import bcrypt
from datetime import datetime, timedelta, timezone

JWT_SECRET = "请通过环境变量JWT_SECRET设置"
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_HOURS = 24


def hash_password(password: str) -> str:
    """对密码进行 bcrypt 哈希。"""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    """验证密码是否匹配哈希。"""
    return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))


def create_token(email: str, user_id: int, is_reviewer: bool) -> str:
    """签发 JWT token。"""
    payload = {
        "sub": email,
        "user_id": user_id,
        "is_reviewer": is_reviewer,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRE_HOURS),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> dict | None:
    """解析 JWT token，失败返回 None。"""
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError:
        return None
