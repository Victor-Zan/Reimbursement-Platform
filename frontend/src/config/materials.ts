/**
 * 报销类型与材料配置（前端渲染与预校验用）。
 *
 * 后端事实源: backend/reimbursement_types.py —— key 与数值规则（min/max/accept）
 * 必须与后端保持一致，后端 submit 会硬校验，这里只负责卡片渲染与 canNext 预校验。
 * 修改材料配置时请同步两端。
 */
import type { ReimbursementType, MaterialKey } from '../types';

export interface MaterialConfig {
  key: MaterialKey;
  label: string;
  icon: string;
  hint: string;
  accept: string;
  minCount: number;
  maxCount: number | null;
  useOCR: boolean;
  /** 审核端快捷批注模板 */
  quickComments: string[];
}

export interface TypeConfig {
  key: ReimbursementType;
  label: string;
  /** 审核端识别色（徽章/色条/分组标题） */
  color: string;
  icon: string;
  description: string;
}

export const TYPE_CONFIGS: Record<ReimbursementType, TypeConfig> = {
  vat: {
    key: 'vat', label: '增值税报销', color: '#7C3AED', icon: 'file-text',
    description: '适用于增值税普通发票的学生活动经费报销，支持多发票上传、OCR自动识别、一键生成报销表',
  },
  insurance: {
    key: 'insurance', label: '保险报销', color: '#0F766E', icon: 'shield',
    description: '适用于购买保险的学生活动报销，上传保险发票与保单',
  },
  travel: {
    key: 'travel', label: '路费报销', color: '#C2410C', icon: 'train',
    description: '适用于出行路费报销，电子发票自动识别，纸质车票手动填写',
  },
  bulk: {
    key: 'bulk', label: '大量发票报销', color: '#A16207', icon: 'receipt',
    description: '适用于发票数量多的活动报销，最多支持 30 张发票',
  },
};

/** "其他类报销"入口下的三种类型（增值税在首页直接进入） */
export const OTHER_TYPES: ReimbursementType[] = ['insurance', 'travel', 'bulk'];

export const MATERIALS: Record<MaterialKey, MaterialConfig> = {
  invoices: {
    key: 'invoices', label: '发票', icon: 'receipt',
    hint: '仅支持增值税普通发票，可一次选择多个文件', accept: '.pdf,.png,.jpg,.jpeg',
    minCount: 1, maxCount: null, useOCR: true,
    quickComments: ['发票缺少公章', '发票印章不清晰', '发票信息与拼接信息不符'],
  },
  evidence: {
    key: 'evidence', label: '活动凭证', icon: 'camera',
    hint: '必须是活动现场照片', accept: '.png,.jpg,.jpeg',
    minCount: 1, maxCount: 20, useOCR: false,
    quickComments: ['活动凭证不清晰', '缺少活动现场照片', '凭证无法证明活动真实性'],
  },
  policy: {
    key: 'policy', label: '保险保单', icon: 'shield',
    hint: '上传该次报销对应的保险保单（PDF 或图片）', accept: '.pdf,.png,.jpg,.jpeg',
    minCount: 1, maxCount: 10, useOCR: false,
    quickComments: ['保单信息与活动不符', '保单缺少投保人信息', '保单文件不清晰'],
  },
  rider_ids: {
    key: 'rider_ids', label: '乘车人员身份凭证', icon: 'id-card',
    hint: '每位乘车人分别上传各自的身份证/学生证照片（图片或 PDF）', accept: '.pdf,.png,.jpg,.jpeg',
    minCount: 1, maxCount: 50, useOCR: false,
    quickComments: ['身份凭证不清晰', '缺少乘车人身份凭证', '凭证与乘车人不符'],
  },
  itinerary: {
    key: 'itinerary', label: '出行行程单', icon: 'map',
    hint: '上传出行行程单（PDF 或图片）', accept: '.pdf,.png,.jpg,.jpeg',
    minCount: 1, maxCount: 10, useOCR: false,
    quickComments: ['行程单信息不完整', '行程单与票据不符'],
  },
  payments: {
    key: 'payments', label: '出行支付记录', icon: 'credit-card',
    hint: '上传出行费用支付记录截图', accept: '.png,.jpg,.jpeg',
    minCount: 1, maxCount: 20, useOCR: false,
    quickComments: ['支付记录不清晰', '支付记录与金额不符'],
  },
};

/** 每种报销类型需要的材料（顺序即上传/预览/审核展示顺序） */
export const TYPE_MATERIALS: Record<ReimbursementType, MaterialKey[]> = {
  vat: ['invoices', 'evidence'],
  insurance: ['invoices', 'policy'],
  travel: ['invoices', 'rider_ids', 'itinerary', 'payments'],
  bulk: ['invoices', 'evidence'],
};

/** 类型级覆盖（默认继承 MATERIALS，与后端 TYPE_OVERRIDES 一致） */
const TYPE_OVERRIDES: Partial<Record<ReimbursementType, Partial<Record<MaterialKey, Partial<MaterialConfig>>>>> = {
  travel: { invoices: { label: '交通票据', hint: '电子发票自动识别；纸质车票识别失败后可手动填写' } },
  bulk: { invoices: { maxCount: 30, hint: '最多上传 30 张发票' } },
};

/** 取某类型下某材料的最终配置 */
export function materialFor(type: ReimbursementType, key: MaterialKey): MaterialConfig {
  return { ...MATERIALS[key], ...(TYPE_OVERRIDES[type]?.[key] || {}) };
}

/** 类型中文名（旧数据无 type 兜底"增值税报销"） */
export function typeLabel(type?: string): string {
  return TYPE_CONFIGS[type as ReimbursementType]?.label || TYPE_CONFIGS.vat.label;
}

/** 类型识别色（旧数据无 type 兜底增值税色） */
export function typeColor(type?: string): string {
  return TYPE_CONFIGS[type as ReimbursementType]?.color || TYPE_CONFIGS.vat.color;
}
