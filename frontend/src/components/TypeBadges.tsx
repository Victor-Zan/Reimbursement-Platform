import { typeLabel, typeColor } from '../config/materials';
import type { ReimbursementType } from '../types';

interface Props {
  types: (string | ReimbursementType)[];
  small?: boolean;
}

/** 报销类型徽章组（多类型提交显示多个徽章）。 */
export default function TypeBadges({ types, small }: Props) {
  return (
    <span className="type-badges" role="status" aria-atomic="true">
      {types.map(t => (
        <span key={t} className="badge badge-neutral">
          <span className="dot" style={{ background: typeColor(t) }} />
          {typeLabel(t)}
        </span>
      ))}
    </span>
  );
}
