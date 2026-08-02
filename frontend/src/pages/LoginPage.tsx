import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface Props {
  onLogin: (token: string, user: any) => void;
}

export default function LoginPage({ onLogin }: Props) {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const r = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const j = await r.json();
      if (!j.success) {
        setError(j.detail || '登录失败');
        return;
      }
      onLogin(j.token, j.user);
    } catch {
      setError('网络错误');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>报销自动化平台</h1>
        <p className="auth-subtitle">香港中文大学（深圳）</p>

        <form onSubmit={handleLogin}>
          <div className="form-group">
            <label className="form-label">邮箱</label>
            <input
              type="email"
              className="form-input"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="example@cuhk.edu.cn 或 @link.cuhk.edu.cn"
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">密码</label>
            <input
              type="password"
              className="form-input"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="输入密码"
              required
            />
          </div>

          {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}

          <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: '100%', marginTop: 8 }}>
            {loading ? <><span className="spinner" /> 登录中...</> : '登录'}
          </button>
        </form>

        <p className="auth-footer">
          还没有账号？{' '}
          <span className="auth-link" onClick={() => navigate('/register')}>
            立即注册
          </span>
        </p>
      </div>
    </div>
  );
}
