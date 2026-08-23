import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { CSSProperties } from 'react';
import { TYPE_MATERIALS, materialFor, typesFrom, typeColor, TYPE_CONFIGS } from '../config/materials';
import type { ReimbursementType, MaterialKey } from '../types';
import { TIME_RANGES, inTimeRange } from '../utils/timeRange';
import TypeBadges from '../components/TypeBadges';
import Icon from '../components/Icon';
import { useFeedback } from '../components/Feedback';

interface Props { user: any; }
interface Submission { filename: string; size: number; modified: string; status: string; reviewer_email: string; reimb_type?: string; reimb_types?: string[]; }
interface PreviewFile { name: string; data_url: string; }
interface PreviewData { materials?: Record<string, PreviewFile[]>; type_materials?: Record<string, Record<string, PreviewFile[]>>; invoices?: PreviewFile[]; evidences?: PreviewFile[]; form: { name: string; download_url: string } | null; }

/** 报销表批注快捷模板 */
const FORM_QUICK = ['拼接信息中组织名称有误', '拼接信息中活动名称有误', '拼接信息中物品名称有误', '拼接信息中金额有误'];

/** 审核窗口内的视图：清单 / 报销表 / 某类型某材料（"type:key"） */
type ReviewView = 'list' | 'form' | string;

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

  if (!url) return <div className="loading">PDF 加载中...</div>;
  return (
    <div className="pdf-shell" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#fff' }}>
      <embed src={url} type="application/pdf" style={{ flex: 1, minHeight: 0, width: '100%', border: 'none', display: 'block', background: '#f5f5f5' }} />
      <div className="pdf-foot">
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}><Icon name="file-text" size={14} /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span></span>
        <a href={url} target="_blank" rel="noreferrer" className="file-link"><Icon name="external-link" size={14} /> 在新窗口打开</a>
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
        {quickComments.map(t => <button key={t} className="btn btn-ghost btn-sm" onClick={() => setComment(comment ? comment + '；' + t : t)}>{t}</button>)}
      </div>
    </div>
  );
}

