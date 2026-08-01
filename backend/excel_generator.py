"""
Excel报销表生成引擎。

基于空白报销表模板，填入表单数据，输出填好的Excel文件。
支持多张发票：同一发票的明细行在G/H/I列纵向合并。
"""
import os
from datetime import datetime

import openpyxl
from openpyxl.styles import Alignment

from config import TEMPLATE_XLSX_PATH
from validation_rules import ReimbursementFormData

# 统一对齐样式：水平垂直居中 + 长文本自动缩小
_CENTER = Alignment(
    horizontal="center",
    vertical="center",
    shrink_to_fit=True,
    wrap_text=False,
)


def _write(ws, row, col, value, fmt=None):
    """写入单元格并应用居中对齐，可选数字格式。"""
    cell = ws.cell(row=row, column=col, value=value)
    cell.alignment = _CENTER
    if fmt:
        cell.number_format = fmt
    return cell


def generate_reimbursement_excel(
    form_data: ReimbursementFormData,
    output_dir: str,
) -> str:
    if not os.path.exists(TEMPLATE_XLSX_PATH):
        raise FileNotFoundError(f"模板文件不存在: {TEMPLATE_XLSX_PATH}")

    wb = openpyxl.load_workbook(TEMPLATE_XLSX_PATH)
    ws = wb.active

    # ---- 表头信息 ----
    _write(ws, 2, 3, form_data.activity_name)
    _write(ws, 2, 7, form_data.org_name)
    _write(ws, 3, 3, form_data.activity_end_date)
    _write(ws, 3, 7, form_data.reimbursement_date)

    # ---- 第4-5行标签完全不动 ----

    # ---- 明细行 + G-I列纵向合并 ----
    current_row = 6
    max_rows = 20

    for inv_idx, invoice in enumerate(form_data.invoices):
        if current_row > max_rows:
            break

        start_row = current_row

        for item in invoice.items:
            if current_row > max_rows:
                break

            _write(ws, current_row, 1, item.get("name", ""))
            channel = item.get("purchase_channel", "")
            reusable = item.get("reusable", "")
            _write(ws, current_row, 4,
                   f"{channel} | {reusable}" if channel and reusable else "")
            _write(ws, current_row, 5, item.get("unit_price", 0), "0.00")
            _write(ws, current_row, 6, item.get("quantity", 0))
            current_row += 1

        end_row = current_row - 1

        if end_row >= start_row:
            if end_row > start_row:
                ws.merge_cells(f"G{start_row}:G{end_row}")
                ws.merge_cells(f"H{start_row}:H{end_row}")
                ws.merge_cells(f"I{start_row}:I{end_row}")

            _write(ws, start_row, 7, invoice.invoice_total, "0.00")
            _write(ws, start_row, 8, invoice.reimbursement_amount, "0.00")
            _write(ws, start_row, 9, invoice.handler)

    # ---- 合计行 ----
    _write(ws, 21, 4, form_data.actual_total, "0.00")

    # ---- 表尾 ----
    _write(ws, 23, 1, form_data.finance_officer)
    _write(ws, 23, 5, form_data.activity_leader_opinion)
    _write(ws, 24, 4, form_data.alipay_account)

    # ---- 保存 ----
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    safe_name = form_data.activity_name or "未命名"
    safe_name = "".join(c for c in safe_name if c not in r'\/:*?"<>|')
    filename = f"报销表_{safe_name}_{timestamp}.xlsx"
    filepath = os.path.join(output_dir, filename)
    wb.save(filepath)

    return filepath
