import { Fragment } from 'react';
import { Step } from '../types';
import Icon from './Icon';

interface Props {
  current: Step;
}

const steps = [
  { num: 1 as Step, label: '上传材料' },
  { num: 2 as Step, label: '填写报销表' },
  { num: 3 as Step, label: '确认提交' },
];

export default function StepIndicator({ current }: Props) {
  return (
    <div className="step-wrap">
      <div className="step-indicator">
        {steps.map((s, i) => (
          <Fragment key={s.num}>
            <div
              className={`step-item ${
                current === s.num ? 'active' : current > s.num ? 'done' : ''
              }`}
            >
              <span className="step-dot">
                {current > s.num ? <Icon name="check" size={14} /> : s.num}
              </span>
              <span>{s.label}</span>
            </div>
            {i < steps.length - 1 && (
              <div className={`step-line ${current > s.num ? 'done' : ''}`} />
            )}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
