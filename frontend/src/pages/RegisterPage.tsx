import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFeedback } from '../components/Feedback';

export default function RegisterPage() {
  const navigate = useNavigate();
  const { toast } = useFeedback();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password !== confirm) {
      setError('两次密码输入不一致');
      return;
    }
    setLoading(true);
    try {
      const r = await fetch('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const j = await r.json();
      if (!j.success) {
        setError(j.detail || '注册失败');
        return;
      }
      toast('注册成功！请登录', 'success');
      navigate('/login');
    } catch {
      setError('网络错误');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <img src="/logo-large.png" alt="CUHK-SZ" className="auth-logo" />
        <h1>注册账号</h1>
        <p className="auth-subtitle">
          @cuhk.edu.cn → 审核员 &nbsp;|&nbsp; @link.cuhk.edu.cn → 社团成员
        </p>

        <form onSubmit={handleRegister}>
          <div className="form-group">
            <label className="form-label">邮箱</label>
            <input
              type="email"
              className="form-input"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="example@link.cuhk.edu.cn"
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
              placeholder="至少6位密码"
              required
              minLength={6}
            />
          </div>
          <div className="form-group">
            <label className="form-label">确认密码</label>
            <input
              type="password"
              className="form-input"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="再次输入密码"
              required
            />
          </div>

          {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}

          <button type="submit" className="btn btn-primary btn-block" disabled={loading} style={{ marginTop: 8 }}>
            {loading ? <><span className="spinner" /> 注册中...</> : '注册'}
          </button>
        </form>

        <p className="auth-footer">
          已有账号？{' '}
          <span className="auth-link" onClick={() => navigate('/login')}>
            返回登录
          </span>
        </p>
      </div>
    </div>
  );
}
