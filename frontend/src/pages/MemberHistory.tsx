import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { CSSProperties } from 'react';
import { typesFrom, typeColor } from '../config/materials';
import { TIME_RANGES, inTimeRange } from '../utils/timeRange';
import TypeBadges from '../components/TypeBadges';
import SubmissionDetailModal from '../components/SubmissionDetailModal';
import Icon from '../components/Icon';

interface Props { user: any; }
interface SubmissionFile { filename: string; size: number; modified: string; org_name?: string; activity_name?: string; reimb_type?: string; reimb_types?: string[]; status?: string; reimburse_progress?: string; }

/** 报销人端：查看历史提交（独立页面，替代原首页弹窗，全宽展示避免排版拥挤）。 */
export default function MemberHistory({ user }: Props) {
  const navigate = useNavigate();
  const [submissions, setSubmissions] = useState<SubmissionFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [timeRange, setTimeRange] = useState('all');
  // 点击条目打开详情弹窗（与审核员端历史审核一致）
  const [selected, setSelected] = useState<SubmissionFile | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`/api/v1/submissions?user_email=${encodeURIComponent(user?.email || '')}`);
        const j = await r.json();
        if (j.success) setSubmissions(j.submissions);
      } catch {}
      setLoading(false);
    })();
  }, [user?.email]);

  /** 条目标题：与审核端一致的「社团名-活动名-日期-报销申请」（无社团名回退文件名） */
  const titleOf = (s: SubmissionFile) => s.org_name
    ? `${s.org_name}-${s.activity_name ? `${s.activity_name}-` : ''}${s.modified.slice(0, 10)}-报销申请`
    : s.filename;

  // 搜索匹配标题或原始文件名；时间筛选沿用弹窗时期规则（按 modified）
  const filtered = submissions.filter(s => {
    const q = search.trim();
    if (q && !titleOf(s).includes(q) && !s.filename.includes(q)) return false;
    if (!inTimeRange(timeRange, s.modified)) return false;
    return true;
  });

  const formatSize = (b: number) => b < 1024*1024 ? `${(b/1024).toFixed(1)} KB` : `${(b/(1024*1024)).toFixed(1)} MB`;
  const formatTime = (iso: string) => iso ? iso.replace('T', ' ').slice(0, 19) : '';
  const statusBadge = (s: string) => s === 'approved' ? <span className="badge badge-ok">已通过</span> : s === 'rejected' ? <span className="badge badge-error">已打回</span> : s === 'resubmitted' ? <span className="badge badge-purple">重审</span> : <span className="badge badge-warn">待审核</span>;

  return (
    <div>
      <div className="page-head">
        <h1><Icon name="folder" size={22} /> 查看历史提交</h1>
        <p className="page-head-sub">我的报销提交记录，已通过的申请可直接下载 ZIP，并会显示报销进度状态</p>
      </div>
      <button className="btn btn-ghost btn-sm" onClick={() => navigate('/member')} style={{ marginBottom: 16 }}><Icon name="arrow-left" size={14} /> 返回首页</button>

      <div className="filter-bar">
        <input className="form-input" placeholder="搜索标题或文件名..." value={search} onChange={e => setSearch(e.target.value)} />
        <select className="form-input filter-status" value={timeRange} onChange={e => setTimeRange(e.target.value)} title="按时间范围筛选">
          {TIME_RANGES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {loading ? <div className="loading"><span className="spinner" /> 加载中...</div>
       : filtered.length === 0 ? <div className="empty"><div className="empty-icon"><Icon name="folder" size={20} /></div>暂无提交记录</div>
       : <div className="submission-list">{filtered.map((s, i) => (
          <div key={i}
               className={`submission-item ${selected?.filename === s.filename ? 'is-selected' : 'accent-left'}`}
               style={{ '--accent': typeColor(typesFrom(s)[0]) } as CSSProperties}
               onClick={() => setSelected(s)}>
            <div className="draft-info">
              <strong><Icon name="archive" size={16} /> {titleOf(s)}</strong>
              <span className="draft-meta">{formatSize(s.size)} · {formatTime(s.modified)}</span>
            </div>
            <div className="submission-progress-col">
              {s.status === 'approved' && (s.reimburse_progress === 'reimbursed' ? (
                <>
                  <span className="badge badge-gold">已报销</span>
                  <button className="btn btn-ghost btn-sm" style={{ marginTop: 6 }} title="标记已报销但未收到打款时申诉"
                          onClick={e => { e.stopPropagation(); navigate(`/member/appeals?unreceived=${encodeURIComponent(s.filename)}`); }}>
                    <Icon name="alert-triangle" size={13} /> 未到账？申诉
                  </button>
                </>
              ) : (
                <span className="badge badge-info">报销流程中</span>
              ))}
            </div>
            <div className="submission-type-col"><TypeBadges types={typesFrom(s)} /></div>
            <div className="submission-right">
              {statusBadge(s.status || '')}
              <a href={`/api/v1/submissions/download/${encodeURIComponent(s.filename)}`} download className="btn btn-secondary btn-sm" style={{ textDecoration: 'none' }} onClick={e => e.stopPropagation()}><Icon name="download" size={14} /> 下载</a>
            </div>
          </div>
        ))}</div>}

      {selected && (
        <SubmissionDetailModal
          submission={selected}
          title={titleOf(selected)}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
