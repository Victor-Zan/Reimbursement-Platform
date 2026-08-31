import { useState, Fragment } from 'react';
import DetailTable from '../components/DetailTable';
import StepIndicator from '../components/StepIndicator';
import { ReimbursementFormData, ReimbursementType } from '../types';
import { TYPE_MATERIALS, materialFor } from '../config/materials';
import type { TypeMaterialsState } from '../App';
import { emptyMaterialEntry } from '../App';
import TypeBadges from '../components/TypeBadges';
import Icon from '../components/Icon';
import { useFeedback } from '../components/Feedback';
import RuleTips from '../components/RuleTips';

interface Props {
  formData: ReimbursementFormData;
  materials: TypeMaterialsState;
  userEmail?: string;
  submitResult: { message: string; zip_filename: string } | null;
  setSubmitResult: (r: { message: string; zip_filename: string } | null) => void;
  onBack: () => void;
  onSaveDraft: () => Promise<boolean>;
  onHome: () => void;
  onReset: () => void;
}

export default function ReviewSubmit({
  formData,
  materials,
  userEmail = '',
  submitResult,
  setSubmitResult,
  onBack,
  onSaveDraft,
  onHome,
  onReset,
}: Props) {
  const { toast } = useFeedback();
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  // 本次申请的类型（旧数据回退：从发票标签去重）
  const types: ReimbursementType[] = formData.types?.length
    ? formData.types
    : (formData.invoices.length ? Array.from(new Set(formData.invoices.map(i => i.reimb_type))) : ['vat']);

  const handleDownloadExcel = async () => {
    setDownloading(true);
    try {
      const resp = await fetch('/api/v1/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (!resp.ok) throw new Error('生成失败');
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `报销表_${formData.activity_name || '预览'}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast('Excel生成失败，请检查后端服务', 'error');
    } finally {
      setDownloading(false);
    }
  };

  const handlePreview = async () => {
    setPreviewing(true);
    try {
      const resp = await fetch('/api/v1/generate-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (!resp.ok) throw new Error('预览失败');
      const j = await resp.json();
      setPreviewHtml(j.html || '');
    } catch {
      toast('报销表生成失败，请检查后端服务', 'error');
    } finally {
      setPreviewing(false);
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError('');

    const form = new FormData();
    form.append('types_json', JSON.stringify(types));
    form.append('previous_zip', formData.previous_zip || '');
    form.append('activity_name', formData.activity_name);
    form.append('org_name', formData.org_name);
    form.append('activity_end_date', formData.activity_end_date);
    form.append('reimbursement_date', formData.reimbursement_date);
    form.append('invoices_json', JSON.stringify(formData.invoices));
    form.append('actual_total', String(formData.actual_total));
    form.append('finance_officer', formData.finance_officer);
    form.append('activity_leader_opinion', formData.activity_leader_opinion);
    form.append('alipay_account', formData.alipay_account);
    form.append('user_email', userEmail);

    // 按类型分别提交材料字段，避免不同类型共用材料 key 互相覆盖
    for (const t of types) {
      for (const key of TYPE_MATERIALS[t]) {
        const entry = materials[t]?.[key] ?? emptyMaterialEntry();
        form.append(`existing_${t}_${key}_paths`, JSON.stringify(entry.existingPaths));
        entry.files.forEach(f => form.append(`${t}_${key}_files`, f));
      }
    }

    try {
      const resp = await fetch('/api/v1/submit', { method: 'POST', body: form });
      const json = await resp.json();

      if (!resp.ok) {
        const detail = json.detail;
        if (typeof detail === 'object' && detail.errors) {
          setSubmitError(detail.errors.map((e: { message: string }) => e.message).join('；'));
        } else {
          setSubmitError(typeof detail === 'string' ? detail : json.message || '提交失败');
        }
        return;
      }

      setSubmitResult({
        message: json.message || '提交成功',
        zip_filename: json.zip_filename || '',
      });
    } catch {
      setSubmitError('网络错误，请检查后端服务');
    } finally {
      setSubmitting(false);
    }
  };

  const [saving, setSaving] = useState(false);
  const handleSave = async () => {
    setSaving(true);
    const ok = await onSaveDraft();
    setSaving(false);
    toast(ok ? '草稿已保存' : '保存失败，请重试', ok ? 'success' : 'error');
  };

  return (
    <>
      <StepIndicator current={3} />
      {submitResult && (
        <div className="success-panel">
          <div className="success-icon"><Icon name="check-circle" size={36} /></div>
          <h2>提交成功！</h2>
          <p>{submitResult.message}</p>
          {submitResult.zip_filename && (
            <p style={{ fontSize: 13 }}>
              存档文件：{submitResult.zip_filename}
            </p>
          )}
          <p className="success-panel-remind"><Icon name="alert-triangle" size={14} /> 请记得在社联坐班期间携带纸质材料（报销表 + 按序发票 + 活动凭证）提交至社联行政。</p>
          <div className="success-panel-actions">
            <button className="btn btn-secondary" onClick={onReset}>返回首页</button>
            <button className="btn btn-primary" onClick={onReset}>发起新的报销申请</button>
          </div>
        </div>
      )}

      {!submitResult && (
        <>
          <div className="card">
            <h2 className="card-title"><Icon name="clipboard" size={18} /> 报销表预览</h2>

            {/* 活动信息 */}
            <div className="preview-section">
              <h3>活动信息</h3>
              <div className="preview-grid">
                <span className="label">活动名称</span>
                <span className="value">{formData.activity_name || '—'}</span>
                <span className="label">学生组织名称</span>
                <span className="value">{formData.org_name || '—'}</span>
                <span className="label">活动时间</span>
                <span className="value">{formData.activity_end_date || '—'}</span>
                <span className="label">报销时间</span>
                <span className="value">{formData.reimbursement_date || '—'}</span>
              </div>
            </div>

            {/* 每张发票 */}
            {formData.invoices.map((inv, idx) => (
              <div className="preview-section" key={idx}>
                <h3><Icon name="receipt" size={14} /> 发票 {idx + 1} <TypeBadges types={[inv.reimb_type]} small /></h3>
                <div className="preview-grid">
                  <span className="label">购买方</span>
                  <span className="value">
                    {inv.buyer_name || '—'}
                    <span className={`badge ${inv.buyer_name_valid ? 'badge-ok' : 'badge-warn'}`} style={{ marginLeft: 6 }}>
                      <Icon name={inv.buyer_name_valid ? 'check' : 'alert-triangle'} size={12} />
                    </span>
                  </span>
                  <span className="label">发票总额</span>
                  <span className="value value-num">¥{inv.invoice_total.toFixed(2)}</span>
                  <span className="label">报销金额</span>
                  <span className="value value-num">¥{inv.reimbursement_amount.toFixed(2)}</span>
                  <span className="label">经手人</span>
                  <span className="value">{inv.handler || '—'}</span>
                </div>

                <div style={{ marginTop: 8 }}>
                  <DetailTable
                    items={inv.items}
                    onChange={() => {}}
                    invoiceTotal={inv.invoice_total}
                    readonly
                  />
                </div>
              </div>
            ))}

            {/* 合计 */}
            <div className="preview-section">
              <h3>合计</h3>
              <div className="preview-grid">
                <span className="label">报销金额总计</span>
                <span className="value value-num" style={{ fontWeight: 700 }}>
                  ¥{formData.actual_total.toFixed(2)}
                </span>
              </div>
            </div>

            {/* 表尾 */}
            <div className="preview-section">
              <h3>其他信息</h3>
              <div className="preview-grid">
                <span className="label">经办人</span>
                <span className="value">{formData.finance_officer || '—'}</span>
                <span className="label">活动负责人意见</span>
                <span className="value">{formData.activity_leader_opinion || '—'}</span>
                <span className="label">支付宝账号</span>
                <span className="value">{formData.alipay_account || '—'}</span>
              </div>
            </div>

            {/* 附件 */}
            <div className="preview-section">
              <h3>上传材料</h3>
              <div className="preview-grid">
                {types.flatMap(t => TYPE_MATERIALS[t].map(k => {
                  const entry = materials[t]?.[k] ?? emptyMaterialEntry();
                  return (
                    <Fragment key={`${t}_${k}`}>
                      <span className="label"><TypeBadges types={[t]} small /> {materialFor(t, k).label}</span>
                      <span className="value">{entry.existingUrls.length + entry.files.length} 张</span>
                    </Fragment>
                  );
                }))}
              </div>
              {types.flatMap(t => TYPE_MATERIALS[t].map(k => {
                const entry = materials[t]?.[k] ?? emptyMaterialEntry();
                const cfg = materialFor(t, k);
                if (entry.existingUrls.length + entry.files.length === 0) return null;
                return (
                  <div className="file-list" key={`${t}_${k}`} style={{ marginTop: 8 }}>
                    {entry.existingUrls.map((_, i) => (<div key={`e_${i}`} className="file-chip"><Icon name={cfg.icon} size={14} /> {cfg.label}_{i + 1} (原有)</div>))}
                    {entry.files.map((f, i) => (<div key={i} className="file-chip"><Icon name={cfg.icon} size={14} /> {f.name}</div>))}
                  </div>
                );
              }))}
            </div>
          </div>

          {/* 线下交付提醒（默认收起，点开可查阅） */}
          <RuleTips
            title="提交后别忘了（线下交付）"
            items={[
              {
                text: <>核对发票按报销表物品顺序排列、与上传材料一致</>,
              },
              {
                text: <>电子发票提交时系统会<strong>自动拼接</strong>报销信息（社团 / 活动 / 物品 / 金额）；<strong>纸质发票请自行在空白处手写标注</strong></>,
              },
              {
                tone: 'warn',
                text: <>需在<strong>社联坐班期间</strong>到社联行政提交纸质材料，顺序：<strong>报销表 → 按序发票 → 活动凭证</strong>（1-2 张海报 / 推送 / 邮件截图）</>,
              },
              {
                tone: 'warn',
                text: <>纸质发票粘贴：<strong>单独一张 A4 纸居中</strong>，用固体胶 / 胶水；禁用双面胶、胶带或订书机</>,
              },
              {
                text: <>提交纸质材料前将<strong>台账发送至社联邮箱</strong>；预付卡（如星巴克预付卡）不可报销；报销按预算案复核</>,
              },
            ]}
          />

          {submitError && (
            <div className="alert alert-error"><Icon name="alert-triangle" size={15} /> {submitError}</div>
          )}

          <div className="btn-actions">
            <div>
              <button className="btn btn-secondary" onClick={onHome}>
                <Icon name="arrow-left" size={15} /> 返回首页
              </button>
              <button className="btn btn-secondary" onClick={onBack} disabled={submitting}>
                <Icon name="arrow-left" size={15} /> 上一步
              </button>
            </div>
            <div>
              <button className="btn btn-secondary" onClick={handleSave} disabled={saving || submitting}>
                {saving ? <><span className="spinner" /> 保存中...</> : <><Icon name="save" size={15} /> 保存草稿</>}
              </button>
              <button
                className="btn btn-secondary"
                onClick={handlePreview}
                disabled={previewing || submitting}
              >
                {previewing ? (
                  <><span className="spinner" /> 生成中...</>
                ) : (
                  <><Icon name="eye" size={15} /> 预览Excel报销表</>
                )}
              </button>
              <button
                className="btn btn-gold"
                onClick={handleSubmit}
                disabled={submitting}
              >
                {submitting ? (
                  <><span className="spinner" /> 提交中...</>
                ) : (
                  <><Icon name="check" size={15} /> 确认提交</>
                )}
              </button>
            </div>
          </div>
        </>
      )}

      {/* 报销表全屏预览（xlsx 由后端渲染为 HTML 表格） */}
      {previewHtml !== null && (
        <div className="modal-overlay" onClick={() => setPreviewHtml(null)}>
          <div className="modal modal-preview-full" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3 className="modal-title"><Icon name="clipboard" size={16} /> 报销表预览</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setPreviewHtml(null)}><Icon name="x" size={14} /> 关闭</button>
            </div>
            <div className="excel-preview-scroll" dangerouslySetInnerHTML={{ __html: previewHtml }} />
            <div className="modal-foot">
              <button className="btn btn-secondary btn-sm" onClick={handleDownloadExcel} disabled={downloading}>
                {downloading ? <><span className="spinner" /> 生成中...</> : <><Icon name="download" size={14} /> 下载 Excel</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
