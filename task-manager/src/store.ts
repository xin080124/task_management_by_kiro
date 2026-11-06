import type { Task } from './types';
import { MAX_LEVEL } from './types';

const STORAGE_KEY = 'task-manager-tasks';

// 把一条可能是「老格式」的记录迁移到新模型：
// 老格式 status 是 open/p1../p5，没有 level 字段。
//   - 旧 'p1'..'p5' → level 1..5，status 变 waiting（熟练度保留在 level）
//   - 旧 'open'     → level 0，status open
// 新格式（已有数字 level，status 为 open/waiting）则原样保留。
function migrateTask(raw: Task & { status: string }): Task {
  let level: number;
  let status: Task['status'];

  if (typeof (raw as { level?: unknown }).level === 'number') {
    // 已是新格式
    level = Math.max(0, Math.min((raw as { level: number }).level, MAX_LEVEL));
    status = raw.status === 'waiting' ? 'waiting' : 'open';
  } else if (/^p[1-5]$/.test(raw.status)) {
    // 老格式 p1..p5
    level = parseInt(raw.status.slice(1), 10);
    status = 'waiting';
  } else {
    // 老格式 open（或任何未知值）
    level = 0;
    status = 'open';
  }

  return {
    ...raw,
    level,
    status,
    starred: raw.starred ?? false,
  } as Task;
}

export function loadTasks(): Task[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    const tasks = JSON.parse(data) as (Task & { status: string })[];
    return tasks.map(migrateTask);
  } catch {
    return [];
  }
}

export function saveTasks(tasks: Task[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// CSV export
export function exportToCsv(tasks: Task[]): string {
  const headers = ['id', 'type', 'question', 'answer', 'status', 'level', 'nextReviewDate', 'createdAt', 'lastReviewedAt', 'starred'];
  const rows = tasks.map(task =>
    headers.map(h => {
      const value = task[h as keyof Task] ?? '';
      // Escape quotes and wrap in quotes if contains comma/newline/quote
      const str = String(value);
      if (str.includes(',') || str.includes('\n') || str.includes('"')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    }).join(',')
  );
  return [headers.join(','), ...rows].join('\n');
}

// CSV import
export function importFromCsv(csvContent: string): Task[] {
  const lines = parseCsvLines(csvContent);
  if (lines.length < 2) return [];

  const headers = lines[0];
  const tasks: Task[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i];
    if (values.length < headers.length) continue;

    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = values[idx] || '';
    });

    // 兼容老 CSV：status 可能是 p1..p5（没有 level 列）
    let level: number;
    let status: Task['status'];
    if (obj.level !== '' && obj.level !== undefined) {
      level = Math.max(0, Math.min(parseInt(obj.level, 10) || 0, MAX_LEVEL));
      status = obj.status === 'waiting' ? 'waiting' : 'open';
    } else if (/^p[1-5]$/.test(obj.status)) {
      level = parseInt(obj.status.slice(1), 10);
      status = 'waiting';
    } else {
      level = 0;
      status = 'open';
    }

    tasks.push({
      id: obj.id || generateId(),
      type: (obj.type as Task['type']) || 'gold',
      question: obj.question || '',
      answer: obj.answer || '',
      status,
      level,
      nextReviewDate: obj.nextReviewDate || new Date().toISOString(),
      createdAt: obj.createdAt || new Date().toISOString(),
      lastReviewedAt: obj.lastReviewedAt || null,
      starred: obj.starred === 'true',
    });
  }

  return tasks;
}

function parseCsvLines(csv: string): string[][] {
  const result: string[][] = [];
  let current: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i];

    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < csv.length && csv[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        current.push(field);
        field = '';
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && i + 1 < csv.length && csv[i + 1] === '\n') {
          i++;
        }
        current.push(field);
        field = '';
        if (current.some(f => f.length > 0)) {
          result.push(current);
        }
        current = [];
      } else {
        field += ch;
      }
    }
  }

  // Last field
  current.push(field);
  if (current.some(f => f.length > 0)) {
    result.push(current);
  }

  return result;
}
