import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { CSSProperties } from 'react';
import { TYPE_MATERIALS, materialFor, typeLabel, typeColor, TYPE_CONFIGS, MATERIALS } from '../config/materials';
import type { ReimbursementType, MaterialKey } from '../types';
import Icon from '../components/Icon';
import { useFeedback } from '../components/Feedback';

interface Props { user: any; }
interface Appeal { id: number; submission_id: number | null; submission_zip: string; user_email: string; reason: string; status: string; admin_email: string; created_at: string; reimb_type?: string; submission_status?: string; }
interface PreviewFile { name: string; data_url: string; }
interface PreviewData { materials?: Record<string, PreviewFile[]>; invoices?: PreviewFile[]; evidences?: PreviewFile[]; form: { name: string; download_url: string } | null; }

/** 报销表批注快捷模板 */
const FORM_QUICK = ['已复核，同意报销', '维持审核员打回决定', '材料已核对，予以通过', '材料仍不符合要求，维持打回'];

/** 审核窗口内的视图：清单 / 报销表 / 某个材料 */
type ReviewView = 'list' | 'form' | MaterialKey;

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

/** 管理员端：处理意见（查看成员申诉 + 报销内容 + 审核员批注，裁定最终结果）。 */
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

  // ---- 处理窗口状态 ----
  const [fullscreen, setFullscreen] = useState(false);
  const [view, setView] = useState<ReviewView>('list');
  const [lightbox, setLightbox] = useState<{ files: PreviewFile[]; index: number; label: string } | null>(null);

  const loadAppeals = async () => {
    setLoading(true);
    try { const r = await fetch('/api/v1/admin/appeals'); const j = await r.json(); if (j.success) setAppeals(j.appeals); } catch {}
    setLoading(false);
  };

  useEffect(() => {
    loadAppeals();
    // 打开处理意见页面即视为已读（与成员审核反馈的红点语义一致）
    localStorage.setItem('appeal_last_read', new Date().toISOString());
  }, []);

  const openAppeal = async (a: Appeal) => {
    setSelected(a);
    setPreview(null);
    setReview(null);
    setFormComment(''); setMaterialComments({});
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

  const handleResolve = async (decision: 'approve' | 'reject') => {
    if (!selected) return;
    const ok = await confirm({
      message: decision === 'approve' ? '确认通过该报销申请？' : '确认打回该报销申请？',
      tone: decision === 'approve' ? 'primary' : 'danger',
    });
    if (!ok) return;
    setActionLoading(true);
    try {
      const r = await fetch(`/api/v1/admin/appeals/${selected.id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_email: user.email, decision, form_comment: formComment, material_comments: materialComments }),
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

  const reimbType: ReimbursementType = (selected?.reimb_type as ReimbursementType) || 'vat';
  const accent = typeColor(reimbType);
  // 仅待处理申诉可裁定；已处理显示结果
  const canResolve = selected?.status === 'pending';

  const filesFor = (key: MaterialKey): PreviewFile[] => {
    if (!preview) return [];
    if (preview.materials) return preview.materials[key] || [];
    if (key === 'invoices') return preview.invoices || [];
    if (key === 'evidence') return preview.evidences || [];
    return [];
  };
  // 批注列映射：发票/凭证沿用旧列，报销表走 form_comment，其余材料走 material_comments JSONB
  const commentFor = (key: MaterialKey | 'form'): [string, (v: string) => void] => {
    if (key === 'form') return [formComment, setFormComment];
    return [materialComments[key] || '', (v: string) => setMaterialComments(p => ({ ...p, [key]: v }))];
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
    if (typeFilter !== '全部' && (a.reimb_type || 'vat') !== typeFilter) return false;
    return true;
  });
  const appealStatusBadge = (s: string) => s === 'approved' ? <span className="badge badge-ok">已通过</span> : s === 'rejected' ? <span className="badge badge-error">已打回</span> : <span className="badge badge-warn">待处理</span>;
  const typeBadge = (t?: string) => (
    <span className="badge badge-neutral">
      <span className="dot" style={{ background: typeColor(t) }} />
      {typeLabel(t)}
    </span>
  );

  // ---- 处理窗口：材料清单视图 ----
  const renderList = () => (
    <>
      <p className="card-sub" style={{ marginBottom: 12 }}>点击材料查看完整内容并填写处理意见</p>
      {TYPE_MATERIALS[reimbType].map(key => {
        const cfg = materialFor(reimbType, key);
        const files = filesFor(key);
        const [comment] = commentFor(key);
        return (
          <div key={key} className="submission-item accent-left" style={{ '--accent': accent, cursor: 'pointer', marginBottom: 8 } as CSSProperties}
               onClick={() => setView(key)}>
            <div className="draft-info"><strong><Icon name={cfg.icon} size={16} /> {cfg.label}</strong><span className="draft-meta">{files.length} 份</span></div>
            {comment && comment.trim() && <span className="badge badge-gold" title="已填处理意见">已批注</span>}
            <Icon name="arrow-right" size={16} />
          </div>
        );
      })}
      {preview?.form && (
        <div className="submission-item accent-left" style={{ '--accent': accent, cursor: 'pointer' } as CSSProperties} onClick={() => setView('form')}>
          <div className="draft-info"><strong><Icon name="clipboard" size={16} /> 报销表</strong><span className="draft-meta">{preview.form.name}</span></div>
          {formComment && formComment.trim() && <span className="badge badge-gold" title="已填处理意见">已批注</span>}
          <Icon name="arrow-right" size={16} />
        </div>
      )}
    </>
  );

  // ---- 处理窗口：材料详情视图 ----
  const renderDetail = () => {
    if (view === 'form') {
      return (
        <div>
          <button className="btn btn-ghost btn-sm" onClick={() => setView('list')} style={{ marginBottom: 12 }}><Icon name="arrow-left" size={14} /> 返回材料清单</button>
          <h4 className="section-title accent-left" style={{ '--accent': accent, paddingLeft: 8, borderLeftWidth: 3 } as CSSProperties}><Icon name="clipboard" size={16} /> 报销表</h4>
          {preview?.form && <a href={preview.form.download_url} download className="btn btn-secondary btn-sm" style={{ marginBottom: 4, textDecoration: 'none' }}><Icon name="download" size={14} /> 下载 {preview.form.name}</a>}
          {canResolve && <CommentBox label="报销表处理意见" comment={formComment} setComment={setFormComment} quickComments={FORM_QUICK} />}
        </div>
      );
    }
    const key = view as MaterialKey;
    const cfg = materialFor(reimbType, key);
    const files = filesFor(key);
    const [comment, setComment] = commentFor(key);
    return (
      <div>
        <button className="btn btn-ghost btn-sm" onClick={() => setView('list')} style={{ marginBottom: 12 }}><Icon name="arrow-left" size={14} /> 返回材料清单</button>
        <h4 className="section-title accent-left" style={{ '--accent': accent, paddingLeft: 8, borderLeftWidth: 3 } as CSSProperties}><Icon name={cfg.icon} size={16} /> {cfg.label}（{files.length} 份）</h4>
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

  const lightboxFile = lightbox ? lightbox.files[lightbox.index] : null;
  // 审核员（或上次处理管理员）的批注展示
  const annotatorComments = review ? (
    <>
      {review.invoice_comment && <p><Icon name="receipt" size={14} /> 发票：{review.invoice_comment}</p>}
      {review.evidence_comment && <p><Icon name="camera" size={14} /> 凭证：{review.evidence_comment}</p>}
      {Object.entries((review.material_comments || {}) as Record<string, string>).filter(([, c]) => c).map(([k, c]) => {
        const cfg = MATERIALS[k as MaterialKey];
        return <p key={k}>{cfg ? <><Icon name={cfg.icon} size={14} /> {cfg.label}</> : k}：{c}</p>;
      })}
      {review.form_comment && <p><Icon name="clipboard" size={14} /> 报销表：{review.form_comment}</p>}
    </>
  ) : null;

  return (
    <div>
      <div className="page-head">
        <h1><Icon name="send" size={22} /> 处理意见</h1>
        <p className="page-head-sub">查看成员申诉、报销内容与审核员批注，直接裁定报销最终结果</p>
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
                 style={{ '--accent': typeColor(a.reimb_type) } as CSSProperties}
                 onClick={() => openAppeal(a)}>
              <div className="draft-info">
                <strong><Icon name="user" size={16} /> {a.user_email}</strong>
                <span className="draft-meta"><Icon name="archive" size={13} /> {a.submission_zip} · {a.reason} · {a.created_at.slice(0, 19).replace('T', ' ')}</span>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {typeBadge(a.reimb_type)}
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
                  {typeBadge(selected.reimb_type)}
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
                    <h4 className="section-title"><Icon name="send" size={16} /> 成员申诉</h4>
                    <div className="draft-info" style={{ fontSize: 14 }}>
                      <strong>{selected.user_email}</strong>
                      <span className="draft-meta">提交时间：{selected.created_at.slice(0, 19).replace('T', ' ')}</span>
                      <p style={{ marginTop: 6, whiteSpace: 'pre-line' }}>{selected.reason}</p>
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
                  {view === 'list' ? renderList() : renderDetail()}
                </>
              )}
            </div>

            {/* 底部操作栏（仅待处理申诉显示） */}
            {canResolve && (
              <div className="modal-foot">
                <span />
                <div style={{ display: 'flex', gap: 12 }}>
                  <button className="btn btn-success" onClick={() => handleResolve('approve')} disabled={actionLoading}><Icon name="check" size={15} /> 通过报销</button>
                  <button className="btn btn-danger" onClick={() => handleResolve('reject')} disabled={actionLoading}><Icon name="rotate-ccw" size={15} /> 打回报销</button>
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
