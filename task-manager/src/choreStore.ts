import type { Chore } from './types';

const STORAGE_KEY = 'task-manager-chores';

export function loadChores(): Chore[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    const chores: Chore[] = JSON.parse(data);
    // Migrate old data missing new fields
    return chores.map(c => ({
      ...c,
      frequencyDays: c.frequencyDays ?? 1,
      skippedDates: c.skippedDates ?? [],
      priority: c.priority ?? ((c.durationMinutes >= 5 && c.durationMinutes <= 10) ? 'high' : 'normal'),
    }));
  } catch {
    return [];
  }
}

export function saveChores(chores: Chore[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(chores));
}

export function generateChoreId(): string {
  return 'ch-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// CSV export for chores
export function exportChoresToCsv(chores: Chore[]): string {
  const headers = ['id', 'title', 'scheduledAt', 'durationMinutes', 'frequencyDays', 'priority', 'skippedDates', 'status', 'createdAt', 'completedAt'];
  const rows = chores.map(chore =>
    headers.map(h => {
      let value: string | number | string[] | null = chore[h as keyof Chore] ?? '';
      // Join array fields with semicolons
      if (Array.isArray(value)) {
        value = value.join(';');
      }
      const str = String(value);
      if (str.includes(',') || str.includes('\n') || str.includes('"')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    }).join(',')
  );
  return [headers.join(','), ...rows].join('\n');
}

// CSV import for chores
export function importChoresFromCsv(csvContent: string): Chore[] {
  const lines = parseCsvLines(csvContent);
  if (lines.length < 2) return [];

  const headers = lines[0];
  const chores: Chore[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i];
    if (values.length < headers.length) continue;

    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = values[idx] || '';
    });

    const duration = parseInt(obj.durationMinutes) || 30;
    chores.push({
      id: obj.id || generateChoreId(),
      title: obj.title || '',
      scheduledAt: obj.scheduledAt || null,
      durationMinutes: duration,
      frequencyDays: parseInt(obj.frequencyDays) || 1,
      priority: (obj.priority as Chore['priority']) || (duration >= 5 && duration <= 10 ? 'high' : 'normal'),
      skippedDates: obj.skippedDates ? obj.skippedDates.split(';').filter(Boolean) : [],
      status: (obj.status as Chore['status']) || 'pending',
      createdAt: obj.createdAt || new Date().toISOString(),
      completedAt: obj.completedAt || null,
    });
  }

  return chores;
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

  current.push(field);
  if (current.some(f => f.length > 0)) {
    result.push(current);
  }

  return result;
}
