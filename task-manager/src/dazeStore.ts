export interface DazeRecord {
  id: string;
  startedAt: string; // ISO datetime
  endedAt: string; // ISO datetime
  durationSeconds: number;
}

const STORAGE_KEY = 'task-manager-daze';

export function loadDazeRecords(): DazeRecord[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    return JSON.parse(data);
  } catch {
    return [];
  }
}

export function saveDazeRecords(records: DazeRecord[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

export function generateDazeId(): string {
  return 'dz-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
