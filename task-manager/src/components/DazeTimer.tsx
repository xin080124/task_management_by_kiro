import { useState, useEffect, useRef } from 'react';
import { loadDazeRecords, saveDazeRecords, generateDazeId } from '../dazeStore';
import type { DazeRecord } from '../dazeStore';

export default function DazeTimer() {
  const [records, setRecords] = useState<DazeRecord[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setRecords(loadDazeRecords());
  }, []);

  useEffect(() => {
    if (isRunning && startTime !== null) {
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRunning, startTime]);

  const handleStart = () => {
    setStartTime(Date.now());
    setElapsed(0);
    setIsRunning(true);
  };

  const handleStop = () => {
    if (!startTime) return;
    const endTime = Date.now();
    const duration = Math.floor((endTime - startTime) / 1000);

    const record: DazeRecord = {
      id: generateDazeId(),
      startedAt: new Date(startTime).toISOString(),
      endedAt: new Date(endTime).toISOString(),
      durationSeconds: duration,
    };

    const updated = [...records, record];
    setRecords(updated);
    saveDazeRecords(updated);

    setIsRunning(false);
    setStartTime(null);
    setElapsed(0);
  };

  const handleDelete = (id: string) => {
    const updated = records.filter(r => r.id !== id);
    setRecords(updated);
    saveDazeRecords(updated);
  };

  // Group records by date and sum durations
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayRecords = records.filter(r => r.startedAt.slice(0, 10) === todayStr);
  const todayTotal = todayRecords.reduce((s, r) => s + r.durationSeconds, 0);

  // Last 7 days stats
  const dailyStats: { date: string; total: number }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const dStr = d.toISOString().slice(0, 10);
    const dayTotal = records
      .filter(r => r.startedAt.slice(0, 10) === dStr)
      .reduce((s, r) => s + r.durationSeconds, 0);
    dailyStats.push({ date: dStr, total: dayTotal });
  }

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}秒`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (m < 60) return s > 0 ? `${m}分${s}秒` : `${m}分钟`;
    const h = Math.floor(m / 60);
    const remainM = m % 60;
    return remainM > 0 ? `${h}小时${remainM}分钟` : `${h}小时`;
  };

  const formatTime = (iso: string) => {
    return new Date(iso).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <div className="daze-timer">
      <div className="daze-header" onClick={() => setExpanded(!expanded)}>
        <span className="daze-icon">😶‍🌫️</span>
        <span className="daze-title">发呆计时器</span>
        <span className="daze-today-total">今日: {formatDuration(todayTotal)}</span>
        <span className="daze-expand">{expanded ? '▼' : '▶'}</span>
      </div>

      <div className="daze-controls">
        {!isRunning ? (
          <button className="btn btn-daze-start" onClick={handleStart}>▶ 开始发呆</button>
        ) : (
          <button className="btn btn-daze-stop" onClick={handleStop}>⏹ 结束发呆</button>
        )}
        {isRunning && (
          <span className="daze-elapsed">{formatDuration(elapsed)}</span>
        )}
      </div>

      {expanded && (
        <div className="daze-details">
          <div className="daze-stats">
            <h4>近7天发呆时长</h4>
            {dailyStats.map(({ date, total }) => (
              <div key={date} className="daze-stat-row">
                <span className="daze-stat-date">{date === todayStr ? '今天' : date.slice(5)}</span>
                <span className="daze-stat-bar" style={{ width: `${Math.min(total / 36, 100)}%` }} />
                <span className="daze-stat-value">{total > 0 ? formatDuration(total) : '-'}</span>
              </div>
            ))}
          </div>

          {todayRecords.length > 0 && (
            <div className="daze-records">
              <h4>今日记录</h4>
              {todayRecords.map(r => (
                <div key={r.id} className="daze-record-item">
                  <span>{formatTime(r.startedAt)} ~ {formatTime(r.endedAt)}</span>
                  <span className="daze-record-duration">{formatDuration(r.durationSeconds)}</span>
                  <button className="btn-delete" onClick={() => handleDelete(r.id)} title="删除">✕</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
