import { useState } from 'react';
import DetailTable from '../components/DetailTable';
import StepIndicator from '../components/StepIndicator';
import {
  ReimbursementFormData,
  InvoiceSection,
  DetailRow,
  ValidationError,
} from '../types';

interface Props {
  formData: ReimbursementFormData;
  updateForm: (patch: Partial<ReimbursementFormData>) => void;
  updateInvoice: (invIndex: number, patch: Partial<InvoiceSection>) => void;
  updateInvoiceItems: (invIndex: number, items: DetailRow[]) => void;
  ocrResults?: any;
  onBack: () => void;
  onNext: () => void;
  onSaveDraft: () => Promise<boolean>;
  onHome: () => void;
}

export default function FillForm({
  formData,
  updateForm,
  updateInvoice,
  updateInvoiceItems,
  onBack,
  onNext,
  onSaveDraft,
  onHome,
}: Props) {
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [validating, setValidating] = useState(false);

  const handleValidate = async () => {
    setValidating(true);
    try {
      const resp = await fetch('/api/v1/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const json = await resp.json();
      setErrors(json.errors || []);

      if (json.passed) {
        onNext();
      }
    } catch {
      setErrors([{ rule: '网络', message: '校验请求失败，请检查后端服务' }]);
    } finally {
      setValidating(false);
    }
  };

  const setField = (field: keyof ReimbursementFormData, value: string | number) => {
    updateForm({ [field]: value });
  };

  const [saving, setSaving] = useState(false);
  const handleSave = async () => {
    setSaving(true);
    const ok = await onSaveDraft();
    setSaving(false);
    alert(ok ? '草稿已保存' : '保存失败，请重试');
  };

  return (
    <>
      <StepIndicator current={2} />
      {/* 活动信息 */}
      <div className="card">
        <h2 className="card-title">活动信息</h2>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">
              活动名称 <span className="required">*</span>
            </label>
            <input
              className="form-input"
              value={formData.activity_name}
              onChange={e => setField('activity_name', e.target.value)}
              placeholder="输入活动名称"
            />
          </div>
          <div className="form-group">
            <label className="form-label">
              学生组织名称 <span className="required">*</span>
            </label>
            <input
              className="form-input"
              value={formData.org_name}
              onChange={e => setField('org_name', e.target.value)}
              placeholder="输入学生组织名称"
            />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">
              活动时间（活动最后一天） <span className="required">*</span>
            </label>
            <input
              type="date"
              className="form-input"
              value={formData.activity_end_date}
              onChange={e => setField('activity_end_date', e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">
              报销时间 <span className="required">*</span>
            </label>
            <input
              type="date"
              className="form-input"
              value={formData.reimbursement_date}
              onChange={e => setField('reimbursement_date', e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* 每张发票的区块 */}
      {formData.invoices.map((invoice, invIdx) => (
        <div className="card" key={invIdx}>
          <h2 className="card-title">
            📄 发票 {invIdx + 1}
            {invoice.buyer_name && (
              <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--gray-500)', marginLeft: 12 }}>
                {invoice.buyer_name}
                <span className={`badge ${invoice.buyer_name_valid ? 'badge-ok' : 'badge-warn'}`} style={{ marginLeft: 6 }}>
                  {invoice.buyer_name_valid ? '✓' : '⚠'}
                </span>
                {invoice.invoice_total > 0 && ` | 总额 ¥${invoice.invoice_total.toFixed(2)}`}
              </span>
            )}
          </h2>

          {/* 该发票的明细行 */}
          <div style={{ marginBottom: 16 }}>
            <span className="form-label">报销明细</span>
            <DetailTable
              items={invoice.items}
              onChange={(items) => updateInvoiceItems(invIdx, items)}
              invoiceTotal={invoice.invoice_total}
              actualTotal={invoice.items.reduce(
                (sum, item) => sum + (item.unit_price || 0) * (item.quantity || 0),
                0
              )}
            />
          </div>

          {/* 该发票的报销金额和经手人 */}
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">
                报销金额（≤¥{invoice.invoice_total.toFixed(2)}） <span className="required">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                className="form-input"
                value={invoice.reimbursement_amount || ''}
                onChange={e =>
                  updateInvoice(invIdx, {
                    reimbursement_amount: parseFloat(e.target.value) || 0,
                  })
                }
              />
            </div>
            <div className="form-group">
              <label className="form-label">
                经手人（商品购买人） <span className="required">*</span>
              </label>
              <input
                className="form-input"
                value={invoice.handler}
                onChange={e => updateInvoice(invIdx, { handler: e.target.value })}
                placeholder="填写该发票对应的商品购买人"
              />
            </div>
          </div>
        </div>
      ))}

      {/* 整体合计 */}
      <div className="card" style={{ textAlign: 'right', fontSize: 16, fontWeight: 700 }}>
        实际花费合计：¥{formData.actual_total.toFixed(2)}
      </div>

      {/* 表尾信息 */}
      <div className="card">
        <h2 className="card-title">其他信息</h2>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">
              经办人/财务负责人 <span className="required">*</span>
            </label>
            <input
              className="form-input"
              value={formData.finance_officer}
              onChange={e => setField('finance_officer', e.target.value)}
              placeholder="填写经办人姓名"
            />
          </div>
          <div className="form-group">
            <label className="form-label">活动负责人意见</label>
            <input
              className="form-input"
              value={formData.activity_leader_opinion}
              onChange={e => setField('activity_leader_opinion', e.target.value)}
              placeholder="如：同意报销"
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">
              支付宝账号 <span className="required">*</span>
            </label>
            <input
              className="form-input"
              value={formData.alipay_account}
              onChange={e => setField('alipay_account', e.target.value)}
              placeholder="填写收款支付宝账号"
            />
          </div>
          <div />
        </div>
      </div>

      {/* 校验错误 */}
      {errors.length > 0 && (
        <div className="card" style={{ border: '1px solid var(--danger)' }}>
          <h2 className="card-title" style={{ color: 'var(--danger)' }}>
            ⚠ 表单未通过校验
          </h2>
          {errors.map((e, i) => (
            <div key={i} className="alert alert-error">{e.message}</div>
          ))}
        </div>
      )}

      <div className="btn-actions">
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={onHome}>
            ← 返回首页
          </button>
          <button className="btn btn-secondary" onClick={onBack}>
            ← 上一步
          </button>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={handleSave} disabled={saving}>
            {saving ? <><span className="spinner" /> 保存中...</> : '💾 保存草稿'}
          </button>
          <button
            className="btn btn-primary"
            onClick={handleValidate}
            disabled={validating}
          >
            {validating ? (
              <><span className="spinner" /> 校验中...</>
            ) : (
              '下一步：确认提交 →'
            )}
          </button>
        </div>
      </div>
    </>
  );
}
