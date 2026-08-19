import { useNavigate } from 'react-router-dom';
import type { CSSProperties } from 'react';
import { OTHER_TYPES, TYPE_CONFIGS } from '../config/materials';
import type { ReimbursementType } from '../types';
import Icon from '../components/Icon';

interface Props {
  onEnterType: (type: ReimbursementType) => void;
}

export default function TypeSelectPage({ onEnterType }: Props) {
  const navigate = useNavigate();

  return (
    <div>
      <button className="btn btn-ghost btn-sm" onClick={() => navigate('/member')} style={{ marginBottom: 16 }}><Icon name="arrow-left" size={14} /> 返回首页</button>
      <div className="page-head">
        <h1>其他类报销</h1>
        <p className="page-head-sub">请选择与你的材料相符的报销类型</p>
      </div>

      <div className="type-grid">
        {OTHER_TYPES.map(t => {
          const c = TYPE_CONFIGS[t];
          return (
            <div key={t} className="type-card" style={{ '--accent': c.color } as CSSProperties} onClick={() => onEnterType(t)}>
              <div className="type-card-icon"><Icon name={c.icon} size={20} /></div>
              <h3>{c.label}</h3>
              <p>{c.description}</p>
              <div><span className="badge badge-neutral">已开放</span></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
