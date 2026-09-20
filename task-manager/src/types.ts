export type TaskType = 'gold' | 'aws';

export type TaskStatus = 'open' | 'p1' | 'p2' | 'p3' | 'p4' | 'p5';

export interface Task {
  id: string;
  type: TaskType;
  question: string;
  answer: string;
  status: TaskStatus;
  nextReviewDate: string; // ISO date string
  createdAt: string;
  lastReviewedAt: string | null;
  starred?: boolean; // 星标：重点关注的题目
}

// Interval in days for each status level
export const REVIEW_INTERVALS: Record<TaskStatus, number> = {
  open: 0,
  p1: 3,
  p2: 5,
  p3: 30,
  p4: 90,
  p5: 180,
};

// ===== Chore types =====

export type ChoreStatus = 'pending' | 'scheduled' | 'overdue' | 'done' | 'skipped';

export type ChorePriority = 'high' | 'normal';

export interface Chore {
  id: string;
  title: string;
  description: string; // 自定义描述，默认空
  scheduledAt: string | null; // ISO datetime string, null = unscheduled
  durationMinutes: number; // default 30
  actualMinutes: number | null; // 实际用时，自动计算
  startedAt: string | null; // ISO datetime, 点开始时记录
  pausedElapsed: number; // 暂停时已累计的秒数
  subtasks: Subtask[]; // 子步骤：这里主要用来记录“分心念头”，默认一个 Initial
  activeSubtaskId: string | null; // 当前正在计时的子步骤 id
  frequencyDays: number; // repeat every n days, default 1
  priority: ChorePriority; // auto-set to 'high' if 5-10 min
  skippedDates: string[]; // ISO date strings of skipped occurrences
  status: ChoreStatus;
  createdAt: string;
  completedAt: string | null;
}

// ===== Meal types =====

export type MealTime = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export type MealStatus = 'planned' | 'done' | 'skipped';

export interface Meal {
  id: string;
  dish: string; // 菜名
  mealTime: MealTime; // 哪一餐
  scheduledDate: string; // ISO date string (YYYY-MM-DD)
  prepMinutes: number; // 准备时间，默认 30
  frequencyDays: number; // 每 n 天重复，默认 0 表示不重复
  skippedDates: string[]; // 跳过的日期
  status: MealStatus;
  createdAt: string;
  completedAt: string | null;
}

// ===== Work/Timesheet types =====

export type WorkCategory = 'coding' | 'meeting' | 'review' | 'planning' | 'ops' | 'other';

export type WorkStatus = 'planned' | 'in-progress' | 'done' | 'skipped';

// 一段工作时间：切换任务/暂停会产生一段。end 为 null 表示这段仍在进行中。
export interface WorkSegment {
  start: string; // ISO datetime
  end: string | null; // ISO datetime, null = 进行中
}

// 子步骤：一个工作任务由若干带计时的子步骤组成（默认第一个是 Initial）。
// 一个子步骤内部可以有多段（被暂停切断），耗时 = 名下所有段之和。
export interface Subtask {
  id: string;
  label: string;
  segments: WorkSegment[];
}

export interface WorkEntry {
  id: string;
  task: string; // 任务描述
  project: string; // 项目名称
  category: WorkCategory;
  scheduledDate: string; // ISO date string (YYYY-MM-DD)
  durationMinutes: number; // 预估时长
  actualMinutes: number | null; // 实际时长，自动计算
  startedAt: string | null; // ISO datetime, 点开始时记录（= 当前进行中那段的开始）
  pausedElapsed: number; // 已完成时间段累计的秒数（不含当前进行中那段）
  segments: WorkSegment[]; // 所有工作时间段（碎片），保留每段起止用于回看注意力流动（旧字段，保留兼容）
  subtasks: Subtask[]; // 子步骤列表（默认含一个 Initial）
  activeSubtaskId: string | null; // 当前正在计时的子步骤 id，null = 未在计
  frequencyDays: number; // 重复频率，0=不重复
  skippedDates: string[];
  status: WorkStatus;
  createdAt: string;
  completedAt: string | null;
}

// ===== Family Project types =====

export type MilestoneStatus = 'todo' | 'in-progress' | 'done';

export interface Milestone {
  id: string;
  title: string;
  status: MilestoneStatus;
  dueDate: string | null; // ISO date string
  completedAt: string | null;
  createdAt: string;
}

export type StoryStatus = 'active' | 'done' | 'on-hold';

export interface Story {
  id: string;
  title: string;
  description: string;
  status: StoryStatus;
  milestones: Milestone[];
  createdAt: string;
  completedAt: string | null;
  // 打卡相关（可选，向后兼容旧数据）
  frequencyDays?: number; // 打卡频率：每 N 天打卡一次，默认 1
  scheduledAt?: string | null; // 下次应打卡时间 ISO datetime
  checkins?: string[]; // 历史打卡时间列表 ISO datetime
  lastCheckinAt?: string | null; // 最近一次打卡时间
}

// ===== Listening Practice types =====

export type ListenStatus = 'open' | 'p1' | 'p2' | 'p3' | 'p4' | 'p5';

export interface ListenItem {
  id: string;
  text: string; // 要听的句子
  translation: string; // 中文翻译（可选提示）
  lang: string; // 语音语言 e.g. 'en-US', 'ja-JP'
  status: ListenStatus;
  nextReviewDate: string;
  createdAt: string;
  lastReviewedAt: string | null;
}

export const LISTEN_INTERVALS: Record<ListenStatus, number> = {
  open: 0,
  p1: 1,
  p2: 3,
  p3: 7,
  p4: 14,
  p5: 30,
};
