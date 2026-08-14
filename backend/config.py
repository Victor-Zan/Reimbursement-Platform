"""
全局配置模块。

所有可能变化的常量集中于此，后续调整无需深入业务代码。
"""
import os

# 加载 .env 文件（若存在）
_ENV_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
if os.path.isfile(_ENV_PATH):
    with open(_ENV_PATH, encoding="utf-8") as _f:
        for _line in _f:
            _line = _line.strip()
            if _line and not _line.startswith("#") and "=" in _line:
                _k, _v = _line.split("=", 1)
                os.environ.setdefault(_k.strip(), _v.strip())

# ---- 路径 ----
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TEMPLATE_PATH = os.path.join(os.path.dirname(BASE_DIR), "空白报销表.xls")
TEMPLATE_XLSX_PATH = os.path.join(os.path.dirname(BASE_DIR), "template.xlsx")
SUBMISSIONS_DIR = os.path.join(BASE_DIR, "submissions")
UPLOADS_DIR = os.path.join(BASE_DIR, "uploads")

# ---- 发票校验 ----
EXPECTED_BUYER_NAME = "香港中文大学（深圳）"
EXPECTED_TAX_ID = "12440300066312613F"

# ---- OCR 引擎 ----
# 可选值: "pdf" (默认, pdfplumber提取) | "baidu" | "mock"
OCR_ENGINE = os.getenv("OCR_ENGINE", "baidu")

# 百度 OCR 配置（使用百度云时填写）
BAIDU_OCR_API_KEY = os.getenv("BAIDU_OCR_API_KEY", "")
BAIDU_OCR_SECRET_KEY = os.getenv("BAIDU_OCR_SECRET_KEY", "")
BAIDU_OCR_TOKEN_URL = "https://aip.baidubce.com/oauth/2.0/token"
BAIDU_OCR_VAT_INVOICE_URL = "https://aip.baidubce.com/rest/2.0/ocr/v1/vat_invoice"

# ---- 上传限制 ----
MAX_INVOICE_SIZE_MB = 10
MAX_EVIDENCE_SIZE_MB = 20
MIN_EVIDENCE_COUNT = 1
ALLOWED_INVOICE_TYPES = {"application/pdf", "image/png", "image/jpeg", "image/jpg"}
ALLOWED_EVIDENCE_TYPES = {"image/png", "image/jpeg", "image/jpg"}

# ---- 数据库 (PostgreSQL) ----
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = int(os.getenv("DB_PORT", "5435"))
DB_USER = os.getenv("DB_USER", "reimbursement")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_NAME = os.getenv("DB_NAME", "reimbursement_db")

# ---- 服务器 ----
HOST = os.getenv("HOST", "127.0.0.1")
PORT = int(os.getenv("PORT", "7999"))
