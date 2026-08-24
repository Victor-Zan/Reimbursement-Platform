import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { materialByKey, typeLabel } from '../config/materials';
import Icon from '../components/Icon';
import { useFeedback } from '../components/Feedback';

interface Props { user: any; onReEdit?: (data: any) => void; }

/** 社团成员端：审核反馈（独立页面，替代原首页弹窗）。进入页面即视为已读（写 feedback_last_read）。 */
export default function MemberFeedback({ user, onReEdit }: Props) {
  const navigate = useNavigate();
  const { toast } = useFeedback();
  const [feedbacks, setFeedbacks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const lastRead = localStorage.getItem('feedback_last_read') || '';
        const r = await fetch(`/api/v1/submissions?user_email=${encodeURIComponent(user?.email || '')}`);
        const j = await r.json();
        const items: any[] = [];
        if (j.success) for (const s of j.submissions) {
          try {
            const rr = await fetch(`/api/v1/review/annotations/${encodeURIComponent(s.filename)}`);
            const rj = await rr.json();
            if (rj.success && rj.review.status !== 'pending') {
              items.push({ ...s, ...rj.review });
            }
          } catch {}
        }
        setFeedbacks(items);
      } catch {}
      setLoading(false);
      // 进入页面即视为已读（对等原「打开弹窗即已读」语义）
      localStorage.setItem('feedback_last_read', new Date().toISOString());
    })();
  }, [user?.email]);

  const titleOf = (f: any) => f.org_name
    ? `${f.org_name}-${f.activity_name ? `${f.activity_name}-` : ''}${f.modified.slice(0, 10)}-报销申请`
    : f.filename;

  return (
    <div>
      <div className="page-head">
        <h1><Icon name="mail" size={22} /> 审核反馈</h1>
        <p className="page-head-sub">审核员与管理员对报销申请的处理结果与批注，打回的申请可重新编辑或提交意见反馈</p>
      </div>
      <button className="btn btn-ghost btn-sm" onClick={() => navigate('/member')} style={{ marginBottom: 16 }}><Icon name="arrow-left" size={14} /> 返回首页</button>

      {loading ? <div className="loading"><span className="spinner" /> 加载中...</div>
       : feedbacks.length === 0 ? <div className="empty"><div className="empty-icon"><Icon name="mail" size={20} /></div>暂无审核反馈</div>
       : <div className="submission-list">{feedbacks.map((f, i) => (
          <div key={i} className="feedback-item">
            <div className="feedback-item-head"><strong><Icon name="archive" size={16} /> {titleOf(f)}</strong><span className={`badge ${f.status === 'approved' ? 'badge-ok' : 'badge-error'}`}>{f.status === 'approved' ? '已通过' : '已打回'}</span></div>
            {f.status === 'rejected' && (<>
              {f.is_admin && <span className="badge badge-purple" style={{ alignSelf: 'flex-start' }}><Icon name="shield" size={12} /> 管理员批注</span>}
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{f.invoice_comment && <p><Icon name="receipt" size={14} /> 发票：{f.invoice_comment}</p>}{f.evidence_comment && <p><Icon name="camera" size={14} /> 凭证：{f.evidence_comment}</p>}{Object.entries((f.material_comments || {}) as Record<string, string>).filter(([, c]) => c).map(([k, c]) => {
                const m = materialByKey(k);
                const label = m.cfg ? (m.type ? `${typeLabel(m.type)}·${m.cfg.label}` : m.cfg.label) : k;
                return <p key={k}>{m.cfg ? <><Icon name={m.cfg.icon} size={14} /> {label}</> : k}：{c}</p>;
              })}{f.form_comment && <p><Icon name="clipboard" size={14} /> 报销表：{f.form_comment}</p>}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                {onReEdit && (<button className="btn btn-primary btn-sm" onClick={async () => { try { const r = await fetch(`/api/v1/submission-data/${encodeURIComponent(f.filename)}`); const j = await r.json(); if (j.success && j.form_data) { const hasMaterial = !!(f.invoice_comment || f.evidence_comment || Object.values(f.material_comments || {}).some(c => c)); const _materials: any = {}; if (j.type_material_urls) { for (const t of Object.keys(j.type_material_urls)) { for (const k of Object.keys(j.type_material_urls[t])) { _materials[`${t}:${k}`] = { urls: j.type_material_urls[t][k], paths: (j.type_material_paths || {})[t]?.[k] || [] }; } } } else { for (const k of Object.keys(j.material_urls || {})) { _materials[k] = { urls: j.material_urls[k], paths: (j.material_paths || {})[k] || [] }; } } onReEdit({ ...j.form_data, _reEditStep: hasMaterial ? 1 : 2, _previousZip: f.filename, _materials }); } else toast('未找到原始数据', 'error'); } catch { toast('加载失败', 'error'); } }}><Icon name="edit" size={14} /> 重新编辑</button>)}
                <button className="btn btn-secondary btn-sm" onClick={() => navigate('/member/appeals')}><Icon name="send" size={14} /> 意见反馈</button>
              </div>
            </>)}
          </div>
        ))}</div>}
    </div>
  );
}
