"""
PostgreSQL 数据库连接与初始化。

连接信息来自 config.py，启动时自动创建 drafts 表。
"""
import psycopg2
import psycopg2.extras

from config import DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME


def get_connection():
    """获取数据库连接。"""
    return psycopg2.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASSWORD,
        dbname=DB_NAME,
    )


def init_db():
    """初始化数据库表（幂等）。"""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS drafts (
                    id            VARCHAR(36) PRIMARY KEY,
                    activity_name TEXT DEFAULT '',
                    org_name      TEXT DEFAULT '',
                    current_step  INTEGER DEFAULT 1,
                    form_data     JSONB DEFAULT '{}',
                    ocr_results   JSONB DEFAULT '[]',
                    created_at    TIMESTAMP DEFAULT NOW(),
                    updated_at    TIMESTAMP DEFAULT NOW()
                );
            """)
        conn.commit()
        print("[DB] drafts 表已就绪")
    finally:
        conn.close()
