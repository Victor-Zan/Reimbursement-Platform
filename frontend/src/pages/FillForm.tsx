import { useState } from 'react';
import DetailTable from '../components/DetailTable';
import StepIndicator from '../components/StepIndicator';
import { ReimbursementFormData, InvoiceSection, DetailRow, ValidationError } from '../types';

interface Props {
  formData: ReimbursementFormData; updateForm: (patch: Partial<ReimbursementFormData>) => void;
  updateInvoice: (invIndex: number, patch: Partial<InvoiceSection>) => void;
  updateInvoiceItems: (invIndex: number, items: DetailRow[]) => void;
  ocrResults?: any; onBack: () => void; onNext: () => void;
  onSaveDraft: () => Promise<boolean>; onHome: () => void;
  onAddInvoice: () => void; onRemoveInvoice: (invIndex: number) => void;
}

export default function FillForm({ formData, updateForm, updateInvoice, updateInvoiceItems, onBack, onNext, onSaveDraft, onHome, onAddInvoice, onRemoveInvoice }: Props) {
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [validating, setValidating] = useState(false);
  const [saving, setSaving] = useState(false);

  const amountErrors = formData.invoices.map(inv => inv.reimbursement_amount > inv.invoice_total && inv.invoice_total > 0);
  const hasAmountError = amountErrors.some(Boolean);

  // 支付宝账号格式校验：11 位手机号或邮箱
  const ALIPAY_MOBILE = /^1[3-9]\d{9}$/;
  const ALIPAY_EMAIL = /^[\w.+-]+@[\w-]+(\.[\w-]+)+$/;
  const alipayValue = formData.alipay_account.trim();
  const isValidAlipay = ALIPAY_MOBILE.test(alipayValue) || ALIPAY_EMAIL.test(alipayValue);
  const alipayError = alipayValue !== '' && !isValidAlipay ? '支付宝账号格式不正确，请输入 11 位手机号或邮箱' : '';

  const handleSave = async () => { setSaving(true); const ok = await onSaveDraft(); setSaving(false); alert(ok ? '草稿已保存' : '保存失败，请重试'); };

  const handleValidate = async () => {
    // 手动添加的票据必须先填总额（现有校验规则按总额约束报销金额）
    const missingIdx = formData.invoices.findIndex(inv => inv.invoice_total <= 0);
    if (missingIdx >= 0) {
      setErrors([{ rule: '发票总额', message: `第 ${missingIdx + 1} 张发票/票据的总额未填写，请先填写总额` }]);
      return;
    }
    // 支付宝账号格式校验
    if (alipayError) {
      setErrors([{ rule: '支付宝账号', message: alipayError }]);
      return;
    }
    setValidating(true);
    try {
      const r = await fetch('/api/v1/validate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData) });
      const j = await r.json(); setErrors(j.errors || []);
      if (j.passed) onNext();
    } catch { setErrors([{ rule: '网络', message: '校验请求失败，请检查后端服务' }]); }
    setValidating(false);
  };

  const setField = (field: keyof ReimbursementFormData, value: string | number) => updateForm({ [field]: value });

  return (
    <>
      <StepIndicator current={2} />

      {/* 活动信息 */}
      <div className="card">
        <h2 className="card-title">活动信息</h2>
        <div className="form-row">
          <div className="form-group"><label className="form-label">活动名称 <span className="required">*</span></label><input className="form-input" value={formData.activity_name} onChange={e => setField('activity_name', e.target.value)} placeholder="输入活动名称" /></div>
          <div className="form-group"><label className="form-label">学生组织名称 <span className="required">*</span></label><input className="form-input" value={formData.org_name} onChange={e => setField('org_name', e.target.value)} placeholder="输入学生组织名称" /></div>
        </div>
        <div className="form-row">
          <div className="form-group"><label className="form-label">活动时间（活动最后一天）<span className="required">*</span></label><input type="date" className="form-input" value={formData.activity_end_date} onChange={e => setField('activity_end_date', e.target.value)} /></div>
          <div className="form-group"><label className="form-label">报销时间 <span className="required">*</span></label><input type="date" className="form-input" value={formData.reimbursement_date} onChange={e => setField('reimbursement_date', e.target.value)} /></div>
        </div>
      </div>

      {/* 每张发票的区块 */}
      {formData.invoices.map((invoice, invIdx) => (
        <div className="card" key={invIdx}>
          <h2 className="card-title">📄 发票 {invIdx + 1}
            {invoice.buyer_name && <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--gray-500)', marginLeft: 12 }}>{invoice.buyer_name}
              <span className={`badge ${invoice.buyer_name_valid ? 'badge-ok' : 'badge-warn'}`} style={{ marginLeft: 6 }}>{invoice.buyer_name_valid ? '✓' : '⚠'}</span>
              {invoice.invoice_total > 0 && ` | 总额 ¥${invoice.invoice_total.toFixed(2)}`}
            </span>}
            {formData.invoices.length > 1 && (
              <button className="btn btn-secondary" style={{ float: 'right', padding: '2px 10px', fontSize: 12, color: 'var(--danger)' }}
                onClick={() => { if (window.confirm(`确定删除发票 ${invIdx + 1}？`)) onRemoveInvoice(invIdx); }}>🗑 删除</button>
            )}
          </h2>

          {/* 手动添加的票据（非 OCR 来源）：填写开票日期与总额 */}
          {invoice.invoice_total <= 0 && (
            <div className="form-row" style={{ marginBottom: 16 }}>
              <div className="form-group">
                <label className="form-label">开票日期</label>
                <input type="date" className="form-input" value={invoice.invoice_date} onChange={e => updateInvoice(invIdx, { invoice_date: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">发票总额 <span className="required">*</span></label>
                <input type="number" step="0.01" className="form-input" value={invoice.invoice_total || ''} onChange={e => updateInvoice(invIdx, { invoice_total: parseFloat(e.target.value) || 0 })} placeholder="填写发票/票据总额" />
              </div>
            </div>
          )}

          <div style={{ marginBottom: 16 }}>
            <span className="form-label">报销明细</span>
            <DetailTable items={invoice.items} onChange={(items) => updateInvoiceItems(invIdx, items)}
              invoiceTotal={invoice.invoice_total}
              actualTotal={invoice.items.reduce((sum, item) => sum + (item.unit_price || 0) * (item.quantity || 0), 0)}
              allowNegativePrice={formData.type === 'travel'} />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">报销金额（≤¥{invoice.invoice_total.toFixed(2)}）<span className="required">*</span></label>
              <input type="number" step="0.01" className={`form-input ${amountErrors[invIdx] ? 'error' : ''}`}
                value={invoice.reimbursement_amount || ''}
                onChange={e => updateInvoice(invIdx, { reimbursement_amount: parseFloat(e.target.value) || 0 })} />
              {amountErrors[invIdx] && <div className="form-error">报销金额不能超过该发票总额 ¥{invoice.invoice_total.toFixed(2)}</div>}
            </div>
            <div className="form-group">
              <label className="form-label">经手人（商品购买人）<span className="required">*</span></label>
              <input className="form-input" value={invoice.handler} onChange={e => updateInvoice(invIdx, { handler: e.target.value })} placeholder="填写该发票对应的商品购买人" />
            </div>
          </div>
        </div>
      ))}

      {/* 添加发票/票据 */}
      <div className="card" style={{ textAlign: 'center' }}>
        <button className="btn btn-secondary" onClick={onAddInvoice} style={{ width: '100%' }}>＋ 添加发票/票据</button>
      </div>

      {/* 整体合计 */}
      <div className="card" style={{ textAlign: 'right', fontSize: 16, fontWeight: 700 }}>实际花费合计：¥{formData.actual_total.toFixed(2)}</div>

      {/* 表尾信息 */}
      <div className="card">
        <h2 className="card-title">其他信息</h2>
        <div className="form-row">
          <div className="form-group"><label className="form-label">经办人/财务负责人 <span className="required">*</span></label><input className="form-input" value={formData.finance_officer} onChange={e => setField('finance_officer', e.target.value)} placeholder="填写经办人姓名" /></div>
          <div className="form-group"><label className="form-label">活动负责人意见</label><input className="form-input" value={formData.activity_leader_opinion} onChange={e => setField('activity_leader_opinion', e.target.value)} placeholder="如：同意报销" /></div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">支付宝账号 <span className="required">*</span></label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input className={`form-input ${alipayError ? 'error' : ''}`} style={{ flex: 1 }} value={formData.alipay_account} onChange={e => setField('alipay_account', e.target.value)} placeholder="填写收款支付宝账号（手机号或邮箱）" />
              {alipayValue !== '' && !alipayError && <span className="badge badge-ok">✓</span>}
            </div>
            {alipayError && <div className="form-error">{alipayError}</div>}
          </div>
          <div />
        </div>
      </div>

      {/* 校验错误 */}
      {errors.length > 0 && (
        <div className="card" style={{ border: '1px solid var(--danger)' }}>
          <h2 className="card-title" style={{ color: 'var(--danger)' }}>⚠ 表单未通过校验</h2>
          {errors.map((e, i) => (<div key={i} className="alert alert-error">{e.message}</div>))}
        </div>
      )}

      <div className="btn-actions">
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={onHome}>← 返回首页</button>
          <button className="btn btn-secondary" onClick={onBack}>← 上一步</button>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={handleSave} disabled={saving}>{saving ? <><span className="spinner" /> 保存中...</> : '💾 保存草稿'}</button>
          <button className="btn btn-primary" onClick={handleValidate} disabled={validating || hasAmountError || !!alipayError} title={hasAmountError ? '请修正报销金额后再继续' : alipayError ? '请修正支付宝账号格式后再继续' : ''}>{validating ? <><span className="spinner" /> 校验中...</> : '下一步：确认提交 →'}</button>
        </div>
      </div>
    </>
  );
}
