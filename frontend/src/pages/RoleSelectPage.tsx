import { useNavigate } from 'react-router-dom';
import Icon from '../components/Icon';

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
        <p className="auth-subtitle" style={{ marginBottom: 28 }}>{user?.email}</p>

        <div className="role-grid" style={{ flexDirection: 'column' }}>
          <div
            className="role-card"
            onClick={() => navigate('/member')}
          >
            <div className="role-card-icon"><Icon name="user" size={22} /></div>
            <h3>社员登录</h3>
            <p>进入报销提交与查看</p>
          </div>

          <div
            className="role-card"
            onClick={() => navigate('/reviewer')}
          >
            <div className="role-card-icon"><Icon name="search" size={22} /></div>
            <h3>审核员登录</h3>
            <p>进入材料审核与管理</p>
          </div>

          {user?.is_admin && (
            <div
              className="role-card"
              onClick={() => navigate('/admin')}
            >
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
