import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../components/Icon';

interface Props {
  user: any;
  onLogout: () => void;
}

/** 角色选择页：双重身份账号登录后选择进入哪一端；审核员/管理员卡片按工作台口径显示待办红点 + 红边框。 */
export default function RoleSelectPage({ user, onLogout }: Props) {
  const navigate = useNavigate();
  // 各端待办统计（与工作台统计卡同一口径，接口均为全局统计；拉取失败则无红点）
  const [reviewerStats, setReviewerStats] = useState({ pending: 0, resubmitted: 0 });
  const [pendingAppeals, setPendingAppeals] = useState(0);
  const [pendingApplications, setPendingApplications] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const [sr, ar, pr] = await Promise.all([
          fetch('/api/v1/review/stats').then(r => r.json()),
          fetch('/api/v1/admin/appeals').then(r => r.json()),
          fetch('/api/v1/reviewer/applications').then(r => r.json()),
        ]);
        if (sr.success && sr.stats) setReviewerStats({ pending: sr.stats.pending || 0, resubmitted: sr.stats.resubmitted || 0 });
        if (ar.success && Array.isArray(ar.appeals)) setPendingAppeals(ar.appeals.filter((a: any) => a.status === 'pending').length);
        if (pr.success && Array.isArray(pr.applications)) setPendingApplications(pr.applications.filter((a: any) => a.status === 'pending').length);
      } catch {}
    })();
  }, []);

  // 待办判定（按用户身份 + 接口计数，红边框样式与工作台统计卡一致，红点定位卡片右上角）
  const hasReviewerTodo = !!user?.is_reviewer && (reviewerStats.pending + reviewerStats.resubmitted) > 0;
  const hasAdminTodo = !!user?.is_admin && (pendingAppeals > 0 || pendingApplications > 0);
  const dangerStyle = { position: 'relative', border: '2px solid var(--danger-line)' } as const;
  const cornerDot = <span className="dot dot--danger" style={{ position: 'absolute', top: 12, right: 12 }} />;

  return (
    <div className="auth-page">
      <div className="auth-card" style={{ width: 480, textAlign: 'center' }}>
        <h1 style={{ marginBottom: 4 }}>选择登录身份</h1>
        <p className="auth-subtitle" style={{ marginBottom: 28 }}>{user?.email}</p>

        <div className="role-grid" style={{ flexDirection: 'column' }}>
          <div
            className="role-card"
            onClick={() => navigate('/member')}
          >
            <div className="role-card-icon"><Icon name="user" size={22} /></div>
            <h3>报销人登录</h3>
            <p>进入报销提交与查看</p>
          </div>

          <div
            className="role-card"
            style={hasReviewerTodo ? dangerStyle : undefined}
            onClick={() => navigate('/reviewer')}
          >
            {hasReviewerTodo && cornerDot}
            <div className="role-card-icon"><Icon name="search" size={22} /></div>
            <h3>审核员登录</h3>
            <p>进入材料审核与管理</p>
          </div>

          {user?.is_admin && (
            <div
              className="role-card"
              style={hasAdminTodo ? dangerStyle : undefined}
              onClick={() => navigate('/admin')}
            >
              {hasAdminTodo && cornerDot}
              <div className="role-card-icon"><Icon name="shield" size={22} /></div>
              <h3>管理员登录</h3>
              <p>进入权限管理与申诉处理</p>
            </div>
          )}
        </div>

        <button
          className="btn btn-secondary btn-block"
          onClick={onLogout}
          style={{ marginTop: 28 }}
        >
          退出登录
        </button>
      </div>
    </div>
  );
}
