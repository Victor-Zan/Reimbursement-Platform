import { useState, useEffect } from 'react';
import { MATERIALS, typeLabel, typeColor } from '../config/materials';
import type { MaterialKey } from '../types';

interface Props {
  onEnterVat: () => void;
  onEnterOther: () => void;
  onOpenDrafts: () => void;
  onOpenHistory: () => void;
  user?: any;
  onApplyReviewer?: () => void;
  onReEdit?: (data: any) => void;
}

interface DraftSummary { id: string; activity_name: string; org_name: string; current_step: number; updated_at: string; }
interface SubmissionFile { filename: string; size: number; modified: string; reimb_type?: string; }

export default function HomePage({ onEnterVat, onEnterOther, onOpenDrafts, onOpenHistory, user, onApplyReviewer, onReEdit }: Props) {
  const [draftCount, setDraftCount] = useState(0);
  const [showDrafts, setShowDrafts] = useState(false);
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [submissions, setSubmissions] = useState<SubmissionFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [historyDateFrom, setHistoryDateFrom] = useState('');
  const [historyDateTo, setHistoryDateTo] = useState('');
  const [feedbackBadge, setFeedbackBadge] = useState(0);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbacks, setFeedbacks] = useState<any[]>([]);
  const [showApply, setShowApply] = useState(false);
  const [applyEmail, setApplyEmail] = useState(user?.email || '');
  const [applyReason, setApplyReason] = useState('');
  const [memberStats, setMemberStats] = useState({ monthly: 0, pending: 0, approved: 0 });

  const loadMemberStats = async () => {
    try { const r = await fetch(`/api/v1/member/stats?user_email=${encodeURIComponent(user?.email || '')}`); const j = await r.json(); if (j.success) setMemberStats(j.stats); } catch {}
  };
  useEffect(() => { if (user?.email) loadMemberStats(); }, [user?.email]);

  const loadDraftCount = async () => {
    try { const r = await fetch(`/api/v1/drafts?user_email=${encodeURIComponent(user?.email || '')}`); const j = await r.json(); if (j.success) setDraftCount(j.drafts.length); } catch {}
  };
  useEffect(() => { loadDraftCount(); }, []);

  const handleOpenDrafts = async () => {
    setLoading(true);
    try { const r = await fetch(`/api/v1/drafts?user_email=${encodeURIComponent(user?.email || '')}`); const j = await r.json(); if (j.success) setDrafts(j.drafts); } catch {}
    setLoading(false); setShowDrafts(true);
  };

  const handleOpenHistory = async () => {
    setLoading(true);
    try { const r = await fetch(`/api/v1/submissions?user_email=${encodeURIComponent(user?.email || '')}`); const j = await r.json(); if (j.success) setSubmissions(j.submissions); } catch {}
    setLoading(false); setShowHistory(true);
  };

  const handleOpenFeedback = async () => {
    setLoading(true);
    try {
      const lastRead = localStorage.getItem('feedback_last_read') || '';
      const r = await fetch(`/api/v1/submissions?user_email=${encodeURIComponent(user?.email || '')}`);
      const j = await r.json();
      const items: any[] = []; let unread = 0;
      if (j.success) for (const s of j.submissions) {
        try {
          const rr = await fetch(`/api/v1/review/annotations/${encodeURIComponent(s.filename)}`);
          const rj = await rr.json();
          if (rj.success && rj.review.status !== 'pending') {
            items.push({ ...s, ...rj.review });
            if (rj.review.created_at && rj.review.created_at > lastRead) unread++;
          }
        } catch {}
      }
      setFeedbacks(items); setFeedbackBadge(unread);
    } catch {}
    setLoading(false); setShowFeedback(true);
    localStorage.setItem('feedback_last_read', new Date().toISOString());
  };

  useEffect(() => {
    if (!user?.email) return;
    (async () => {
      try {
        const lastRead = localStorage.getItem('feedback_last_read') || '';
        const r = await fetch(`/api/v1/submissions?user_email=${encodeURIComponent(user.email)}`);
        const j = await r.json(); let unread = 0;
        if (j.success) for (const s of j.submissions) {
          try {
            const rr = await fetch(`/api/v1/review/annotations/${encodeURIComponent(s.filename)}`);
            const rj = await rr.json();
            if (rj.success && rj.review.status !== 'pending' && rj.review.created_at && rj.review.created_at > lastRead) unread++;
          } catch {}
        }
        setFeedbackBadge(unread);
      } catch {}
    })();
  }, [user?.email]);

  const handleApply = async () => {
    if (!applyEmail || !applyReason) { alert('请填写邮箱和申请原因'); return; }
    await fetch('/api/v1/reviewer/apply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: applyEmail, reason: applyReason }) });
    alert('申请已提交'); setShowApply(false);
  };

  const formatSize = (b: number) => b < 1024*1024 ? `${(b/1024).toFixed(1)} KB` : `${(b/(1024*1024)).toFixed(1)} MB`;
  const formatTime = (iso: string) => iso ? iso.replace('T', ' ').slice(0, 19) : '';

  const filteredSubmissions = submissions.filter(s => {
    if (historySearch && !s.filename.includes(historySearch)) return false;
    if (historyDateFrom && s.modified < historyDateFrom) return false;
    if (historyDateTo && s.modified > historyDateTo + 'T23:59:59') return false;
    return true;
  });

  return (
    <div className="home-page">
      <div className="home-header">
        <h1>社团成员工作台</h1>
        <div className="home-status-row">
          <div className="home-status-item"><span className="home-status-num">{memberStats.monthly}</span><span>本月提交</span></div>
          <div className="home-status-item"><span className="home-status-num" style={{ color: 'var(--warning)' }}>{memberStats.pending}</span><span>待审核</span></div>
          <div className="home-status-item"><span className="home-status-num" style={{ color: 'var(--success)' }}>{memberStats.approved}</span><span>已通过</span></div>
        </div>
      </div>
      <div className="home-grid">
        <div className="home-card home-card-large" onClick={onEnterVat}>
          <div className="home-card-icon">📄</div>
          <div className="home-card-content"><h2>增值税报销</h2><p>适用于增值税普通发票的学生活动经费报销，支持多发票上传、OCR自动识别、一键生成报销表</p><span className="home-card-badge">已开放</span></div>
        </div>
        <div className="home-card-stack">
          <div className="home-card home-card-small" onClick={onEnterOther}><span className="home-card-icon">📎</span><span className="home-card-label">其他类报销</span><span className="home-card-badge">保险 · 路费 · 大量发票</span></div>
          <div className="home-card home-card-small" onClick={handleOpenDrafts}><span className="home-card-icon">📝</span><span className="home-card-label">我的草稿</span>{draftCount > 0 && <span className="home-card-count">{draftCount} 条</span>}</div>
          <div className="home-card home-card-small" onClick={handleOpenHistory}><span className="home-card-icon">📂</span><span className="home-card-label">查看历史提交</span></div>
          <div className="home-card home-card-small" onClick={handleOpenFeedback}><span className="home-card-icon">📬</span><span className="home-card-label">审核反馈</span>{feedbackBadge > 0 && <span className="home-card-count" style={{ background: 'var(--danger)', color: 'white' }}>{feedbackBadge}</span>}</div>
          {onApplyReviewer && (<div className="home-card home-card-small" onClick={() => setShowApply(true)}><span className="home-card-icon">🔑</span><span className="home-card-label">申请成为审核员</span></div>)}
        </div>
      </div>

      {/* 草稿弹窗 */}
      {showDrafts && (
        <div className="modal-overlay" onClick={() => setShowDrafts(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}><h2>📝 我的草稿</h2>
            {loading ? <p style={{ textAlign: 'center', padding: 24, color: 'var(--gray-500)' }}><span className="spinner" /> 加载中...</p>
             : drafts.length === 0 ? <p style={{ textAlign: 'center', padding: 24, color: 'var(--gray-500)' }}>暂无草稿</p>
             : <div className="draft-list">{drafts.map(d => (
              <div key={d.id} className="draft-item">
                <div className="draft-info" style={{ flex: 1, cursor: 'pointer' }} onClick={() => { setShowDrafts(false); fetch(`/api/v1/drafts/${d.id}`).then(r => r.json()).then(j => { if (j.success) window.dispatchEvent(new CustomEvent('restore-draft', { detail: j.draft })); }); }}>
                  <strong>{d.activity_name || '未命名活动'}</strong><span className="draft-meta">{d.org_name} · 步骤 {d.current_step}/3 · {formatTime(d.updated_at)}</span>
                </div>
                <button className="draft-delete" onClick={async (e) => { e.stopPropagation(); if (!window.confirm('确定删除？')) return; await fetch(`/api/v1/drafts/${d.id}`, { method: 'DELETE' }); setDrafts(p => p.filter(x => x.id !== d.id)); loadDraftCount(); }}>×</button>
              </div>
            ))}</div>}
            <button className="btn btn-secondary" onClick={() => setShowDrafts(false)} style={{ marginTop: 16, width: '100%' }}>关闭</button>
          </div>
        </div>
      )}

      {/* 历史提交弹窗 */}
      {showHistory && (
        <div className="modal-overlay" onClick={() => setShowHistory(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}><h2>📂 查看历史提交</h2>
            <input className="form-input" placeholder="🔍 搜索文件名..." value={historySearch} onChange={e => setHistorySearch(e.target.value)} style={{ marginBottom: 8 }} />
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input type="date" className="form-input" value={historyDateFrom} onChange={e => setHistoryDateFrom(e.target.value)} style={{ fontSize: 12 }} title="起始日期" />
              <span style={{ alignSelf: 'center', color: 'var(--gray-400)', fontSize: 12 }}>至</span>
              <input type="date" className="form-input" value={historyDateTo} onChange={e => setHistoryDateTo(e.target.value)} style={{ fontSize: 12 }} title="截止日期" />
            </div>
            {loading ? <p style={{ textAlign: 'center', padding: 24, color: 'var(--gray-500)' }}><span className="spinner" /> 加载中...</p>
             : filteredSubmissions.length === 0 ? <p style={{ textAlign: 'center', padding: 24, color: 'var(--gray-500)' }}>暂无提交记录</p>
             : <div className="submission-list">{filteredSubmissions.map((s, i) => (
              <div key={i} className="submission-item">
                <div className="draft-info"><strong>📦 {s.filename}</strong><span className="draft-meta">{formatSize(s.size)} · {formatTime(s.modified)}</span></div>
                <span className="badge" style={{ background: typeColor(s.reimb_type), color: '#fff' }}>{typeLabel(s.reimb_type)}</span>
                <a href={`/api/v1/submissions/download/${encodeURIComponent(s.filename)}`} download className="btn btn-secondary" style={{ padding: '6px 14px', fontSize: 13 }}>📥 下载</a>
              </div>
            ))}</div>}
            <button className="btn btn-secondary" onClick={() => setShowHistory(false)} style={{ marginTop: 16, width: '100%' }}>关闭</button>
          </div>
        </div>
      )}

      {/* 审核反馈弹窗 */}
      {showFeedback && (
        <div className="modal-overlay" onClick={() => setShowFeedback(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}><h2>📬 审核反馈</h2>
            {loading ? <p style={{ textAlign: 'center', padding: 24 }}><span className="spinner" /> 加载中...</p>
             : feedbacks.length === 0 ? <p style={{ textAlign: 'center', padding: 24, color: 'var(--gray-500)' }}>暂无审核反馈</p>
             : feedbacks.map((f, i) => (
              <div key={i} className="submission-item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><strong>📦 {f.filename}</strong><span className={`badge ${f.status === 'approved' ? 'badge-ok' : 'badge-error'}`}>{f.status === 'approved' ? '已通过' : '已打回'}</span></div>
                {f.status === 'rejected' && (<>
                  <div style={{ fontSize: 13, color: 'var(--gray-600)' }}>{f.invoice_comment && <p>📎 发票：{f.invoice_comment}</p>}{f.evidence_comment && <p>📷 凭证：{f.evidence_comment}</p>}{Object.entries((f.material_comments || {}) as Record<string, string>).filter(([, c]) => c).map(([k, c]) => {
                    const cfg = MATERIALS[k as MaterialKey];
                    return <p key={k}>{cfg ? `${cfg.icon} ${cfg.label}` : k}：{c}</p>;
                  })}{f.form_comment && <p>📋 报销表：{f.form_comment}</p>}</div>
                  {onReEdit && (<button className="btn btn-primary" style={{ padding: '4px 14px', fontSize: 13, marginTop: 8 }} onClick={async (e) => { e.stopPropagation(); try { const r = await fetch(`/api/v1/submission-data/${encodeURIComponent(f.filename)}`); const j = await r.json(); if (j.success && j.form_data) { setShowFeedback(false); const hasMaterial = !!(f.invoice_comment || f.evidence_comment || Object.values(f.material_comments || {}).some(c => c)); const _materials: any = {}; for (const k of Object.keys(j.material_urls || {})) { _materials[k] = { urls: j.material_urls[k], paths: (j.material_paths || {})[k] || [] }; } onReEdit({ ...j.form_data, _reEditStep: hasMaterial ? 1 : 2, _previousZip: f.filename, _materials }); } else alert('未找到原始数据'); } catch { alert('加载失败'); } }}>✏️ 重新编辑</button>)}
                </>)}
              </div>
            ))}
            <button className="btn btn-secondary" onClick={() => setShowFeedback(false)} style={{ marginTop: 16, width: '100%' }}>关闭</button>
          </div>
        </div>
      )}

      {/* 申请审核员弹窗 */}
      {showApply && (
        <div className="modal-overlay" onClick={() => setShowApply(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}><h2>🔑 申请成为审核员</h2>
            <div className="form-group"><label className="form-label">邮箱</label><input className="form-input" value={applyEmail} onChange={e => setApplyEmail(e.target.value)} /></div>
            <div className="form-group"><label className="form-label">申请原因</label><textarea className="form-input" rows={3} value={applyReason} onChange={e => setApplyReason(e.target.value)} placeholder="请简述申请原因..." /></div>
            <div style={{ display: 'flex', gap: 12, marginTop: 16 }}><button className="btn btn-primary" onClick={handleApply}>提交申请</button><button className="btn btn-secondary" onClick={() => setShowApply(false)}>取消</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
