import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { TYPE_MATERIALS, materialFor, typeLabel, typeColor, TYPE_CONFIGS } from '../config/materials';
import type { ReimbursementType, MaterialKey } from '../types';

interface Props { user: any; }
interface Submission { filename: string; size: number; modified: string; status: string; reviewer_email: string; reimb_type?: string; }
interface PreviewFile { name: string; data_url: string; }
interface PreviewData { materials?: Record<string, PreviewFile[]>; invoices?: PreviewFile[]; evidences?: PreviewFile[]; form: { name: string; download_url: string } | null; }

/** 报销表批注快捷模板 */
const FORM_QUICK = ['拼接信息中组织名称有误', '拼接信息中活动名称有误', '拼接信息中物品名称有误', '拼接信息中金额有误'];

/** 审核窗口内的视图：清单 / 报销表 / 某个材料 */
type ReviewView = 'list' | 'form' | MaterialKey;

/** PDF 预览：base64 转 Blob URL 再渲染（超长 data URI 在内置 PDF 查看器中常无法显示），附新窗口打开兜底。
    填满父容器（与图片放大一致的尺寸）。 */
function PdfPreview({ dataUrl, name }: { dataUrl: string; name: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let objectUrl: string | null = null;
    try {
      const base64 = dataUrl.split(',')[1] || '';
      const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: 'application/pdf' });
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    } catch { setUrl(dataUrl); }
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [dataUrl]);

  if (!url) return <div style={{ padding: 16, color: 'var(--gray-500)', fontSize: 13 }}>PDF 加载中...</div>;
  return (
    <div style={{ width: '100%', height: '100%', border: '1px solid var(--gray-200)', borderRadius: 8, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: '#fff' }}>
      <embed src={url} type="application/pdf" style={{ flex: 1, minHeight: 0, width: '100%', border: 'none', display: 'block', background: '#f5f5f5' }} />
      <div style={{ padding: '6px 10px', borderTop: '1px solid var(--gray-200)', fontSize: 12, color: 'var(--gray-500)', display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
        <span>📄 {name}</span>
        <a href={url} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)' }}>↗ 在新窗口打开</a>
      </div>
    </div>
  );
}

