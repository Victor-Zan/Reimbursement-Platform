import { useState, useEffect } from 'react';

interface Props {
  onEnterVat: () => void;
  onOpenDrafts: () => void;
  onOpenHistory: () => void;
}

interface DraftSummary {
  id: string;
  activity_name: string;
  org_name: string;
  current_step: number;
  updated_at: string;
}

interface SubmissionFile {
  filename: string;
  size: number;
  modified: string;
}

export default function HomePage({ onEnterVat, onOpenDrafts, onOpenHistory }: Props) {
  const [draftCount, setDraftCount] = useState(0);
  const [showDrafts, setShowDrafts] = useState(false);
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [submissions, setSubmissions] = useState<SubmissionFile[]>([]);
  const [loading, setLoading] = useState(false);

  // 加载草稿数量
  const loadDraftCount = async () => {
    try {
      const r = await fetch('/api/v1/drafts');
      const j = await r.json();
      if (j.success) setDraftCount(j.drafts.length);
    } catch {}
  };

  useEffect(() => { loadDraftCount(); }, []);

  // 加载草稿列表
  const handleOpenDrafts = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/v1/drafts');
      const j = await r.json();
      if (j.success) setDrafts(j.drafts);
    } catch {}
    setLoading(false);
    setShowDrafts(true);
  };

  // 加载历史提交
  const handleOpenHistory = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/v1/submissions');
      const j = await r.json();
      if (j.success) setSubmissions(j.submissions);
    } catch {}
    setLoading(false);
    setShowHistory(true);
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatTime = (iso: string) => {
    if (!iso) return '';
    return iso.replace('T', ' ').slice(0, 19);
  };

  return (
    <div className="home-page">
      {/* 标题 */}
      <div className="home-header">
        <h1>报销自动化平台</h1>
        <p>香港中文大学（深圳）学生活动经费报销</p>
      </div>

      {/* 主体：左大右三小 */}
      <div className="home-grid">
        {/* 左侧大卡片 — 增值税报销 */}
        <div className="home-card home-card-large" onClick={onEnterVat}>
          <div className="home-card-icon">📄</div>
          <div className="home-card-content">
            <h2>增值税报销</h2>
            <p>学生活动经费在线报销</p>
            <span className="home-card-badge">已开放</span>
          </div>
        </div>

        {/* 右侧三小卡片 */}
        <div className="home-card-stack">
          <div className="home-card home-card-small" onClick={() => alert('功能开发中，敬请期待')}>
            <span className="home-card-icon">📎</span>
            <span className="home-card-label">其他类报销</span>
          </div>

          <div className="home-card home-card-small" onClick={handleOpenDrafts}>
            <span className="home-card-icon">📝</span>
            <span className="home-card-label">我的草稿</span>
            {draftCount > 0 && <span className="home-card-count">{draftCount} 条</span>}
          </div>

          <div className="home-card home-card-small" onClick={handleOpenHistory}>
            <span className="home-card-icon">📂</span>
            <span className="home-card-label">查看历史提交</span>
          </div>
        </div>
      </div>

      {/* 草稿弹窗 */}
      {showDrafts && (
        <div className="modal-overlay" onClick={() => setShowDrafts(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>📝 我的草稿</h2>
            {loading ? (
              <p style={{ textAlign: 'center', padding: 24, color: 'var(--gray-500)' }}>
                <span className="spinner" /> 加载中...
              </p>
            ) : drafts.length === 0 ? (
              <p style={{ textAlign: 'center', padding: 24, color: 'var(--gray-500)' }}>
                暂无草稿
              </p>
            ) : (
              <div className="draft-list">
                {drafts.map(d => (
                  <div
                    key={d.id}
                    className="draft-item"
                  >
                    <div
                      className="draft-info"
                      style={{ flex: 1, cursor: 'pointer' }}
                      onClick={() => {
                        setShowDrafts(false);
                        fetch(`/api/v1/drafts/${d.id}`)
                          .then(r => r.json())
                          .then(j => {
                            if (j.success) {
                              window.dispatchEvent(new CustomEvent('restore-draft', {
                                detail: j.draft,
                              }));
                            }
                          });
                      }}
                    >
                      <strong>{d.activity_name || '未命名活动'}</strong>
                      <span className="draft-meta">
                        {d.org_name} · 步骤 {d.current_step}/3 · {formatTime(d.updated_at)}
                      </span>
                    </div>
                    <button
                      className="draft-delete"
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (!window.confirm('确定删除该草稿？')) return;
                        await fetch(`/api/v1/drafts/${d.id}`, { method: 'DELETE' });
                        setDrafts(prev => prev.filter(x => x.id !== d.id));
                        loadDraftCount();
                      }}
                      title="删除草稿"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button
              className="btn btn-secondary"
              onClick={() => setShowDrafts(false)}
              style={{ marginTop: 16, width: '100%' }}
            >
              关闭
            </button>
          </div>
        </div>
      )}

      {/* 历史提交弹窗 */}
      {showHistory && (
        <div className="modal-overlay" onClick={() => setShowHistory(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>📂 查看历史提交</h2>
            {loading ? (
              <p style={{ textAlign: 'center', padding: 24, color: 'var(--gray-500)' }}>
                <span className="spinner" /> 加载中...
              </p>
            ) : submissions.length === 0 ? (
              <p style={{ textAlign: 'center', padding: 24, color: 'var(--gray-500)' }}>
                暂无提交记录
              </p>
            ) : (
              <div className="submission-list">
                {submissions.map((s, i) => (
                  <div key={i} className="submission-item">
                    <div className="draft-info">
                      <strong>📦 {s.filename}</strong>
                      <span className="draft-meta">
                        {formatSize(s.size)} · {formatTime(s.modified)}
                      </span>
                    </div>
                    <a
                      href={`/api/v1/submissions/download/${encodeURIComponent(s.filename)}`}
                      download
                      className="btn btn-secondary"
                      style={{ padding: '6px 14px', fontSize: 13 }}
                    >
                      📥 下载
                    </a>
                  </div>
                ))}
              </div>
            )}
            <button
              className="btn btn-secondary"
              onClick={() => setShowHistory(false)}
              style={{ marginTop: 16, width: '100%' }}
            >
              关闭
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
