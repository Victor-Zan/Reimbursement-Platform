import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Icon from '../components/Icon';
import { GUIDE_BOOKS, guideRoleFromPath, type GuideBlock } from '../config/guides';

/**
 * 操作指南页面：分页式新手导航（独立路由 /{role}/guide）。
 * 右上角 X 返回打开前的页面；Esc 同样可返回；翻页支持左右箭头与顶部进度点。
 */

/** 解析 **紫色强调** 标记：split('**') 奇偶交替，奇数段渲染为紫色 <strong> */
function renderGuideText(text: string, keyPrefix: string): ReactNode {
  return text.split('**').map((seg, i) =>
    seg
      ? i % 2 === 1
        ? <strong key={`${keyPrefix}-${i}`} className="guide-em">{seg}</strong>
        : <span key={`${keyPrefix}-${i}`}>{seg}</span>
      : null,
  );
}

/**
 * 全屏图片预览（复用全局 .lightbox 结构）：滚轮以鼠标为锚点缩放（1–6 倍）、
 * 缩放后可拖拽平移、双击在「适配屏幕 / 3 倍」间切换；Esc、点击遮罩或 X 关闭。
 */
function ImagePreview({ images, index, alt, onIndex, onClose }: {
  images: string[]; index: number; alt: string; onIndex: (i: number) => void; onClose: () => void;
}) {
  const src = images[index];
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const drag = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  // 切换图片时重置缩放与位移
  useEffect(() => { setZoom(1); zoomRef.current = 1; setPos({ x: 0, y: 0 }); }, [src]);

  // Esc 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // 滚轮缩放（原生监听以阻止页面滚动），以鼠标位置为锚点：newPos = anchor - (anchor - oldPos) * k
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const anchor = { x: e.clientX - rect.left - rect.width / 2, y: e.clientY - rect.top - rect.height / 2 };
      const nz = Math.min(6, Math.max(1, zoomRef.current * Math.pow(1.15, -e.deltaY / 100)));
      if (nz === zoomRef.current) return;
      const k = nz / zoomRef.current;
      setPos(p => ({ x: anchor.x - (anchor.x - p.x) * k, y: anchor.y - (anchor.y - p.y) * k }));
      zoomRef.current = nz;
      setZoom(nz);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const onMouseDown = (e: React.MouseEvent) => {
    if (zoomRef.current <= 1) return;
    drag.current = { sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y };
    e.preventDefault();
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!drag.current) return;
    setPos({ x: drag.current.ox + e.clientX - drag.current.sx, y: drag.current.oy + e.clientY - drag.current.sy });
  };
  const endDrag = () => { drag.current = null; };
  const onDblClick = () => {
    const nz = zoomRef.current <= 1.05 ? 3 : 1;
    const k = nz / zoomRef.current;
    setPos(p => ({ x: p.x * k, y: p.y * k }));
    zoomRef.current = nz;
    setZoom(nz);
  };

  return (
    <div className="lightbox" onClick={onClose}>
      <div className="lightbox-bar" onClick={e => e.stopPropagation()}>
        <span>截图预览 {index + 1} / {images.length} · 滚轮缩放，拖拽平移，双击复位</span>
        <div style={{ display: 'flex', gap: 8 }}>
          {images.length > 1 && (
            <>
              <button type="button" className="btn btn-secondary btn-sm" disabled={index === 0} onClick={() => onIndex(index - 1)}><Icon name="arrow-left" size={14} /> 上一张</button>
              <button type="button" className="btn btn-secondary btn-sm" disabled={index === images.length - 1} onClick={() => onIndex(index + 1)}>下一张 <Icon name="arrow-right" size={14} /></button>
            </>
          )}
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}><Icon name="x" size={14} /> 关闭</button>
        </div>
      </div>
      <div ref={bodyRef} className="lightbox-body lightbox--zoom"
           onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={endDrag} onMouseLeave={endDrag}
           onClick={e => e.stopPropagation()}>
        <img src={src} alt={alt} draggable={false}
             style={zoom > 1
               ? { transform: `translate(${pos.x}px, ${pos.y}px) scale(${zoom})`, cursor: drag.current ? 'grabbing' : 'grab' }
               : { cursor: 'zoom-in' }}
             onDoubleClick={onDblClick} />
      </div>
    </div>
  );
}

