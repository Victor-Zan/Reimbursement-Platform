import { useNavigate } from 'react-router-dom';
import Icon from '../components/Icon';

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="landing-page">
      <img src="/logo-large.png" alt="CUHK-SZ" className="landing-logo" />
      <div className="landing-hero">
        <div className="landing-badge">香港中文大学（深圳）</div>
        <h1>报销自动化平台</h1>
        <p className="landing-subtitle">学生活动经费报销，简单高效</p>

        <div className="landing-cards">
          <div className="landing-card">
            <div className="landing-card-icon"><Icon name="user" size={20} /></div>
            <h3>社团成员</h3>
            <p>提交报销申请、查看审核进度、管理草稿</p>
          </div>
          <div className="landing-card">
            <div className="landing-card-icon"><Icon name="search" size={20} /></div>
            <h3>审核员</h3>
            <p>材料审核、批注反馈、权限管理</p>
          </div>
        </div>

        <button className="btn landing-btn" onClick={() => navigate('/login')}>
          登录 / 注册
        </button>
      </div>
    </div>
  );
}
