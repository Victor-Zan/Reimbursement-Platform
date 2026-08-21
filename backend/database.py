"""
PostgreSQL 数据库连接与初始化。

连接信息来自 config.py，启动时自动建表/迁移（幂等，单事务）。
迁移策略：每条语句自带守卫（to_regclass / IF NOT EXISTS / DO $$ ALTER / ON CONFLICT），
每次启动重跑无害；失败整体回滚，下次启动自动重试，不存在半迁移状态。
"""
import os

import psycopg2
import psycopg2.extras

from config import DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, SUBMISSIONS_DIR


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
    """初始化数据库表（幂等，单事务，含历史数据迁移）。"""
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
            # 兼容旧表：管理员角色列
            cur.execute("""
                DO $$ BEGIN
                    ALTER TABLE users ADD COLUMN is_admin BOOLEAN DEFAULT FALSE;
                EXCEPTION WHEN duplicate_column THEN NULL;
                END $$;
            """)

            # ---- submissions 主表（由旧 submissions_data 原位 rename 演进）----
            # 1. 旧表重命名（必须在 CREATE TABLE 之前，幂等双条件）
            cur.execute("""
                DO $$ BEGIN
                    IF to_regclass('public.submissions_data') IS NOT NULL
                       AND to_regclass('public.submissions') IS NULL THEN
                        ALTER TABLE submissions_data RENAME TO submissions;
                    END IF;
                END $$;
            """)
            # 异常兜底：两表并存（此前半次迁移）→ 按 zip 合并后旧表降级为 legacy
            cur.execute("""
                DO $$ BEGIN
                    IF to_regclass('public.submissions_data') IS NOT NULL
                       AND to_regclass('public.submissions') IS NOT NULL THEN
                        INSERT INTO submissions (zip_filename, user_email, form_data, created_at)
                        SELECT d.zip_filename, d.user_email, d.form_data, d.created_at
                        FROM submissions_data d
                        WHERE NOT EXISTS (SELECT 1 FROM submissions s WHERE s.zip_filename = d.zip_filename)
                        ON CONFLICT (zip_filename) DO NOTHING;
                        ALTER TABLE submissions_data RENAME TO submissions_data_legacy;
                    END IF;
                END $$;
            """)
            # 2. 全新安装路径
            cur.execute("""
                CREATE TABLE IF NOT EXISTS submissions (
                    id            SERIAL PRIMARY KEY,
                    zip_filename  VARCHAR(500) NOT NULL UNIQUE,
                    user_email    VARCHAR(255) DEFAULT '',
                    reimb_type    VARCHAR(20) DEFAULT 'vat',
                    status        VARCHAR(20) DEFAULT 'pending',
                    activity_name TEXT DEFAULT '',
                    parent_id     INTEGER REFERENCES submissions(id) ON DELETE SET NULL,
                    form_data     JSONB DEFAULT '{}',
                    created_at    TIMESTAMP DEFAULT NOW(),
                    updated_at    TIMESTAMP DEFAULT NOW()
                );
            """)
            # 3. 升级路径补列（rename 后的旧表缺新列）
            cur.execute("""
                DO $$ BEGIN
                    ALTER TABLE submissions ADD COLUMN parent_id INTEGER REFERENCES submissions(id) ON DELETE SET NULL;
                EXCEPTION WHEN duplicate_column THEN NULL;
                END $$;
            """)
            cur.execute("""
                DO $$ BEGIN
                    ALTER TABLE submissions ADD COLUMN reimb_type VARCHAR(20) DEFAULT 'vat';
                EXCEPTION WHEN duplicate_column THEN NULL;
                END $$;
            """)
            cur.execute("""
                DO $$ BEGIN
                    ALTER TABLE submissions ADD COLUMN status VARCHAR(20) DEFAULT 'pending';
                EXCEPTION WHEN duplicate_column THEN NULL;
                END $$;
            """)
            cur.execute("""
                DO $$ BEGIN
                    ALTER TABLE submissions ADD COLUMN activity_name TEXT DEFAULT '';
                EXCEPTION WHEN duplicate_column THEN NULL;
                END $$;
            """)
            # updated_at 先不带默认值加列，历史行回填为 created_at，再设默认值供新行使用
            cur.execute("""
                DO $$ BEGIN
                    ALTER TABLE submissions ADD COLUMN updated_at TIMESTAMP;
                EXCEPTION WHEN duplicate_column THEN NULL;
                END $$;
            """)
            cur.execute("UPDATE submissions SET updated_at = created_at WHERE updated_at IS NULL")
            cur.execute("ALTER TABLE submissions ALTER COLUMN updated_at SET DEFAULT NOW()")

            # ---- 审核批注表（挂 submission_id）----
            cur.execute("""
                CREATE TABLE IF NOT EXISTS review_annotations (
                    id                SERIAL PRIMARY KEY,
                    submission_zip    VARCHAR(500) NOT NULL,
                    submission_id     INTEGER REFERENCES submissions(id),
                    status            VARCHAR(20) DEFAULT 'pending',
                    reviewer_email    VARCHAR(255) DEFAULT '',
                    invoice_comment   TEXT DEFAULT '',
                    evidence_comment  TEXT DEFAULT '',
                    form_comment      TEXT DEFAULT '',
                    material_comments JSONB DEFAULT '{}',
                    created_at        TIMESTAMP DEFAULT NOW()
                );
            """)
            # 兼容旧表：新增材料批注列（保单/身份凭证/行程单/支付记录等，key->批注）
            cur.execute("""
                DO $$ BEGIN
                    ALTER TABLE review_annotations ADD COLUMN material_comments JSONB DEFAULT '{}';
                EXCEPTION WHEN duplicate_column THEN NULL;
                END $$;
            """)
            # 兼容旧表：挂接 submission_id
            cur.execute("""
                DO $$ BEGIN
                    ALTER TABLE review_annotations ADD COLUMN submission_id INTEGER REFERENCES submissions(id);
                EXCEPTION WHEN duplicate_column THEN NULL;
                END $$;
            """)
            # 兼容旧表：管理员处理标记（管理员对申诉的最终决定）
            cur.execute("""
                DO $$ BEGIN
                    ALTER TABLE review_annotations ADD COLUMN is_admin BOOLEAN DEFAULT FALSE;
                EXCEPTION WHEN duplicate_column THEN NULL;
                END $$;
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
            # 兼容旧表：申请的角色（审核员/管理员）
            cur.execute("""
                DO $$ BEGIN
                    ALTER TABLE reviewer_applications ADD COLUMN role VARCHAR(20) DEFAULT 'reviewer';
                EXCEPTION WHEN duplicate_column THEN NULL;
                END $$;
            """)

            # ---- 意见反馈（申诉）表：成员对打回结果不认可时提交，管理员裁决 ----
            cur.execute("""
                CREATE TABLE IF NOT EXISTS appeals (
                    id             SERIAL PRIMARY KEY,
                    submission_id  INTEGER REFERENCES submissions(id),
                    submission_zip VARCHAR(500) NOT NULL,
                    user_email     VARCHAR(255) DEFAULT '',
                    reason         TEXT DEFAULT '',
                    status         VARCHAR(20) DEFAULT 'pending',
                    admin_email    VARCHAR(255) DEFAULT '',
                    created_at     TIMESTAMP DEFAULT NOW(),
                    updated_at     TIMESTAMP DEFAULT NOW()
                );
            """)

            # 4. 同名 ZIP 去重（UNIQUE 索引前）：保留 id 最大者，其余改名墓碑（幂等）
            cur.execute("""
                UPDATE submissions s
                SET zip_filename = s.zip_filename || '_dup' || s.id || '.zip',
                    updated_at = NOW()
                WHERE s.id NOT IN (SELECT MAX(id) FROM submissions GROUP BY zip_filename);
            """)

            # 5. 索引
            cur.execute("CREATE UNIQUE INDEX IF NOT EXISTS submissions_zip_filename_key ON submissions(zip_filename)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_submissions_user_email ON submissions(user_email)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions(status)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_submissions_parent_id ON submissions(parent_id)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_review_annotations_submission_id ON review_annotations(submission_id)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_review_annotations_submission_zip ON review_annotations(submission_zip)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_appeals_submission_id ON appeals(submission_id)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_appeals_user_email ON appeals(user_email)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_appeals_status ON appeals(status)")

            # 6. 孤儿行回填（幂等）：DB 成为唯一行来源，保证改造后不丢行
            # 6a. 仅存在于批注表的 zip
            cur.execute("""
                INSERT INTO submissions (zip_filename, user_email, reimb_type, status, form_data)
                SELECT DISTINCT ra.submission_zip, '', 'vat', 'pending', '{}'::jsonb
                FROM review_annotations ra
                WHERE NOT EXISTS (SELECT 1 FROM submissions s WHERE s.zip_filename = ra.submission_zip)
                ON CONFLICT (zip_filename) DO NOTHING;
            """)
            # 6b. 仅存在于 submissions/ 目录的 .zip
            if os.path.isdir(SUBMISSIONS_DIR):
                for z in sorted(os.listdir(SUBMISSIONS_DIR)):
                    if not z.endswith(".zip"):
                        continue
                    cur.execute("""
                        INSERT INTO submissions (zip_filename, user_email, reimb_type, status, form_data)
                        SELECT %s, '', 'vat', 'pending', %s::jsonb
                        WHERE NOT EXISTS (SELECT 1 FROM submissions WHERE zip_filename = %s)
                        ON CONFLICT (zip_filename) DO NOTHING;
                    """, (z, "{}", z))

            # 7. 历史数据回填（幂等、自愈）
            # 7a. 报销类型：从 form_data 提取，兜底 vat
            cur.execute("""
                UPDATE submissions
                SET reimb_type = COALESCE(NULLIF(form_data->'form'->>'type', ''), 'vat')
                WHERE COALESCE(NULLIF(form_data->'form'->>'type', ''), 'vat') IS DISTINCT FROM reimb_type;
            """)
            # 7b. 活动名称
            cur.execute("""
                UPDATE submissions
                SET activity_name = COALESCE(form_data->'form'->>'activity_name', '')
                WHERE COALESCE(form_data->'form'->>'activity_name', '') IS DISTINCT FROM activity_name;
            """)
            # 7c. 批注挂接 submission_id（只补 NULL 行）
            cur.execute("""
                UPDATE review_annotations ra SET submission_id = s.id
                FROM submissions s
                WHERE s.zip_filename = ra.submission_zip AND ra.submission_id IS NULL;
            """)
            # 7c2. 申诉挂接 submission_id（只补 NULL 行）
            cur.execute("""
                UPDATE appeals a SET submission_id = s.id
                FROM submissions s
                WHERE s.zip_filename = a.submission_zip AND a.submission_id IS NULL;
            """)
            # 7d. status 冗余：仅对"有批注"的行用最新批注状态收敛（无批注行不动，保护 resubmitted）
            cur.execute("""
                UPDATE submissions s
                SET status = a.status,
                    updated_at = GREATEST(COALESCE(s.updated_at, s.created_at), a.created_at)
                FROM (SELECT DISTINCT ON (submission_id) submission_id, status, created_at
                      FROM review_annotations
                      WHERE submission_id IS NOT NULL
                      ORDER BY submission_id, id DESC) a
                WHERE a.submission_id = s.id AND a.status IS DISTINCT FROM s.status;
            """)

        conn.commit()
        print("[DB] 所有表已就绪")
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
