"""
报销类型与材料配置。

后端校验的唯一事实源。前端镜像: frontend/src/config/materials.ts
—— key 与数值规则必须与本文保持一致，以后端为准（submit 硬校验），
前端仅用于卡片渲染与预校验。修改材料配置时请同步两端。
"""

# 报销类型
REIMBURSEMENT_TYPES = ["vat", "insurance", "travel", "bulk", "large"]

TYPE_LABELS = {
    "vat": "增值税报销",
    "insurance": "保险报销",
    "travel": "路费报销",
    "bulk": "大量发票报销",
    "large": "大额报销",
}

# 材料定义：key → 配置（label 中文名 / zip_folder ZIP 内文件夹名 / zip_prefix 编号前缀 /
# accept_exts 允许扩展名 / max_size_mb 单文件上限 / min_count、max_count 张数上下限
# （None = 不限）/ use_ocr 是否走发票 OCR / upload_subdir 上传目录）
MATERIALS = {
    "invoices": {
        "label": "发票",
        "zip_folder": "发票",
        "zip_prefix": "发票",
        "accept_exts": {".pdf", ".png", ".jpg", ".jpeg"},
        "max_size_mb": 10,
        "min_count": 1,
        "max_count": None,
        "use_ocr": True,
        "upload_subdir": "invoices",
    },
    "evidence": {
        "label": "活动凭证",
        "zip_folder": "活动凭证",
        "zip_prefix": "凭证",
        "accept_exts": {".png", ".jpg", ".jpeg"},
        "max_size_mb": 20,
        "min_count": 1,
        "max_count": 20,
        "use_ocr": False,
        "upload_subdir": "evidence",
    },
    "policy": {
        "label": "保险保单",
        "zip_folder": "保险保单",
        "zip_prefix": "保单",
        "accept_exts": {".pdf", ".png", ".jpg", ".jpeg"},
        "max_size_mb": 20,
        "min_count": 1,
        "max_count": 10,
        "use_ocr": False,
        "upload_subdir": "policy",
    },
    "rider_ids": {
        "label": "乘车人员身份凭证",
        "zip_folder": "乘车人身份凭证",
        "zip_prefix": "身份凭证",
        "accept_exts": {".pdf", ".png", ".jpg", ".jpeg"},
        "max_size_mb": 10,
        "min_count": 1,
        "max_count": 50,
        "use_ocr": False,
        "upload_subdir": "rider_ids",
    },
    "itinerary": {
        "label": "出行行程单",
        "zip_folder": "出行行程单",
        "zip_prefix": "行程单",
        "accept_exts": {".pdf", ".png", ".jpg", ".jpeg"},
        "max_size_mb": 20,
        "min_count": 1,
        "max_count": 10,
        "use_ocr": False,
        "upload_subdir": "itinerary",
    },
    "payments": {
        "label": "出行支付记录",
        "zip_folder": "出行支付记录",
        "zip_prefix": "支付记录",
        "accept_exts": {".png", ".jpg", ".jpeg"},
        "max_size_mb": 10,
        "min_count": 1,
        "max_count": 20,
        "use_ocr": False,
        "upload_subdir": "payments",
    },
    "supplier_detail": {
        "label": "供应商明细表单",
        "zip_folder": "供应商明细表单",
        "zip_prefix": "供应商明细",
        "accept_exts": {".pdf", ".png", ".jpg", ".jpeg"},
        "max_size_mb": 20,
        "min_count": 1,
        "max_count": 20,
        "use_ocr": False,
        "upload_subdir": "supplier_detail",
    },
    "payments_voucher": {
        "label": "支付凭证",
        "zip_folder": "支付凭证",
        "zip_prefix": "支付凭证",
        "accept_exts": {".png", ".jpg", ".jpeg"},
        "max_size_mb": 10,
        "min_count": 1,
        "max_count": 20,
        "use_ocr": False,
        "upload_subdir": "payments_voucher",
    },
}

# 每种报销类型需要的材料（顺序即打包/预览/审核展示顺序）
TYPE_MATERIALS = {
    "vat": ["invoices", "evidence"],
    "insurance": ["invoices", "policy"],
    "travel": ["invoices", "rider_ids", "itinerary", "payments"],
    "bulk": ["invoices", "evidence"],
    "large": ["invoices", "supplier_detail", "payments_voucher"],
}

# 类型级覆盖（默认继承 MATERIALS）
TYPE_OVERRIDES = {
    # 路费：发票实为交通票据，电子发票同样走 OCR，纸质车票 OCR 失败后手动补录
    "travel": {"invoices": {"label": "交通票据"}},
    # 大量发票：上限 30 张
    "bulk": {"invoices": {"max_count": 30}},
}


def material_cfg(reimb_type: str, key: str) -> dict:
    """取某类型下某材料的最终配置。"""
    return {**MATERIALS[key], **TYPE_OVERRIDES.get(reimb_type, {}).get(key, {})}
