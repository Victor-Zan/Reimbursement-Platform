interface Props {
  user: any;
  onLogout: () => void;
}

export default function TopNav({ user, onLogout }: Props) {
  if (!user) return null;

  return (
    <nav className="top-nav">
      <div className="top-nav-inner">
        <div className="top-nav-left">
          <img src="/logo.png" alt="CUHK-SZ" className="top-nav-logo-img" />
          <span className="top-nav-title">报销自动化平台</span>
        </div>
        <div className="top-nav-right">
          <span className="top-nav-email">{user.email}</span>
          <button type="button" className="top-nav-logout" onClick={onLogout}>退出</button>
        </div>
      </div>
    </nav>
  );
}
