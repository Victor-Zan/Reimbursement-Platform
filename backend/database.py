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
                    user_email    VARCHAR(255) DEFAULT '',
                    created_at    TIMESTAMP DEFAULT NOW(),
                    updated_at    TIMESTAMP DEFAULT NOW()
                );
            """)
            # 兼容旧数据：无 user_email 的列
            cur.execute("""
                DO $$ BEGIN
                    ALTER TABLE drafts ADD COLUMN user_email VARCHAR(255) DEFAULT '';
                EXCEPTION WHEN duplicate_column THEN NULL;
                END $$;
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id            SERIAL PRIMARY KEY,
                    email         VARCHAR(255) UNIQUE NOT NULL,
                    password_hash VARCHAR(255) NOT NULL,
                    is_reviewer   BOOLEAN DEFAULT FALSE,
                    created_at    TIMESTAMP DEFAULT NOW()
                );
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS review_annotations (
                    id               SERIAL PRIMARY KEY,
                    submission_zip   VARCHAR(500) NOT NULL,
                    status           VARCHAR(20) DEFAULT 'pending',
                    reviewer_email   VARCHAR(255) DEFAULT '',
                    invoice_comment  TEXT DEFAULT '',
                    evidence_comment TEXT DEFAULT '',
                    form_comment     TEXT DEFAULT '',
                    created_at       TIMESTAMP DEFAULT NOW()
                );
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS reviewer_applications (
                    id         SERIAL PRIMARY KEY,
                    email      VARCHAR(255) NOT NULL,
                    reason     TEXT DEFAULT '',
                    status     VARCHAR(20) DEFAULT 'pending',
                    created_at TIMESTAMP DEFAULT NOW()
                );
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS submissions_data (
                    id           SERIAL PRIMARY KEY,
                    zip_filename VARCHAR(500) NOT NULL,
                    user_email   VARCHAR(255) DEFAULT '',
                    form_data    JSONB DEFAULT '{}',
                    created_at   TIMESTAMP DEFAULT NOW()
                );
            """)
        conn.commit()
        print("[DB] 所有表已就绪")
    finally:
        conn.close()
