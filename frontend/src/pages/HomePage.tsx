import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { MATERIALS, typeLabel, typeColor } from '../config/materials';
import type { MaterialKey } from '../types';
import { TIME_RANGES, inTimeRange } from '../utils/timeRange';
import Icon from '../components/Icon';
import { useFeedback } from '../components/Feedback';

interface Props {
  onEnterVat: () => void;
  onEnterOther: () => void;
  onOpenDrafts: () => void;
  onOpenHistory: () => void;
  user?: any;
  onReEdit?: (data: any) => void;
}

interface DraftSummary { id: string; activity_name: string; org_name: string; current_step: number; updated_at: string; }
interface SubmissionFile { filename: string; size: number; modified: string; reimb_type?: string; status?: string; }

export default function HomePage({ onEnterVat, onEnterOther, onOpenDrafts, onOpenHistory, user, onReEdit }: Props) {
  const navigate = useNavigate();
  const { toast, confirm } = useFeedback();
  const [draftCount, setDraftCount] = useState(0);
  const [showDrafts, setShowDrafts] = useState(false);
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [submissions, setSubmissions] = useState<SubmissionFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [historyTimeRange, setHistoryTimeRange] = useState('all');
  const [feedbackBadge, setFeedbackBadge] = useState(0);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbacks, setFeedbacks] = useState<any[]>([]);
  const [showApply, setShowApply] = useState(false);
  const [applyEmail, setApplyEmail] = useState(user?.email || '');
  const [applyReason, setApplyReason] = useState('');
  const [applyRole, setApplyRole] = useState('reviewer');
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

  const closeFeedback = () => { setShowFeedback(false); setFeedbackBadge(0); };

  // 未读红点计算：任何状态改变（通过/打回）都会产生新批注，计入未读
  const refreshUnread = useCallback(async () => {
    if (!user?.email) return;
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
  }, [user?.email]);

  useEffect(() => { refreshUnread(); }, [refreshUnread]);

  // 轮询：审核员操作后 30 秒内红点自动出现，无需刷新页面
  useEffect(() => {
    const timer = setInterval(refreshUnread, 30000);
    return () => clearInterval(timer);
  }, [refreshUnread]);

  const handleApply = async () => {
    if (!applyEmail || !applyReason) { toast('请填写邮箱和申请原因', 'warn'); return; }
    await fetch('/api/v1/reviewer/apply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: applyEmail, reason: applyReason, role: applyRole }) });
    toast('申请已提交', 'success'); setShowApply(false); setApplyReason(''); setApplyRole('reviewer');
  };

  const formatSize = (b: number) => b < 1024*1024 ? `${(b/1024).toFixed(1)} KB` : `${(b/(1024*1024)).toFixed(1)} MB`;
  const formatTime = (iso: string) => iso ? iso.replace('T', ' ').slice(0, 19) : '';

  const filteredSubmissions = submissions.filter(s => {
    if (historySearch && !s.filename.includes(historySearch)) return false;
    if (!inTimeRange(historyTimeRange, s.modified)) return false;
    return true;
  });

  const typeBadge = (t?: string) => (
    <span className="badge badge-neutral">
      <span className="dot" style={{ background: typeColor(t) }} />
      {typeLabel(t)}
    </span>
  );

  return (
    <div className="home-page">
      <div className="home-header">
        <h1>社团成员工作台</h1>
        <div className="home-status-row">
          <div className="home-status-item"><span className="home-status-num stat-num--gold">{memberStats.monthly}</span><span>本月提交</span></div>
          <div className="home-status-item"><span className="home-status-num stat-num--warn">{memberStats.pending}</span><span>待审核</span></div>
          <div className="home-status-item"><span className="home-status-num stat-num--success">{memberStats.approved}</span><span>已通过</span></div>
        </div>
      </div>
      <div className="home-grid">
        <div className="home-card home-card-large" onClick={onEnterVat}>
          <div className="home-card-icon"><Icon name="file-text" size={28} /></div>
          <div className="home-card-content"><h2>增值税报销</h2><p>适用于增值税普通发票的学生活动经费报销，支持多发票上传、OCR自动识别、一键生成报销表</p><span className="home-card-badge">已开放</span></div>
        </div>
        <div className="home-card-stack">
          <div className="home-card home-card-small" onClick={onEnterOther}><span className="home-card-icon"><Icon name="paperclip" size={20} /></span><span className="home-card-label">其他类报销</span><span className="home-card-badge">保险 · 路费 · 大量发票</span></div>
          <div className="home-card home-card-small" onClick={handleOpenDrafts}><span className="home-card-icon"><Icon name="edit" size={20} /></span><span className="home-card-label">我的草稿</span>{draftCount > 0 && <span className="home-card-count">{draftCount} 条</span>}</div>
          <div className="home-card home-card-small" onClick={handleOpenHistory}><span className="home-card-icon"><Icon name="folder" size={20} /></span><span className="home-card-label">查看历史提交</span></div>
          <div className="home-card home-card-small" onClick={handleOpenFeedback}><span className="home-card-icon"><Icon name="mail" size={20} /></span><span className="home-card-label">审核反馈</span>{feedbackBadge > 0 && <span className="home-card-count home-card-count--danger">{feedbackBadge}</span>}</div>
          <div className="home-card home-card-small" onClick={() => setShowApply(true)}><span className="home-card-icon"><Icon name="key" size={20} /></span><span className="home-card-label">申请权限</span></div>
        </div>
      </div>

      {/* 草稿弹窗 */}
      {showDrafts && (
        <div className="modal-overlay" onClick={() => setShowDrafts(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head"><h2 className="modal-title"><Icon name="edit" size={18} /> 我的草稿</h2></div>
            {loading ? <div className="loading"><span className="spinner" /> 加载中...</div>
             : drafts.length === 0 ? <div className="empty"><div className="empty-icon"><Icon name="edit" size={20} /></div>暂无草稿</div>
             : <div className="draft-list">{drafts.map(d => (
              <div key={d.id} className="draft-item">
                <div className="draft-info" style={{ flex: 1, cursor: 'pointer' }} onClick={() => { setShowDrafts(false); fetch(`/api/v1/drafts/${d.id}`).then(r => r.json()).then(j => { if (j.success) window.dispatchEvent(new CustomEvent('restore-draft', { detail: j.draft })); }); }}>
                  <strong>{d.activity_name || '未命名活动'}</strong><span className="draft-meta">{d.org_name} · 步骤 {d.current_step}/3 · {formatTime(d.updated_at)}</span>
                </div>
                <button className="draft-delete" aria-label="删除草稿" onClick={async (e) => { e.stopPropagation(); if (!(await confirm({ message: '确定删除？', tone: 'danger' }))) return; await fetch(`/api/v1/drafts/${d.id}`, { method: 'DELETE' }); setDrafts(p => p.filter(x => x.id !== d.id)); loadDraftCount(); }}><Icon name="trash" size={14} /></button>
              </div>
            ))}</div>}
            <button className="btn btn-secondary btn-block" onClick={() => setShowDrafts(false)} style={{ marginTop: 16 }}>关闭</button>
          </div>
        </div>
      )}

      {/* 历史提交弹窗 */}
      {showHistory && (
        <div className="modal-overlay" onClick={() => setShowHistory(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head"><h2 className="modal-title"><Icon name="folder" size={18} /> 查看历史提交</h2></div>
            <input className="form-input" placeholder="搜索文件名..." value={historySearch} onChange={e => setHistorySearch(e.target.value)} style={{ marginBottom: 12 }} />
            <select className="form-input" value={historyTimeRange} onChange={e => setHistoryTimeRange(e.target.value)} style={{ marginBottom: 12 }} title="按时间范围筛选">
              {TIME_RANGES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {loading ? <div className="loading"><span className="spinner" /> 加载中...</div>
             : filteredSubmissions.length === 0 ? <div className="empty"><div className="empty-icon"><Icon name="folder" size={20} /></div>暂无提交记录</div>
             : <div className="submission-list">{filteredSubmissions.map((s, i) => (
              <div key={i} className="submission-item">
                <div className="draft-info"><strong><Icon name="archive" size={16} /> {s.filename}</strong><span className="draft-meta">{formatSize(s.size)} · {formatTime(s.modified)}</span></div>
                {typeBadge(s.reimb_type)}
                <a href={`/api/v1/submissions/download/${encodeURIComponent(s.filename)}`} download className="btn btn-secondary btn-sm" style={{ textDecoration: 'none' }}><Icon name="download" size={14} /> 下载</a>
              </div>
            ))}</div>}
            <button className="btn btn-secondary btn-block" onClick={() => setShowHistory(false)} style={{ marginTop: 16 }}>关闭</button>
          </div>
        </div>
      )}

      {/* 审核反馈弹窗 */}
      {showFeedback && (
        <div className="modal-overlay" onClick={closeFeedback}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head"><h2 className="modal-title"><Icon name="mail" size={18} /> 审核反馈</h2></div>
            {loading ? <div className="loading"><span className="spinner" /> 加载中...</div>
             : feedbacks.length === 0 ? <div className="empty"><div className="empty-icon"><Icon name="mail" size={20} /></div>暂无审核反馈</div>
             : feedbacks.map((f, i) => (
              <div key={i} className="feedback-item">
                <div className="feedback-item-head"><strong><Icon name="archive" size={16} /> {f.filename}</strong><span className={`badge ${f.status === 'approved' ? 'badge-ok' : 'badge-error'}`}>{f.status === 'approved' ? '已通过' : '已打回'}</span></div>
                {f.status === 'rejected' && (<>
                  {f.is_admin && <span className="badge badge-purple" style={{ alignSelf: 'flex-start' }}><Icon name="shield" size={12} /> 管理员批注</span>}
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{f.invoice_comment && <p><Icon name="receipt" size={14} /> 发票：{f.invoice_comment}</p>}{f.evidence_comment && <p><Icon name="camera" size={14} /> 凭证：{f.evidence_comment}</p>}{Object.entries((f.material_comments || {}) as Record<string, string>).filter(([, c]) => c).map(([k, c]) => {
                    const cfg = MATERIALS[k as MaterialKey];
                    return <p key={k}>{cfg ? <><Icon name={cfg.icon} size={14} /> {cfg.label}</> : k}：{c}</p>;
                  })}{f.form_comment && <p><Icon name="clipboard" size={14} /> 报销表：{f.form_comment}</p>}</div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    {onReEdit && (<button className="btn btn-primary btn-sm" onClick={async (e) => { e.stopPropagation(); try { const r = await fetch(`/api/v1/submission-data/${encodeURIComponent(f.filename)}`); const j = await r.json(); if (j.success && j.form_data) { closeFeedback(); const hasMaterial = !!(f.invoice_comment || f.evidence_comment || Object.values(f.material_comments || {}).some(c => c)); const _materials: any = {}; for (const k of Object.keys(j.material_urls || {})) { _materials[k] = { urls: j.material_urls[k], paths: (j.material_paths || {})[k] || [] }; } onReEdit({ ...j.form_data, _reEditStep: hasMaterial ? 1 : 2, _previousZip: f.filename, _materials }); } else toast('未找到原始数据', 'error'); } catch { toast('加载失败', 'error'); } }}><Icon name="edit" size={14} /> 重新编辑</button>)}
                    <button className="btn btn-secondary btn-sm" onClick={(e) => { e.stopPropagation(); closeFeedback(); navigate('/member/appeals'); }}><Icon name="send" size={14} /> 意见反馈</button>
                  </div>
                </>)}
              </div>
            ))}
            <button className="btn btn-secondary btn-block" onClick={closeFeedback} style={{ marginTop: 16 }}>关闭</button>
          </div>
        </div>
      )}

      {/* 申请审核员弹窗 */}
      {showApply && (
        <div className="modal-overlay" onClick={() => setShowApply(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head"><h2 className="modal-title"><Icon name="key" size={18} /> 申请权限</h2></div>
            <div className="form-group"><label className="form-label">邮箱</label><input className="form-input" value={applyEmail} onChange={e => setApplyEmail(e.target.value)} /></div>
            <div className="form-group"><label className="form-label">申请角色</label>
              <select className="form-input" value={applyRole} onChange={e => setApplyRole(e.target.value)}>
                <option value="reviewer">审核员</option>
                <option value="admin">管理员</option>
              </select>
            </div>
            <div className="form-group"><label className="form-label">申请原因</label><textarea className="form-input" rows={3} value={applyReason} onChange={e => setApplyReason(e.target.value)} placeholder="请简述申请原因..." /></div>
            <div className="modal-foot"><button className="btn btn-primary" onClick={handleApply}>提交申请</button><button className="btn btn-secondary" onClick={() => setShowApply(false)}>取消</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
