import { useState } from 'react';
import type { Chore, WorkSegment } from '../types';

function segSeconds(segments: WorkSegment[], nowMs: number): number {
  return segments.reduce((sum, seg) => {
    const start = new Date(seg.start).getTime();
    const end = seg.end ? new Date(seg.end).getTime() : nowMs;
    return sum + Math.max(0, Math.floor((end - start) / 1000));
  }, 0);
}

function choreSeconds(chore: Chore, nowMs: number): number {
  return (chore.subtasks ?? []).reduce((s, sub) => s + segSeconds(sub.segments, nowMs), 0);
}

function fmt(seconds: number): string {
  if (seconds <= 0) return '0分钟';
  const m = Math.round(seconds / 60);
  if (m === 0) return '<1分钟';
  if (m < 60) return `${m}分钟`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm > 0 ? `${h}小时${rm}分钟` : `${h}小时`;
}

function choreDate(chore: Chore): string {
  const ref = chore.completedAt || chore.subtasks?.flatMap(s => s.segments)[0]?.start || chore.scheduledAt;
  if (!ref) return '';
  const d = new Date(ref);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface Props {
  chores: Chore[];
}

// 家务工时表：按天整理每个家务用了多久，可展开看过程（含分心念头）
export default function ChoreTimesheet({ chores }: Props) {
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [expandedChore, setExpandedChore] = useState<string | null>(null);
  const nowMs = Date.now();

  const timed = chores.filter(c => !String(c.id).startsWith('proj-') && choreSeconds(c, nowMs) > 0);

  const byDay = new Map<string, Chore[]>();
  for (const c of timed) {
    const day = choreDate(c);
    if (!day) continue;
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(c);
  }
  const days = Array.from(byDay.keys()).sort((a, b) => b.localeCompare(a));
  const days_zh = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  if (timed.length === 0) return null;

  const todayStr = (() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`; })();

  return (
    <div className="stats-card timesheet-card">
      <h4>🧾 家务工时表（每个家务用了多久）</h4>
      {days.map(day => {
        const dayChores = byDay.get(day)!.sort((a, b) => choreSeconds(b, nowMs) - choreSeconds(a, nowMs));
        const dayTotal = dayChores.reduce((s, c) => s + choreSeconds(c, nowMs), 0);
        const d = new Date(day + 'T00:00:00');
        const label = day === todayStr ? `今天 ${day}` : `${day} (${days_zh[d.getDay()]})`;
        const dayOpen = expandedDay === day;
        return (
          <div key={day} className="stats-collapse">
            <div className="stats-collapse-header" onClick={() => setExpandedDay(dayOpen ? null : day)}>
              <span className="stats-collapse-arrow">{dayOpen ? '▼' : '▶'}</span>
              <span className="stats-collapse-label">{label}</span>
              <span className="stats-collapse-value">{fmt(dayTotal)}</span>
            </div>
            {dayOpen && (
              <div className="stats-collapse-body">
                {dayChores.map(c => {
                  const total = choreSeconds(c, nowMs);
                  const choreOpen = expandedChore === c.id;
                  const hasDistractions = (c.subtasks?.length ?? 0) > 1;
                  return (
                    <div key={c.id} className="timesheet-entry">
                      <div className="timesheet-entry-header" onClick={() => hasDistractions && setExpandedChore(choreOpen ? null : c.id)}>
                        {hasDistractions && <span className="timesheet-arrow">{choreOpen ? '▾' : '▸'}</span>}
                        <span className="timesheet-task">{c.title}</span>
                        <span className="timesheet-time">{fmt(total)}</span>
                      </div>
                      {choreOpen && hasDistractions && (
                        <div className="timesheet-subs">
                          {c.subtasks.map((sub, i) => (
                            <div key={sub.id} className="timesheet-sub-row">
                              <span className="timesheet-sub-index">{i === 0 ? '·' : '💭'}</span>
                              <span className="timesheet-sub-label">{sub.label}</span>
                              <span className="timesheet-sub-time">{fmt(segSeconds(sub.segments, nowMs))}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
