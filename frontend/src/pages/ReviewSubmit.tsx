import { useState } from 'react';
import DetailTable from '../components/DetailTable';
import { ReimbursementFormData } from '../types';

interface Props {
  formData: ReimbursementFormData;
  invoiceFiles: File[];
  evidenceFiles: File[];
  submitResult: { message: string; zip_filename: string } | null;
  setSubmitResult: (r: { message: string; zip_filename: string } | null) => void;
  onBack: () => void;
  onReset: () => void;
}

export default function ReviewSubmit({
  formData,
  invoiceFiles,
  evidenceFiles,
  submitResult,
  setSubmitResult,
  onBack,
  onReset,
}: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [downloading, setDownloading] = useState(false);

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
      alert('Excel生成失败，请检查后端服务');
    } finally {
      setDownloading(false);
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError('');

    const form = new FormData();
    form.append('activity_name', formData.activity_name);
    form.append('org_name', formData.org_name);
    form.append('activity_end_date', formData.activity_end_date);
    form.append('reimbursement_date', formData.reimbursement_date);
    form.append('invoices_json', JSON.stringify(formData.invoices));
    form.append('actual_total', String(formData.actual_total));
    form.append('finance_officer', formData.finance_officer);
    form.append('activity_leader_opinion', formData.activity_leader_opinion);
    form.append('alipay_account', formData.alipay_account);

    invoiceFiles.forEach(f => form.append('invoice_files', f));
    evidenceFiles.forEach(f => form.append('evidence_files', f));

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

  return (
    <>
      {submitResult && (
        <div className="card" style={{ textAlign: 'center', padding: 48 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
          <h2 style={{ color: 'var(--success)', marginBottom: 8 }}>提交成功！</h2>
          <p style={{ color: 'var(--gray-600)', marginBottom: 8 }}>{submitResult.message}</p>
          {submitResult.zip_filename && (
            <p style={{ fontSize: 13, color: 'var(--gray-500)' }}>
              存档文件：{submitResult.zip_filename}
            </p>
          )}
          <button className="btn btn-primary" onClick={onReset} style={{ marginTop: 24 }}>
            发起新的报销申请
          </button>
        </div>
      )}

      {!submitResult && (
        <>
          <div className="card">
            <h2 className="card-title">📋 报销表预览</h2>

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
                <h3>📄 发票 {idx + 1}</h3>
                <div className="preview-grid">
                  <span className="label">购买方</span>
                  <span className="value">
                    {inv.buyer_name || '—'}
                    <span className={`badge ${inv.buyer_name_valid ? 'badge-ok' : 'badge-warn'}`} style={{ marginLeft: 6 }}>
                      {inv.buyer_name_valid ? '✓' : '⚠'}
                    </span>
                  </span>
                  <span className="label">发票总额</span>
                  <span className="value">¥{inv.invoice_total.toFixed(2)}</span>
                  <span className="label">报销金额</span>
                  <span className="value">¥{inv.reimbursement_amount.toFixed(2)}</span>
                  <span className="label">经手人</span>
                  <span className="value">{inv.handler || '—'}</span>
                </div>

                <div style={{ marginTop: 8 }}>
                  <DetailTable
                    items={inv.items}
                    onChange={() => {}}
                    invoiceTotal={inv.invoice_total}
                    actualTotal={inv.items.reduce((s, it) => s + (it.unit_price || 0) * (it.quantity || 0), 0)}
                    readonly
                  />
                </div>
              </div>
            ))}

            {/* 合计 */}
            <div className="preview-section">
              <h3>合计</h3>
              <div className="preview-grid">
                <span className="label">实际花费总计</span>
                <span className="value" style={{ fontWeight: 700 }}>
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
                <span className="label">发票文件</span>
                <span className="value">{invoiceFiles.length} 张</span>
                <span className="label">活动凭证</span>
                <span className="value">{evidenceFiles.length} 张</span>
              </div>
              {invoiceFiles.length > 0 && (
                <div className="file-list" style={{ marginTop: 8 }}>
                  {invoiceFiles.map((f, i) => (
                    <div key={i} className="file-chip">📎 {f.name}</div>
                  ))}
                </div>
              )}
              {evidenceFiles.length > 0 && (
                <div className="file-list" style={{ marginTop: 8 }}>
                  {evidenceFiles.map((f, i) => (
                    <div key={i} className="file-chip">📷 {f.name}</div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {submitError && (
            <div className="card" style={{ border: '1px solid var(--danger)' }}>
              <div className="alert alert-error">{submitError}</div>
            </div>
          )}

          <div className="btn-actions">
            <button className="btn btn-secondary" onClick={onBack} disabled={submitting}>
              ← 上一步
            </button>
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                className="btn btn-secondary"
                onClick={handleDownloadExcel}
                disabled={downloading || submitting}
              >
                {downloading ? (
                  <><span className="spinner" /> 生成中...</>
                ) : (
                  '📥 预览Excel报销表'
                )}
              </button>
              <button
                className="btn btn-success"
                onClick={handleSubmit}
                disabled={submitting}
              >
                {submitting ? (
                  <><span className="spinner" /> 提交中...</>
                ) : (
                  '✅ 确认提交'
                )}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
