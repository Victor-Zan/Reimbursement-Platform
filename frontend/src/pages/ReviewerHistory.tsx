import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { CSSProperties } from 'react';
import { TYPE_MATERIALS, materialFor, typesFrom, materialByKey, typeLabel, typeColor, TYPE_CONFIGS } from '../config/materials';
import type { ReimbursementType, MaterialKey } from '../types';
import { TIME_RANGES, inTimeRange } from '../utils/timeRange';
import TypeBadges from '../components/TypeBadges';
import OrgAutocomplete from '../components/OrgAutocomplete';
import Icon from '../components/Icon';
import { ORGANIZATIONS } from '../config/organizations';

interface Submission { filename: string; size: number; modified: string; status: string; reviewer_email: string; org_name?: string; reimb_type?: string; reimb_types?: string[]; }
interface PreviewFile { name: string; data_url: string; }
interface PreviewData { materials?: Record<string, PreviewFile[]>; type_materials?: Record<string, Record<string, PreviewFile[]>>; invoices?: PreviewFile[]; evidences?: PreviewFile[]; form: { name: string; download_url: string; html?: string } | null; }

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

/** 审核员端：历史审核（已通过/已打回的报销申请，只读查看 + 已通过可下载 ZIP）。 */
export default function ReviewerHistory() {
  const navigate = useNavigate();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [review, setReview] = useState<any>(null);
  const [statusFilter, setStatusFilter] = useState('全部');
  const [typeFilter, setTypeFilter] = useState('全部');
  const [timeRange, setTimeRange] = useState('all');
  const [orgFilter, setOrgFilter] = useState('');

  // ---- 查看窗口状态 ----
  const [fullscreen, setFullscreen] = useState(false);
  const [view, setView] = useState<ReviewView>('list');
  const [lightbox, setLightbox] = useState<{ files: PreviewFile[]; index: number; label: string } | null>(null);
  const [formFullscreen, setFormFullscreen] = useState(false);

  const loadSubmissions = async () => {
    setLoading(true);
    try { const r = await fetch('/api/v1/review/submissions'); const j = await r.json(); if (j.success) setSubmissions(j.submissions); } catch {}
    setLoading(false);
  };
  useEffect(() => { loadSubmissions(); }, []);

  const openView = async (filename: string) => {
    setSelected(filename);
    setPreview(null);
    setReview(null);
    setFullscreen(false); setView('list'); setLightbox(null);
    setPreviewLoading(true);
    try {
      const [pr, ar] = await Promise.all([
        fetch(`/api/v1/submissions/preview/${encodeURIComponent(filename)}`).then(r => r.json()),
        fetch(`/api/v1/review/annotations/${encodeURIComponent(filename)}`).then(r => r.json()),
      ]);
      if (pr.success) setPreview(pr);
      if (ar.success) setReview(ar.review);
    } catch {}
    setPreviewLoading(false);
  };

  const selectedSubmission = submissions.find(s => s.filename === selected);
  const types: ReimbursementType[] = typesFrom(selectedSubmission);
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

  // 快捷键：Esc 逐层退出（放大图 → 全屏 → 窗口），放大图内 ←/→ 切换
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      if (tag === 'textarea' || tag === 'input' || tag === 'select') return;
      if (e.key === 'Escape') {
        if (lightbox) setLightbox(null);
        else if (fullscreen) setFullscreen(false);
        else { setSelected(null); setFullscreen(false); setView('list'); setLightbox(null); }
      } else if (lightbox) {
        if (e.key === 'ArrowLeft') setLightbox(l => l && { ...l, index: Math.max(0, l.index - 1) });
        if (e.key === 'ArrowRight') setLightbox(l => l && { ...l, index: Math.min(l.files.length - 1, l.index + 1) });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, lightbox, fullscreen]);

  // 历史审核只含已通过/已打回
  const filteredSubmissions = submissions.filter(s => {
    if (s.status !== 'approved' && s.status !== 'rejected') return false;
    if (statusFilter === '已通过' && s.status !== 'approved') return false;
    if (statusFilter === '已打回' && s.status !== 'rejected') return false;
    if (typeFilter !== '全部' && !typesFrom(s).includes(typeFilter as ReimbursementType)) return false;
    if (!inTimeRange(timeRange, s.modified)) return false;
    const q = orgFilter.trim().toLowerCase();
    if (q && !(s.org_name || '').toLowerCase().includes(q)) return false;
    return true;
  });
  /** 一键恢复默认筛选：状态=全部、类型=全部、时间=全部、社团=空 */
  const resetFilters = () => { setStatusFilter('全部'); setTypeFilter('全部'); setTimeRange('all'); setOrgFilter(''); };
  const formatSize = (b: number) => b < 1024*1024 ? `${(b/1024).toFixed(1)} KB` : `${(b/(1024*1024)).toFixed(1)} MB`;
  const statusBadge = (s: string) => s === 'approved' ? <span className="badge badge-ok">已通过</span> : <span className="badge badge-error">已打回</span>;

  // ---- 查看窗口：清单视图（多类型按类型分列） ----
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

  // ---- 查看窗口：材料详情视图（view 为 "type:key"） ----
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
    <div>
      <div className="page-head">
        <h1><Icon name="folder" size={22} /> 历史审核</h1>
        <p className="page-head-sub">已通过与已打回的报销申请（只读），已通过的申请可直接下载 ZIP</p>
      </div>
      <button className="btn btn-ghost btn-sm" onClick={() => navigate('/reviewer')} style={{ marginBottom: 16 }}><Icon name="arrow-left" size={14} /> 返回</button>
      <div className="filter-bar">
        <select className="form-input filter-status" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          {['全部', '已通过', '已打回'].map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        <select className="form-input filter-type" value={typeFilter} onChange={e => setTypeFilter(e.target.value)} title="按报销类型筛选">
          <option value="全部">全部类型</option>
          {(Object.keys(TYPE_CONFIGS) as ReimbursementType[]).map(t => <option key={t} value={t}>{TYPE_CONFIGS[t].label}</option>)}
        </select>
        <select className="form-input filter-status" value={timeRange} onChange={e => setTimeRange(e.target.value)} title="按时间范围筛选">
          {TIME_RANGES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <OrgAutocomplete value={orgFilter} onChange={setOrgFilter} orgs={ORGANIZATIONS} placeholder="按社团筛选..." />
        <button className="btn btn-ghost btn-sm" onClick={resetFilters} title="一键恢复默认筛选"><Icon name="rotate-ccw" size={14} /> 恢复默认</button>
      </div>

      {loading ? <div className="loading"><span className="spinner" /> 加载中...</div>
       : filteredSubmissions.length === 0 ? <div className="empty"><div className="empty-icon"><Icon name="folder" size={20} /></div>暂无历史审核记录</div>
       : (
        <div className="submission-list">
          {filteredSubmissions.map(s => (
            <div key={s.filename}
                 className={`submission-item ${selected === s.filename ? 'is-selected' : 'accent-left'}`}
                 style={{ '--accent': typeColor(typesFrom(s)[0]) } as CSSProperties}
                 onClick={() => openView(s.filename)}>
              <div className="draft-info">
                <strong><Icon name="archive" size={16} /> {s.org_name
                  ? `${s.org_name}-${s.modified.slice(0, 10)}-报销申请`
                  : s.filename}</strong>
                <span className="draft-meta">{formatSize(s.size)} · {s.modified.slice(0,19).replace('T',' ')}{s.reviewer_email ? ` · 审核人：${s.reviewer_email}` : ''}</span>
              </div>
              <div className="submission-type-col"><TypeBadges types={typesFrom(s)} /></div>
              <div className="submission-right">
                {statusBadge(s.status)}
                {s.status === 'approved' && (
                  <a href={`/api/v1/submissions/download/${encodeURIComponent(s.filename)}`} download
                     className="btn btn-secondary btn-sm" style={{ textDecoration: 'none' }} title="下载 ZIP 归档"
                     onClick={e => e.stopPropagation()}><Icon name="download" size={14} /> 下载 ZIP</a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 查看窗口（默认 80% 视口，可全屏，只读） */}
      {selected && (
        <div className="modal-overlay" onClick={() => { if (!fullscreen) { setSelected(null); setFullscreen(false); setView('list'); setLightbox(null); } }}>
          <div className={`modal modal-review${fullscreen ? ' modal-review--full' : ''}`} onClick={e => e.stopPropagation()}>
            {/* 头部：标题 + 类型/状态 + 窗口控制 */}
            <div className="modal-head">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
                <h3 className="modal-title" style={{ fontSize: 16 }}>历史审核：{selected}</h3>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <TypeBadges types={types} />
                  {statusBadge(selectedSubmission?.status || '')}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button className="btn btn-secondary btn-sm" onClick={() => setFullscreen(f => !f)} title="全屏/退出全屏">
                  <Icon name={fullscreen ? 'minimize' : 'maximize'} size={14} /> {fullscreen ? '退出全屏' : '全屏'}
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => { setSelected(null); setFullscreen(false); setView('list'); setLightbox(null); }} title="退出"><Icon name="x" size={14} /> 退出</button>
              </div>
            </div>

            {/* 主体：审核批注 + 材料清单/详情 */}
            <div className="modal-body">
              {previewLoading ? <div className="loading"><span className="spinner" /> 加载预览...</div> : (
                <>
                  {review && review.status !== 'pending' && (
                    <div className="card" style={{ padding: 16, marginBottom: 16 }}>
                      <h4 className="section-title">
                        {review.is_admin ? <><Icon name="shield" size={16} /> 管理员批注</> : <><Icon name="search" size={16} /> 审核员批注</>}
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
    </div>
  );
}
