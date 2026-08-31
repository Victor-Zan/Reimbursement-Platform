import { useCallback, useEffect, useState, type ReactNode } from 'react';
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
  const [imgFailed, setImgFailed] = useState(false);
  const page = book.pages[pageIndex];
  const isFirst = pageIndex === 0;
  const isLast = pageIndex === book.pages.length - 1;
  const from = (location.state as { from?: string } | null)?.from;

  // 翻页时重置图片错误态（否则切到有图的页仍显示占位）
  useEffect(() => { setImgFailed(false); }, [pageIndex]);

  // 返回：① 有 from → 回到打开前页面；② 刷新后 from 丢失但标签页历史还在 → back；
  // ③ 新标签直接输 URL（无历史，location.key === 'default'）→ 落角色首页
  const goBack = useCallback(() => {
    if (from && from !== location.pathname) navigate(from);
    else if (location.key !== 'default') navigate(-1);
    else navigate('/' + role);
  }, [from, location.key, location.pathname, role, navigate]);

  // Esc → 返回（与旧弹窗体验一致）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') goBack(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goBack]);

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
        {page.image && !imgFailed ? (
          <figure className="guide-img-card">
            <img className="guide-img" src={page.image}
                 alt={page.imageCaption ?? page.title}
                 onError={() => setImgFailed(true)} />
            {page.imageCaption && <figcaption className="guide-img-caption">{page.imageCaption}</figcaption>}
          </figure>
        ) : page.image ? (
          <div className="guide-img-placeholder">
            <Icon name="image" size={28} />
            <span>截图待补充：{page.image}</span>
            {page.imageCaption && <span className="guide-img-caption">{page.imageCaption}</span>}
          </div>
        ) : null}

        {page.blocks.map((b, i) => <GuideBlockView key={i} block={b} />)}
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
