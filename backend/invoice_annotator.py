"""
发票信息拼接模块。

在发票图片底部添加白底黑字信息条：
  学生组织名称、活动名称、发票对应物品、金额
"""
import io
import os

from PIL import Image, ImageDraw, ImageFont


def _load_font(size: int):
    """加载中文字体，优先系统自带。"""
    font_paths = [
        "C:/Windows/Fonts/msyh.ttc",       # 微软雅黑
        "C:/Windows/Fonts/simsun.ttc",      # 宋体
        "C:/Windows/Fonts/simhei.ttf",      # 黑体
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
    for fp in font_paths:
        if os.path.exists(fp):
            return ImageFont.truetype(fp, size)
    return ImageFont.load_default()


def annotate_invoice(
    invoice_path: str,
    org_name: str,
    activity_name: str,
    item_names: str,
    amount: str,
    output_dir: str,
) -> str:
    """
    在发票底部拼接白底黑字信息条。

    Args:
        invoice_path: 原始发票文件路径（PDF/PNG/JPG）
        org_name: 学生组织名称
        activity_name: 活动名称
        item_names: 发票对应物品（多个用逗号分隔）
        amount: 金额
        output_dir: 输出目录

    Returns:
        带标注的 PNG 文件路径
    """
    # 1. 加载发票为 PIL Image
    ext = os.path.splitext(invoice_path)[1].lower()
    if ext == ".pdf":
        try:
            import pypdfium2 as pdfium
            pdf = pdfium.PdfDocument(invoice_path)
            page = pdf[0]
            bitmap = page.render(scale=2)  # 2x 缩放保证清晰度
            pil_image = bitmap.to_pil()
        except Exception:
            raise RuntimeError(f"PDF 渲染失败: {invoice_path}")
    else:
        pil_image = Image.open(invoice_path).convert("RGB")

    # 2. 创建信息条
    w = pil_image.width
    bar_h = 100
    font = _load_font(20)

    bar = Image.new("RGB", (w, bar_h), color="white")
    draw = ImageDraw.Draw(bar)

    lines = [
        f"学生组织：{org_name}",
        f"活动名称：{activity_name}",
        f"对应物品：{item_names}",
        f"金额：{amount}",
    ]
    y = 6
    for line in lines:
        draw.text((12, y), line, fill="black", font=font)
        y += 22

    # 3. 纵向拼接
    result = Image.new("RGB", (w, pil_image.height + bar_h))
    result.paste(pil_image, (0, 0))
    result.paste(bar, (0, pil_image.height))

    # 4. 保存
    base = os.path.splitext(os.path.basename(invoice_path))[0]
    out_path = os.path.join(output_dir, f"annotated_{base}.png")
    result.save(out_path, "PNG")
    return out_path
