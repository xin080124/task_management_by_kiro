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
  scheduledAt: string | null; // ISO datetime string, null = unscheduled
  durationMinutes: number; // default 30
  frequencyDays: number; // repeat every n days, default 1
  priority: ChorePriority; // auto-set to 'high' if 5-10 min
  skippedDates: string[]; // ISO date strings of skipped occurrences
  status: ChoreStatus;
  createdAt: string;
  completedAt: string | null;
}
