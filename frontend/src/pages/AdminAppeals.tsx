import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { CSSProperties, ChangeEvent } from 'react';
import { TYPE_MATERIALS, materialFor, typesFrom, materialByKey, typeLabel, typeColor, TYPE_CONFIGS } from '../config/materials';
import type { ReimbursementType, MaterialKey } from '../types';
import TypeBadges from '../components/TypeBadges';
import Icon from '../components/Icon';
import { useFeedback } from '../components/Feedback';

interface Props { user: any; }
interface Appeal { id: number; submission_id: number | null; submission_zip: string; user_email: string; reason: string; status: string; admin_email: string; created_at: string; reimb_type?: string; reimb_types?: string[]; submission_status?: string; appeal_type?: string; proof_url?: string; }
interface PreviewFile { name: string; data_url: string; }
/** 发票明细行（报销表项目） */
interface InvoiceItem { name: string; unit_price: number; quantity: number; }
/** 单张发票的报销表项目备注（与发票文件同序配对） */
interface InvoiceDetail { invoice_total: number; reimbursement_amount: number; items: InvoiceItem[]; }
interface PreviewData { materials?: Record<string, PreviewFile[]>; type_materials?: Record<string, Record<string, PreviewFile[]>>; invoices?: PreviewFile[]; evidences?: PreviewFile[]; form: { name: string; download_url: string; html?: string } | null; invoice_details?: Record<string, InvoiceDetail[]>; }

/** 报销表批注快捷模板 */
const FORM_QUICK = ['已复核，同意报销', '维持审核员打回决定', '材料已核对，予以通过', '材料仍不符合要求，维持打回'];

/** 审核窗口内的视图：清单 / 报销表 / 某类型某材料（"type:key"） */
type ReviewView = 'list' | 'form' | string;

/** PDF 预览：base64 转 Blob URL 再渲染，附新窗口打开兜底 */
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
      <textarea className="form-input" rows={2} value={comment} onChange={e => setComment(e.target.value)} placeholder="处理意见..." />
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
        {quickComments.map(t => <button key={t} className="btn btn-ghost btn-sm" onClick={() => setComment(comment ? comment + '；' + t : t)}>{t}</button>)}
      </div>
    </div>
  );
}

