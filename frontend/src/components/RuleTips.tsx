import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import Icon from './Icon';

export interface RuleTipItem {
  text: ReactNode;
  tone?: 'info' | 'warn';
  tag?: string;
}

interface Props {
  title?: string;
  /** 仅首次挂载生效，之后折叠状态完全由浏览器接管 */
  defaultOpen?: boolean;
  items: RuleTipItem[];
}

/** 提交规则提示卡（可折叠）：报销人端展示《报销人提交规则提示》的摘要条目。
 *  底部标注为社联特化声明——部署到其他部门/组织时，请按自身报销制度替换上面的规则文案，并修改本标注。 */
export default function RuleTips({ title = '提交规则提示', defaultOpen = false, items }: Props) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (defaultOpen && ref.current) ref.current.open = true;
  }, []);

  return (
    <details className="rule-tips" ref={ref}>
      <summary><Icon name="info" size={14} />{title}</summary>
      <ul className="rule-tips-list">
        {items.map((item, i) => (
          <li key={i} className={`rule-tips-item rule-tips-item--${item.tone || 'info'}`}>
            <Icon name={item.tone === 'warn' ? 'alert-triangle' : 'info'} size={14} />
            <span>{item.text}</span>
            {item.tag && <span className="badge badge-warn">{item.tag}</span>}
          </li>
        ))}
      </ul>
      <div className="rule-tips-note">本平台内置的报销规则为社联行政细则示例；其他部门/组织部署使用时，请按自身报销制度更新</div>
    </details>
  );
}
