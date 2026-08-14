import { useNavigate } from 'react-router-dom';
import { OTHER_TYPES, TYPE_CONFIGS } from '../config/materials';
import type { ReimbursementType } from '../types';

interface Props {
  onEnterType: (type: ReimbursementType) => void;
}

export default function TypeSelectPage({ onEnterType }: Props) {
  const navigate = useNavigate();

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '24px 16px' }}>
      <button className="btn btn-secondary" onClick={() => navigate('/member')} style={{ marginBottom: 16 }}>← 返回首页</button>
      <h2 style={{ marginBottom: 8 }}>其他类报销</h2>
      <p style={{ color: 'var(--gray-500)', fontSize: 13, marginBottom: 20 }}>请选择与你的材料相符的报销类型</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {OTHER_TYPES.map(t => {
          const c = TYPE_CONFIGS[t];
          return (
            <div key={t} className="home-card" onClick={() => onEnterType(t)}
                 style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 20, borderLeft: `4px solid ${c.color}`, cursor: 'pointer' }}>
              <div className="home-card-icon" style={{ fontSize: 32 }}>{c.icon}</div>
              <div className="home-card-content" style={{ flex: 1 }}>
                <h2 style={{ marginBottom: 4 }}>{c.label}</h2>
                <p style={{ fontSize: 13, color: 'var(--gray-600)', margin: 0 }}>{c.description}</p>
              </div>
              <span className="home-card-badge" style={{ background: c.color, color: '#fff' }}>已开放</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
