import type { WorkEntry } from '../types';

interface Props {
  entries: WorkEntry[];
}

const COLORS = ['#007aff', '#ff9500', '#34c759', '#5856d6', '#ff3b30', '#af52de', '#00c7be', '#ff6482'];

export default function WorkTimeline({ entries }: Props) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

  // Show today's entries that have been started or completed (have real time data)
  const todayEntries = entries.filter(e => {
    // Has startedAt today (local time)
    if (e.startedAt) {
      const t = new Date(e.startedAt);
      if (t >= todayStart && t < todayEnd) return true;
    }
    // Or completed today (local time)
    if (e.status === 'done' && e.completedAt) {
      const t = new Date(e.completedAt);
      if (t >= todayStart && t < todayEnd) return true;
    }
    return false;
  }).sort((a, b) => {
    const aStart = getEntryStart(a).getTime();
    const bStart = getEntryStart(b).getTime();
    return aStart - bStart;
  });

  if (todayEntries.length === 0) return null;

  function getEntryStart(e: WorkEntry): Date {
    if (e.startedAt) return new Date(e.startedAt);
    // Infer from completedAt - actualMinutes
    if (e.completedAt) {
      const minutes = e.actualMinutes ?? e.durationMinutes;
      return new Date(new Date(e.completedAt).getTime() - minutes * 60 * 1000);
    }
    return new Date();
  }

  function getEntryEnd(e: WorkEntry): Date {
    if (e.status === 'done' && e.completedAt) return new Date(e.completedAt);
    // In progress: show up to now
    return now;
  }

  // Calculate time ranges
  const times = todayEntries.map(e => {
    const start = getEntryStart(e);
    const end = getEntryEnd(e);
    return { entry: e, start, end };
  });

  const minTime = Math.min(...times.map(t => t.start.getTime()));
  const maxTime = Math.max(...times.map(t => t.end.getTime()));

  // Extend range for padding (round to hour)
  const rangeStart = new Date(minTime);
  rangeStart.setMinutes(0, 0, 0);
  const rangeEnd = new Date(maxTime);
  rangeEnd.setMinutes(0, 0, 0);
  rangeEnd.setHours(rangeEnd.getHours() + 1);

  const totalMs = rangeEnd.getTime() - rangeStart.getTime();
  if (totalMs <= 0) return null;

  // Generate hour labels
  const hours: string[] = [];
  const cursor = new Date(rangeStart);
  while (cursor <= rangeEnd) {
    hours.push(cursor.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }));
    cursor.setHours(cursor.getHours() + 1);
  }

  // Assign lanes for overlapping entries
  const lanes: { entry: WorkEntry; start: Date; end: Date; lane: number }[] = [];
  const laneEnds: number[] = [];

  for (const { entry, start, end } of times) {
    let assigned = -1;
    for (let i = 0; i < laneEnds.length; i++) {
      if (laneEnds[i] <= start.getTime()) {
        assigned = i;
        laneEnds[i] = end.getTime();
        break;
      }
    }
    if (assigned === -1) {
      assigned = laneEnds.length;
      laneEnds.push(end.getTime());
    }
    lanes.push({ entry, start, end, lane: assigned });
  }

  const totalLanes = laneEnds.length;
  const getLeft = (d: Date) => ((d.getTime() - rangeStart.getTime()) / totalMs) * 100;
  const getWidth = (s: Date, e: Date) => ((e.getTime() - s.getTime()) / totalMs) * 100;

  const formatTimeShort = (d: Date) => d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="timeline-container">
      <div className="timeline-header">
        <h3>📊 今日工作时间线</h3>
      </div>

      <div className="timeline">
        {/* Hour grid lines */}
        <div className="timeline-grid">
          {hours.map((label, i) => (
            <div
              key={i}
              className="timeline-gridline"
              style={{ left: `${(i / (hours.length - 1)) * 100}%` }}
            >
              <span className="timeline-label">{label}</span>
            </div>
          ))}
        </div>

        {/* Task bars */}
        <div className="timeline-bars" style={{ height: `${totalLanes * 36 + 8}px` }}>
          {lanes.map(({ entry, start, end, lane }, idx) => {
            const isRunning = entry.status === 'in-progress';
            const projectLabel = entry.project ? `[${entry.project}] ` : '';
            return (
              <div
                key={entry.id}
                className={`timeline-bar ${isRunning ? 'running' : ''}`}
                style={{
                  left: `${getLeft(start)}%`,
                  width: `${Math.max(getWidth(start, end), 2)}%`,
                  top: `${lane * 36 + 4}px`,
                  backgroundColor: COLORS[idx % COLORS.length],
                }}
                title={`${projectLabel}${entry.task}\n${formatTimeShort(start)} - ${isRunning ? '进行中' : formatTimeShort(end)}\n${entry.actualMinutes ? `实际 ${entry.actualMinutes}分钟` : ''}`}
              >
                <span className="bar-text">{projectLabel}{entry.task}</span>
              </div>
            );
          })}
        </div>

        {/* Now indicator */}
        {now >= rangeStart && now <= rangeEnd && (
          <div className="timeline-now" style={{ left: `${getLeft(now)}%` }} />
        )}
      </div>
    </div>
  );
}
