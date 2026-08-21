import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../components/Icon';

interface Props { user: any; }

export default function AdminDashboard({ user }: Props) {
  const navigate = useNavigate();
  const [stats, setStats] = useState({ pending: 0, approved: 0, rejected: 0, resubmitted: 0 });
  const [pendingAppeals, setPendingAppeals] = useState(0);
  const [unreadAppeals, setUnreadAppeals] = useState(0);
  const [pendingApplications, setPendingApplications] = useState(0);

  // 红点语义与成员审核反馈一致：未读 = 申诉创建时间晚于上次查看时间（打开处理意见页时刷新）
  const loadAppeals = async () => {
    try {
      const lastRead = localStorage.getItem('appeal_last_read') || '';
      const r = await fetch('/api/v1/admin/appeals');
      const j = await r.json();
      if (j.success) {
        const pendings = j.appeals.filter((a: any) => a.status === 'pending');
        setPendingAppeals(pendings.length);
        setUnreadAppeals(pendings.filter((a: any) => a.created_at && a.created_at > lastRead).length);
      }
    } catch {}
  };

  const loadApplications = async () => {
    try {
      const r = await fetch('/api/v1/reviewer/applications');
      const j = await r.json();
      if (j.success) setPendingApplications(j.applications.filter((a: any) => a.status === 'pending').length);
    } catch {}
  };

  useEffect(() => {
    fetch('/api/v1/review/stats').then(r => r.json()).then(j => { if (j.success) setStats(j.stats); }).catch(() => {});
    loadAppeals();
    loadApplications();
    // 轮询：新申诉/新申请 30 秒内自动出现，无需刷新页面
    const timer = setInterval(() => { loadAppeals(); loadApplications(); }, 30000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="home-page">
      <div className="home-header">
        <h1>管理员工作台</h1>
        <p>{user?.email}</p>
      </div>

      {/* 统计卡片 */}
      <div className="stat-grid">
        <div className="stat-card" style={unreadAppeals > 0 ? { border: '2px solid var(--danger-line)' } : undefined}>
          <div className="stat-card-num stat-num--error">{pendingAppeals}</div>
          <div className="stat-card-label">待处理申诉{unreadAppeals > 0 && <span className="dot dot--danger" />}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-num stat-num--warn">{pendingApplications}</div>
          <div className="stat-card-label">待审批权限申请</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-num stat-num--warn">{stats.pending}</div>
          <div className="stat-card-label">待审核报销</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-num stat-num--success">{stats.approved}</div>
          <div className="stat-card-label">已通过报销</div>
        </div>
      </div>

      <div className="home-grid">
        <div className="home-card home-card-large" onClick={() => navigate('/admin/appeals')}>
          <div className="home-card-icon"><Icon name="send" size={28} /></div>
          <div className="home-card-content"><h2>处理意见</h2><p>查看成员对打回结果的意见反馈与审核员批注，裁定报销最终结果</p>{unreadAppeals > 0 && <span className="home-card-count home-card-count--danger">{unreadAppeals} 条新反馈</span>}</div>
        </div>
        <div className="home-card-stack">
          <div className="home-card home-card-small" onClick={() => navigate('/admin/permissions')}><span className="home-card-icon"><Icon name="key" size={20} /></span><span className="home-card-label">给予权限</span>{pendingApplications > 0 && <span className="home-card-count">{pendingApplications} 条申请</span>}</div>
        </div>
      </div>
    </div>
  );
}
