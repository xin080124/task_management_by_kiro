import type { WorkEntry } from './types';

const STORAGE_KEY = 'task-manager-work';

export function loadWorkEntries(): WorkEntry[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    const entries: WorkEntry[] = JSON.parse(data);
    return entries.map(e => ({
      ...e,
      project: e.project ?? '',
      startedAt: e.startedAt ?? null,
      frequencyDays: e.frequencyDays ?? 0,
      skippedDates: e.skippedDates ?? [],
      actualMinutes: e.actualMinutes ?? null,
    }));
  } catch {
    return [];
  }
}

export function saveWorkEntries(entries: WorkEntry[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

export function generateWorkId(): string {
  return 'wk-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// CSV export
export function exportWorkToCsv(entries: WorkEntry[]): string {
  const headers = ['id', 'task', 'project', 'category', 'scheduledDate', 'durationMinutes', 'actualMinutes', 'startedAt', 'frequencyDays', 'skippedDates', 'status', 'createdAt', 'completedAt'];
  const rows = entries.map(entry =>
    headers.map(h => {
      let value: string | number | string[] | null = entry[h as keyof WorkEntry] ?? '';
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

// CSV import
export function importWorkFromCsv(csvContent: string): WorkEntry[] {
  const lines = parseCsvLines(csvContent);
  if (lines.length < 2) return [];

  const headers = lines[0];
  const entries: WorkEntry[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i];
    if (values.length < headers.length) continue;

    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = values[idx] || '';
    });

    entries.push({
      id: obj.id || generateWorkId(),
      task: obj.task || '',
      project: obj.project || '',
      category: (obj.category as WorkEntry['category']) || 'other',
      scheduledDate: obj.scheduledDate || new Date().toISOString().slice(0, 10),
      durationMinutes: parseInt(obj.durationMinutes) || 30,
      actualMinutes: obj.actualMinutes ? parseInt(obj.actualMinutes) : null,
      startedAt: obj.startedAt || null,
      frequencyDays: parseInt(obj.frequencyDays) || 0,
      skippedDates: obj.skippedDates ? obj.skippedDates.split(';').filter(Boolean) : [],
      status: (obj.status as WorkEntry['status']) || 'planned',
      createdAt: obj.createdAt || new Date().toISOString(),
      completedAt: obj.completedAt || null,
    });
  }

  return entries;
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
