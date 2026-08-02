import { useNavigate } from 'react-router-dom';

interface Props {
  user: any;
  onLogout: () => void;
}

export default function ReviewerDashboard({ user, onLogout }: Props) {
  const navigate = useNavigate();

  return (
    <div className="home-page">
      <div className="home-header">
        <h1>审核员工作台</h1>
        <p>{user?.email} &nbsp;|&nbsp; <span className="auth-link" onClick={onLogout}>退出登录</span></p>
      </div>

      <div className="home-grid">
        <div className="home-card home-card-large" onClick={() => navigate('/reviewer/materials')}>
          <div className="home-card-icon">📋</div>
          <div className="home-card-content">
            <h2>材料审核</h2>
            <p>查看和审核已提交的报销申请</p>
            <span className="home-card-badge">审核</span>
          </div>
        </div>

        <div className="home-card-stack">
          <div className="home-card home-card-small" onClick={() => navigate('/reviewer/permissions')}>
            <span className="home-card-icon">🔑</span>
            <span className="home-card-label">给予权限</span>
          </div>
          <div className="home-card home-card-small" onClick={onLogout}>
            <span className="home-card-icon">🚪</span>
            <span className="home-card-label">退出</span>
          </div>
        </div>
      </div>
    </div>
  );
}
