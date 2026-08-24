"""
OCR引擎模块 —— 抽象接口 + 可插拔实现。

引擎列表:
    PDFInvoiceEngine  — 用 pdfplumber 提取 PDF 电子发票文字并解析（默认）
    BaiduOCREngine    — 百度云增值税发票OCR API
    MockOCREngine     — 开发调试用，返回固定数据
"""
import base64
import io
import re
from abc import ABC, abstractmethod
from typing import Optional

import requests


# 发票明细中常见的单位词（用于后处理清洗）
_UNIT_WORDS = re.compile(r'\s+[份个瓶支包箱千克公斤吨件套台张本](?=\s|$)')
_SPEC_PATTERN = re.compile(r'\s+\*{1,2}(?=\s|$)')


def _strip_spec_and_unit(name_raw: str) -> str:
    """从可能包含规格(**)和单位(份)的原始名称中剥掉尾部杂质。"""
    name = name_raw.strip()
    name = _SPEC_PATTERN.sub('', name)    # 去掉 ** 或 *
    name = _UNIT_WORDS.sub('', name)      # 去掉 份/个/箱 等单位
    return name.strip()


def _clean_item_name(raw: str) -> str:
    """
    清理发票货物名称。

    增值税发票格式: *类别*物品名
    清理规则: 去掉首尾的 * 和空格，中间的 * 改为 /
    例如: *生物化学制品*防晒喷雾 → 生物化学制品/防晒喷雾
    """
    name = raw.strip()
    name = name.strip("*").strip()
    name = name.replace("*", "/")
    return name
    """
    清理发票货物名称。

    增值税发票格式: *类别*物品名*规格*...
    清理规则: 去掉首尾的 *，中间的 * 改为 /
    例如: *生物化学制品*防晒喷雾 → 生物化学制品/防晒喷雾
    """
    name = raw.strip()
    name = name.strip("*")
    name = name.replace("*", "/")
    return name

from config import (
    BAIDU_OCR_API_KEY,
    BAIDU_OCR_SECRET_KEY,
    BAIDU_OCR_TOKEN_URL,
    BAIDU_OCR_VAT_INVOICE_URL,
    EXPECTED_BUYER_NAME,
    EXPECTED_TAX_ID,
)
from ocr_field_mapping import OCRResult, InvoiceItem


# ============================================================
# 抽象接口
# ============================================================

class BaseOCREngine(ABC):
    """OCR引擎抽象基类。"""

    @abstractmethod
    def recognize_invoice(self, image_bytes: bytes, filename: str = "") -> OCRResult:
        """识别发票图片/PDF，返回结构化OCR结果。"""
        ...


# ============================================================
# PDF 电子发票解析引擎（默认）
# ============================================================

