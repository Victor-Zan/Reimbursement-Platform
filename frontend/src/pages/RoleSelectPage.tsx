import { useNavigate } from 'react-router-dom';

interface Props {
  user: any;
  onLogout: () => void;
}

export default function RoleSelectPage({ user, onLogout }: Props) {
  const navigate = useNavigate();

  return (
    <div className="auth-page">
      <div className="auth-card" style={{ width: 480, textAlign: 'center' }}>
        <h1 style={{ marginBottom: 4 }}>选择登录身份</h1>
        <p style={{ color: 'var(--gray-500)', fontSize: 14, marginBottom: 28 }}>{user?.email}</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div
            className="home-card home-card-large"
            onClick={() => navigate('/member')}
            style={{ cursor: 'pointer', padding: 28, border: '2px solid var(--primary)' }}
          >
            <div className="home-card-icon" style={{ fontSize: 40 }}>👤</div>
            <div className="home-card-content">
              <h2 style={{ fontSize: 20 }}>社员登录</h2>
              <p style={{ fontSize: 13, color: 'var(--gray-500)' }}>进入报销提交与查看</p>
            </div>
          </div>

          <div
            className="home-card home-card-large"
            onClick={() => navigate('/reviewer')}
            style={{ cursor: 'pointer', padding: 28, border: '2px solid var(--primary)' }}
          >
            <div className="home-card-icon" style={{ fontSize: 40 }}>🔍</div>
            <div className="home-card-content">
              <h2 style={{ fontSize: 20 }}>审核员登录</h2>
              <p style={{ fontSize: 13, color: 'var(--gray-500)' }}>进入材料审核与管理</p>
            </div>
          </div>
        </div>

        <button
          className="btn btn-secondary"
          onClick={onLogout}
          style={{ marginTop: 28, width: '100%' }}
        >
          退出登录
        </button>
      </div>
    </div>
  );
}
