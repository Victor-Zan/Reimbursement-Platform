import { useEffect, useState } from 'react';
import DetailTable from '../components/DetailTable';
import StepIndicator from '../components/StepIndicator';
import { ReimbursementFormData, InvoiceSection, DetailRow, ValidationError, ReimbursementType } from '../types';
import { SELECTABLE_TYPES, TAB_LABELS } from '../config/materials';
import TypeBadges from '../components/TypeBadges';
import OrgAutocomplete from '../components/OrgAutocomplete';
import { ORGANIZATIONS } from '../config/organizations';
import Icon from '../components/Icon';
import { useFeedback } from '../components/Feedback';
import RuleTips from '../components/RuleTips';

/** 本地时区的今天（YYYY-MM-DD） */
const todayStr = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

interface Props {
  formData: ReimbursementFormData; updateForm: (patch: Partial<ReimbursementFormData>) => void;
  updateInvoice: (invIndex: number, patch: Partial<InvoiceSection>) => void;
  updateInvoiceItems: (invIndex: number, items: DetailRow[]) => void;
  userEmail: string;
  ocrResults?: any; onBack: () => void; onNext: () => void;
  onSaveDraft: () => Promise<boolean>; onHome: () => void;
  onAddInvoice: (type: ReimbursementType) => void; onRemoveInvoice: (invIndex: number) => void;
}