function GuideBlockView({ block }: { block: GuideBlock }) {
  switch (block.type) {
    case 'p':
      return <p className="guide-p">{renderGuideText(block.text, 'p')}</p>;
    case 'list':
      return (
        <ul className="guide-list">
          {block.items.map((it, j) => (
            <li key={j}>{renderGuideText(it, `li-${j}`)}</li>
          ))}
        </ul>
      );
    case 'tip':
      return (
        <div className="guide-tip">
          <Icon name="alert-triangle" size={16} />
          <span>{renderGuideText(block.text, 'tip')}</span>
        </div>
      );
  }
}

export default function GuidePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const role = guideRoleFromPath(location.pathname);   // /member/guide → member
  const book = GUIDE_BOOKS[role];
  const [pageIndex, setPageIndex] = useState(0);
  const [imgFailed, setImgFailed] = useState<boolean[]>([]);
  const [previewIdx, setPreviewIdx] = useState(-1);  // 全屏预览当前图下标，-1 = 未打开
  const [imgIdx, setImgIdx] = useState(0);           // 多图卡片当前可见图下标（正文随图切换）
  const page = book.pages[pageIndex];
  const images = Array.isArray(page.image) ? page.image : page.image ? [page.image] : [];
  const trackRef = useRef<HTMLDivElement>(null);
  // 多图卡片：左右箭头按一屏宽度平滑滚动
  const scrollTrack = (dir: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth, behavior: 'smooth' });
  };
  // 滑动/箭头滚动时跟踪当前可见图：scroll-snap 下 scrollLeft 稳定停在子元素步长整数倍
  const onTrackScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.children.length < 2) return;
    const step = (el.children[1] as HTMLElement).offsetLeft - (el.children[0] as HTMLElement).offsetLeft;
    const idx = Math.max(0, Math.min(el.children.length - 1, Math.round(el.scrollLeft / step)));
    if (idx !== imgIdx) setImgIdx(idx);
  };
  // 有随图正文时显示当前图对应的一组，缺省回退页级 blocks
  const displayBlocks = page.blocksByImage ? (page.blocksByImage[imgIdx] ?? page.blocks) : page.blocks;
  // 每图说明：滑动到第 i 张时显示 imageCaptions[i]，缺省回退页级 imageCaption
  const imageCaption = page.imageCaptions ? (page.imageCaptions[imgIdx] ?? page.imageCaption) : page.imageCaption;
  const isFirst = pageIndex === 0;
  const isLast = pageIndex === book.pages.length - 1;
  const from = (location.state as { from?: string } | null)?.from;

  // 翻页时重置图片错误态与随图正文下标（页卡 key={pageIndex} 重挂载已重置滚动位置）
  useEffect(() => { setImgFailed([]); setImgIdx(0); }, [pageIndex]);

  // 返回：① 有 from → 回到打开前页面；② 刷新后 from 丢失但标签页历史还在 → back；
  // ③ 新标签直接输 URL（无历史，location.key === 'default'）→ 落角色首页
  const goBack = useCallback(() => {
    if (from && from !== location.pathname) navigate(from);
    else if (location.key !== 'default') navigate(-1);
    else navigate('/' + role);
  }, [from, location.key, location.pathname, role, navigate]);

  // Esc → 返回（与旧弹窗体验一致）；全屏预览打开时 Esc 由预览层处理，不触发返回
  useEffect(() => {
    if (previewIdx >= 0) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') goBack(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goBack, previewIdx]);

  return (
    <>
      {/* Hero 区：紫渐变横幅 + 书名 + X 关闭 + 页标题 + 可点击进度点 */}
      <div className="guide-hero">
        <div className="guide-hero-top">
          <span className="guide-hero-book"><Icon name="info" size={14} /> {book.title}</span>
          <button type="button" className="guide-x" aria-label="关闭指南" onClick={goBack} autoFocus>
            <Icon name="x" size={16} />
          </button>
        </div>
        <h1 className="guide-hero-title">
          <span className="guide-hero-icon"><Icon name={page.icon ?? 'info'} size={20} /></span>
          {page.title}
        </h1>
        <div className="guide-progress" aria-label="页面进度">
          {book.pages.map((_, i) => (
            <button key={i} type="button"
                    className={`guide-dot${i === pageIndex ? ' guide-dot--active' : ''}`}
                    aria-label={`第 ${i + 1} 页：${book.pages[i].title}`}
                    onClick={() => setPageIndex(i)} />
          ))}
        </div>
      </div>

      {/* 内容区：复用全局 .card；key={pageIndex} 重挂载以重播翻页动画 */}
      <div className="card guide-stage" key={pageIndex}>
        {images.length > 0 && (
          <figure className="guide-img-card">
            {images.length > 1 ? (
              <>
                <button type="button" className="guide-img-arrow guide-img-arrow--left" aria-label="上一张截图" onClick={() => scrollTrack(-1)}>
                  <Icon name="arrow-left" size={16} />
                </button>
                <button type="button" className="guide-img-arrow guide-img-arrow--right" aria-label="下一张截图" onClick={() => scrollTrack(1)}>
                  <Icon name="arrow-right" size={16} />
                </button>
                <div className="guide-img-track" ref={trackRef} onScroll={onTrackScroll}>
                  {images.map((src, i) => imgFailed[i] ? (
                    <div className="guide-img-placeholder" key={src}>
                      <Icon name="image" size={28} />
                      <span>截图待补充：{src}</span>
                    </div>
                  ) : (
                    <img className="guide-img" key={src} src={src}
                         alt={page.imageCaptions?.[i] ?? page.imageCaption ?? page.title}
                         onClick={() => setPreviewIdx(i)}
                         onError={() => setImgFailed(prev => { const next = [...prev]; next[i] = true; return next; })} />
                  ))}
                </div>
              </>
            ) : imgFailed[0] ? (
              <div className="guide-img-placeholder">
                <Icon name="image" size={28} />
                <span>截图待补充：{images[0]}</span>
              </div>
            ) : (
              <img className="guide-img" src={images[0]}
                   alt={page.imageCaption ?? page.title}
                   onClick={() => setPreviewIdx(0)}
                   onError={() => setImgFailed([true])} />
            )}
            {imageCaption && <figcaption className="guide-img-caption">{imageCaption}</figcaption>}
          </figure>
        )}

        {previewIdx >= 0 && images[previewIdx] && (
          <ImagePreview images={images} index={previewIdx} alt={imageCaption ?? page.title}
                        onIndex={setPreviewIdx} onClose={() => setPreviewIdx(-1)} />
        )}

        {displayBlocks.map((b, i) => <GuideBlockView key={i} block={b} />)}
      </div>

      {/* 底部导航：Grid 三列保证页码恒居中 */}
      <div className="guide-foot">
        <div className="guide-nav-left">
          {!isFirst && (
            <button type="button" className="guide-nav-btn" aria-label="上一页"
                    onClick={() => setPageIndex(i => i - 1)}>
              <Icon name="arrow-left" size={16} />
            </button>
          )}
        </div>
        <span className="guide-page-num">第 {pageIndex + 1} / {book.pages.length} 页</span>
        <div className="guide-nav-right">
          {!isLast && (
            <button type="button" className="guide-nav-btn" aria-label="下一页"
                    onClick={() => setPageIndex(i => i + 1)}>
              <Icon name="arrow-right" size={16} />
            </button>
          )}
        </div>
      </div>
    </>
  );
}
