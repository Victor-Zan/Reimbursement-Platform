import { useLocation, useNavigate } from 'react-router-dom';
import Icon from './Icon';
import { guideRoleFromPath } from '../config/guides';

interface Props {
  user: any;
  onLogout: () => void;
}

export default function TopNav({ user, onLogout }: Props) {
  const location = useLocation();
  const navigate = useNavigate();

  if (!user) return null;

  const isGuidePage = location.pathname.endsWith('/guide');  // 指南页隐藏入口按钮

  const openGuide = () => {
    // 按当前页所在角色域导航；记录来源页供指南页"关闭"返回
    const role = guideRoleFromPath(location.pathname);
    navigate(`/${role}/guide`, { state: { from: location.pathname } });
  };

  return (
    <nav className="top-nav">
      <div className="top-nav-inner">
        <div className="top-nav-left">
          <img src="/logo-horizontal.png" alt="CUHK-SZ" className="top-nav-logo-img" />
          <span className="top-nav-title">报销自动化平台</span>
        </div>
        <div className="top-nav-right">
          <span className="top-nav-email">{user.email}</span>
          {!isGuidePage && (
            <button type="button" className="top-nav-guide" onClick={openGuide}>
              <Icon name="info" size={14} /> 操作指南
            </button>
          )}
          <button type="button" className="top-nav-logout" onClick={onLogout}>退出</button>
        </div>
      </div>
    </nav>
  );
}
