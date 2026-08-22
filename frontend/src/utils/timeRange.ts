/** 时间范围预设筛选：按筛选那一刻的时间往前推天数（基于提交时间 modified）。 */

export const TIME_RANGES = [
  { value: 'all', label: '所有历史' },
  { value: '15', label: '15天内' },
  { value: '30', label: '一个月内' },
  { value: '90', label: '三个月内' },
  { value: '180', label: '六个月内' },
  { value: '365', label: '一年内' },
];

export function inTimeRange(value: string, iso: string): boolean {
  if (value === 'all' || !iso) return true;
  const days = parseInt(value, 10);
  return new Date(iso).getTime() >= Date.now() - days * 86400000;
}
