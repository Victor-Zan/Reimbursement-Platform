"""
OCR 结果 → 报销表字段映射配置。

定义发票OCR返回的字段如何映射到报销表的各个字段。
支持多张发票的场景。
"""
from dataclasses import dataclass, field


@dataclass
class InvoiceItem:
    """发票明细行（OCR提取的货物/服务条目）"""
    name: str = ""                 # 货物名称
    unit_price: float = 0.0        # 单价（税前）
    quantity: float = 1.0          # 数量
    amount: float = 0.0            # 金额（税前）
    tax_amount: float = 0.0        # 税额
    total_with_tax: float = 0.0    # 含税金额


@dataclass
class OCRResult:
    """
    单张发票的OCR识别结果。
    """
    # ---- 从发票提取的字段 ----
    buyer_name: str = ""             # 购买方名称
    buyer_tax_id: str = ""           # 购买方纳税人识别号
    buyer_name_valid: bool = False   # 名称是否匹配预期
    buyer_tax_id_valid: bool = False # 税号是否匹配预期
    invoice_date: str = ""           # 开票日期
    invoice_total: float = 0.0       # 价税合计（发票总额）
    items: list[InvoiceItem] = field(default_factory=list)  # 明细行

    # ---- 手写体字段（第一版预留，暂不提取）----
    handwritten_activity_name: str = ""
    handwritten_org_name: str = ""
    handwritten_item_name: str = ""
    handwritten_amount: float = 0.0

    # ---- 错误/警告信息 ----
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


@dataclass
class InvoiceSection:
    """
    报销表中的一张发票区块。

    包含该发票的识别信息、明细行、以及该发票对应的
    报销金额和经手人（不同发票可能不同）。
    """
    buyer_name: str = ""
    buyer_tax_id: str = ""
    buyer_name_valid: bool = False
    buyer_tax_id_valid: bool = False
    invoice_date: str = ""
    invoice_total: float = 0.0       # 该发票的价税合计
    reimbursement_amount: float = 0.0  # 该发票对应的报销金额
    handler: str = ""                # 该发票对应的经手人(商品购买人)
    items: list[dict] = field(default_factory=list)
    # items 每条: {"name": str, "unit_price": float, "quantity": int,
    #              "purchase_channel": str, "reusable": str,
    #              "source_invoice_item": bool}
