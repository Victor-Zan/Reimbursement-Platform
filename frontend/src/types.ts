/**
 * 共享类型定义 — 支持多发票。
 */

/** 发票明细项（OCR提取） */
export interface InvoiceItem {
  name: string;
  unit_price: number;
  quantity: number;
  amount: number;
  tax_amount: number;
  total_with_tax: number;
}

/** 单张发票的OCR识别结果 */
export interface OCRResult {
  buyer_name: string;
  buyer_tax_id: string;
  buyer_name_valid: boolean;
  buyer_tax_id_valid: boolean;
  invoice_date: string;
  invoice_total: number;
  items: InvoiceItem[];
  handwritten_activity_name: string;
  handwritten_org_name: string;
  handwritten_item_name: string;
  handwritten_amount: number;
}

/** 报销表明细行（用户可编辑） */
export interface DetailRow {
  name: string;
  unit_price: number;
  quantity: number;
  amount: number;
  purchase_channel: string;
  reusable: string;
  source_invoice_item: boolean;
}

/** 单张发票在报销表中的数据区块 */
export interface InvoiceSection {
  buyer_name: string;
  buyer_tax_id: string;
  buyer_name_valid: boolean;
  buyer_tax_id_valid: boolean;
  invoice_date: string;
  invoice_total: number;
  reimbursement_amount: number;
  handler: string;
  items: DetailRow[];
}

/** 完整报销表单数据 */
export interface ReimbursementFormData {
  activity_name: string;
  org_name: string;
  activity_end_date: string;
  reimbursement_date: string;
  invoices: InvoiceSection[];
  actual_total: number;
  finance_officer: string;
  activity_leader_opinion: string;
  alipay_account: string;
}

/** OCR批量上传单条结果 */
export interface OCRFileResult {
  filename: string;
  success: boolean;
  data: OCRResult | null;
  warnings?: string[];
  errors?: string[];
  error?: string;
}

/** API 响应 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  results?: OCRFileResult[];
  passed?: boolean;
  errors?: ValidationError[];
  message?: string;
  zip_filename?: string;
  engine?: string;
}

export interface ValidationError {
  rule: string;
  message: string;
}

export type Step = 1 | 2 | 3;
