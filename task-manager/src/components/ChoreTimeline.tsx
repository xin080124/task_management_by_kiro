import type { Chore } from '../types';

interface Props {
  chores: Chore[];
}

export default function ChoreTimeline({ chores }: Props) {
  // Only show scheduled, non-done chores for today
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

  const scheduledToday = chores.filter(c => {
    if (!c.scheduledAt || c.status === 'done') return false;
    const start = new Date(c.scheduledAt);
    return start >= todayStart && start < todayEnd;
  }).sort((a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime());

  if (scheduledToday.length === 0) {
    return null;
  }

  // Find time range for the timeline
  const times = scheduledToday.map(c => ({
    start: new Date(c.scheduledAt!),
    end: new Date(new Date(c.scheduledAt!).getTime() + c.durationMinutes * 60 * 1000),
  }));

  const minTime = Math.min(...times.map(t => t.start.getTime()));
  const maxTime = Math.max(...times.map(t => t.end.getTime()));

  // Extend range a bit for padding (round to hour)
  const rangeStart = new Date(minTime);
  rangeStart.setMinutes(0, 0, 0);
  const rangeEnd = new Date(maxTime);
  rangeEnd.setMinutes(0, 0, 0);
  rangeEnd.setHours(rangeEnd.getHours() + 1);

  const totalMs = rangeEnd.getTime() - rangeStart.getTime();

  // Generate hour labels
  const hours: string[] = [];
  const cursor = new Date(rangeStart);
  while (cursor <= rangeEnd) {
    hours.push(cursor.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }));
    cursor.setHours(cursor.getHours() + 1);
  }

  // Detect overlaps: assign lanes
  const lanes: { chore: typeof scheduledToday[0]; start: Date; end: Date; lane: number }[] = [];
  const laneEnds: number[] = []; // track end time of each lane

  for (const chore of scheduledToday) {
    const start = new Date(chore.scheduledAt!);
    const end = new Date(start.getTime() + chore.durationMinutes * 60 * 1000);

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

    lanes.push({ chore, start, end, lane: assigned });
  }

  const totalLanes = laneEnds.length;
  const hasOverlap = totalLanes > 1;

  const getLeft = (d: Date) => ((d.getTime() - rangeStart.getTime()) / totalMs) * 100;
  const getWidth = (s: Date, e: Date) => ((e.getTime() - s.getTime()) / totalMs) * 100;

  const colors = ['#007aff', '#ff9500', '#34c759', '#5856d6', '#ff3b30', '#af52de'];

  return (
    <div className="timeline-container">
      <div className="timeline-header">
        <h3>📊 今日时间线</h3>
        {hasOverlap && <span className="overlap-warning">⚠️ 有时间重叠</span>}
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
          {lanes.map(({ chore, start, end, lane }, idx) => (
            <div
              key={chore.id}
              className={`timeline-bar ${new Date() > end ? 'overdue' : ''}`}
              style={{
                left: `${getLeft(start)}%`,
                width: `${Math.max(getWidth(start, end), 2)}%`,
                top: `${lane * 36 + 4}px`,
                backgroundColor: colors[idx % colors.length],
              }}
              title={`${chore.title} (${start.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} - ${end.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })})`}
            >
              <span className="bar-text">{chore.title}</span>
            </div>
          ))}
        </div>

        {/* Now indicator */}
        {now >= rangeStart && now <= rangeEnd && (
          <div className="timeline-now" style={{ left: `${getLeft(now)}%` }} />
        )}
      </div>
    </div>
  );
}
