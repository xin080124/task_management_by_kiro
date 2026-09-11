import type { Story, Milestone } from './types';

const STORAGE_KEY = 'task-manager-projects';

export function loadStories(): Story[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    const stories: Story[] = JSON.parse(data);
    // 迁移旧数据，补齐打卡字段
    return stories.map(s => ({
      ...s,
      frequencyDays: s.frequencyDays ?? 1,
      scheduledAt: s.scheduledAt ?? null,
      checkins: s.checkins ?? [],
      lastCheckinAt: s.lastCheckinAt ?? null,
    }));
  } catch {
    return [];
  }
}

export function saveStories(stories: Story[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stories));
}

export function generateStoryId(): string {
  return 'st-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function generateMilestoneId(): string {
  return 'ms-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// CSV export - flatten milestones into rows
export function exportProjectsToCsv(stories: Story[]): string {
  const headers = ['storyId', 'storyTitle', 'storyDescription', 'storyStatus', 'milestoneId', 'milestoneTitle', 'milestoneStatus', 'milestoneDueDate', 'milestoneCompletedAt', 'milestoneCreatedAt', 'storyCreatedAt', 'storyCompletedAt', 'frequencyDays', 'scheduledAt', 'checkins', 'lastCheckinAt'];
  const rows: string[] = [];

  for (const story of stories) {
    const freq = String(story.frequencyDays ?? 1);
    const sched = story.scheduledAt ?? '';
    const checkins = (story.checkins ?? []).join(';');
    const lastCheckin = story.lastCheckinAt ?? '';
    if (story.milestones.length === 0) {
      rows.push(formatRow([story.id, story.title, story.description, story.status, '', '', '', '', '', '', story.createdAt, story.completedAt ?? '', freq, sched, checkins, lastCheckin]));
    } else {
      for (const ms of story.milestones) {
        rows.push(formatRow([story.id, story.title, story.description, story.status, ms.id, ms.title, ms.status, ms.dueDate ?? '', ms.completedAt ?? '', ms.createdAt, story.createdAt, story.completedAt ?? '', freq, sched, checkins, lastCheckin]));
      }
    }
  }

  return [headers.join(','), ...rows].join('\n');
}

function formatRow(fields: string[]): string {
  return fields.map(f => {
    if (f.includes(',') || f.includes('\n') || f.includes('"')) {
      return `"${f.replace(/"/g, '""')}"`;
    }
    return f;
  }).join(',');
}

// CSV import
export function importProjectsFromCsv(csvContent: string): Story[] {
  const lines = parseCsvLines(csvContent);
  if (lines.length < 2) return [];

  const headers = lines[0];
  const storyMap = new Map<string, Story>();

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i];
    if (values.length < headers.length) continue;

    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => { obj[h] = values[idx] || ''; });

    const storyId = obj.storyId || generateStoryId();

    if (!storyMap.has(storyId)) {
      storyMap.set(storyId, {
        id: storyId,
        title: obj.storyTitle || '',
        description: obj.storyDescription || '',
        status: (obj.storyStatus as Story['status']) || 'active',
        milestones: [],
        createdAt: obj.storyCreatedAt || new Date().toISOString(),
        completedAt: obj.storyCompletedAt || null,
        frequencyDays: parseInt(obj.frequencyDays) || 1,
        scheduledAt: obj.scheduledAt || null,
        checkins: obj.checkins ? obj.checkins.split(';').filter(Boolean) : [],
        lastCheckinAt: obj.lastCheckinAt || null,
      });
    }

    if (obj.milestoneId || obj.milestoneTitle) {
      const story = storyMap.get(storyId)!;
      story.milestones.push({
        id: obj.milestoneId || generateMilestoneId(),
        title: obj.milestoneTitle || '',
        status: (obj.milestoneStatus as Milestone['status']) || 'todo',
        dueDate: obj.milestoneDueDate || null,
        completedAt: obj.milestoneCompletedAt || null,
        createdAt: obj.milestoneCreatedAt || new Date().toISOString(),
      });
    }
  }

  return Array.from(storyMap.values());
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
      } else { field += ch; }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { current.push(field); field = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && i + 1 < csv.length && csv[i + 1] === '\n') i++;
        current.push(field); field = '';
        if (current.some(f => f.length > 0)) result.push(current);
        current = [];
      } else { field += ch; }
    }
  }
  current.push(field);
  if (current.some(f => f.length > 0)) result.push(current);
  return result;
}
