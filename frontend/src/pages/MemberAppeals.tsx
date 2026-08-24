import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { typesFrom } from '../config/materials';
import TypeBadges from '../components/TypeBadges';
import Icon from '../components/Icon';
import { useFeedback } from '../components/Feedback';

interface Props { user: any; }
interface AppealItem { id: number; submission_zip: string; reimb_type?: string; reimb_types?: string[]; reason: string; status: string; created_at: string; }
interface SubmissionFile { filename: string; size: number; modified: string; org_name?: string; activity_name?: string; reimb_type?: string; reimb_types?: string[]; status?: string; }

/** 社团成员端：意见反馈（申诉被打回的报销申请，可多选 + 共同理由）。 */
export default function MemberAppeals({ user }: Props) {
  const navigate = useNavigate();
  const { toast } = useFeedback();
  const [appeals, setAppeals] = useState<AppealItem[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionFile[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [ar, sr] = await Promise.all([
        fetch(`/api/v1/appeals?user_email=${encodeURIComponent(user?.email || '')}`).then(r => r.json()),
        fetch(`/api/v1/submissions?user_email=${encodeURIComponent(user?.email || '')}`).then(r => r.json()),
      ]);
      if (ar.success) setAppeals(ar.appeals);
      if (sr.success) setSubmissions(sr.submissions);
    } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  // 已有待处理反馈的提交不可重复勾选
  const pendingZips = new Set(appeals.filter(a => a.status === 'pending').map(a => a.submission_zip));
  const rejected = submissions.filter(s => s.status === 'rejected');

  const toggleSelect = (filename: string, checked: boolean) => {
    setSelected(p => checked ? [...p, filename] : p.filter(x => x !== filename));
  };

  const handleSubmit = async () => {
    if (!selected.length) { toast('请勾选需要反馈的申请', 'warn'); return; }
    if (!reason.trim()) { toast('请填写反馈原因', 'warn'); return; }
    setSubmitting(true);
    try {
      const r = await fetch('/api/v1/appeals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_email: user?.email || '', submission_zip: selected, reason }),
      });
      const j = await r.json();
      if (r.ok && j.success) {
        toast(`已提交 ${j.created} 条反馈${j.skipped && j.skipped.length ? `，${j.skipped.length} 条被跳过` : ''}`, 'success');
        setSelected([]); setReason('');
        load();
      } else {
        toast(j.detail || '提交失败', 'error');
      }
    } catch { toast('网络错误', 'error'); }
    setSubmitting(false);
  };

  const statusBadge = (s: string) => s === 'approved' ? <span className="badge badge-ok">已通过</span> : s === 'rejected' ? <span className="badge badge-error">已打回</span> : <span className="badge badge-warn">待处理</span>;

  return (
    <div>
      <button className="btn btn-ghost btn-sm" onClick={() => navigate('/member')} style={{ marginBottom: 16 }}><Icon name="arrow-left" size={14} /> 返回首页</button>
      <div className="page-head">
        <h1><Icon name="send" size={22} /> 意见反馈</h1>
        <p className="page-head-sub">对审核员的打回结果不认可时，勾选对应申请并填写原因提交申诉，由管理员复核裁定</p>
      </div>

      {/* 我的反馈历史 */}
      <div className="card">
        <h3 className="section-title">我的反馈</h3>
        {loading ? <div className="loading"><span className="spinner" /> 加载中...</div>
         : appeals.length === 0 ? <div className="empty"><div className="empty-icon"><Icon name="send" size={20} /></div>暂无反馈记录</div>
         : <div className="submission-list">{appeals.map(a => (
            <div key={a.id} className="submission-item">
              <div className="draft-info">
                <strong><Icon name="archive" size={16} /> {a.submission_zip}</strong>
                <span className="draft-meta">{a.reason} · {a.created_at.slice(0, 19).replace('T', ' ')}</span>
              </div>
              <TypeBadges types={typesFrom(a)} />
              {statusBadge(a.status)}
            </div>
          ))}</div>}
      </div>

      {/* 提交新反馈 */}
      <div className="card">
        <h3 className="section-title">提交意见反馈</h3>
        <p className="card-sub" style={{ marginBottom: 12 }}>仅被打回的申请可勾选反馈；每条申请同一时间只能有一条待处理反馈</p>
        {rejected.length === 0 ? <div className="empty"><div className="empty-icon"><Icon name="alert-triangle" size={20} /></div>当前没有被打回的申请</div>
         : <div className="appeal-check-list">
            {rejected.map(s => {
              const blocked = pendingZips.has(s.filename);
              return (
                <label key={s.filename} className={`form-check${blocked ? ' is-disabled' : ''}`}>
                  <input type="checkbox" className="form-check-input"
                         checked={selected.includes(s.filename)}
                         disabled={blocked}
                         onChange={e => toggleSelect(s.filename, e.target.checked)} />
                  <span className="form-check-label">{s.org_name
                    ? `${s.org_name}-${s.activity_name ? `${s.activity_name}-` : ''}${s.modified.slice(0, 10)}-报销申请`
                    : s.filename}</span>
                  <TypeBadges types={typesFrom(s)} />
                  {blocked && <span className="badge badge-purple">反馈处理中</span>}
                </label>
              );
            })}
          </div>}
        <div className="form-group">
          <label className="form-label">反馈原因</label>
          <textarea className="form-input" rows={3} value={reason} onChange={e => setReason(e.target.value)} placeholder="请说明为什么不认可此次打回..." />
        </div>
        <button className="btn btn-primary" disabled={submitting || !selected.length || !reason.trim()} onClick={handleSubmit}>
          {submitting ? <><span className="spinner" /> 提交中...</> : <><Icon name="send" size={15} /> 提交反馈</>}
        </button>
      </div>
    </div>
  );
}
