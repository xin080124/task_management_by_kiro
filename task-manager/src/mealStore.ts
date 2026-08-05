import type { Meal } from './types';

const STORAGE_KEY = 'task-manager-meals';

export function loadMeals(): Meal[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    const meals: Meal[] = JSON.parse(data);
    return meals.map(m => ({
      ...m,
      frequencyDays: m.frequencyDays ?? 0,
      skippedDates: m.skippedDates ?? [],
    }));
  } catch {
    return [];
  }
}

export function saveMeals(meals: Meal[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(meals));
}

export function generateMealId(): string {
  return 'ml-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// CSV export
export function exportMealsToCsv(meals: Meal[]): string {
  const headers = ['id', 'dish', 'mealTime', 'scheduledDate', 'prepMinutes', 'frequencyDays', 'skippedDates', 'status', 'createdAt', 'completedAt'];
  const rows = meals.map(meal =>
    headers.map(h => {
      let value: string | number | string[] | null = meal[h as keyof Meal] ?? '';
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
export function importMealsFromCsv(csvContent: string): Meal[] {
  const lines = parseCsvLines(csvContent);
  if (lines.length < 2) return [];

  const headers = lines[0];
  const meals: Meal[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i];
    if (values.length < headers.length) continue;

    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = values[idx] || '';
    });

    meals.push({
      id: obj.id || generateMealId(),
      dish: obj.dish || '',
      mealTime: (obj.mealTime as Meal['mealTime']) || 'dinner',
      scheduledDate: obj.scheduledDate || new Date().toISOString().slice(0, 10),
      prepMinutes: parseInt(obj.prepMinutes) || 30,
      frequencyDays: parseInt(obj.frequencyDays) || 0,
      skippedDates: obj.skippedDates ? obj.skippedDates.split(';').filter(Boolean) : [],
      status: (obj.status as Meal['status']) || 'planned',
      createdAt: obj.createdAt || new Date().toISOString(),
      completedAt: obj.completedAt || null,
    });
  }

  return meals;
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
