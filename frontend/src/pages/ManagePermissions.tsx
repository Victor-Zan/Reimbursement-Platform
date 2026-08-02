import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

interface Application {
  id: number;
  email: string;
  reason: string;
  status: string;
  created_at: string;
}

export default function ManagePermissions() {
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
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 16px' }}>
      <button className="btn btn-secondary" onClick={() => navigate('/reviewer')} style={{ marginBottom: 16 }}>← 返回</button>
      <h2>🔑 给予权限</h2>

      {loading ? <p style={{ textAlign: 'center', padding: 24 }}><span className="spinner" /> 加载中...</p>
       : applications.length === 0 ? <p style={{ textAlign: 'center', padding: 24, color: 'var(--gray-500)' }}>暂无申请</p>
       : (
        <div className="submission-list">
          {applications.map(a => (
            <div key={a.id} className="submission-item">
              <div className="draft-info">
                <strong>{a.email}</strong>
                <span className="draft-meta">{a.reason || '无申请原因'} · {a.created_at.slice(0, 19).replace('T', ' ')}</span>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {a.status === 'approved' ? (
                  <span className="badge badge-ok">已通过</span>
                ) : a.status === 'rejected' ? (
                  <span className="badge badge-error">已拒绝</span>
                ) : (
                  <button className="btn btn-success" style={{ padding: '4px 14px', fontSize: 13 }} onClick={() => handleApprove(a.id)}>通过</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
