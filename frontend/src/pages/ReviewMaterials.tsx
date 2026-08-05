import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

interface Props { user: any; }
interface Submission { filename: string; size: number; modified: string; status: string; reviewer_email: string; }
interface PreviewData { invoices: {name:string; data_url:string}[]; evidences: {name:string; data_url:string}[]; form: {name:string; download_url:string} | null; }

export default function ReviewMaterials({ user }: Props) {
  const navigate = useNavigate();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [review, setReview] = useState<any>(null);
  const [invoiceComment, setInvoiceComment] = useState('');
  const [evidenceComment, setEvidenceComment] = useState('');
  const [formComment, setFormComment] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('全部');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const loadSubmissions = async () => {
    setLoading(true);
    try { const r = await fetch('/api/v1/review/submissions'); const j = await r.json(); if (j.success) setSubmissions(j.submissions); } catch {}
    setLoading(false);
  };
  useEffect(() => { loadSubmissions(); }, []);

  const openReview = async (filename: string) => {
    setSelected(filename);
    setPreview(null);
    setReview(null);
    setInvoiceComment(''); setEvidenceComment(''); setFormComment('');
    setPreviewLoading(true);
    try {
      const [pr, ar] = await Promise.all([
        fetch(`/api/v1/submissions/preview/${encodeURIComponent(filename)}`).then(r => r.json()),
        fetch(`/api/v1/review/annotations/${encodeURIComponent(filename)}`).then(r => r.json()),
      ]);
      if (pr.success) setPreview(pr);
      if (ar.success) {
        setReview(ar.review);
        setInvoiceComment(ar.review.invoice_comment || '');
        setEvidenceComment(ar.review.evidence_comment || '');
        setFormComment(ar.review.form_comment || '');
      }
    } catch {}
    setPreviewLoading(false);
  };

  const handleApprove = async () => {
    if (!selected) return;
    setActionLoading(true);
    await fetch('/api/v1/review/approve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ submission_zip: selected, reviewer_email: user.email }) });
    setActionLoading(false); setSelected(null); loadSubmissions();
  };
  const handleReject = async () => {
    if (!selected) return;
    setActionLoading(true);
    await fetch('/api/v1/review/reject', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ submission_zip: selected, reviewer_email: user.email, invoice_comment: invoiceComment, evidence_comment: evidenceComment, form_comment: formComment }) });
    setActionLoading(false); setSelected(null); loadSubmissions();
  };

  const filteredSubmissions = submissions.filter(s => {
    if (statusFilter === '待审核' && s.status !== 'pending') return false;
    if (statusFilter === '已通过' && s.status !== 'approved') return false;
    if (statusFilter === '已打回' && s.status !== 'rejected') return false;
    if (dateFrom && s.modified < dateFrom) return false;
    if (dateTo && s.modified > dateTo + 'T23:59:59') return false;
    return true;
  });
  const formatSize = (b: number) => b < 1024*1024 ? `${(b/1024).toFixed(1)} KB` : `${(b/(1024*1024)).toFixed(1)} MB`;
  const statusBadge = (s: string) => s === 'approved' ? <span className="badge badge-ok">已通过</span> : s === 'rejected' ? <span className="badge badge-error">已打回</span> : <span className="badge badge-warn">待审核</span>;
  const presetInvoice = (t: string) => setInvoiceComment(p => p ? p + '；' + t : t);
  const presetEvidence = (t: string) => setEvidenceComment(p => p ? p + '；' + t : t);
  const presetForm = (t: string) => setFormComment(p => p ? p + '；' + t : t);

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 16px' }}>
      <button className="btn btn-secondary" onClick={() => navigate('/reviewer')} style={{ marginBottom: 16 }}>← 返回</button>
      <h2>📋 材料审核</h2>
      <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
        <select className="form-input" style={{ width: 120 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          {['全部', '待审核', '已通过', '已打回'].map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        <input type="date" className="form-input" style={{ width: 140, fontSize: 12 }} value={dateFrom} onChange={e => setDateFrom(e.target.value)} title="起始日期" />
        <span style={{ color: 'var(--gray-400)', fontSize: 12 }}>至</span>
        <input type="date" className="form-input" style={{ width: 140, fontSize: 12 }} value={dateTo} onChange={e => setDateTo(e.target.value)} title="截止日期" />
      </div>

      {loading ? <p style={{ textAlign: 'center', padding: 24 }}><span className="spinner" /> 加载中...</p>
       : filteredSubmissions.length === 0 ? <p style={{ textAlign: 'center', padding: 24, color: 'var(--gray-500)' }}>暂无提交</p>
       : (
        <div className="submission-list">
          {filteredSubmissions.map(s => (
            <div key={s.filename} className={`submission-item ${selected === s.filename ? 'active' : ''}`}
                 style={selected === s.filename ? { border: '2px solid var(--primary)' } : {}}
                 onClick={() => openReview(s.filename)}>
              <div className="draft-info">
                <strong>📦 {s.filename}</strong>
                <span className="draft-meta">{formatSize(s.size)} · {s.modified.slice(0,19).replace('T',' ')}{s.reviewer_email ? ` · 审核人：${s.reviewer_email}` : ''}</span>
              </div>
              {statusBadge(s.status)}
            </div>
          ))}
        </div>
      )}

      {/* 审核详情弹窗 */}
      {selected && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 700, maxHeight: '85vh' }}>
            <h3>审核：{selected}</h3>

            {previewLoading ? <p style={{ textAlign: 'center', padding: 24 }}><span className="spinner" /> 加载预览...</p> : preview && (
              <>
                {review && review.status !== 'pending' && (
                  <div className={`alert ${review.status === 'approved' ? 'alert-success' : 'alert-error'}`}>
                    状态：{review.status === 'approved' ? '已通过' : '已打回'} · 审核人：{review.reviewer_email}
                  </div>
                )}

                {/* 发票图片 */}
                {preview.invoices.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <h4 style={{ marginBottom: 8 }}>📎 发票 ({preview.invoices.length}张)</h4>
                    {preview.invoices.map((inv, i) => (
                      <div key={i} style={{ marginBottom: 12 }}>
                        {inv.data_url.startsWith('data:application/pdf') ? (
                          <embed src={inv.data_url} width="100%" height="400" type="application/pdf" style={{ border: '1px solid var(--gray-200)', borderRadius: 8 }} />
                        ) : (
                          <img src={inv.data_url} alt={inv.name} style={{ width: '100%', border: '1px solid var(--gray-200)', borderRadius: 8 }} />
                        )}
                      </div>
                    ))}
                    <div className="form-group">
                      <label className="form-label">发票批注</label>
                      <textarea className="form-input" rows={2} value={invoiceComment} onChange={e => setInvoiceComment(e.target.value)} placeholder="发票问题描述..." />
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                        {['发票缺少公章', '发票印章不清晰', '发票信息与拼接信息不符'].map(t => <button key={t} className="btn btn-secondary" style={{ padding: '2px 8px', fontSize: 11 }} onClick={() => presetInvoice(t)}>{t}</button>)}
                      </div>
                    </div>
                  </div>
                )}

                {/* 活动凭证 */}
                {preview.evidences.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <h4 style={{ marginBottom: 8 }}>📷 活动凭证 ({preview.evidences.length}张)</h4>
                    {preview.evidences.map((ev, i) => (
                      <div key={i} style={{ marginBottom: 8 }}>
                        <img src={ev.data_url} alt={ev.name} style={{ width: '100%', border: '1px solid var(--gray-200)', borderRadius: 8 }} />
                      </div>
                    ))}
                    <div className="form-group">
                      <label className="form-label">活动凭证批注</label>
                      <textarea className="form-input" rows={2} value={evidenceComment} onChange={e => setEvidenceComment(e.target.value)} placeholder="凭证问题描述..." />
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                        {['活动凭证不清晰', '缺少活动现场照片', '凭证无法证明活动真实性'].map(t => <button key={t} className="btn btn-secondary" style={{ padding: '2px 8px', fontSize: 11 }} onClick={() => presetEvidence(t)}>{t}</button>)}
                      </div>
                    </div>
                  </div>
                )}

                {/* 报销表 */}
                {preview.form && (
                  <div style={{ marginBottom: 16 }}>
                    <h4 style={{ marginBottom: 8 }}>📋 报销表</h4>
                    <a href={preview.form.download_url} download className="btn btn-secondary" style={{ marginBottom: 8 }}>📥 下载 {preview.form.name}</a>
                    <div className="form-group">
                      <label className="form-label">报销表/拼接信息批注</label>
                      <textarea className="form-input" rows={2} value={formComment} onChange={e => setFormComment(e.target.value)} placeholder="报销表或拼接信息问题描述..." />
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                        {['拼接信息中组织名称有误', '拼接信息中活动名称有误', '拼接信息中物品名称有误', '拼接信息中金额有误'].map(t => <button key={t} className="btn btn-secondary" style={{ padding: '2px 8px', fontSize: 11 }} onClick={() => presetForm(t)}>{t}</button>)}
                      </div>
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
                  <button className="btn btn-success" onClick={handleApprove} disabled={actionLoading}>✅ 确认无误</button>
                  <button className="btn" style={{ background: 'var(--danger)', color: 'white' }} onClick={handleReject} disabled={actionLoading}>↩ 打回修改</button>
                  <button className="btn btn-secondary" onClick={() => setSelected(null)}>取消</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