/** 批注框 + 快捷批注模板 */
function CommentBox({ label, comment, setComment, quickComments }: { label: string; comment: string; setComment: (v: string) => void; quickComments: string[] }) {
  return (
    <div className="form-group" style={{ marginTop: 16 }}>
      <label className="form-label">{label}</label>
      <textarea className="form-input" rows={2} value={comment} onChange={e => setComment(e.target.value)} placeholder="问题描述..." />
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
        {quickComments.map(t => <button key={t} className="btn btn-secondary" style={{ padding: '2px 8px', fontSize: 11 }} onClick={() => setComment(comment ? comment + '；' + t : t)}>{t}</button>)}
      </div>
    </div>
  );
}

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
  const [materialComments, setMaterialComments] = useState<Record<string, string>>({});
  const [actionLoading, setActionLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('全部');
  const [typeFilter, setTypeFilter] = useState('全部');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // ---- 审核窗口状态 ----
  const [fullscreen, setFullscreen] = useState(false);
  const [view, setView] = useState<ReviewView>('list');
  const [lightbox, setLightbox] = useState<{ files: PreviewFile[]; index: number; label: string } | null>(null);

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
    setInvoiceComment(''); setEvidenceComment(''); setFormComment(''); setMaterialComments({});
    setFullscreen(false); setView('list'); setLightbox(null);
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
        setMaterialComments(ar.review.material_comments || {});
      }
    } catch {}
    setPreviewLoading(false);
  };

  const handleApprove = async () => {
    if (!selected) return;
    setActionLoading(true);
    await fetch('/api/v1/review/approve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ submission_zip: selected, reviewer_email: user.email }) });
    setActionLoading(false); setSelected(null); setFullscreen(false); setView('list'); setLightbox(null); loadSubmissions();
  };
  const handleReject = async () => {
    if (!selected) return;
    setActionLoading(true);
    await fetch('/api/v1/review/reject', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ submission_zip: selected, reviewer_email: user.email, invoice_comment: invoiceComment, evidence_comment: evidenceComment, form_comment: formComment, material_comments: materialComments }) });
    setActionLoading(false); setSelected(null); setFullscreen(false); setView('list'); setLightbox(null); loadSubmissions();
  };

  const selectedSubmission = submissions.find(s => s.filename === selected);
  const reimbType: ReimbursementType = (selectedSubmission?.reimb_type as ReimbursementType) || 'vat';
  const accent = typeColor(reimbType);
  // 审核操作按钮仅待审核/重审显示；ZIP 下载仅已通过显示
  const canAct = selectedSubmission?.status === 'pending' || selectedSubmission?.status === 'resubmitted';
  const canDownload = selectedSubmission?.status === 'approved';

  // 某材料组的预览文件（兼容旧版后端只返回 invoices/evidences 的响应）
  const filesFor = (key: MaterialKey): PreviewFile[] => {
    if (!preview) return [];
    if (preview.materials) return preview.materials[key] || [];
    if (key === 'invoices') return preview.invoices || [];
    if (key === 'evidence') return preview.evidences || [];
    return [];
  };
  // 批注列映射：发票/凭证沿用旧列，报销表走 form_comment，其余材料走 material_comments JSONB
  const commentFor = (key: MaterialKey | 'form'): [string, (v: string) => void] => {
    if (key === 'invoices') return [invoiceComment, setInvoiceComment];
    if (key === 'evidence') return [evidenceComment, setEvidenceComment];
    if (key === 'form') return [formComment, setFormComment];
    return [materialComments[key] || '', (v: string) => setMaterialComments(p => ({ ...p, [key]: v }))];
  };

  const hasUnsavedComments = !!(invoiceComment || evidenceComment || formComment || Object.values(materialComments).some(c => c && c.trim()));
  const requestClose = () => {
    if (hasUnsavedComments && !window.confirm('有未保存的批注，确定退出？')) return;
    setSelected(null); setFullscreen(false); setView('list'); setLightbox(null);
  };

  // 快捷键：Esc 逐层退出（放大图 → 全屏 → 窗口），放大图内 ←/→ 切换
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      if (tag === 'textarea' || tag === 'input' || tag === 'select') return;
      if (e.key === 'Escape') {
        if (lightbox) setLightbox(null);
        else if (fullscreen) setFullscreen(false);
        else requestClose();
      } else if (lightbox) {
        if (e.key === 'ArrowLeft') setLightbox(l => l && { ...l, index: Math.max(0, l.index - 1) });
        if (e.key === 'ArrowRight') setLightbox(l => l && { ...l, index: Math.min(l.files.length - 1, l.index + 1) });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, lightbox, fullscreen, hasUnsavedComments]);

  const filteredSubmissions = submissions.filter(s => {
    if (statusFilter === '待审核' && s.status !== 'pending') return false;
    if (statusFilter === '已通过' && s.status !== 'approved') return false;
    if (statusFilter === '已打回' && s.status !== 'rejected') return false;
    if (statusFilter === '重审' && s.status !== 'resubmitted') return false;
    if (typeFilter !== '全部' && (s.reimb_type || 'vat') !== typeFilter) return false;
    if (dateFrom && s.modified < dateFrom) return false;
    if (dateTo && s.modified > dateTo + 'T23:59:59') return false;
    return true;
  });
  const formatSize = (b: number) => b < 1024*1024 ? `${(b/1024).toFixed(1)} KB` : `${(b/(1024*1024)).toFixed(1)} MB`;
  const statusBadge = (s: string) => s === 'approved' ? <span className="badge badge-ok">已通过</span> : s === 'rejected' ? <span className="badge badge-error">已打回</span> : s === 'resubmitted' ? <span className="badge" style={{ background: '#e67e22', color: '#fff' }}>重审</span> : <span className="badge badge-warn">待审核</span>;
  const typeBadge = (t?: string) => <span className="badge" style={{ background: typeColor(t), color: '#fff' }}>{typeLabel(t)}</span>;

  // ---- 审核窗口：清单视图 ----
  const renderList = () => (
    <>
      <p style={{ fontSize: 13, color: 'var(--gray-500)', margin: '0 0 12px' }}>点击材料查看完整内容与批注</p>
      {TYPE_MATERIALS[reimbType].map(key => {
        const cfg = materialFor(reimbType, key);
        const files = filesFor(key);
        const [comment] = commentFor(key);
        return (
          <div key={key} className="submission-item" style={{ cursor: 'pointer', borderLeft: `4px solid ${accent}`, marginBottom: 8 }}
               onClick={() => setView(key)}>
            <div className="draft-info"><strong>{cfg.icon} {cfg.label}</strong><span className="draft-meta">{files.length} 份</span></div>
            {comment && comment.trim() && <span className="badge badge-ok" title="已填批注">已批注</span>}
            <span style={{ color: 'var(--gray-400)' }}>→</span>
          </div>
        );
      })}
      {preview?.form && (
        <div className="submission-item" style={{ cursor: 'pointer', borderLeft: `4px solid ${accent}` }} onClick={() => setView('form')}>
          <div className="draft-info"><strong>📋 报销表</strong><span className="draft-meta">{preview.form.name}</span></div>
          {formComment && formComment.trim() && <span className="badge badge-ok" title="已填批注">已批注</span>}
          <span style={{ color: 'var(--gray-400)' }}>→</span>
        </div>
      )}
    </>
  );

  // ---- 审核窗口：材料详情视图 ----
  const renderDetail = () => {
    if (view === 'form') {
      return (
        <div>
          <button className="btn btn-secondary" onClick={() => setView('list')} style={{ marginBottom: 12 }}>← 返回材料清单</button>
          <h4 style={{ margin: '0 0 12px', borderLeft: `4px solid ${accent}`, paddingLeft: 8 }}>📋 报销表</h4>
          {preview?.form && <a href={preview.form.download_url} download className="btn btn-secondary" style={{ marginBottom: 4 }}>📥 下载 {preview.form.name}</a>}
          <CommentBox label="报销表/拼接信息批注" comment={formComment} setComment={setFormComment} quickComments={FORM_QUICK} />
        </div>
      );
    }
    const key = view as MaterialKey;
    const cfg = materialFor(reimbType, key);
    const files = filesFor(key);
    const [comment, setComment] = commentFor(key);
    return (
      <div>
        <button className="btn btn-secondary" onClick={() => setView('list')} style={{ marginBottom: 12 }}>← 返回材料清单</button>
        <h4 style={{ margin: '0 0 12px', borderLeft: `4px solid ${accent}`, paddingLeft: 8 }}>{cfg.icon} {cfg.label}（{files.length} 份）</h4>
        {files.length === 0 && <p style={{ color: 'var(--gray-500)', fontSize: 13 }}>该材料无文件</p>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
          {files.map((f, i) => (
            <div key={i} style={{ border: '1px solid var(--gray-200)', borderRadius: 8, overflow: 'hidden', cursor: 'pointer', background: 'var(--gray-50)' }}
                 title={f.name}
                 onClick={() => setLightbox({ files, index: i, label: cfg.label })}>
              {f.data_url.startsWith('data:application/pdf') ? (
                <div style={{ height: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>📄</div>
              ) : (
                <img src={f.data_url} alt={f.name} style={{ width: '100%', height: 90, objectFit: 'cover', display: 'block' }} />
              )}
              <div style={{ padding: '4px 6px', fontSize: 11, color: 'var(--gray-600)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</div>
            </div>
          ))}
        </div>
        <CommentBox label={`${cfg.label}批注`} comment={comment} setComment={setComment} quickComments={cfg.quickComments} />
      </div>
    );
  };

  const lightboxFile = lightbox ? lightbox.files[lightbox.index] : null;

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 16px' }}>
      <button className="btn btn-secondary" onClick={() => navigate('/reviewer')} style={{ marginBottom: 16 }}>← 返回</button>
      <h2>📋 材料审核</h2>
      <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <select className="form-input" style={{ width: 120 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          {['全部', '待审核', '已通过', '已打回', '重审'].map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        <select className="form-input" style={{ width: 140 }} value={typeFilter} onChange={e => setTypeFilter(e.target.value)} title="按报销类型筛选">
          <option value="全部">全部类型</option>
          {(Object.keys(TYPE_CONFIGS) as ReimbursementType[]).map(t => <option key={t} value={t}>{TYPE_CONFIGS[t].label}</option>)}
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
                 style={{ ...(selected === s.filename ? { border: `2px solid ${accent}` } : {}), borderLeft: `4px solid ${typeColor(s.reimb_type)}` }}
                 onClick={() => openReview(s.filename)}>
              <div className="draft-info">
                <strong>📦 {s.filename}</strong>
                <span className="draft-meta">{formatSize(s.size)} · {s.modified.slice(0,19).replace('T',' ')}{s.reviewer_email ? ` · 审核人：${s.reviewer_email}` : ''}</span>
              </div>
              {typeBadge(s.reimb_type)}
              {statusBadge(s.status)}
            </div>
          ))}
        </div>
      )}

      {/* 审核窗口（默认 80% 视口，可全屏） */}
      {selected && (
        <div className="modal-overlay" onClick={() => { if (!fullscreen) requestClose(); }}>
          <div className="modal" onClick={e => e.stopPropagation()}
               style={fullscreen
                 ? { width: '100vw', height: '100vh', maxHeight: '100vh', borderRadius: 0, padding: 0, display: 'flex', flexDirection: 'column' }
                 : { width: '80vw', height: '80vh', maxHeight: '80vh', padding: 0, display: 'flex', flexDirection: 'column' }}>
            {/* 头部：标题 + 类型/状态 + 窗口控制 */}
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--gray-200)', flexShrink: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: 16 }}>审核：{selected}</h3>
                <div style={{ display: 'flex', gap: 6 }}>
                  {canDownload && (
                    <a className="btn btn-secondary" style={{ padding: '2px 10px', fontSize: 12, textDecoration: 'none' }}
                       href={`/api/v1/submissions/download/${encodeURIComponent(selected)}`} download title="下载 ZIP 归档">📥 下载 ZIP</a>
                  )}
                  <button className="btn btn-secondary" style={{ padding: '2px 10px', fontSize: 12 }} onClick={() => setFullscreen(f => !f)} title="全屏/退出全屏">
                    {fullscreen ? '🗗 退出全屏' : '⛶ 全屏'}
                  </button>
                  <button className="btn btn-secondary" style={{ padding: '2px 10px', fontSize: 12 }} onClick={requestClose} title="退出">✕ 退出</button>
                </div>
              </div>
              <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {typeBadge(reimbType)}
                {review && review.status !== 'pending' && (
                  <span className={`badge ${review.status === 'approved' ? 'badge-ok' : review.status === 'rejected' ? 'badge-error' : 'badge-warn'}`}>
                    {review.status === 'approved' ? '已通过' : review.status === 'rejected' ? '已打回' : '重审'} · 审核人：{review.reviewer_email}
                  </span>
                )}
              </div>
            </div>

            {/* 主体：材料清单 / 材料详情 */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
              {previewLoading ? <p style={{ textAlign: 'center', padding: 24 }}><span className="spinner" /> 加载预览...</p>
               : view === 'list' ? renderList() : renderDetail()}
            </div>

            {/* 底部操作栏（仅待审核/重审显示） */}
            {canAct && (
              <div style={{ padding: '12px 16px', borderTop: '1px solid var(--gray-200)', display: 'flex', gap: 12, flexShrink: 0 }}>
                <button className="btn btn-success" onClick={handleApprove} disabled={actionLoading}>✅ 确认无误</button>
                <button className="btn" style={{ background: 'var(--danger)', color: 'white' }} onClick={handleReject} disabled={actionLoading}>↩ 打回修改</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 放大查看（缩略图点击后） */}
      {lightbox && lightboxFile && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', flexDirection: 'column' }}
             onClick={() => setLightbox(null)}>
          <div style={{ padding: '10px 16px', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
            <span style={{ fontSize: 13 }}>{lightbox.label} · {lightbox.index + 1} / {lightbox.files.length} · {lightboxFile.name}</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary" style={{ padding: '2px 10px', fontSize: 12 }} disabled={lightbox.index === 0} onClick={() => setLightbox(l => l && { ...l, index: l.index - 1 })}>← 上一个</button>
              <button className="btn btn-secondary" style={{ padding: '2px 10px', fontSize: 12 }} disabled={lightbox.index >= lightbox.files.length - 1} onClick={() => setLightbox(l => l && { ...l, index: l.index + 1 })}>下一个 →</button>
              <button className="btn btn-secondary" style={{ padding: '2px 10px', fontSize: 12 }} onClick={() => setLightbox(null)}>✕ 关闭</button>
            </div>
          </div>
          <div style={{ flex: 1, overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }} onClick={e => e.stopPropagation()}>
            {lightboxFile.data_url.startsWith('data:application/pdf') ? (
              <div style={{ width: '100%', height: '100%' }}>
                <PdfPreview dataUrl={lightboxFile.data_url} name={lightboxFile.name} />
              </div>
            ) : (
              <img src={lightboxFile.data_url} alt={lightboxFile.name} style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: 6 }} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
