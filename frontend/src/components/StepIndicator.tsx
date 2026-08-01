import { Step } from '../types';

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
    <div className="step-indicator">
      {steps.map((s, i) => (
        <div key={s.num} style={{ display: 'flex', alignItems: 'center' }}>
          <div
            className={`step-item ${
              current === s.num ? 'active' : current > s.num ? 'done' : ''
            }`}
          >
            <span className="step-dot">
              {current > s.num ? '✓' : s.num}
            </span>
            <span>{s.label}</span>
          </div>
          {i < steps.length - 1 && (
            <div className={`step-line ${current > s.num ? 'done' : ''}`} />
          )}
        </div>
      ))}
    </div>
  );
}
