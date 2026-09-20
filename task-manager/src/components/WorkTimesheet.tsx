import { useState } from 'react';
import type { WorkEntry, Subtask, WorkSegment } from '../types';

function segSeconds(segments: WorkSegment[], nowMs: number): number {
  return segments.reduce((sum, seg) => {
    const start = new Date(seg.start).getTime();
    const end = seg.end ? new Date(seg.end).getTime() : nowMs;
    return sum + Math.max(0, Math.floor((end - start) / 1000));
  }, 0);
}

function subSeconds(sub: Subtask, nowMs: number): number {
  return segSeconds(sub.segments, nowMs);
}

function entrySeconds(entry: WorkEntry, nowMs: number): number {
  return (entry.subtasks ?? []).reduce((s, sub) => s + subSeconds(sub, nowMs), 0);
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

// 一个任务归属的日期：优先用完成日期，否则用第一段的开始日期，否则用计划日期
function entryDate(entry: WorkEntry): string {
  if (entry.completedAt) {
    const d = new Date(entry.completedAt);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  const firstSeg = entry.subtasks?.flatMap(s => s.segments)[0];
  if (firstSeg) {
    const d = new Date(firstSeg.start);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  return entry.scheduledDate;
}

interface Props {
  entries: WorkEntry[];
}

// 工时表：按天整理每个任务用了多长时间，可展开看子步骤
export default function WorkTimesheet({ entries }: Props) {
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);
  const nowMs = Date.now();

  // 只统计真正计过时的任务（有任意时间段）
  const timed = entries.filter(e => entrySeconds(e, nowMs) > 0);

  // 按天分组
  const byDay = new Map<string, WorkEntry[]>();
  for (const e of timed) {
    const day = entryDate(e);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(e);
  }
  const days = Array.from(byDay.keys()).sort((a, b) => b.localeCompare(a));

  const days_zh = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  if (timed.length === 0) return null;

  return (
    <div className="stats-card timesheet-card">
      <h4>🧾 工时表（每个任务用了多久）</h4>
      {days.map(day => {
        const dayEntries = byDay.get(day)!.sort((a, b) => entrySeconds(b, nowMs) - entrySeconds(a, nowMs));
        const dayTotal = dayEntries.reduce((s, e) => s + entrySeconds(e, nowMs), 0);
        const d = new Date(day + 'T00:00:00');
        const todayStr = (() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`; })();
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
                {dayEntries.map(e => {
                  const total = entrySeconds(e, nowMs);
                  const entryOpen = expandedEntry === e.id;
                  const hasSubs = (e.subtasks?.length ?? 0) > 0;
                  return (
                    <div key={e.id} className="timesheet-entry">
                      <div className="timesheet-entry-header" onClick={() => hasSubs && setExpandedEntry(entryOpen ? null : e.id)}>
                        {hasSubs && <span className="timesheet-arrow">{entryOpen ? '▾' : '▸'}</span>}
                        {e.project && <span className="timesheet-project">[{e.project}]</span>}
                        <span className="timesheet-task">{e.task}</span>
                        <span className="timesheet-time">{fmt(total)}</span>
                      </div>
                      {entryOpen && hasSubs && (
                        <div className="timesheet-subs">
                          {e.subtasks.map((sub, i) => (
                            <div key={sub.id} className="timesheet-sub-row">
                              <span className="timesheet-sub-index">{i + 1}.</span>
                              <span className="timesheet-sub-label">{sub.label}</span>
                              <span className="timesheet-sub-time">{fmt(subSeconds(sub, nowMs))}</span>
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
