"""
校验规则配置。

每条规则是一个独立的校验函数，新增规则只需：
1. 编写校验函数（接收表单数据，返回 (bool, error_message)）
2. 注册到 RULES 列表
"""
import re
from dataclasses import dataclass, field
from typing import Callable


@dataclass
class InvoiceSectionData:
    """单张发票在报销表中的数据区块"""
    buyer_name: str = ""
    buyer_tax_id: str = ""
    buyer_name_valid: bool = False
    buyer_tax_id_valid: bool = False
    invoice_date: str = ""
    invoice_total: float = 0.0
    reimbursement_amount: float = 0.0
    handler: str = ""
    items: list[dict] = field(default_factory=list)
    reimb_type: str = "vat"


@dataclass
class ReimbursementFormData:
    """报销表完整表单数据"""
    # 报销类型（vat/insurance/travel/bulk，旧数据兜底 vat）
    type: str = "vat"

    # 多类型报销：类型数组（单类型时 len=1；旧数据回退 [type]）
    types: list[str] = field(default_factory=lambda: ["vat"])

    # 表头（所有发票共享）
    activity_name: str = ""
    org_name: str = ""
    activity_end_date: str = ""
    reimbursement_date: str = ""

    # 多张发票
    invoices: list[InvoiceSectionData] = field(default_factory=list)

    # 自动计算
    actual_total: float = 0.0          # Σ所有明细行(单价×数量)

    # 表尾（共享）
    finance_officer: str = ""
    activity_leader_opinion: str = ""
    alipay_account: str = ""


# ---- 校验函数 ----

def _invoice_allow_negative(invoice: InvoiceSectionData, data: ReimbursementFormData) -> bool:
    """出行类发票允许负数单价（如退票差价）；旧数据无发票类型时按表单类型兜底。"""
    return invoice.reimb_type == "travel" or (not invoice.reimb_type and "travel" in data.types)


def check_detail_rows_complete(data: ReimbursementFormData) -> tuple[bool, str]:
    """凡填写了物品名称的行，单价/数量/购买途径/是否可重复利用必须齐全。
    出行类报销允许负数单价（如退票差价），其他类型单价必须为正。"""
    for inv_idx, invoice in enumerate(data.invoices):
        allow_negative = _invoice_allow_negative(invoice, data)
        for i, item in enumerate(invoice.items):
            if item.get("name", "").strip():
                missing = []
                price = item.get("unit_price")
                if not price or (price <= 0 and not allow_negative):
                    missing.append("单价")
                if not item.get("quantity") or item["quantity"] <= 0:
                    missing.append("数量")
                if not item.get("purchase_channel", "").strip():
                    missing.append("购买途径")
                if not item.get("reusable", "").strip():
                    missing.append("是否可重复利用")
                if missing:
                    label = f"发票{inv_idx+1}第{i+1}行物品'{item['name']}'"
                    return False, f"{label}信息不完整，缺少：{'、'.join(missing)}"
    return True, ""


def check_at_least_one_item(data: ReimbursementFormData) -> tuple[bool, str]:
    """至少有一行完整有效的报销项（出行类允许负数单价）"""
    for invoice in data.invoices:
        allow_negative = _invoice_allow_negative(invoice, data)
        for item in invoice.items:
            name = item.get("name", "").strip()
            price = item.get("unit_price", 0)
            qty = item.get("quantity", 0)
            channel = item.get("purchase_channel", "").strip()
            reusable = item.get("reusable", "").strip()
            price_ok = (bool(price) and price != 0) if allow_negative else price > 0
            if name and price_ok and qty > 0 and channel and reusable:
                return True, ""
    return False, "明细表格至少需要一条完整有效的报销项"


def check_required_fields(data: ReimbursementFormData) -> tuple[bool, str]:
    """所有必填项非空"""
    required = {
        "活动名称": data.activity_name,
        "学生组织名称": data.org_name,
        "活动时间": data.activity_end_date,
        "报销时间": data.reimbursement_date,
        "经办人": data.finance_officer,
        "支付宝账号": data.alipay_account,
    }
    for label, value in required.items():
        if not value:
            return False, f"必填项'{label}'未填写"

    # 每张发票的必填项
    for i, inv in enumerate(data.invoices):
        if inv.reimbursement_amount <= 0:
            return False, f"发票{i+1}的报销金额未填写"
        if not inv.handler.strip():
            return False, f"发票{i+1}的经手人未填写"

    return True, ""


def check_reimbursement_le_invoice(data: ReimbursementFormData) -> tuple[bool, str]:
    """每张发票的报销金额 ≤ 该发票总额"""
    for i, inv in enumerate(data.invoices):
        if inv.reimbursement_amount > inv.invoice_total:
            return False, (
                f"发票{i+1}的报销金额({inv.reimbursement_amount})"
                f"不能超过发票总额({inv.invoice_total})"
            )
    return True, ""


def check_invoice_sections_exist(data: ReimbursementFormData) -> tuple[bool, str]:
    """至少有一张发票"""
    if not data.invoices:
        return False, "至少需要上传一张发票"
    return True, ""


_ALIPAY_MOBILE_RE = re.compile(r"^1[3-9]\d{9}$")
_ALIPAY_EMAIL_RE = re.compile(r"^[\w.+-]+@[\w-]+(\.[\w-]+)+$")


def check_alipay_format(data: ReimbursementFormData) -> tuple[bool, str]:
    """支付宝账号必须是 11 位手机号或邮箱"""
    v = data.alipay_account.strip()
    if v and not (_ALIPAY_MOBILE_RE.fullmatch(v) or _ALIPAY_EMAIL_RE.fullmatch(v)):
        return False, "支付宝账号格式不正确，请输入 11 位手机号或邮箱"
    return True, ""


# 校验规则注册表（按执行顺序）
RULES: list[tuple[str, Callable[[ReimbursementFormData], tuple[bool, str]]]] = [
    ("至少一张发票", check_invoice_sections_exist),
    ("明细行完整性", check_detail_rows_complete),
    ("至少一条有效报销项", check_at_least_one_item),
    ("必填项检查", check_required_fields),
    ("报销金额上限", check_reimbursement_le_invoice),
    ("支付宝账号格式", check_alipay_format),
]