class PDFInvoiceEngine(BaseOCREngine):
    """
    从 PDF 电子发票中提取文字并解析字段。

    适用于 OFD 转 PDF 的中国增值税电子普通发票，
    文字层可直接读取，无需 OCR 图片识别。
    """

    def recognize_invoice(self, image_bytes: bytes, filename: str = "") -> OCRResult:
        is_pdf = filename.lower().endswith(".pdf") if filename else False

        if not is_pdf:
            return OCRResult(
                errors=["暂不支持图片格式发票，请上传 PDF 电子发票"],
            )

        try:
            import pdfplumber
            pdf = pdfplumber.open(io.BytesIO(image_bytes))
            if not pdf.pages:
                return OCRResult(errors=["PDF 文件为空"])
            text = "\n".join(
                page.extract_text() or "" for page in pdf.pages
            )
            pdf.close()
            return self._parse_invoice_text(text)
        except Exception as e:
            return OCRResult(errors=[f"PDF 解析失败: {str(e)}"])

    def _parse_invoice_text(self, text: str) -> OCRResult:
        """从发票文本中提取结构化字段。"""
        errors = []
        warnings = []

        # ---- 购买方名称 ----
        buyer_name = ""
        # 匹配 "名称：香港中文大学（深圳）" 或 "购买方名称: xxx"
        m = re.search(r"名\s*称[：:]\s*(.+?)(?:\s|$)", text)
        if m:
            # 可能有多个"名称"，找购买方那个（在纳税人识别号附近）
            # 尝试更精准的匹配
            pass

        # 搜索购买方区块
        buyer_section = ""
        m = re.search(
            r"购买方\s*(.*?)(?:销售方|密码区|货物或应税劳务|价税合计)",
            text, re.DOTALL
        )
        if m:
            buyer_section = m.group(1)

        # 提取购买方名称（简单匹配：名称后到行尾）
        m = re.search(r"名\s*称[：:]\s*(.+)", buyer_section or text)
        if m:
            buyer_name = m.group(1).strip()

        # 提取纳税人识别号
        buyer_tax_id = ""
        m = re.search(r"纳税人识别号[：:]\s*([0-9A-Za-z]+)", buyer_section or text)
        if m:
            buyer_tax_id = m.group(1).strip()

        # ---- 开票日期 ----
        invoice_date = ""
        m = re.search(r"开票日期[：:]\s*(\d{4}年\d{1,2}月\d{1,2}日|\d{4}-\d{2}-\d{2})", text)
        if m:
            date_str = m.group(1)
            date_str = date_str.replace("年", "-").replace("月", "-").replace("日", "")
            invoice_date = date_str

        # ---- 发票总额（价税合计）----
        invoice_total = 0.0
        # 优先匹配 "小写) ¥136.00" 或 "小写）¥136.00"
        m = re.search(r"小写\s*[)）]?\s*[¥￥]\s*([\d,]+\.?\d*)", text)
        if m:
            try:
                invoice_total = float(m.group(1).replace(",", ""))
            except ValueError:
                pass
        # 回退：取最后一个 ¥ 金额
        if invoice_total == 0.0:
            amounts = re.findall(r"[¥￥]\s*([\d,]+\.?\d*)", text)
            if amounts:
                try:
                    invoice_total = float(amounts[-1].replace(",", ""))
                except ValueError:
                    pass

        # ---- 明细行 ----
        # 列结构：货物名称 | 规格型号 | 单位 | 数量 | 单价 | 金额 | 税率 | 税额
        # 规格(**)和单位(份)在名称和数字之间，也可能省略
        # 核心思路：匹配 *类别*物品名 → 跳过中间的 ** 和单位 → 匹配数字
        items = []

        # 完整匹配（含税额）：名称(可能含杂质) → 数量/单价/金额/税率/税额
        # 用非贪婪 .+? 匹配名称部分，再通过 _strip_spec_and_unit 剥掉杂质
        full_pattern = re.findall(
            r"(\*[^*]+\*.+?)"                   # 名称(非贪婪，可能含规格/单位)
            r"\s+(\d+(?:\.\d+)?)"              # 数量
            r"\s+([\d.]+)"                     # 单价
            r"\s+([\d.]+)"                     # 金额
            r"(?:\s+(\d+%))?"                  # 税率 (可选)
            r"\s+([\d.]+)",                    # 税额
            text
        )
        for match in full_pattern:
            name_raw, qty, unit_price, amount, tax_rate, tax_amount = match
            try:
                name = _clean_item_name(_strip_spec_and_unit(name_raw))
                up = float(unit_price)
                q = int(float(qty))
                amt = float(amount)
                tax = float(tax_amount)
                items.append(InvoiceItem(
                    name=name, unit_price=up, quantity=q, amount=amt,
                    tax_amount=tax, total_with_tax=amt + tax,
                ))
            except ValueError:
                continue

        # 宽松匹配（无税额列）
        if not items:
            loose_pattern = re.findall(
                r"(\*[^*]+\*.+?)"                   # 名称(非贪婪)
                r"\s+(\d+(?:\.\d+)?)"              # 数量
                r"\s+([\d.]+)"                     # 单价
                r"\s+([\d.]+)",                    # 金额
                text
            )
            for match in loose_pattern:
                name_raw, qty, unit_price, amount = match
                try:
                    name = _clean_item_name(_strip_spec_and_unit(name_raw))
                    items.append(InvoiceItem(
                        name=name,
                        unit_price=float(unit_price),
                        quantity=int(float(qty)),
                        amount=float(amount),
                        tax_amount=0.0, total_with_tax=float(amount),
                    ))
                except ValueError:
                    continue

        # 如果还是没有，尝试提取 "货物或应税劳务名称" 后面的内容
        if not items:
            m = re.search(
                r"货物或应税劳务[、\s]*名称\s*(.+?)(?:合计|价税合计|$)",
                text, re.DOTALL
            )
            if m:
                detail_text = m.group(1)
                # 简单提取：找行首的 * 开头的内容
                item_names = re.findall(r"\*[^*]+\*[^\d]+", detail_text)
                numbers = re.findall(r"([\d.]+)", detail_text)
                if item_names and len(numbers) >= len(item_names) * 4:
                    for i, name in enumerate(item_names):
                        base = i * 4
                        try:
                            qty = int(float(numbers[base])) if base < len(numbers) else 1
                            up = float(numbers[base + 1]) if base + 1 < len(numbers) else 0.0
                            amt = float(numbers[base + 2]) if base + 2 < len(numbers) else 0.0
                            tax = float(numbers[base + 3]) if base + 3 < len(numbers) else 0.0
                            items.append(InvoiceItem(
                                name=_clean_item_name(name),
                                unit_price=up,
                                quantity=qty,
                                amount=amt,
                                tax_amount=tax,
                                total_with_tax=amt + tax,
                            ))
                        except (ValueError, IndexError):
                            pass

        # ---- 校验 ----
        name_ok = buyer_name == EXPECTED_BUYER_NAME
        tax_ok = buyer_tax_id == EXPECTED_TAX_ID

        if buyer_name and not name_ok:
            warnings.append(f"购买方名称'{buyer_name}'与预期'{EXPECTED_BUYER_NAME}'不一致")
        if buyer_tax_id and not tax_ok:
            warnings.append(f"税号'{buyer_tax_id}'与预期'{EXPECTED_TAX_ID}'不一致")

        return OCRResult(
            buyer_name=buyer_name,
            buyer_tax_id=buyer_tax_id,
            buyer_name_valid=name_ok and bool(buyer_name),
            buyer_tax_id_valid=tax_ok and bool(buyer_tax_id),
            invoice_date=invoice_date,
            invoice_total=invoice_total,
            items=items,
            errors=errors,
            warnings=warnings,
        )


