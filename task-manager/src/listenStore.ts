import type { ListenItem } from './types';

const STORAGE_KEY = 'task-manager-listen';

export function loadListenItems(): ListenItem[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    return JSON.parse(data);
  } catch {
    return [];
  }
}

export function saveListenItems(items: ListenItem[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function generateListenId(): string {
  return 'ls-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function exportListenToCsv(items: ListenItem[]): string {
  const headers = ['id', 'text', 'translation', 'lang', 'status', 'nextReviewDate', 'createdAt', 'lastReviewedAt'];
  const rows = items.map(item =>
    headers.map(h => {
      const value = item[h as keyof ListenItem] ?? '';
      const str = String(value);
      if (str.includes(',') || str.includes('\n') || str.includes('"')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    }).join(',')
  );
  return [headers.join(','), ...rows].join('\n');
}

export function importListenFromCsv(csvContent: string): ListenItem[] {
  const lines = parseCsvLines(csvContent);
  if (lines.length < 2) return [];
  const headers = lines[0];
  const items: ListenItem[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i];
    if (values.length < headers.length) continue;
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => { obj[h] = values[idx] || ''; });

    items.push({
      id: obj.id || generateListenId(),
      text: obj.text || '',
      translation: obj.translation || '',
      lang: obj.lang || 'en-US',
      status: (obj.status as ListenItem['status']) || 'open',
      nextReviewDate: obj.nextReviewDate || new Date().toISOString(),
      createdAt: obj.createdAt || new Date().toISOString(),
      lastReviewedAt: obj.lastReviewedAt || null,
    });
  }
  return items;
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
        if (i + 1 < csv.length && csv[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { current.push(field); field = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && i + 1 < csv.length && csv[i + 1] === '\n') i++;
        current.push(field); field = '';
        if (current.some(f => f.length > 0)) result.push(current);
        current = [];
      } else field += ch;
    }
  }
  current.push(field);
  if (current.some(f => f.length > 0)) result.push(current);
  return result;
}
