"""草稿服务：CRUD 操作。按 user_email 隔离。"""
import uuid, json
from database import get_connection


def save_draft(activity_name: str, org_name: str, current_step: int,
               form_data: dict, ocr_results: list, user_email: str = "",
               draft_id: str | None = None) -> str:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            if draft_id:
                cur.execute(
                    """UPDATE drafts SET activity_name=%s, org_name=%s, current_step=%s,
                       form_data=%s, ocr_results=%s, user_email=%s, updated_at=NOW()
                       WHERE id=%s""",
                    (activity_name, org_name, current_step,
                     json.dumps(form_data, ensure_ascii=False),
                     json.dumps(ocr_results, ensure_ascii=False),
                     user_email, draft_id))
                conn.commit()
                return draft_id
            else:
                new_id = str(uuid.uuid4())
                cur.execute(
                    """INSERT INTO drafts (id, activity_name, org_name,
                       current_step, form_data, ocr_results, user_email)
                       VALUES (%s, %s, %s, %s, %s, %s, %s)""",
                    (new_id, activity_name, org_name, current_step,
                     json.dumps(form_data, ensure_ascii=False),
                     json.dumps(ocr_results, ensure_ascii=False),
                     user_email))
                conn.commit()
                return new_id
    finally:
        conn.close()


def list_drafts(user_email: str = "") -> list[dict]:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            if user_email:
                cur.execute(
                    """SELECT id, activity_name, org_name, current_step,
                       created_at, updated_at FROM drafts
                       WHERE user_email = %s ORDER BY updated_at DESC""",
                    (user_email,))
            else:
                cur.execute(
                    """SELECT id, activity_name, org_name, current_step,
                       created_at, updated_at FROM drafts
                       ORDER BY updated_at DESC""")
            rows = cur.fetchall()
            return [{"id": r[0], "activity_name": r[1], "org_name": r[2],
                     "current_step": r[3],
                     "created_at": r[4].isoformat() if r[4] else "",
                     "updated_at": r[5].isoformat() if r[5] else ""}
                    for r in rows]
    finally:
        conn.close()


def get_draft(draft_id: str) -> dict | None:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT id, activity_name, org_name, current_step,
                   form_data, ocr_results, created_at, updated_at
                   FROM drafts WHERE id = %s""", (draft_id,))
            r = cur.fetchone()
            if not r: return None
            return {"id": r[0], "activity_name": r[1], "org_name": r[2],
                    "current_step": r[3],
                    "form_data": r[4] if isinstance(r[4], dict) else json.loads(r[4]),
                    "ocr_results": r[5] if isinstance(r[5], list) else json.loads(r[5]),
                    "created_at": r[6].isoformat() if r[6] else "",
                    "updated_at": r[7].isoformat() if r[7] else ""}
    finally:
        conn.close()


def delete_draft(draft_id: str) -> bool:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM drafts WHERE id = %s", (draft_id,))
            deleted = cur.rowcount > 0
            conn.commit()
            return deleted
    finally:
        conn.close()