# ============================================================
# 百度 OCR 引擎
# ============================================================

class BaiduOCREngine(BaseOCREngine):
    """百度云增值税发票OCR识别引擎。"""

    def __init__(self):
        self._access_token: Optional[str] = None

    def _get_access_token(self) -> str:
        if self._access_token:
            return self._access_token

        resp = requests.get(BAIDU_OCR_TOKEN_URL, params={
            "grant_type": "client_credentials",
            "client_id": BAIDU_OCR_API_KEY,
            "client_secret": BAIDU_OCR_SECRET_KEY,
        })
        resp.raise_for_status()
        data = resp.json()
        self._access_token = data.get("access_token", "")
        return self._access_token

    def recognize_invoice(self, image_bytes: bytes, filename: str = "") -> OCRResult:
        b64_image = base64.b64encode(image_bytes).decode("utf-8")
        is_pdf = filename.lower().endswith(".pdf")
        param_key = "pdf_file" if is_pdf else "image"

        headers = {}
        if BAIDU_OCR_API_KEY.startswith("bce-v3/"):
            # 新版 IAM API-Key 认证（bce-v3/ALTAK-... 格式）：Bearer 头直连，无需 access_token
            headers["Authorization"] = f"Bearer {BAIDU_OCR_API_KEY}"
            url = BAIDU_OCR_VAT_INVOICE_URL
        else:
            # 旧版 AK/SK 认证：先取 access_token 再调用
            token = self._get_access_token()
            url = f"{BAIDU_OCR_VAT_INVOICE_URL}?access_token={token}"

        try:
            resp = requests.post(
                url,
                data={param_key: b64_image},
                headers=headers,
                timeout=30,
            )
            resp.raise_for_status()
            api_result = resp.json()
        except requests.RequestException as e:
            return OCRResult(errors=[f"OCR请求失败: {str(e)}"])

        return self._parse_response(api_result)

    def _parse_response(self, data: dict) -> OCRResult:
        if data.get("error_code"):
            # 百度侧返回错误（如未开通服务/配额不足），透传给用户便于排查
            return OCRResult(errors=[f"百度OCR错误 {data['error_code']}: {data.get('error_msg', '')}"])

        wr = data.get("words_result", {})

        def get_word(key: str, default=""):
            node = wr.get(key, default)
            if isinstance(node, dict):
                return node.get("word", default)
            elif isinstance(node, str):
                return node
            return default

        buyer_name = get_word("PurchaserName")
        buyer_tax_id = get_word("PurchaserRegisterNum")
        invoice_date = get_word("InvoiceDate")
        # AmountInFiguers = 价税合计小写, TotalAmount = 不含税合计
        try:
            invoice_total = float(get_word("AmountInFiguers", "0"))
        except (ValueError, TypeError):
            invoice_total = 0.0

        # 明细行：百度API返回多个并行数组，按行号对齐
        items = []
        names = wr.get("CommodityName", [])
        nums = {r["row"]: r["word"] for r in (wr.get("CommodityNum", []) or []) if "row" in r}
        prices = {r["row"]: r["word"] for r in (wr.get("CommodityPrice", []) or []) if "row" in r}
        amounts = {r["row"]: r["word"] for r in (wr.get("CommodityAmount", []) or []) if "row" in r}
        taxes = {r["row"]: r["word"] for r in (wr.get("CommodityTax", []) or []) if "row" in r}

        for name_row in (names or []):
            row_id = name_row.get("row", "1")
            name = name_row.get("word", "")
            try:
                up = float(prices.get(row_id, "0"))
            except (ValueError, TypeError):
                up = 0.0
            try:
                qty = int(float(nums.get(row_id, "1")))
            except (ValueError, TypeError):
                qty = 1
            try:
                amt = float(amounts.get(row_id, "0"))
            except (ValueError, TypeError):
                amt = 0.0
            try:
                tax = float(taxes.get(row_id, "0"))
            except (ValueError, TypeError):
                tax = 0.0

            items.append(InvoiceItem(
                name=_clean_item_name(name), unit_price=up, quantity=qty,
                amount=amt, tax_amount=tax,
                total_with_tax=amt + tax,
            ))

        errors = []
        warnings = []
        name_ok = buyer_name == EXPECTED_BUYER_NAME
        tax_ok = buyer_tax_id == EXPECTED_TAX_ID

        if buyer_name and not name_ok:
            warnings.append(f"购买方名称'{buyer_name}'与预期'{EXPECTED_BUYER_NAME}'不一致")
        if buyer_tax_id and not tax_ok:
            warnings.append(f"税号'{buyer_tax_id}'与预期'{EXPECTED_TAX_ID}'不一致")

        return OCRResult(
            buyer_name=buyer_name, buyer_tax_id=buyer_tax_id,
            buyer_name_valid=name_ok and bool(buyer_name),
            buyer_tax_id_valid=tax_ok and bool(buyer_tax_id),
            invoice_date=invoice_date, invoice_total=invoice_total,
            items=items, errors=errors, warnings=warnings,
        )


# ============================================================
# Mock 引擎（开发调试用，返回固定数据）
# ============================================================

class MockOCREngine(BaseOCREngine):
    """Mock OCR引擎——仅开发调试时使用。"""

    def recognize_invoice(self, image_bytes: bytes, filename: str = "") -> OCRResult:
        return OCRResult(
            buyer_name="香港中文大学（深圳）",
            buyer_tax_id="12440300066312613F",
            buyer_name_valid=True,
            buyer_tax_id_valid=True,
            invoice_date="2026-03-25",
            invoice_total=136.00,
            items=[
                InvoiceItem(
                    name="生物化学制品/防晒喷雾",
                    unit_price=128.30, quantity=1,
                    amount=128.30, tax_amount=7.70,
                    total_with_tax=136.00,
                )
            ],
        )


# ============================================================
# 工厂函数
# ============================================================

def get_ocr_engine() -> BaseOCREngine:
    """根据配置返回OCR引擎实例。"""
    from config import OCR_ENGINE

    if OCR_ENGINE == "baidu":
        return BaiduOCREngine()
    elif OCR_ENGINE == "mock":
        return MockOCREngine()
    else:
        # 默认使用 PDF 解析引擎
        return PDFInvoiceEngine()
