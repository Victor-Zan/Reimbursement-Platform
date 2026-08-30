"""
校验引擎。

对 ReimbursementFormData 执行所有注册的校验规则，
返回汇总的校验结果。
"""
from reimbursement_types import REIMBURSEMENT_TYPES
from validation_rules import RULES, ReimbursementFormData, InvoiceSectionData


class ValidationResult:
    """单次校验结果。"""

    def __init__(self):
        self.passed: bool = True
        self.errors: list[dict] = []   # [{"rule": str, "message": str}]

    def add_error(self, rule_name: str, message: str):
        self.passed = False
        self.errors.append({"rule": rule_name, "message": message})


def validate_form(data: ReimbursementFormData) -> ValidationResult:
    """
    对报销表单数据执行全部校验规则。
    """
    result = ValidationResult()
    for rule_name, rule_fn in RULES:
        ok, message = rule_fn(data)
        if not ok:
            result.add_error(rule_name, message)
    return result


def build_form_data(json_data: dict) -> ReimbursementFormData:
    """从 JSON 字典构建 ReimbursementFormData 实例。"""
    # 多类型数组；旧请求只有 type 字段时回退单类型
    raw_types = json_data.get("types") or []
    if not isinstance(raw_types, list):
        raw_types = []
    types = [t for t in raw_types if isinstance(t, str) and t in REIMBURSEMENT_TYPES]
    if not types:
        types = [json_data.get("type", "vat") or "vat"]
        if types[0] not in REIMBURSEMENT_TYPES:
            types = ["vat"]

    invoices = []
    for inv in json_data.get("invoices", []):
        invoices.append(InvoiceSectionData(
            buyer_name=inv.get("buyer_name", ""),
            buyer_tax_id=inv.get("buyer_tax_id", ""),
            buyer_name_valid=inv.get("buyer_name_valid", False),
            buyer_tax_id_valid=inv.get("buyer_tax_id_valid", False),
            invoice_date=inv.get("invoice_date", ""),
            invoice_total=float(inv.get("invoice_total", 0)),
            reimbursement_amount=float(inv.get("reimbursement_amount", 0)),
            handler=inv.get("handler", ""),
            items=inv.get("items", []),
            reimb_type=inv.get("reimb_type", "") or (types[0] if len(types) == 1 else "vat"),
            is_public_transfer=bool(inv.get("is_public_transfer", False)),
        ))

    return ReimbursementFormData(
        type=types[0] if types else "vat",
        types=types,
        activity_name=json_data.get("activity_name", ""),
        org_name=json_data.get("org_name", ""),
        activity_end_date=json_data.get("activity_end_date", ""),
        reimbursement_date=json_data.get("reimbursement_date", ""),
        invoices=invoices,
        actual_total=float(json_data.get("actual_total", 0)),
        finance_officer=json_data.get("finance_officer", ""),
        activity_leader_opinion=json_data.get("activity_leader_opinion", ""),
        alipay_account=json_data.get("alipay_account", ""),
    )
