import { useState } from 'react';
import type { OrgInfo } from '../config/organizations';

interface Props {
  value: string;
  onChange: (v: string) => void;
  orgs: OrgInfo[];
  placeholder?: string;
  emptyText?: string;
}

/**
 * 社团名称自动补全输入框：
 * 输入时从名单弹出候选（中文名/英文名/别名都匹配），点选回填规范名；
 * 也支持自由输入（不在名单时按模糊匹配过滤）。
 * 防坑：候选行 onMouseDown preventDefault 阻止 input 先失焦，避免"点击候选失效"。
 */
export default function OrgAutocomplete({ value, onChange, orgs, placeholder, emptyText }: Props) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);

  const q = value.trim().toLowerCase();
  const matches = orgs.filter(o =>
    [o.name, ...(o.aliases || [])].some(n => n.toLowerCase().includes(q))
  );

  const select = (name: string) => {
    onChange(name);
    setOpen(false);
    setHighlight(-1);
  };

  return (
    <div className="org-search" onBlur={() => setOpen(false)}>
      <input
        type="text"
        className="form-input org-input"
        value={value}
        placeholder={placeholder}
        onChange={e => { onChange(e.target.value); setOpen(true); setHighlight(-1); }}
        onFocus={() => setOpen(true)}
        onKeyDown={e => {
          if (e.key === 'Escape') setOpen(false);
          else if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHighlight(h => Math.min(h + 1, matches.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(h => Math.max(h - 1, -1)); }
          else if (e.key === 'Enter' && highlight >= 0 && matches[highlight]) select(matches[highlight].name);
        }}
      />
      {open && (
        <div className="org-dropdown" onMouseDown={e => e.preventDefault()}>
          {matches.length === 0 ? (
            <div className="org-dropdown-empty">{emptyText ?? '未在名单中，仍按模糊匹配过滤'}</div>
          ) : matches.map((o, i) => (
            <div
              key={o.name}
              className={'org-dropdown-item' + (i === highlight ? ' is-active' : '')}
              onMouseEnter={() => setHighlight(i)}
              onClick={() => select(o.name)}
            >
              {o.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