/** 管理员端：处理意见（查看报销人申诉 + 报销内容 + 审核员批注，裁定最终结果）。 */
export default function AdminAppeals({ user }: Props) {
  const navigate = useNavigate();
  const { toast, confirm } = useFeedback();
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Appeal | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [review, setReview] = useState<any>(null);
  const [formComment, setFormComment] = useState('');
  const [materialComments, setMaterialComments] = useState<Record<string, string>>({});
  const [actionLoading, setActionLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('全部');
  const [typeFilter, setTypeFilter] = useState('全部');
  // 打款证明（未到账申诉驳回时上传，resolve 一并提交）
  const [proofFile, setProofFile] = useState<{ filename: string; url: string } | null>(null);
  const [proofUploading, setProofUploading] = useState(false);

  // ---- 处理窗口状态 ----
  const [fullscreen, setFullscreen] = useState(false);
  const [view, setView] = useState<ReviewView>('list');
  const [lightbox, setLightbox] = useState<{ files: PreviewFile[]; index: number; label: string } | null>(null);
  const [formFullscreen, setFormFullscreen] = useState(false);
  const [showHint, setShowHint] = useState(false);

  // 全屏报销表预览：进入即弹出审查提示气泡，4 秒后自动关闭（也可手动关闭）
  useEffect(() => {
    if (!formFullscreen) { setShowHint(false); return; }
    setShowHint(true);
    const timer = setTimeout(() => setShowHint(false), 4000);
    return () => clearTimeout(timer);
  }, [formFullscreen]);

  const loadAppeals = async () => {
    setLoading(true);
    try { const r = await fetch('/api/v1/admin/appeals'); const j = await r.json(); if (j.success) setAppeals(j.appeals); } catch {}
    setLoading(false);
  };

  useEffect(() => {
    loadAppeals();
    // 打开处理意见页面即视为已读（与报销人审核反馈的红点语义一致）
    localStorage.setItem('appeal_last_read', new Date().toISOString());
  }, []);

  const openAppeal = async (a: Appeal) => {
    setSelected(a);
    setPreview(null);
    setReview(null);
    setFormComment(''); setMaterialComments({});
    setProofFile(null);
    setFullscreen(false); setView('list'); setLightbox(null);
    setPreviewLoading(true);
    try {
      const [pr, ar] = await Promise.all([
        fetch(`/api/v1/submissions/preview/${encodeURIComponent(a.submission_zip)}`).then(r => r.json()),
        fetch(`/api/v1/review/annotations/${encodeURIComponent(a.submission_zip)}`).then(r => r.json()),
      ]);
      if (pr.success) setPreview(pr); else toast('文件缺失，无法预览', 'warn');
      if (ar.success) setReview(ar.review);
    } catch {}
    setPreviewLoading(false);
  };

  /** 上传打款证明截图（保存于服务端，resolve 时随申诉记录；可重传覆盖） */
  const handleUploadProof = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selected) return;
    setProofUploading(true);
    try {
      const fd = new FormData();
      fd.append('proof_file', file);
      const r = await fetch(`/api/v1/admin/appeals/${selected.id}/proof`, { method: 'POST', body: fd });
      const j = await r.json();
      if (r.ok && j.success) {
        setProofFile({ filename: j.proof_filename, url: j.proof_url });
        toast('打款证明已上传', 'success');
      } else {
        toast(j.detail || '上传失败', 'error');
      }
    } catch { toast('网络错误', 'error'); }
    setProofUploading(false);
    e.target.value = '';
  };

  const handleResolve = async (decision: 'approve' | 'reject') => {
    if (!selected) return;
    const unreceived = selected.appeal_type === 'unreceived';
    const ok = await confirm({
      message: unreceived
        ? (decision === 'approve' ? '确认未到账？报销进度将回到「报销流程中」重新处理打款。' : '确认已到账并驳回该申诉？')
        : (decision === 'approve' ? '确认通过该报销申请？' : '确认打回该报销申请？'),
      tone: unreceived ? 'primary' : (decision === 'approve' ? 'primary' : 'danger'),
    });
    if (!ok) return;
    setActionLoading(true);
    try {
      const r = await fetch(`/api/v1/admin/appeals/${selected.id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_email: user.email, decision, form_comment: formComment, material_comments: materialComments, proof_filename: proofFile?.filename || '' }),
      });
      const j = await r.json();
      if (r.ok && j.success) {
        toast('处理完成', 'success');
        setSelected(null); setFullscreen(false); setView('list'); setLightbox(null);
        loadAppeals();
      } else {
        toast(j.detail || '操作失败', 'error');
      }
    } catch { toast('网络错误', 'error'); }
    setActionLoading(false);
  };

  const types: ReimbursementType[] = typesFrom(selected ?? undefined);
  const accent = typeColor(types[0]);
  // 仅待处理申诉可裁定；已处理显示结果
  const canResolve = selected?.status === 'pending';

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
  // 批注列映射：单类型用裸 key；多类型用 "type:key"
  const commentFor = (type: ReimbursementType, key: MaterialKey | 'form'): [string, (v: string) => void] => {
    if (key === 'form') return [formComment, setFormComment];
    const ck = types.length === 1 ? key : `${type}:${key}`;
    return [materialComments[ck] || '', (v: string) => setMaterialComments(p => ({ ...p, [ck]: v }))];
  };

  const hasUnsavedComments = !!(formComment || Object.values(materialComments).some(c => c && c.trim()));
  const requestClose = async () => {
    if (hasUnsavedComments && !(await confirm({ message: '有未保存的处理意见，确定退出？', tone: 'danger' }))) return;
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

  const filteredAppeals = appeals.filter(a => {
    if (statusFilter === '待处理' && a.status !== 'pending') return false;
    if (statusFilter === '已通过' && a.status !== 'approved') return false;
    if (statusFilter === '已打回' && a.status !== 'rejected') return false;
    if (typeFilter !== '全部' && !typesFrom(a).includes(typeFilter as ReimbursementType)) return false;
    return true;
  });
  const appealStatusBadge = (s: string) => s === 'approved' ? <span className="badge badge-ok">已通过</span> : s === 'rejected' ? <span className="badge badge-error">已打回</span> : <span className="badge badge-warn">待处理</span>;

  // ---- 处理窗口：材料清单视图（多类型按类型分列） ----
  const renderList = () => (
    <>
      <p className="card-sub" style={{ marginBottom: 12 }}>点击材料查看完整内容并填写处理意见</p>
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
                    {comment && comment.trim() && <span className="badge badge-gold" title="已填处理意见">已批注</span>}
                    <Icon name="arrow-right" size={16} />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {preview?.form && (
        <div className="submission-item accent-left" style={{ '--accent': accent, cursor: 'pointer' } as CSSProperties} onClick={() => { setView('form'); setFormFullscreen(true); }}>
          <div className="draft-info"><strong><Icon name="clipboard" size={16} /> 报销表</strong><span className="draft-meta">{preview.form.name}</span></div>
          {formComment && formComment.trim() && <span className="badge badge-gold" title="已填处理意见">已批注</span>}
          <Icon name="arrow-right" size={16} />
        </div>
      )}
    </>
  );

  // ---- 处理窗口：材料详情视图（view 为 "type:key"） ----
  const renderDetail = () => {
    if (view === 'form') {
      return (
        <div>
          <button className="btn btn-ghost btn-sm" onClick={() => setView('list')} style={{ marginBottom: 12 }}><Icon name="arrow-left" size={14} /> 返回材料清单</button>
          <h4 className="section-title accent-left" style={{ '--accent': accent, paddingLeft: 8, borderLeftWidth: 3 } as CSSProperties}><Icon name="clipboard" size={16} /> 报销表</h4>
          {preview?.form && (preview.form.html ? (
            <>
              <div className="excel-preview-scroll" dangerouslySetInnerHTML={{ __html: preview.form.html }} />
              <a href={preview.form.download_url} download className="btn btn-secondary btn-sm" style={{ marginTop: 8, textDecoration: 'none' }}><Icon name="download" size={14} /> 下载 {preview.form.name}</a>
            </>
          ) : (
            <a href={preview.form.download_url} download className="btn btn-secondary btn-sm" style={{ marginBottom: 4, textDecoration: 'none' }}><Icon name="download" size={14} /> 下载 {preview.form.name}</a>
          ))}
          {canResolve && <CommentBox label="报销表处理意见" comment={formComment} setComment={setFormComment} quickComments={FORM_QUICK} />}
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
        {canResolve && <CommentBox label={`${cfg.label}处理意见`} comment={comment} setComment={setComment} quickComments={cfg.quickComments} />}
      </div>
    );
  };

  // 全屏报销表右侧发票面板：按类型分组，卡片可点开放大查看，下方备注该发票对应的报销表项目
  const renderInvoiceSide = () => {
    const invoiceTypes = types.filter(t => filesFor(t, 'invoices').length > 0);
    if (invoiceTypes.length === 0) return <p className="empty" style={{ padding: 16 }}>无发票</p>;
    return (
      <div className="invoice-side">
        {invoiceTypes.map(t => {
          const files = filesFor(t, 'invoices');
          const details = preview?.invoice_details?.[t] || [];
          return (
            <div key={t}>
              <div className="review-column-head" style={{ '--accent': typeColor(t) } as CSSProperties}>
                <TypeBadges types={[t]} />
              </div>
              {files.map((f, i) => {
                const d = details[i];
                return (
                  <div key={i} className="invoice-card"
                       title="点击放大查看"
                       onClick={() => setLightbox({ files, index: i, label: TYPE_CONFIGS[t].label })}>
                    <div className="invoice-card-head">
                      <span className="invoice-card-name"><Icon name="receipt" size={14} /> {f.name}</span>
                      {d && <span className="invoice-card-amount">¥{Number(d.reimbursement_amount || 0).toFixed(2)}</span>}
                    </div>
                    <div className="invoice-card-items">
                      {d ? (d.items.length ? d.items.map((it, j) => (
                        <div key={j} className="invoice-card-item">{it.name} ×{it.quantity} · 单价¥{Number(it.unit_price || 0).toFixed(2)}</div>
                      )) : <div className="invoice-card-item is-empty">无明细项目</div>)
                      : <div className="invoice-card-item is-empty">无项目数据</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    );
  };

  const lightboxFile = lightbox ? lightbox.files[lightbox.index] : null;
  // 审核员（或上次处理管理员）的批注展示（多类型批注 key 为 "type:key"）
  const annotatorComments = review ? (
    <>
      {review.invoice_comment && <p><Icon name="receipt" size={14} /> 发票：{review.invoice_comment}</p>}
      {review.evidence_comment && <p><Icon name="camera" size={14} /> 凭证：{review.evidence_comment}</p>}
      {Object.entries((review.material_comments || {}) as Record<string, string>).filter(([, c]) => c).map(([k, c]) => {
        const m = materialByKey(k);
        const label = m.cfg ? (m.type ? `${typeLabel(m.type)}·${m.cfg.label}` : m.cfg.label) : k;
        return <p key={k}>{m.cfg ? <><Icon name={m.cfg.icon} size={14} /> {label}</> : k}：{c}</p>;
      })}
      {review.form_comment && <p><Icon name="clipboard" size={14} /> 报销表：{review.form_comment}</p>}
    </>
  ) : null;

  return (
    <div>
      <div className="page-head">
        <h1><Icon name="send" size={22} /> 处理意见</h1>
        <p className="page-head-sub">查看报销人申诉、报销内容与审核员批注，直接裁定报销最终结果</p>
      </div>
      <button className="btn btn-ghost btn-sm" onClick={() => navigate('/admin')} style={{ marginBottom: 16 }}><Icon name="arrow-left" size={14} /> 返回</button>
      <div className="filter-bar">
        <select className="form-input filter-status" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          {['全部', '待处理', '已通过', '已打回'].map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        <select className="form-input filter-type" value={typeFilter} onChange={e => setTypeFilter(e.target.value)} title="按报销类型筛选">
          <option value="全部">全部类型</option>
          {(Object.keys(TYPE_CONFIGS) as ReimbursementType[]).map(t => <option key={t} value={t}>{TYPE_CONFIGS[t].label}</option>)}
        </select>
      </div>

      {loading ? <div className="loading"><span className="spinner" /> 加载中...</div>
       : filteredAppeals.length === 0 ? <div className="empty"><div className="empty-icon"><Icon name="send" size={20} /></div>暂无申诉</div>
       : (
        <div className="submission-list">
          {filteredAppeals.map(a => (
            <div key={a.id}
                 className={`submission-item ${selected?.id === a.id ? 'is-selected' : 'accent-left'}`}
                 style={{ '--accent': typeColor(typesFrom(a)[0]) } as CSSProperties}
                 onClick={() => openAppeal(a)}>
              <div className="draft-info">
                <strong><Icon name="user" size={16} /> {a.user_email}
                  {a.appeal_type === 'unreceived' && <span className="badge badge-gold" style={{ marginLeft: 6 }}>未到账申诉</span>}
                </strong>
                <span className="draft-meta"><Icon name="archive" size={13} /> {a.submission_zip} · {a.reason} · {a.created_at.slice(0, 19).replace('T', ' ')}</span>
              </div>
              <div className="submission-type-col"><TypeBadges types={typesFrom(a)} /></div>
              <div className="submission-right">
                {a.submission_status === 'resubmitted' && <span className="badge badge-purple">已重新提交</span>}
                {appealStatusBadge(a.status)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 处理窗口（默认 80% 视口，可全屏） */}
      {selected && (
        <div className="modal-overlay" onClick={() => { if (!fullscreen) void requestClose(); }}>
          <div className={`modal modal-review${fullscreen ? ' modal-review--full' : ''}`} onClick={e => e.stopPropagation()}>
            {/* 头部：标题 + 类型/状态 + 窗口控制 */}
            <div className="modal-head">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
                <h3 className="modal-title" style={{ fontSize: 16 }}>处理意见：{selected.submission_zip}</h3>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <TypeBadges types={types} />
                  {selected.appeal_type === 'unreceived' ? <span className="badge badge-gold">未到账申诉</span> : <span className="badge badge-info">打回申诉</span>}
                  {appealStatusBadge(selected.status)}
                  {selected.status !== 'pending' && selected.admin_email && <span className="draft-meta">处理人：{selected.admin_email}</span>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button className="btn btn-secondary btn-sm" onClick={() => setFullscreen(f => !f)} title="全屏/退出全屏">
                  <Icon name={fullscreen ? 'minimize' : 'maximize'} size={14} /> {fullscreen ? '退出全屏' : '全屏'}
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => void requestClose()} title="退出"><Icon name="x" size={14} /> 退出</button>
              </div>
            </div>

            {/* 主体：申诉信息 + 审核员批注 + 材料清单/详情 */}
            <div className="modal-body">
              {previewLoading ? <div className="loading"><span className="spinner" /> 加载预览...</div> : (
                <>
                  {/* 申诉信息 */}
                  <div className="card" style={{ padding: 16, marginBottom: 16 }}>
                    <h4 className="section-title"><Icon name="send" size={16} /> 报销人申诉</h4>
                    <div className="draft-info" style={{ fontSize: 14 }}>
                      <strong>{selected.user_email}</strong>
                      <span className="draft-meta">提交时间：{selected.created_at.slice(0, 19).replace('T', ' ')}</span>
                      <p style={{ marginTop: 6, whiteSpace: 'pre-line' }}>{selected.reason}</p>
                      {selected.proof_url && (
                        <div style={{ marginTop: 8 }}>
                          <a href={selected.proof_url} target="_blank" rel="noreferrer" className="file-link"><Icon name="image" size={14} /> 打款证明截图</a>
                        </div>
                      )}
                    </div>
                  </div>
                  {/* 审核员/管理员批注（申诉待处理时最新批注即审核员打回意见） */}
                  {review && review.status !== 'pending' && (
                    <div className="card" style={{ padding: 16, marginBottom: 16 }}>
                      <h4 className="section-title">
                        {review.is_admin ? <><Icon name="shield" size={16} /> 管理员批注</> : <><Icon name="search" size={16} /> 审核员批注</>}
                      </h4>
                      <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                        {annotatorComments}
                        {!review.invoice_comment && !review.evidence_comment && !review.form_comment && !Object.values(review.material_comments || {}).some(c => c) && <p className="empty">无批注内容</p>}
                      </div>
                      <span className="draft-meta">批注人：{review.reviewer_email} · 状态：{review.status === 'approved' ? '已通过' : '已打回'}</span>
                    </div>
                  )}
                  {/* 打款证明上传（仅未到账申诉、待处理时显示；驳回申诉时提供依据） */}
                  {canResolve && selected.appeal_type === 'unreceived' && (
                    <div className="card" style={{ padding: 16, marginBottom: 16 }}>
                      <h4 className="section-title"><Icon name="image" size={16} /> 打款证明（驳回申诉时可提供）</h4>
                      <p className="card-sub" style={{ marginBottom: 8 }}>确认已到账、驳回申诉时，可上传打款截图作为依据（可选，可重新上传覆盖）</p>
                      {proofFile ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <img src={proofFile.url} alt="打款证明" style={{ width: 96, height: 72, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--gray-300)' }} />
                          <div>
                            <div className="file-chip"><Icon name="image" size={14} /> {proofFile.filename}</div>
                            <label className="btn btn-ghost btn-sm" style={{ marginTop: 6, cursor: 'pointer', display: 'inline-flex' }}>
                              <Icon name="refresh" size={13} /> 重新上传
                              <input type="file" accept=".png,.jpg,.jpeg" hidden onChange={handleUploadProof} />
                            </label>
                          </div>
                        </div>
                      ) : (
                        <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
                          {proofUploading ? <><span className="spinner" /> 上传中...</> : <><Icon name="upload-cloud" size={14} /> 上传截图</>}
                          <input type="file" accept=".png,.jpg,.jpeg" hidden onChange={handleUploadProof} />
                        </label>
                      )}
                    </div>
                  )}
                  {view === 'list' ? renderList() : renderDetail()}
                </>
              )}
            </div>

            {/* 底部操作栏（仅待处理申诉显示；未到账申诉为核实打款的两个动作） */}
            {canResolve && (
              <div className="modal-foot">
                <span />
                <div style={{ display: 'flex', gap: 12 }}>
                  {selected.appeal_type === 'unreceived' ? (
                    <>
                      <button className="btn btn-success" onClick={() => handleResolve('reject')} disabled={actionLoading}><Icon name="check" size={15} /> 确认已到账，驳回申诉</button>
                      <button className="btn btn-gold" onClick={() => handleResolve('approve')} disabled={actionLoading}><Icon name="refresh" size={15} /> 确认未到账，重新处理</button>
                    </>
                  ) : (
                    <>
                      <button className="btn btn-success" onClick={() => handleResolve('approve')} disabled={actionLoading}><Icon name="check" size={15} /> 通过报销</button>
                      <button className="btn btn-danger" onClick={() => handleResolve('reject')} disabled={actionLoading}><Icon name="rotate-ccw" size={15} /> 打回报销</button>
                    </>
                  )}
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

      {/* 报销表全屏预览：点材料清单「报销表」自动进入，关闭回材料清单；左侧报销表、右侧发票列 */}
      {formFullscreen && preview?.form?.html && (
        <div className="modal-overlay" onClick={() => { setFormFullscreen(false); setView('list'); }}>
          <div className="modal modal-preview-full" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3 className="modal-title"><Icon name="clipboard" size={16} /> 报销表预览</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => { setFormFullscreen(false); setView('list'); }}><Icon name="x" size={14} /> 关闭</button>
            </div>
            <div className="preview-split">
              <div className="preview-sheet">
                <div className="excel-preview-scroll" dangerouslySetInnerHTML={{ __html: preview.form.html }} />
                {showHint && (
                  <div className="hint-bubble">
                    <div className="hint-bubble-head">
                      <Icon name="info" size={15} /> 审查提示
                      <button className="btn btn-ghost btn-sm" onClick={() => setShowHint(false)} title="关闭提示"><Icon name="x" size={12} /></button>
                    </div>
                    <p>请重点核对：表中报销项目是否均可报销？有无错报、重复报销的情况？</p>
                  </div>
                )}
              </div>
              {renderInvoiceSide()}
            </div>
            <div style={{ padding: '0 20px' }}>
              {canResolve && <CommentBox label="报销表处理意见" comment={formComment} setComment={setFormComment} quickComments={FORM_QUICK} />}
            </div>
            <div className="modal-foot">
              <a href={preview.form.download_url} download className="btn btn-secondary btn-sm" style={{ textDecoration: 'none' }}><Icon name="download" size={14} /> 下载 {preview.form.name}</a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
