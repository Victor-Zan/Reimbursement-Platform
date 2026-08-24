import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../components/Icon';
import { useFeedback } from '../components/Feedback';

interface Props {
  onEnterWizard: () => void;
  onOpenDrafts: () => void;
  onOpenHistory: () => void;
  user?: any;
  onReEdit?: (data: any) => void;
}

interface DraftSummary { id: string; activity_name: string; org_name: string; current_step: number; updated_at: string; }

export default function HomePage({ onEnterWizard, onOpenDrafts, onOpenHistory, user, onReEdit }: Props) {
  const navigate = useNavigate();
  const { toast, confirm } = useFeedback();
  const [draftCount, setDraftCount] = useState(0);
  const [showDrafts, setShowDrafts] = useState(false);
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [feedbackBadge, setFeedbackBadge] = useState(0);
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

  // 未读红点计算：任何状态改变（通过/打回）都会产生新批注，计入未读；
  // 批注请求并行发出（Promise.all），避免多条提交串行等待拖慢红点刷新
  const refreshUnread = useCallback(async () => {
    if (!user?.email) return;
    try {
      const lastRead = localStorage.getItem('feedback_last_read') || '';
      const r = await fetch(`/api/v1/submissions?user_email=${encodeURIComponent(user.email)}`);
      const j = await r.json(); let unread = 0;
      if (j.success) {
        const results = await Promise.all(j.submissions.map(async (s: any) => {
          try {
            const rr = await fetch(`/api/v1/review/annotations/${encodeURIComponent(s.filename)}`);
            const rj = await rr.json();
            return rj.success && rj.review.status !== 'pending' && rj.review.created_at && rj.review.created_at > lastRead ? 1 : 0;
          } catch { return 0; }
        }));
        unread = results.reduce((a: number, b: number) => a + b, 0);
      }
      setFeedbackBadge(unread);
    } catch {}
  }, [user?.email]);

  useEffect(() => { refreshUnread(); }, [refreshUnread]);

  // 轮询：审核员操作后 10 秒内红点自动出现/消失，无需刷新页面
  useEffect(() => {
    const timer = setInterval(refreshUnread, 10000);
    return () => clearInterval(timer);
  }, [refreshUnread]);

  const handleApply = async () => {
    if (!applyEmail || !applyReason) { toast('请填写邮箱和申请原因', 'warn'); return; }
    await fetch('/api/v1/reviewer/apply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: applyEmail, reason: applyReason, role: applyRole }) });
    toast('申请已提交', 'success'); setShowApply(false); setApplyReason(''); setApplyRole('reviewer');
  };

  const formatTime = (iso: string) => iso ? iso.replace('T', ' ').slice(0, 19) : '';

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
        <div className="home-card home-card-large" onClick={onEnterWizard}>
          <div className="home-card-icon"><Icon name="file-text" size={28} /></div>
          <div className="home-card-content"><h2>报销申请</h2><p>一次提交可同时包含增值税、保险、出行多类报销，上传发票与其他材料后自动 OCR 识别并生成报销表</p><span className="home-card-badge">增值税 · 保险 · 出行</span></div>
        </div>
        <div className="home-card-stack">
          <div className="home-card home-card-small" onClick={handleOpenDrafts}><span className="home-card-icon"><Icon name="edit" size={20} /></span><span className="home-card-label">我的草稿</span>{draftCount > 0 && <span className="home-card-count">{draftCount} 条</span>}</div>
          <div className="home-card home-card-small" onClick={() => navigate('/member/history')}><span className="home-card-icon"><Icon name="folder" size={20} /></span><span className="home-card-label">查看历史提交</span></div>
          <div className="home-card home-card-small" onClick={() => navigate('/member/feedback')}><span className="home-card-icon"><Icon name="mail" size={20} /></span><span className="home-card-label">审核反馈</span>{feedbackBadge > 0 && <span className="home-card-count home-card-count--danger">{feedbackBadge}</span>}</div>
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
