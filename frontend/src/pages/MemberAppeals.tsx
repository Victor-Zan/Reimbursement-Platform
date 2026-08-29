import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { typesFrom } from '../config/materials';
import TypeBadges from '../components/TypeBadges';
import Icon from '../components/Icon';
import { useFeedback } from '../components/Feedback';

interface Props { user: any; }
interface AppealItem { id: number; submission_zip: string; reimb_type?: string; reimb_types?: string[]; reason: string; status: string; created_at: string; appeal_type?: string; proof_url?: string; }
interface SubmissionFile { filename: string; size: number; modified: string; org_name?: string; activity_name?: string; reimb_type?: string; reimb_types?: string[]; status?: string; reimburse_progress?: string; finance_officer?: string; alipay_account?: string; total_amount?: string; }

/** 报销人端：意见反馈（申诉两类申请——被打回的、或已标记「已报销」但未收到打款的，可多选 + 共同理由）。 */
export default function MemberAppeals({ user }: Props) {
  const navigate = useNavigate();
  const { toast } = useFeedback();
  const [params] = useSearchParams();
  // 从历史记录「未到账？申诉」入口跳来时预勾选对应提交
  const preZip = params.get('unreceived');
  const preApplied = useRef(false);
  const [appeals, setAppeals] = useState<AppealItem[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionFile[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    let fetchedSubs: SubmissionFile[] = [];
    try {
      const [ar, sr] = await Promise.all([
        fetch(`/api/v1/appeals?user_email=${encodeURIComponent(user?.email || '')}`).then(r => r.json()),
        fetch(`/api/v1/submissions?user_email=${encodeURIComponent(user?.email || '')}`).then(r => r.json()),
      ]);
      if (ar.success) setAppeals(ar.appeals);
      if (sr.success) { setSubmissions(sr.submissions); fetchedSubs = sr.submissions; }
    } catch {}
    setLoading(false);
    if (!preApplied.current && preZip) {
      preApplied.current = true;
      setSelected(p => p.includes(preZip) ? p : [...p, preZip]);
      // 预勾选的是「已报销未到账」项时同样弹出核对提示（数据刚拉取，直接基于接口结果判断）
      if (fetchedSubs.some(s => s.filename === preZip && s.status === 'approved' && s.reimburse_progress === 'reimbursed')) remindCheck();
    }
  };
  useEffect(() => { load(); }, []);

  // 已有待处理反馈的提交不可重复勾选（两类申诉共用同一限制）
  const pendingZips = new Set(appeals.filter(a => a.status === 'pending').map(a => a.submission_zip));
  const rejected = submissions.filter(s => s.status === 'rejected');
  const unreceived = submissions.filter(s => s.status === 'approved' && s.reimburse_progress === 'reimbursed');

  // 未到账申诉核对提示：检测到未到账项被勾选（含从历史页跳转的自动预勾选）时弹出一次，
  // 提醒核对财务负责人 / 支付宝账号 / 总金额；4 秒后自动关闭，也可手动关闭
  const [showRemind, setShowRemind] = useState(false);
  const notifyShown = useRef(false);
  const remindCheck = () => {
    if (notifyShown.current) return;
    notifyShown.current = true;
    setShowRemind(true);
  };
  // 核对提示 4 秒后自动关闭
  useEffect(() => {
    if (!showRemind) return;
    const t = setTimeout(() => setShowRemind(false), 4000);
    return () => clearTimeout(t);
  }, [showRemind]);

  const toggleSelect = (filename: string, checked: boolean) => {
    if (checked && unreceived.some(s => s.filename === filename)) remindCheck();
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

  // 申诉结果徽章：按申诉类型显示不同文案（打回申诉=裁定报销结果；未到账申诉=核实打款情况）
  const statusBadge = (a: AppealItem) => {
    if (a.appeal_type === 'unreceived') {
      return a.status === 'approved' ? <span className="badge badge-gold">确认未到账，重新处理</span>
        : a.status === 'rejected' ? <span className="badge badge-info">已核实到账</span>
        : <span className="badge badge-warn">待处理</span>;
    }
    return a.status === 'approved' ? <span className="badge badge-ok">已通过</span> : a.status === 'rejected' ? <span className="badge badge-error">已打回</span> : <span className="badge badge-warn">待处理</span>;
  };

  return (
    <div>
      <button className="btn btn-ghost btn-sm" onClick={() => navigate('/member')} style={{ marginBottom: 16 }}><Icon name="arrow-left" size={14} /> 返回首页</button>
      <div className="page-head">
        <h1><Icon name="send" size={22} /> 意见反馈</h1>
        <p className="page-head-sub">对审核员的打回结果不认可，或已标记「已报销」但未收到打款时，勾选对应申请并填写原因提交申诉，由管理员复核处理</p>
      </div>

      {/* 我的反馈历史 */}
      <div className="card">
        <h3 className="section-title">我的反馈</h3>
        {loading ? <div className="loading"><span className="spinner" /> 加载中...</div>
         : appeals.length === 0 ? <div className="empty"><div className="empty-icon"><Icon name="send" size={20} /></div>暂无反馈记录</div>
         : <div className="submission-list">{appeals.map(a => (
            <div key={a.id} className="submission-item">
              <div className="draft-info">
                <strong><Icon name="archive" size={16} /> {a.submission_zip}
                  {a.appeal_type === 'unreceived' && <span className="badge badge-gold" style={{ marginLeft: 6 }}>未到账申诉</span>}
                </strong>
                <span className="draft-meta">{a.reason} · {a.created_at.slice(0, 19).replace('T', ' ')}</span>
              </div>
              <div className="submission-type-col"><TypeBadges types={typesFrom(a)} /></div>
              <div className="submission-right">
                {statusBadge(a)}
                {a.proof_url && <a href={a.proof_url} target="_blank" rel="noreferrer" className="file-link" style={{ marginLeft: 8 }}><Icon name="image" size={14} /> 查看打款证明</a>}
              </div>
            </div>
          ))}</div>}
      </div>

      {/* 提交新反馈 */}
      <div className="card">
        <h3 className="section-title">提交意见反馈</h3>
        <p className="card-sub" style={{ marginBottom: 12 }}>可申诉两类申请：被打回的、或已标记「已报销」但未收到打款的；每条申请同一时间只能有一条待处理反馈</p>

        <h4 className="section-title" style={{ fontSize: 14, margin: '12px 0 8px' }}><Icon name="rotate-ccw" size={14} /> ① 打回申诉</h4>
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

        {/* ② 分区标题行；核对提示气泡嵌在标题右侧（对话气泡样式，不遮挡列表内容） */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '18px 0 8px' }}>
          <h4 className="section-title" style={{ fontSize: 14, margin: 0, flexShrink: 0 }}><Icon name="credit-card" size={14} /> ② 已报销未到账申诉</h4>
          {showRemind && (
            <div className="hint-bubble" style={{ position: 'static', width: 300, flexShrink: 0, marginLeft: 'auto' }}>
              <div className="hint-bubble-head">
                <Icon name="info" size={15} /> 核对提示
                <button className="btn btn-ghost btn-sm" onClick={() => setShowRemind(false)} title="关闭提示"><Icon name="x" size={12} /></button>
              </div>
              <p>提交未到账申诉前，请核对勾选项的财务负责人、支付宝账号、总金额是否正确</p>
            </div>
          )}
        </div>
        {unreceived.length === 0 ? <div className="empty"><div className="empty-icon"><Icon name="credit-card" size={20} /></div>当前没有已标记「已报销」的申请</div>
         : <div className="appeal-check-list">
            {unreceived.map(s => {
              const blocked = pendingZips.has(s.filename);
              return (
                <label key={s.filename} className={`form-check${blocked ? ' is-disabled' : ''}`}>
                  <input type="checkbox" className="form-check-input"
                         checked={selected.includes(s.filename)}
                         disabled={blocked}
                         onChange={e => toggleSelect(s.filename, e.target.checked)} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span className="form-check-label">{s.org_name
                      ? `${s.org_name}-${s.activity_name ? `${s.activity_name}-` : ''}${s.modified.slice(0, 10)}-报销申请`
                      : s.filename}</span>
                    {/* 未到账申诉核实信息：财务负责人 / 支付宝账号 / 报销总金额（来自报销单） */}
                    <div className="draft-meta" style={{ fontSize: 12, marginTop: 2 }}>财务负责人：{s.finance_officer || '—'} · 支付宝：{s.alipay_account || '—'} · 总金额：¥{Number(s.total_amount || 0).toFixed(2)}</div>
                  </div>
                  <TypeBadges types={typesFrom(s)} />
                  {blocked && <span className="badge badge-purple">反馈处理中</span>}
                </label>
              );
            })}
          </div>}

        <div className="form-group">
          <label className="form-label">反馈原因</label>
          <textarea className="form-input" rows={3} value={reason} onChange={e => setReason(e.target.value)} placeholder="请说明为什么不认可此次打回 / 为何未收到打款..." />
        </div>
        <button className="btn btn-primary" disabled={submitting || !selected.length || !reason.trim()} onClick={handleSubmit}>
          {submitting ? <><span className="spinner" /> 提交中...</> : <><Icon name="send" size={15} /> 提交反馈</>}
        </button>
      </div>
    </div>
  );
}
