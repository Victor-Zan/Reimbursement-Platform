interface Props {
  user: any;
  onLogout: () => void;
  badge?: number;
}

export default function TopNav({ user, onLogout, badge = 0 }: Props) {
  if (!user) return null;

  return (
    <nav className="top-nav">
      <div className="top-nav-left">
        <img src="/logo.png" alt="CUHK-SZ" className="top-nav-logo-img" />
        <span className="top-nav-title">报销自动化平台</span>
      </div>
      <div className="top-nav-right">
        <span className="top-nav-email">{user.email}</span>
        <span className="top-nav-bell" title="审核反馈">
          🔔
          {badge > 0 && <span className="top-nav-dot">{badge}</span>}
        </span>
        <span className="top-nav-logout" onClick={onLogout}>退出</span>
      </div>
    </nav>
  );
}
