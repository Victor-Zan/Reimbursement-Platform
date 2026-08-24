/**
 * 学生社团名单（2026-2027 学年）
 * 来源：2026-2027香港中文大学（深圳）学生社团名单.xlsx（项目根目录）
 * 维护：直接编辑本文件即可；name 为规范名称（点选后填入、列表展示），
 *       aliases 为英文名/别名（参与匹配，不改变展示名）。
 */
export interface OrgInfo {
  /** 规范名称（点选后填入、列表展示） */
  name: string;
  /** 别名/英文名，匹配候选与过滤时一并生效 */
  aliases?: string[];
}

/** 前端维护的社团名单 */
export const ORGANIZATIONS: OrgInfo[] = [
  { name: 'CP 食研社', aliases: ['Cooking Pioneer'] },
  { name: '尚饮社', aliases: ['Tea & Bartending Club'] },
  { name: '淇奥手创社', aliases: ['iCraft Club'] },
  { name: '锦灰社', aliases: ['Jinhui Club'] },
  { name: '颜究所', aliases: ['The Mask Studio'] },
  { name: '唯在设计', aliases: ['Wesign'] },
  { name: '“沉浸人生”推理协会', aliases: ['Life in Mystery'] },
  { name: '桌游社', aliases: ['Board Game Club'] },
  { name: 'PIC摄影社', aliases: ['P.I.C. Photography Association（P.I.C.)'] },
  { name: '校园媒体⼈', aliases: ['Campus Media Agency (CMA)'] },
  { name: '电影俱乐部', aliases: ['Film Club'] },
  { name: '趣旅行', aliases: ['Darlingo'] },
  { name: 'English Animator', aliases: ['English Animator'] },
  { name: '粤语社', aliases: ['Cantonese Club'] },
  { name: '机智协会', aliases: ['Electronic Intelligence Association'] },
  { name: '数独社', aliases: ['Sudoku Club'] },
  { name: '天文社', aliases: ['Astronomy Society'] },
  { name: '交通社', aliases: ['Transport Fans Club'] },
  { name: '模拟联合国协会', aliases: ['The Model United Nations of CUHKSZ(MUN)'] },
  { name: '万寿模型社', aliases: ['Bantako Model Club'] },
  { name: '睡眠社', aliases: ['Sleep Matters Club'] },
  { name: '醉红学', aliases: ['Redology Club'] },
  { name: '人文历史社', aliases: ['Humanities and History Club'] },
  { name: 'TEDxCUHKSZ', aliases: ['TEDxCUHKSZ'] },
  { name: '客属联谊会', aliases: ['Hakka Association'] },
  { name: '奇点科幻社', aliases: ['Singularity Science Fiction'] },
  { name: '武联社', aliases: ['Martial Arts Union'] },
  { name: '羽毛球社', aliases: ['Badminton Club'] },
  { name: '跑步社', aliases: ['Running Club'] },
  { name: '乒乓球社', aliases: ['Table Tennis Club'] },
  { name: '极限飞盘协会', aliases: ['Ultimate Frisbee Organization'] },
  { name: 'Lg足球社', aliases: ['Lg Football Club'] },
  { name: '健身社', aliases: ['Fitness Club'] },
  { name: '排球社', aliases: ['Volleyball Club'] },
  { name: 'ACE网球社', aliases: ['ACE Tennis Club'] },
  { name: '电竞社', aliases: ['E-sport Club'] },
  { name: '击剑社', aliases: ['The First Sword Fencing Club'] },
  { name: '台球社', aliases: ['Billiards Club'] },
  { name: '游泳社', aliases: ['Swimming Club'] },
  { name: '酷滑社', aliases: ['SkateCool Club'] },
  { name: '高尔夫社', aliases: ['Golf Association'] },
  { name: 'V8橄榄球俱乐部', aliases: ['V8 Football Club'] },
  { name: '2Tired骑行社', aliases: ['2Tired Cycling Club'] },
  { name: '攀岩社', aliases: ['Climbing Club'] },
  { name: '棒球社', aliases: ['Baseball Club'] },
  { name: '手极社', aliases: ['Hand Extreme Sports Club'] },
  { name: '弈秋棋社', aliases: ['Chess Club'] },
  { name: '匹克球社', aliases: ['Pickleball Club'] },
  { name: '桥牌社', aliases: ['Bridge Club'] },
  { name: '魅影戏剧社', aliases: ['Phantom Club'] },
  { name: '精舞团', aliases: ['Max Dancing Club'] },
  { name: '凤凰漫研社', aliases: ['Phoenix ACG Club'] },
  { name: '聚乐部', aliases: ['Music Union'] },
  { name: '南露书法社', aliases: ['Nanlu Calligraphy Club'] },
  { name: '鹿鸣配音社', aliases: ['The Voice of Deer Dubbing Club(VDDC)'] },
  { name: '电音社', aliases: ['Electronic  Music Club'] },
  { name: '自说自话脱口秀社', aliases: ['SOMIC Stand-up Comedy Club'] },
  { name: '涤纶诗社', aliases: ['Dylan Poetry Club'] },
  { name: '戏曲社', aliases: ['Chinese Opera Association'] },
  { name: '掬月社', aliases: ['Jvyue Club'] },
  { name: '润泽书社', aliases: ['Runze Book Society'] },
  { name: 'Encore音乐剧社', aliases: ['Encore Musical Club'] },
  { name: 'HIPHOP音乐社', aliases: ['HIPHOP Club'] },
];
