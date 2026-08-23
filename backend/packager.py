"""
打包模块。

将报销表Excel与各材料文件（发票、活动凭证、保单、身份凭证、行程单、支付记录）
打包为ZIP文件，模拟推送至人工审核窗口的流程。
"""
import os
import secrets
import zipfile
from datetime import datetime

from reimbursement_types import MATERIALS, TYPE_LABELS, material_cfg


def create_submission_package(
    excel_path: str,
    material_groups: dict[str, list[str]],
    output_dir: str,
    activity_name: str = "",
    nested: bool = False,
) -> str:
    """
    将报销表与各材料打包为一个ZIP文件。

    Args:
        excel_path: 生成的报销表Excel路径
        material_groups: 单类型为 {材料key: 文件路径列表}；nested=True 时为 {类型: {材料key: 路径列表}}
        output_dir: 输出目录
        activity_name: 活动名称（用于文件命名）
        nested: 多类型报销时按类型建子文件夹（{类型标签}/{材料文件夹}/...）

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
    # 同一秒多次提交时避免同名覆盖：冲突时追加 4 位随机段重试
    while os.path.exists(zip_path):
        zip_filename = f"报销申请_{safe_name}_{timestamp}_{secrets.token_hex(2)}.zip"
        zip_path = os.path.join(output_dir, zip_filename)

    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        # 报销表
        if os.path.exists(excel_path):
            zf.write(excel_path, f"报销表/{os.path.basename(excel_path)}")

        def _write_material(zf, folder, prefix, fpaths):
            for i, fpath in enumerate(fpaths, 1):
                if os.path.exists(fpath):
                    ext = os.path.splitext(fpath)[1]
                    zf.write(fpath, f"{folder}/{prefix}_{i:02d}{ext}")

        if nested:
            # 多类型：按类型标签建子文件夹（{类型}/{材料文件夹}/{前缀}_{编号}{ext}）
            for rtype, groups in material_groups.items():
                for key, fpaths in groups.items():
                    cfg = material_cfg(rtype, key)
                    _write_material(zf, f"{TYPE_LABELS[rtype]}/{cfg['zip_folder']}", cfg["zip_prefix"], fpaths)
        else:
            # 单类型：平铺文件夹（与历史提交一致）
            for key, fpaths in material_groups.items():
                cfg = MATERIALS[key]
                _write_material(zf, cfg["zip_folder"], cfg["zip_prefix"], fpaths)

    return zip_path
