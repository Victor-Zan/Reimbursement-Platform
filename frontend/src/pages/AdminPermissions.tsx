import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../components/Icon';

interface Application {
  id: number;
  email: string;
  reason: string;
  status: string;
  created_at: string;
  role: string;
}

/** 管理员端：给予权限（审批报销人提交的审核员/管理员权限申请）。 */
export default function AdminPermissions() {
  const navigate = useNavigate();
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/v1/reviewer/applications');
      const j = await r.json();
      if (j.success) setApplications(j.applications);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleApprove = async (id: number) => {
    await fetch(`/api/v1/reviewer/applications/${id}/approve`, { method: 'POST' });
    load();
  };

  return (
    <div>
      <button className="btn btn-ghost btn-sm" onClick={() => navigate('/admin')} style={{ marginBottom: 16 }}><Icon name="arrow-left" size={14} /> 返回</button>
      <div className="page-head">
        <h1><Icon name="key" size={22} /> 给予权限</h1>
        <p className="page-head-sub">审批报销人提交的权限申请，通过后按申请的角色授予审核员或管理员权限</p>
      </div>

      {loading ? <div className="loading"><span className="spinner" /> 加载中...</div>
       : applications.length === 0 ? <div className="empty"><div className="empty-icon"><Icon name="key" size={20} /></div>暂无申请</div>
       : (
        <div className="submission-list">
          {applications.map(a => (
            <div key={a.id} className="submission-item">
              <div className="draft-info">
                <strong>{a.email}</strong>
                <span className="draft-meta">{a.reason || '无申请原因'} · {a.created_at.slice(0, 19).replace('T', ' ')}</span>
              </div>
              <div className="submission-right">
                {a.role === 'admin' ? <span className="badge badge-purple">管理员</span> : <span className="badge badge-gold">审核员</span>}
                {a.status === 'approved' ? (
                  <span className="badge badge-ok">已通过</span>
                ) : a.status === 'rejected' ? (
                  <span className="badge badge-error">已拒绝</span>
                ) : (
                  <button className="btn btn-success btn-sm" onClick={() => handleApprove(a.id)}>通过</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
