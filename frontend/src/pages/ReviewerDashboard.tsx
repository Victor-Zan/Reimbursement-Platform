import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

interface Props { user: any; onLogout: () => void; }

export default function ReviewerDashboard({ user, onLogout }: Props) {
  const navigate = useNavigate();
  const [stats, setStats] = useState({ pending: 0, approved: 0, rejected: 0, resubmitted: 0 });
  const [resubmittedList, setResubmittedList] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/v1/review/stats').then(r => r.json()).then(j => { if (j.success) setStats(j.stats); }).catch(() => {});
    fetch('/api/v1/review/submissions').then(r => r.json()).then(j => {
      if (j.success) setResubmittedList(j.submissions.filter((s: any) => s.status === 'resubmitted').slice(0, 5));
    }).catch(() => {});
  }, []);

  return (
    <div className="home-page">
      <div className="home-header">
        <h1>审核员工作台</h1>
        <p>{user?.email} | <span className="auth-link" onClick={onLogout}>退出登录</span></p>
      </div>

      {/* 统计卡片 */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
        <div className="card" style={{ flex: 1, textAlign: 'center', padding: 20 }}>
          <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--warning)' }}>{stats.pending}</div>
          <div style={{ fontSize: 14, color: 'var(--gray-500)' }}>待审核</div>
        </div>
        <div className="card" style={{ flex: 1, textAlign: 'center', padding: 20 }}>
          <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--success)' }}>{stats.approved}</div>
          <div style={{ fontSize: 14, color: 'var(--gray-500)' }}>已通过</div>
        </div>
        <div className="card" style={{ flex: 1, textAlign: 'center', padding: 20 }}>
          <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--danger)' }}>{stats.rejected}</div>
          <div style={{ fontSize: 14, color: 'var(--gray-500)' }}>已打回</div>
        </div>
        <div className="card" style={{ flex: 1, textAlign: 'center', padding: 20, border: stats.resubmitted > 0 ? '2px solid var(--danger)' : '' }}>
          <div style={{ fontSize: 32, fontWeight: 700, color: '#e67e22' }}>{stats.resubmitted}</div>
          <div style={{ fontSize: 14, color: 'var(--gray-500)' }}>已打回材料重审{stats.resubmitted > 0 && <span style={{ color: 'var(--danger)', fontWeight: 700 }}> 🔴</span>}</div>
        </div>
      </div>

      {/* 重审材料列表 */}
      {resubmittedList.length > 0 && (
        <div className="card" style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 15, marginBottom: 8, color: '#e67e22' }}>🔴 待重审材料</h3>
          {resubmittedList.map((s: any, i: number) => (
            <div key={i} className="submission-item" style={{ cursor: 'pointer' }} onClick={() => navigate('/reviewer/materials')}>
              <div className="draft-info"><strong>📦 {s.filename}</strong><span className="draft-meta">{s.modified.slice(0,19).replace('T',' ')}</span></div>
              <span className="badge badge-error">重审</span>
            </div>
          ))}
        </div>
      )}

      <div className="home-grid">
        <div className="home-card home-card-large" onClick={() => navigate('/reviewer/materials')}>
          <div className="home-card-icon">📋</div>
          <div className="home-card-content"><h2>材料审核</h2><p>查看和审核已提交的报销申请</p><span className="home-card-badge">审核</span></div>
        </div>
        <div className="home-card-stack">
          <div className="home-card home-card-small" onClick={() => navigate('/reviewer/permissions')}><span className="home-card-icon">🔑</span><span className="home-card-label">给予权限</span></div>
          <div className="home-card home-card-small" onClick={onLogout}><span className="home-card-icon">🚪</span><span className="home-card-label">退出</span></div>
        </div>
      </div>
    </div>
  );
}
