"""
打包模块。

将报销表Excel、发票图片、活动凭证照片打包为ZIP文件，
模拟推送至人工审核窗口的流程。
"""
import os
import zipfile
from datetime import datetime


def create_submission_package(
    excel_path: str,
    invoice_files: list[str],
    evidence_files: list[str],
    output_dir: str,
    activity_name: str = "",
) -> str:
    """
    将报销表、发票、活动凭证打包为一个ZIP文件。

    Args:
        excel_path: 生成的报销表Excel路径
        invoice_files: 发票图片/PDF路径列表
        evidence_files: 活动凭证图片路径列表
        output_dir: 输出目录
        activity_name: 活动名称（用于文件命名）

    Returns:
        str: 生成的ZIP文件路径
    """
    os.makedirs(output_dir, exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    safe_name = activity_name or "未命名"
    # 移除文件名中的非法字符
    safe_name = "".join(c for c in safe_name if c not in r'\/:*?"<>|')
    zip_filename = f"报销申请_{safe_name}_{timestamp}.zip"
    zip_path = os.path.join(output_dir, zip_filename)

    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        # 报销表
        if os.path.exists(excel_path):
            zf.write(excel_path, f"报销表/{os.path.basename(excel_path)}")

        # 发票（按顺序编号）
        for i, fpath in enumerate(invoice_files, 1):
            if os.path.exists(fpath):
                ext = os.path.splitext(fpath)[1]
                zf.write(fpath, f"发票/发票_{i:02d}{ext}")

        # 活动凭证（按顺序编号）
        for i, fpath in enumerate(evidence_files, 1):
            if os.path.exists(fpath):
                ext = os.path.splitext(fpath)[1]
                zf.write(fpath, f"活动凭证/凭证_{i:02d}{ext}")

    return zip_path
