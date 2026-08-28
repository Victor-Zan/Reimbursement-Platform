import { useState, useEffect } from 'react';
import type { CSSProperties } from 'react';
import { TYPE_MATERIALS, materialFor, typesFrom, materialByKey, typeLabel, typeColor } from '../config/materials';
import type { ReimbursementType, MaterialKey } from '../types';
import TypeBadges from './TypeBadges';
import Icon from './Icon';

/** 列表行对象（含类型与状态，供详情窗口推导类型与徽章） */
export interface SubmissionSummary {
  filename: string;
  status?: string;
  reimb_type?: string;
  reimb_types?: string[];
  reimburse_progress?: string;
}

interface PreviewFile { name: string; data_url: string; }
interface PreviewData { materials?: Record<string, PreviewFile[]>; type_materials?: Record<string, Record<string, PreviewFile[]>>; invoices?: PreviewFile[]; evidences?: PreviewFile[]; form: { name: string; download_url: string; html?: string } | null; }

/** 审核窗口内的视图：清单 / 报销表 / 某类型某材料（"type:key"） */
type ReviewView = 'list' | 'form' | string;

interface Props {
  submission: SubmissionSummary;
  title?: string;
  onClose: () => void;
}

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

/** 报销人/审核员共用的提交详情弹窗：材料清单（多类型按类型分列）、缩略图/灯箱、报销表预览、审核批注（只读）。 */
export default function SubmissionDetailModal({ submission, title, onClose }: Props) {
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [review, setReview] = useState<any>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [view, setView] = useState<ReviewView>('list');
  const [lightbox, setLightbox] = useState<{ files: PreviewFile[]; index: number; label: string } | null>(null);
  const [formFullscreen, setFormFullscreen] = useState(false);

  // 打开时并行拉取材料预览与审核批注
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [pr, ar] = await Promise.all([
          fetch(`/api/v1/submissions/preview/${encodeURIComponent(submission.filename)}`).then(r => r.json()),
          fetch(`/api/v1/review/annotations/${encodeURIComponent(submission.filename)}`).then(r => r.json()),
        ]);
        if (cancelled) return;
        if (pr.success) setPreview(pr);
        if (ar.success) setReview(ar.review);
      } catch {}
      if (!cancelled) setPreviewLoading(false);
    })();
    return () => { cancelled = true; };
  }, [submission.filename]);

  const types: ReimbursementType[] = typesFrom(submission);
  const accent = typeColor(types[0]);

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

  // 快捷键：Esc 逐层退出（灯箱 → 报销表全屏 → 窗口全屏 → 关闭），灯箱内 ←/→ 切换
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      if (tag === 'textarea' || tag === 'input' || tag === 'select') return;
      if (e.key === 'Escape') {
        if (lightbox) setLightbox(null);
        else if (formFullscreen) { setFormFullscreen(false); setView('list'); }
        else if (fullscreen) setFullscreen(false);
        else onClose();
      } else if (lightbox) {
        if (e.key === 'ArrowLeft') setLightbox(l => l && { ...l, index: Math.max(0, l.index - 1) });
        if (e.key === 'ArrowRight') setLightbox(l => l && { ...l, index: Math.min(l.files.length - 1, l.index + 1) });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox, formFullscreen, fullscreen, onClose]);

  const statusBadge = (s: string) => s === 'approved' ? <span className="badge badge-ok">已通过</span>
    : s === 'rejected' ? <span className="badge badge-error">已打回</span>
    : s === 'resubmitted' ? <span className="badge badge-purple">重审</span>
    : <span className="badge badge-warn">待审核</span>;

  // ---- 材料清单视图（多类型按类型分列） ----
  const renderList = () => (
    <>
      <p className="card-sub" style={{ marginBottom: 12 }}>点击材料查看完整内容</p>
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
                return (
                  <div key={key} className="submission-item accent-left" style={{ '--accent': typeColor(t), cursor: 'pointer', marginBottom: 8 } as CSSProperties}
                       onClick={() => setView(`${t}:${key}`)}>
                    <div className="draft-info"><strong><Icon name={cfg.icon} size={16} /> {cfg.label}</strong><span className="draft-meta">{files.length} 份</span></div>
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
          <Icon name="arrow-right" size={16} />
        </div>
      )}
    </>
  );

  // ---- 材料详情视图（view 为 "type:key" 或 "form"） ----
  const renderDetail = () => {
    if (view === 'form') {
      return (
        <div>
          <button className="btn btn-ghost btn-sm" onClick={() => { setView('list'); setFormFullscreen(false); }} style={{ marginBottom: 12 }}><Icon name="arrow-left" size={14} /> 返回材料清单</button>
          <h4 className="section-title accent-left" style={{ '--accent': accent, paddingLeft: 8, borderLeftWidth: 3 } as CSSProperties}><Icon name="clipboard" size={16} /> 报销表</h4>
          {preview?.form && (preview.form.html ? (
            <>
              <div className="excel-preview-scroll" dangerouslySetInnerHTML={{ __html: preview.form.html }} />
              <a href={preview.form.download_url} download className="btn btn-secondary btn-sm" style={{ marginTop: 8, textDecoration: 'none' }}><Icon name="download" size={14} /> 下载 {preview.form.name}</a>
            </>
          ) : (
            <a href={preview.form.download_url} download className="btn btn-secondary btn-sm" style={{ marginBottom: 4, textDecoration: 'none' }}><Icon name="download" size={14} /> 下载 {preview.form.name}</a>
          ))}
        </div>
      );
    }
    const [t, k] = (view.includes(':') ? view.split(':') : [types[0], view]) as [ReimbursementType, MaterialKey];
    const cfg = materialFor(t, k);
    const files = filesFor(t, k);
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
      </div>
    );
  };

  const lightboxFile = lightbox ? lightbox.files[lightbox.index] : null;
  // 审核批注只读展示（多类型批注 key 为 "type:key"）
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
    <>
      <div className="modal-overlay" onClick={() => { if (!fullscreen) onClose(); }}>
        <div className={`modal modal-review${fullscreen ? ' modal-review--full' : ''}`} onClick={e => e.stopPropagation()}>
          {/* 头部：标题 + 类型/状态 + 窗口控制 */}
          <div className="modal-head">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
              <h3 className="modal-title" style={{ fontSize: 16 }}>{title || submission.filename}</h3>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <TypeBadges types={types} />
                {statusBadge(submission.status || '')}
                {submission.status === 'approved' && (submission.reimburse_progress === 'reimbursed'
                  ? <span className="badge badge-gold">已报销</span>
                  : <span className="badge badge-info">报销流程中</span>)}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setFullscreen(f => !f)} title="全屏/退出全屏">
                <Icon name={fullscreen ? 'minimize' : 'maximize'} size={14} /> {fullscreen ? '退出全屏' : '全屏'}
              </button>
              <button className="btn btn-secondary btn-sm" onClick={onClose} title="退出"><Icon name="x" size={14} /> 退出</button>
            </div>
          </div>

          {/* 主体：审核批注 + 材料清单/详情 */}
          <div className="modal-body">
            {previewLoading ? <div className="loading"><span className="spinner" /> 加载预览...</div> : (
              <>
                {review && review.status !== 'pending' && (
                  <div className="card" style={{ padding: 16, marginBottom: 16 }}>
                    <h4 className="section-title">
                      <Icon name="search" size={16} /> 审核批注
                      {review.is_admin && <span className="badge badge-purple" style={{ marginLeft: 8 }}><Icon name="shield" size={12} /> 管理员批注</span>}
                    </h4>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                      {annotatorComments}
                      {!review.invoice_comment && !review.evidence_comment && !review.form_comment && !Object.values(review.material_comments || {}).some(c => c) && <p className="empty">无批注内容</p>}
                    </div>
                    <span className="draft-meta">批注人：{review.reviewer_email} · 状态：{review.status === 'approved' ? '已通过' : review.status === 'rejected' ? '已打回' : '重审'}</span>
                  </div>
                )}
                {view === 'list' ? renderList() : renderDetail()}
              </>
            )}
          </div>
        </div>
      </div>

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

      {/* 报销表全屏预览：点材料清单「报销表」自动进入，关闭回材料清单 */}
      {formFullscreen && preview?.form?.html && (
        <div className="modal-overlay" onClick={() => { setFormFullscreen(false); setView('list'); }}>
          <div className="modal modal-preview-full" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3 className="modal-title"><Icon name="clipboard" size={16} /> 报销表预览</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => { setFormFullscreen(false); setView('list'); }}><Icon name="x" size={14} /> 关闭</button>
            </div>
            <div className="excel-preview-scroll" dangerouslySetInnerHTML={{ __html: preview.form.html }} />
            <div className="modal-foot">
              <a href={preview.form.download_url} download className="btn btn-secondary btn-sm" style={{ textDecoration: 'none' }}><Icon name="download" size={14} /> 下载 {preview.form.name}</a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