export default function FillForm({ formData, updateForm, updateInvoice, updateInvoiceItems, userEmail, onBack, onNext, onSaveDraft, onHome, onAddInvoice, onRemoveInvoice }: Props) {
  const { toast, confirm } = useFeedback();
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [validating, setValidating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addType, setAddType] = useState<ReimbursementType>(formData.types?.[0] || 'vat');

  // 历史经手人候选（财务负责人字段模糊搜索）；加载失败静默降级，不阻塞表单
  const [handlerHistory, setHandlerHistory] = useState<string[]>([]);
  useEffect(() => {
    if (!userEmail) return;
    let cancelled = false;
    fetch(`/api/v1/submissions/handlers?user_email=${encodeURIComponent(userEmail)}`)
      .then(r => r.json())
      .then(j => { if (!cancelled) setHandlerHistory((j.handlers || []).filter(Boolean)); })
      .catch(() => { if (!cancelled) setHandlerHistory([]); });
    return () => { cancelled = true; };
  }, [userEmail]);

  const amountErrors = formData.invoices.map(inv => inv.reimbursement_amount > inv.invoice_total && inv.invoice_total > 0);
  const hasAmountError = amountErrors.some(Boolean);

  // 支付宝账号格式校验：11 位手机号或邮箱
  const ALIPAY_MOBILE = /^1[3-9]\d{9}$/;
  const ALIPAY_EMAIL = /^[\w.+-]+@[\w-]+(\.[\w-]+)+$/;
  const alipayValue = formData.alipay_account.trim();
  const isValidAlipay = ALIPAY_MOBILE.test(alipayValue) || ALIPAY_EMAIL.test(alipayValue);
  const alipayError = alipayValue !== '' && !isValidAlipay ? '支付宝账号格式不正确，请输入 11 位手机号或邮箱' : '';

  const handleSave = async () => { setSaving(true); const ok = await onSaveDraft(); setSaving(false); toast(ok ? '草稿已保存' : '保存失败，请重试', ok ? 'success' : 'error'); };

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
    // 日期不能晚于今天
    const today = todayStr();
    if (formData.activity_end_date && formData.activity_end_date > today) {
      setErrors([{ rule: '活动时间', message: '活动时间不能晚于今天' }]);
      return;
    }
    if (formData.reimbursement_date && formData.reimbursement_date > today) {
      setErrors([{ rule: '报销时间', message: '报销时间不能晚于今天' }]);
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

  // 手动票据填发票总额：报销金额默认跟随（保持最大值），除非用户已改为其他值
  const handleInvoiceTotal = (invIdx: number, raw: string) => {
    const v = parseFloat(raw) || 0;
    const inv = formData.invoices[invIdx];
    const nextAmount = (inv.reimbursement_amount === 0 || inv.reimbursement_amount === inv.invoice_total) ? v : inv.reimbursement_amount;
    updateInvoice(invIdx, { invoice_total: v, reimbursement_amount: nextAmount });
  };

  return (
    <>
      <StepIndicator current={2} />

      {/* 填写规则提示（默认收起，点开可查阅） */}
      <RuleTips
        title="填写报销表规则"
        items={[
          {
            text: <>金额三条逻辑：<strong>单价 = 税前价格</strong>；<strong>发票总额 = 税后总额</strong>（OCR 自动填入）；<strong>报销金额 ≤ 发票总额</strong>（超出会被拦截）</>,
          },
          {
            text: <>活动时间 = 活动的<strong>最后一天</strong>；报销时间 = <strong>提交报销材料的当天</strong></>,
          },
          {
            tone: 'warn',
            text: <>明细一行 = <strong>一张发票上的一个条目</strong>；一张发票有多个条目需逐行列出；实物材料中发票需按报销表物品名称顺序排列</>,
          },
          {
            text: <>购买途径选「<strong>网购</strong>」或「<strong>实体店</strong>」；是否可重复利用选「是 / 否」</>,
          },
          {
            text: <>经手人 = 该发票对应物品的<strong>实际购买者</strong>（每张发票可不同，财务负责人 ≠ 经手人）</>,
          },
          {
            text: <>财务负责人（经办人）= <strong>完整报销单的负责人</strong>、支付宝账号所有者；支付宝账号 = <strong>实名认证后的财务负责人账号</strong>（11 位手机号或邮箱）</>,
          },
          {
            tone: 'warn',
            text: <>单项报销超 <strong>2000 元</strong>需附付款截图；单品尽量≤<strong>1000 元</strong>（数量叠加超 1000 无碍）；总额超 <strong>1 万元</strong>请提前联系 OSA 老师</>,
          },
        ]}
      />

      {/* 活动信息 */}
      <div className="card">
        <h2 className="card-title">活动信息</h2>
        <div className="form-row">
          <div className="form-group"><label className="form-label">活动名称 <span className="required">*</span></label><input className="form-input" value={formData.activity_name} onChange={e => setField('activity_name', e.target.value)} placeholder="输入活动名称" /></div>
          <div className="form-group"><label className="form-label">学生组织名称 <span className="required">*</span></label><OrgAutocomplete value={formData.org_name} onChange={v => setField('org_name', v)} orgs={ORGANIZATIONS} placeholder="输入或从名单中选择" /></div>
        </div>
        <div className="form-row">
          <div className="form-group"><label className="form-label">活动时间（活动最后一天）<span className="required">*</span></label><input type="date" className="form-input" max={todayStr()} value={formData.activity_end_date} onChange={e => setField('activity_end_date', e.target.value)} /></div>
          <div className="form-group"><label className="form-label">报销时间 <span className="required">*</span></label><input type="date" className="form-input" max={todayStr()} value={formData.reimbursement_date} onChange={e => setField('reimbursement_date', e.target.value)} /></div>
        </div>
      </div>

      {/* 每张发票的区块 */}
      {formData.invoices.map((invoice, invIdx) => (
        <div className="card" key={invIdx}>
          <div className="card-head">
            <h2 className="card-title"><Icon name="receipt" size={18} /> 发票 {invIdx + 1}
              <TypeBadges types={[invoice.reimb_type]} small />
              {invoice.buyer_name && <span className="card-sub" style={{ marginLeft: 12 }}>{invoice.buyer_name}
                <span className={`badge ${invoice.buyer_name_valid ? 'badge-ok' : 'badge-warn'}`} style={{ marginLeft: 6 }}><Icon name={invoice.buyer_name_valid ? 'check' : 'alert-triangle'} size={12} /></span>
                {invoice.invoice_total > 0 && ` | 总额 ¥${invoice.invoice_total.toFixed(2)}`}
              </span>}
              <label className="form-switch" style={{ marginLeft: 12 }} title="该发票是否通过公对公转账付款">
                <span className="form-switch-name">公对公转账</span>
                <input type="checkbox" checked={!!invoice.is_public_transfer}
                  onChange={e => updateInvoice(invIdx, { is_public_transfer: e.target.checked })} />
                <span className="form-switch-track" />
                <span className="form-switch-value">{invoice.is_public_transfer ? '是' : '否'}</span>
              </label>
            </h2>
            {formData.invoices.length > 1 && (
              <div className="card-actions">
                <button className="btn btn-danger btn-sm"
                  onClick={() => { void (async () => { if (await confirm({ message: `确定删除发票 ${invIdx + 1}？`, tone: 'danger' })) onRemoveInvoice(invIdx); })(); }}><Icon name="trash" size={14} /> 删除</button>
              </div>
            )}
          </div>

          {/* 手动添加的票据（非 OCR 来源）：填写开票日期与总额 */}
          {invoice.invoice_total <= 0 && (
            <div className="form-row" style={{ marginBottom: 16 }}>
              <div className="form-group">
                <label className="form-label">开票日期</label>
                <input type="date" className="form-input" value={invoice.invoice_date} onChange={e => updateInvoice(invIdx, { invoice_date: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">发票总额 <span className="required">*</span></label>
                <input type="number" step="0.01" className="form-input" value={invoice.invoice_total || ''} onChange={e => handleInvoiceTotal(invIdx, e.target.value)} placeholder="填写发票/票据总额" />
              </div>
            </div>
          )}

          <div style={{ marginBottom: 16 }}>
            <span className="form-label">报销明细</span>
            <DetailTable items={invoice.items} onChange={(items) => updateInvoiceItems(invIdx, items)}
              invoiceTotal={invoice.invoice_total}
              actualTotal={invoice.items.reduce((sum, item) => sum + (item.unit_price || 0) * (item.quantity || 0), 0)}
              allowNegativePrice={invoice.reimb_type === 'travel'} />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">报销金额（≤¥{invoice.invoice_total.toFixed(2)}）<span className="required">*</span></label>
              <input type="number" step="0.01" className={`form-input ${amountErrors[invIdx] ? 'error' : ''}`}
                value={invoice.reimbursement_amount || ''}
                onWheel={e => e.currentTarget.blur()}   // 禁用滚轮改数，只允许手动输入
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

      {/* 添加发票/票据（选择所属类型） */}
      <div className="card card--center">
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <select className="form-input" style={{ width: 140 }} value={addType} onChange={e => setAddType(e.target.value as ReimbursementType)} title="选择发票所属类型">
            {SELECTABLE_TYPES.map(t => <option key={t} value={t}>{TAB_LABELS[t]}</option>)}
          </select>
          <button className="btn btn-secondary" onClick={() => onAddInvoice(addType)}><Icon name="plus" size={16} /> 添加发票/票据</button>
        </div>
      </div>

      {/* 整体合计 */}
      <div className="card card-total" style={{ textAlign: 'right' }}><span>实际花费合计：</span><span className="card-total-num">¥{formData.actual_total.toFixed(2)}</span></div>

      {/* 表尾信息 */}
      <div className="card">
        <h2 className="card-title">其他信息</h2>
        <div className="form-row">
          <div className="form-group"><label className="form-label">经办人/财务负责人 <span className="required">*</span></label><OrgAutocomplete value={formData.finance_officer} onChange={v => setField('finance_officer', v)} orgs={handlerHistory.map(h => ({ name: h }))} placeholder="输入或从历史经手人中选择" emptyText="暂无历史经手人，可直接输入" /></div>
          <div className="form-group"><label className="form-label">活动负责人意见</label><input className="form-input" value={formData.activity_leader_opinion} onChange={e => setField('activity_leader_opinion', e.target.value)} placeholder="如：同意报销" /></div>
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">支付宝账号 <span className="required">*</span></label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input className={`form-input ${alipayError ? 'error' : ''}`} style={{ flex: 1 }} value={formData.alipay_account} onChange={e => setField('alipay_account', e.target.value)} placeholder="填写收款支付宝账号（手机号或邮箱）" />
            {alipayValue !== '' && !alipayError && <span className="badge badge-ok"><Icon name="check" size={12} /></span>}
          </div>
          {alipayError && <div className="form-error">{alipayError}</div>}
        </div>
      </div>

      {/* 校验错误 */}
      {errors.length > 0 && (
        <div className="alert-panel">
          <div className="alert-panel-title"><Icon name="alert-triangle" size={16} /> 表单未通过校验</div>
          <ul>
            {errors.map((e, i) => (<li key={i}>{e.message}</li>))}
          </ul>
        </div>
      )}

      <div className="btn-actions">
        <div>
          <button className="btn btn-secondary" onClick={onHome}><Icon name="arrow-left" size={15} /> 返回首页</button>
          <button className="btn btn-secondary" onClick={onBack}><Icon name="arrow-left" size={15} /> 上一步</button>
        </div>
        <div>
          <button className="btn btn-secondary" onClick={handleSave} disabled={saving}>{saving ? <><span className="spinner" /> 保存中...</> : <><Icon name="save" size={15} /> 保存草稿</>}</button>
          <button className="btn btn-primary" onClick={handleValidate} disabled={validating || hasAmountError || !!alipayError} title={hasAmountError ? '请修正报销金额后再继续' : alipayError ? '请修正支付宝账号格式后再继续' : ''}>{validating ? <><span className="spinner" /> 校验中...</> : <>下一步：确认提交 <Icon name="arrow-right" size={15} /></>}</button>
        </div>
      </div>
    </>
  );
}