export default function ReviewMaterials({ user }: Props) {
  const navigate = useNavigate();
  const { confirm } = useFeedback();
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
  const [typeFilter, setTypeFilter] = useState('全部');
  const [timeRange, setTimeRange] = useState('all');

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
  const types: ReimbursementType[] = typesFrom(selectedSubmission);
  const accent = typeColor(types[0]);
  // 审核操作按钮仅待审核/重审显示（列表只含这两类，已通过/已打回在历史审核页）
  const canAct = selectedSubmission?.status === 'pending' || selectedSubmission?.status === 'resubmitted';

  // 某类型某材料的预览文件（多类型读 type_materials；单类型回退旧版平铺键）
  const filesFor = (type: ReimbursementType, key: MaterialKey): PreviewFile[] => {
    if (!preview) return [];
    if (preview.type_materials?.[type]?.[key]) return preview.type_materials[type][key];
    if (types.length === 1 && type === types[0]) {
      if (preview.materials) return preview.materials[key] || [];
      if (key === 'invoices') return preview.invoices || [];
      if (key === 'evidence') return preview.evidences || [];
    }
    return [];
  };
  // 批注列映射：单类型沿用旧列（发票/凭证旧列、报销表 form_comment、其余裸 key）；
  // 多类型一律走 material_comments 的 "type:key" 键
  const commentFor = (type: ReimbursementType, key: MaterialKey | 'form'): [string, (v: string) => void] => {
    if (key === 'form') return [formComment, setFormComment];
    if (types.length === 1) {
      if (key === 'invoices') return [invoiceComment, setInvoiceComment];
      if (key === 'evidence') return [evidenceComment, setEvidenceComment];
      return [materialComments[key] || '', (v: string) => setMaterialComments(p => ({ ...p, [key]: v }))];
    }
    const ck = `${type}:${key}`;
    return [materialComments[ck] || '', (v: string) => setMaterialComments(p => ({ ...p, [ck]: v }))];
  };

  const hasUnsavedComments = !!(invoiceComment || evidenceComment || formComment || Object.values(materialComments).some(c => c && c.trim()));
  const requestClose = async () => {
    if (hasUnsavedComments && !(await confirm({ message: '有未保存的批注，确定退出？', tone: 'danger' }))) return;
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
        else void requestClose();
      } else if (lightbox) {
        if (e.key === 'ArrowLeft') setLightbox(l => l && { ...l, index: Math.max(0, l.index - 1) });
        if (e.key === 'ArrowRight') setLightbox(l => l && { ...l, index: Math.min(l.files.length - 1, l.index + 1) });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, lightbox, fullscreen, hasUnsavedComments]);

  // 材料审核只显示待处理（待审核/重审）；已通过/已打回在历史审核页
  const filteredSubmissions = submissions.filter(s => {
    if (s.status !== 'pending' && s.status !== 'resubmitted') return false;
    if (typeFilter !== '全部' && !typesFrom(s).includes(typeFilter as ReimbursementType)) return false;
    if (!inTimeRange(timeRange, s.modified)) return false;
    return true;
  });
  const formatSize = (b: number) => b < 1024*1024 ? `${(b/1024).toFixed(1)} KB` : `${(b/(1024*1024)).toFixed(1)} MB`;
  const statusBadge = (s: string) => s === 'approved' ? <span className="badge badge-ok">已通过</span> : s === 'rejected' ? <span className="badge badge-error">已打回</span> : s === 'resubmitted' ? <span className="badge badge-purple">重审</span> : <span className="badge badge-warn">待审核</span>;

  // ---- 审核窗口：清单视图（多类型按类型分列，列内为该类型的材料行） ----
  const renderList = () => (
    <>
      <p className="card-sub" style={{ marginBottom: 12 }}>点击材料查看完整内容与批注</p>
      <div className="review-columns" style={{ gridTemplateColumns: `repeat(${types.length}, minmax(220px, 1fr))` }}>
        {types.map(t => (
          <div key={t} className="review-column">
            <div className="review-column-head" style={{ '--accent': typeColor(t) } as CSSProperties}>
              <TypeBadges types={[t]} />
            </div>
            <div style={{ padding: 8 }}>
              {TYPE_MATERIALS[t].map(key => {
                const cfg = materialFor(t, key);
                const files = filesFor(t, key);
                const [comment] = commentFor(t, key);
                return (
                  <div key={key} className="submission-item accent-left" style={{ '--accent': typeColor(t), cursor: 'pointer', marginBottom: 8 } as CSSProperties}
                       onClick={() => setView(`${t}:${key}`)}>
                    <div className="draft-info"><strong><Icon name={cfg.icon} size={16} /> {cfg.label}</strong><span className="draft-meta">{files.length} 份</span></div>
                    {comment && comment.trim() && <span className="badge badge-gold" title="已填批注">已批注</span>}
                    <Icon name="arrow-right" size={16} />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {preview?.form && (
        <div className="submission-item accent-left" style={{ '--accent': accent, cursor: 'pointer' } as CSSProperties} onClick={() => setView('form')}>
          <div className="draft-info"><strong><Icon name="clipboard" size={16} /> 报销表</strong><span className="draft-meta">{preview.form.name}</span></div>
          {formComment && formComment.trim() && <span className="badge badge-gold" title="已填批注">已批注</span>}
          <Icon name="arrow-right" size={16} />
        </div>
      )}
    </>
  );

  // ---- 审核窗口：材料详情视图（view 为 "type:key"） ----
  const renderDetail = () => {
    if (view === 'form') {
      return (
        <div>
          <button className="btn btn-ghost btn-sm" onClick={() => setView('list')} style={{ marginBottom: 12 }}><Icon name="arrow-left" size={14} /> 返回材料清单</button>
          <h4 className="section-title accent-left" style={{ '--accent': accent, paddingLeft: 8, borderLeftWidth: 3 } as CSSProperties}><Icon name="clipboard" size={16} /> 报销表</h4>
          {preview?.form && <a href={preview.form.download_url} download className="btn btn-secondary btn-sm" style={{ marginBottom: 4, textDecoration: 'none' }}><Icon name="download" size={14} /> 下载 {preview.form.name}</a>}
          <CommentBox label="报销表/拼接信息批注" comment={formComment} setComment={setFormComment} quickComments={FORM_QUICK} />
        </div>
      );
    }
    const [t, k] = (view.includes(':') ? view.split(':') : [types[0], view]) as [ReimbursementType, MaterialKey];
    const cfg = materialFor(t, k);
    const files = filesFor(t, k);
    const [comment, setComment] = commentFor(t, k);
    return (
      <div>
        <button className="btn btn-ghost btn-sm" onClick={() => setView('list')} style={{ marginBottom: 12 }}><Icon name="arrow-left" size={14} /> 返回材料清单</button>
        <h4 className="section-title accent-left" style={{ '--accent': typeColor(t), paddingLeft: 8, borderLeftWidth: 3 } as CSSProperties}><TypeBadges types={[t]} small /> {cfg.label}（{files.length} 份）</h4>
        {files.length === 0 && <p className="empty">该材料无文件</p>}
        <div className="thumb-grid">
          {files.map((f, i) => (
            <div key={i} className="thumb"
                 title={f.name}
                 onClick={() => setLightbox({ files, index: i, label: cfg.label })}>
              {f.data_url.startsWith('data:application/pdf') ? (
                <div className="thumb-pdf"><Icon name="file-text" size={28} /></div>
              ) : (
                <img src={f.data_url} alt={f.name} />
              )}
              <div className="thumb-name">{f.name}</div>
            </div>
          ))}
        </div>
        <CommentBox label={`${cfg.label}批注`} comment={comment} setComment={setComment} quickComments={cfg.quickComments} />
      </div>
    );
  };

  const lightboxFile = lightbox ? lightbox.files[lightbox.index] : null;

  return (
    <div>
      <div className="page-head">
        <h1>材料审核</h1>
      </div>
      <button className="btn btn-ghost btn-sm" onClick={() => navigate('/reviewer')} style={{ marginBottom: 16 }}><Icon name="arrow-left" size={14} /> 返回</button>
      <div className="filter-bar">
        <select className="form-input filter-type" value={typeFilter} onChange={e => setTypeFilter(e.target.value)} title="按报销类型筛选">
          <option value="全部">全部类型</option>
          {(Object.keys(TYPE_CONFIGS) as ReimbursementType[]).map(t => <option key={t} value={t}>{TYPE_CONFIGS[t].label}</option>)}
        </select>
        <select className="form-input filter-status" value={timeRange} onChange={e => setTimeRange(e.target.value)} title="按时间范围筛选">
          {TIME_RANGES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {loading ? <div className="loading"><span className="spinner" /> 加载中...</div>
       : filteredSubmissions.length === 0 ? <div className="empty"><div className="empty-icon"><Icon name="folder" size={20} /></div>暂无提交</div>
       : (
        <div className="submission-list">
          {filteredSubmissions.map(s => (
            <div key={s.filename}
                 className={`submission-item ${selected === s.filename ? 'is-selected' : 'accent-left'}`}
                 style={{ '--accent': typeColor(typesFrom(s)[0]) } as CSSProperties}
                 onClick={() => openReview(s.filename)}>
              <div className="draft-info">
                <strong><Icon name="archive" size={16} /> {s.filename}</strong>
                <span className="draft-meta">{formatSize(s.size)} · {s.modified.slice(0,19).replace('T',' ')}{s.reviewer_email ? ` · 审核人：${s.reviewer_email}` : ''}</span>
              </div>
              <TypeBadges types={typesFrom(s)} />
              {statusBadge(s.status)}
            </div>
          ))}
        </div>
      )}

      {/* 审核窗口（默认 80% 视口，可全屏） */}
      {selected && (
        <div className="modal-overlay" onClick={() => { if (!fullscreen) void requestClose(); }}>
          <div className={`modal modal-review${fullscreen ? ' modal-review--full' : ''}`} onClick={e => e.stopPropagation()}>
            {/* 头部：标题 + 类型/状态 + 窗口控制 */}
            <div className="modal-head">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
                <h3 className="modal-title" style={{ fontSize: 16 }}>审核：{selected}</h3>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <TypeBadges types={types} />
                  {review && review.status !== 'pending' && (
                    <span className={`badge ${review.status === 'approved' ? 'badge-ok' : review.status === 'rejected' ? 'badge-error' : 'badge-purple'}`}>
                      {review.status === 'approved' ? '已通过' : review.status === 'rejected' ? '已打回' : '重审'} · 审核人：{review.reviewer_email}
                    </span>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button className="btn btn-secondary btn-sm" onClick={() => setFullscreen(f => !f)} title="全屏/退出全屏">
                  <Icon name={fullscreen ? 'minimize' : 'maximize'} size={14} /> {fullscreen ? '退出全屏' : '全屏'}
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => void requestClose()} title="退出"><Icon name="x" size={14} /> 退出</button>
              </div>
            </div>

            {/* 主体：材料清单 / 材料详情 */}
            <div className="modal-body">
              {previewLoading ? <div className="loading"><span className="spinner" /> 加载预览...</div>
               : view === 'list' ? renderList() : renderDetail()}
            </div>

            {/* 底部操作栏（仅待审核/重审显示） */}
            {canAct && (
              <div className="modal-foot">
                <span />
                <div style={{ display: 'flex', gap: 12 }}>
                  <button className="btn btn-success" onClick={handleApprove} disabled={actionLoading}><Icon name="check" size={15} /> 确认无误</button>
                  <button className="btn btn-danger" onClick={handleReject} disabled={actionLoading}><Icon name="rotate-ccw" size={15} /> 打回修改</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 放大查看（缩略图点击后） */}
      {lightbox && lightboxFile && (
        <div className="lightbox" onClick={() => setLightbox(null)}>
          <div className="lightbox-bar" onClick={e => e.stopPropagation()}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lightbox.label} · {lightbox.index + 1} / {lightbox.files.length} · {lightboxFile.name}</span>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <button className="btn btn-secondary btn-sm" disabled={lightbox.index === 0} onClick={() => setLightbox(l => l && { ...l, index: l.index - 1 })}><Icon name="arrow-left" size={14} /> 上一个</button>
              <button className="btn btn-secondary btn-sm" disabled={lightbox.index >= lightbox.files.length - 1} onClick={() => setLightbox(l => l && { ...l, index: l.index + 1 })}>下一个 <Icon name="arrow-right" size={14} /></button>
              <button className="btn btn-secondary btn-sm" onClick={() => setLightbox(null)}><Icon name="x" size={14} /> 关闭</button>
            </div>
          </div>
          <div className="lightbox-body" onClick={e => e.stopPropagation()}>
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
