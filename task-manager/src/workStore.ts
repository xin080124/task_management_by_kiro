import type { WorkEntry } from './types';

const STORAGE_KEY = 'task-manager-work';

export function loadWorkEntries(): WorkEntry[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    const entries: WorkEntry[] = JSON.parse(data);
    return entries.map(e => {
      // 迁移：旧数据没有 segments，用 startedAt/pausedElapsed 重建一段近似记录
      let segments = e.segments ?? [];
      if (!e.segments) {
        if (e.startedAt) {
          segments = [{ start: e.startedAt, end: null }];
        }
      }
      // 迁移：旧数据没有 subtasks，把已有 segments 归到一个默认 Initial 子步骤
      let subtasks = e.subtasks;
      let activeSubtaskId = e.activeSubtaskId ?? null;
      if (!subtasks || subtasks.length === 0) {
        const initialId = 'sub-initial-' + e.id;
        subtasks = [{ id: initialId, label: 'Initial', segments }];
        // 若旧任务当前正在计时，则活跃子步骤指向 Initial
        activeSubtaskId = e.startedAt ? initialId : null;
      }
      return {
        ...e,
        project: e.project ?? '',
        startedAt: e.startedAt ?? null,
        pausedElapsed: e.pausedElapsed ?? 0,
        segments,
        subtasks,
        activeSubtaskId,
        frequencyDays: e.frequencyDays ?? 0,
        skippedDates: e.skippedDates ?? [],
        actualMinutes: e.actualMinutes ?? null,
      };
    });
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
  const headers = ['id', 'task', 'project', 'category', 'scheduledDate', 'durationMinutes', 'actualMinutes', 'startedAt', 'pausedElapsed', 'segments', 'subtasks', 'activeSubtaskId', 'frequencyDays', 'skippedDates', 'status', 'createdAt', 'completedAt'];
  const rows = entries.map(entry =>
    headers.map(h => {
      // segments / subtasks 用 JSON 序列化存进单个字段
      let str: string;
      if (h === 'segments') {
        str = JSON.stringify(entry.segments ?? []);
      } else if (h === 'subtasks') {
        str = JSON.stringify(entry.subtasks ?? []);
      } else {
        let value: string | number | string[] | null = (entry[h as keyof WorkEntry] as string | number | string[] | null) ?? '';
        if (Array.isArray(value)) {
          value = value.join(';');
        }
        str = String(value);
      }
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

    let segments: WorkEntry['segments'] = [];
    if (obj.segments) {
      try {
        const parsed = JSON.parse(obj.segments);
        if (Array.isArray(parsed)) segments = parsed;
      } catch {
        segments = [];
      }
    }

    let subtasks: WorkEntry['subtasks'] = [];
    if (obj.subtasks) {
      try {
        const parsed = JSON.parse(obj.subtasks);
        if (Array.isArray(parsed)) subtasks = parsed;
      } catch {
        subtasks = [];
      }
    }
    if (subtasks.length === 0) {
      const initialId = 'sub-initial-' + (obj.id || generateWorkId());
      subtasks = [{ id: initialId, label: 'Initial', segments }];
    }

    entries.push({
      id: obj.id || generateWorkId(),
      task: obj.task || '',
      project: obj.project || '',
      category: (obj.category as WorkEntry['category']) || 'other',
      scheduledDate: obj.scheduledDate || new Date().toISOString().slice(0, 10),
      durationMinutes: parseInt(obj.durationMinutes) || 30,
      actualMinutes: obj.actualMinutes ? parseInt(obj.actualMinutes) : null,
      startedAt: obj.startedAt || null,
      pausedElapsed: parseInt(obj.pausedElapsed) || 0,
      segments,
      subtasks,
      activeSubtaskId: obj.activeSubtaskId || null,
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
