import type { Task } from './types';

const STORAGE_KEY = 'task-manager-tasks';

export function loadTasks(): Task[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    return JSON.parse(data);
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
  const headers = ['id', 'type', 'question', 'answer', 'status', 'nextReviewDate', 'createdAt', 'lastReviewedAt'];
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

    tasks.push({
      id: obj.id || generateId(),
      type: (obj.type as Task['type']) || 'gold',
      question: obj.question || '',
      answer: obj.answer || '',
      status: (obj.status as Task['status']) || 'open',
      nextReviewDate: obj.nextReviewDate || new Date().toISOString(),
      createdAt: obj.createdAt || new Date().toISOString(),
      lastReviewedAt: obj.lastReviewedAt || null,
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
