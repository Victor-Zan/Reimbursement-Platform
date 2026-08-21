import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../components/Icon';

interface Props { user: any; }

export default function ReviewerDashboard({ user }: Props) {
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
        <p>{user?.email}</p>
      </div>

      {/* 统计卡片 */}
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-card-num stat-num--warn">{stats.pending}</div>
          <div className="stat-card-label">待审核</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-num stat-num--success">{stats.approved}</div>
          <div className="stat-card-label">已通过</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-num stat-num--error">{stats.rejected}</div>
          <div className="stat-card-label">已打回</div>
        </div>
        <div className="stat-card" style={stats.resubmitted > 0 ? { border: '2px solid var(--danger-line)' } : undefined}>
          <div className="stat-card-num stat-num--purple">{stats.resubmitted}</div>
          <div className="stat-card-label">已打回材料重审{stats.resubmitted > 0 && <span className="dot dot--danger" />}</div>
        </div>
      </div>

      {/* 重审材料列表 */}
      {resubmittedList.length > 0 && (
        <div className="card" style={{ marginBottom: 24 }}>
          <h3 className="section-title"><span className="dot dot--danger" /> 待重审材料</h3>
          {resubmittedList.map((s: any, i: number) => (
            <div key={i} className="submission-item" style={{ cursor: 'pointer' }} onClick={() => navigate('/reviewer/materials')}>
              <div className="draft-info"><strong><Icon name="archive" size={16} /> {s.filename}</strong><span className="draft-meta">{s.modified.slice(0,19).replace('T',' ')}</span></div>
              <span className="badge badge-purple">重审</span>
            </div>
          ))}
        </div>
      )}

      <div className="home-grid">
        <div className="home-card home-card-large" onClick={() => navigate('/reviewer/materials')}>
          <div className="home-card-icon"><Icon name="clipboard" size={28} /></div>
          <div className="home-card-content"><h2>材料审核</h2><p>查看和审核已提交的报销申请</p><span className="home-card-badge">审核</span></div>
        </div>
      </div>
    </div>
  );
}
