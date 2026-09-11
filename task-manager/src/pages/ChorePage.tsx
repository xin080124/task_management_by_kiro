import { useState, useEffect, useCallback, useRef } from 'react';
import type { Chore } from '../types';
import { loadChores, saveChores, generateChoreId, exportChoresToCsv, importChoresFromCsv } from '../choreStore';
import ChoreTimeline from '../components/ChoreTimeline';

export default function ChorePage() {
  const [chores, setChores] = useState<Chore[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedForDelete, setSelectedForDelete] = useState<Set<string>>(new Set());
  const [expandedStat, setExpandedStat] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [newTitle, setNewTitle] = useState('');
  const [newScheduledAt, setNewScheduledAt] = useState('');
  const [newDuration, setNewDuration] = useState(30);
  const [newFrequency, setNewFrequency] = useState(1);

  useEffect(() => {
    const loaded = loadChores();
    setChores(loaded);
    setInitialized(true);
  }, []);

  useEffect(() => {
    if (initialized) {
      saveChores(chores);
    }
  }, [chores, initialized]);

  // Categorize chores
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const getChoreCategory = (chore: Chore): 'overdue' | 'active' | 'upcoming' | 'unscheduled' | 'done' | 'skipped' => {
    if (chore.status === 'done') return 'done';
    if (chore.status === 'skipped') return 'skipped';
    if (!chore.scheduledAt) return 'unscheduled';

    const start = new Date(chore.scheduledAt);
    const end = new Date(start.getTime() + chore.durationMinutes * 60 * 1000);

    if (end < now) return 'overdue';
    if (start <= now && end >= now) return 'active';
    return 'upcoming';
  };

  const overdueChores = chores.filter(c => getChoreCategory(c) === 'overdue');
  const activeChores = chores.filter(c => getChoreCategory(c) === 'active');
  const upcomingChores = chores.filter(c => getChoreCategory(c) === 'upcoming');
  const unscheduledChores = chores.filter(c => getChoreCategory(c) === 'unscheduled');
  const doneChores = chores.filter(c => getChoreCategory(c) === 'done')
    .sort((a, b) => new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime());
  const skippedChores = chores.filter(c => getChoreCategory(c) === 'skipped');

  // Generate projected future chores based on frequency (up to 3 days out)
  const projectedChores: Chore[] = [];
  const projectionEnd = new Date(todayStart.getTime() + 3 * 24 * 60 * 60 * 1000);
  for (const c of chores) {
    if (c.status === 'done' || c.status === 'skipped') continue;
    if (!c.scheduledAt) continue;
    const freq = c.frequencyDays ?? 1;
    const baseTime = new Date(c.scheduledAt);
    // Step forward from base by frequency to find future occurrences
    let t = new Date(baseTime.getTime() + freq * 24 * 60 * 60 * 1000);
    while (t < projectionEnd) {
      // Only add if not already covered by an existing chore (same title + same day)
      const tDay = t.toISOString().slice(0, 10);
      const alreadyExists = chores.some(existing =>
        existing.title === c.title &&
        existing.scheduledAt &&
        existing.scheduledAt.slice(0, 10) === tDay &&
        existing.status !== 'done' && existing.status !== 'skipped'
      );
      if (!alreadyExists && t > now) {
        projectedChores.push({
          id: `proj-${c.id}-${tDay}`,
          title: c.title,
          description: '',
          scheduledAt: t.toISOString(),
          durationMinutes: c.durationMinutes,
          actualMinutes: null,
          startedAt: null,
          pausedElapsed: 0,
          frequencyDays: freq,
          priority: c.priority ?? 'normal',
          skippedDates: c.skippedDates ?? [],
          status: 'scheduled',
          createdAt: c.createdAt,
          completedAt: null,
        });
      }
      t = new Date(t.getTime() + freq * 24 * 60 * 60 * 1000);
    }
  }

  // Merge projected into upcoming
  const allUpcoming = [...upcomingChores, ...projectedChores];

  // Sort upcoming by scheduled time
  allUpcoming.sort((a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime());
  // Sort overdue by most overdue first
  overdueChores.sort((a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime());

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const chore: Chore = {
      id: generateChoreId(),
      title: newTitle.trim(),
      description: '',
      scheduledAt: newScheduledAt || null,
      durationMinutes: newDuration,
      actualMinutes: null,
      startedAt: null,
      pausedElapsed: 0,
      frequencyDays: newFrequency,
      priority: (newDuration >= 5 && newDuration <= 10) ? 'high' : 'normal',
      skippedDates: [],
      status: newScheduledAt ? 'scheduled' : 'pending',
      createdAt: new Date().toISOString(),
      completedAt: null,
    };

    setChores(prev => [...prev, chore]);
    setNewTitle('');
    setNewScheduledAt('');
    setNewDuration(30);
    setNewFrequency(1);
    setShowAddForm(false);
  };

  const handleComplete = useCallback((id: string) => {
    setChores(prev => {
      const updated = prev.map(c => {
        if (c.id !== id) return c;
        // Auto-calculate actual minutes: pausedElapsed + current running time
        let actual: number | null = null;
        const paused = c.pausedElapsed ?? 0;
        if (c.startedAt) {
          const running = Math.floor((Date.now() - new Date(c.startedAt).getTime()) / 1000);
          actual = Math.max(1, Math.round((paused + running) / 60));
        } else if (paused > 0) {
          actual = Math.max(1, Math.round(paused / 60));
        }
        return { ...c, status: 'done' as const, completedAt: new Date().toISOString(), actualMinutes: actual, pausedElapsed: 0 };
      });

      // Auto-create next occurrence based on frequency
      const completed = updated.find(c => c.id === id);
      if (completed && completed.scheduledAt) {
        const freq = completed.frequencyDays ?? 1;
        const prevTime = new Date(completed.scheduledAt);
        const nextTime = new Date(prevTime.getTime() + freq * 24 * 60 * 60 * 1000);
        const nextDateStr = nextTime.toISOString().slice(0, 10);

        // Prevent duplicate: check if a same-title task already exists for that day
        const alreadyExists = updated.some(c =>
          c.title === completed.title &&
          c.id !== id &&
          c.status !== 'done' && c.status !== 'skipped' &&
          c.scheduledAt && c.scheduledAt.slice(0, 10) === nextDateStr
        );

        if (!alreadyExists) {
          const nextChore: Chore = {
            id: generateChoreId(),
            title: completed.title,
            description: '',
            scheduledAt: nextTime.toISOString(),
            durationMinutes: completed.durationMinutes,
            actualMinutes: null,
            startedAt: null,
            pausedElapsed: 0,
            frequencyDays: freq,
            priority: completed.priority ?? 'normal',
            skippedDates: completed.skippedDates ?? [],
            status: 'scheduled',
            createdAt: new Date().toISOString(),
            completedAt: null,
          };
          updated.push(nextChore);
        }
      }

      return updated;
    });
  }, []);

  const handleSkip = useCallback((id: string) => {
    setChores(prev => {
      const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
      const updated = prev.map(c =>
        c.id === id ? {
          ...c,
          status: 'skipped' as const,
          skippedDates: [...(c.skippedDates ?? []), today],
        } : c
      );

      // Auto-create next occurrence (same as complete)
      const skipped = updated.find(c => c.id === id);
      if (skipped && skipped.scheduledAt) {
        const freq = skipped.frequencyDays ?? 1;
        const prevTime = new Date(skipped.scheduledAt);
        const nextTime = new Date(prevTime.getTime() + freq * 24 * 60 * 60 * 1000);
        const nextDateStr = nextTime.toISOString().slice(0, 10);

        const alreadyExists = updated.some(c =>
          c.title === skipped.title &&
          c.id !== id &&
          c.status !== 'done' && c.status !== 'skipped' &&
          c.scheduledAt && c.scheduledAt.slice(0, 10) === nextDateStr
        );

        if (!alreadyExists) {
          const nextChore: Chore = {
            id: generateChoreId(),
            title: skipped.title,
            description: '',
            scheduledAt: nextTime.toISOString(),
            durationMinutes: skipped.durationMinutes,
            actualMinutes: null,
            startedAt: null,
            pausedElapsed: 0,
            frequencyDays: freq,
            priority: skipped.priority ?? 'normal',
            skippedDates: skipped.skippedDates ?? [],
            status: 'scheduled',
            createdAt: new Date().toISOString(),
            completedAt: null,
          };
          updated.push(nextChore);
        }
      }

      return updated;
    });
  }, []);

  const handleDelete = useCallback((id: string) => {
    if (confirm('确定删除这个家务？')) {
      setChores(prev => prev.filter(c => c.id !== id));
    }
  }, []);

  const handleBatchDelete = useCallback(() => {
    if (selectedForDelete.size === 0) return;
    if (confirm(`确定删除选中的 ${selectedForDelete.size} 项？`)) {
      setChores(prev => prev.filter(c => !selectedForDelete.has(c.id)));
      setSelectedForDelete(new Set());
    }
  }, [selectedForDelete]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedForDelete(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback((ids: string[]) => {
    setSelectedForDelete(prev => {
      const allSelected = ids.every(id => prev.has(id));
      if (allSelected) return new Set();
      return new Set(ids);
    });
  }, []);

  const handleReschedule = useCallback((id: string, newTime: string) => {
    setChores(prev => prev.map(c =>
      c.id === id ? { ...c, scheduledAt: newTime, status: 'scheduled' as const } : c
    ));
  }, []);

  const handleStartChore = useCallback((id: string) => {
    setChores(prev => prev.map(c =>
      c.id === id ? { ...c, startedAt: new Date().toISOString() } : c
    ));
  }, []);

  const handleCancelChore = useCallback((id: string) => {
    setChores(prev => prev.map(c =>
      c.id === id ? { ...c, startedAt: null, pausedElapsed: 0 } : c
    ));
  }, []);

  const handlePauseChore = useCallback((id: string) => {
    setChores(prev => prev.map(c => {
      if (c.id !== id || !c.startedAt) return c;
      const elapsed = Math.floor((Date.now() - new Date(c.startedAt).getTime()) / 1000) + (c.pausedElapsed ?? 0);
      return { ...c, startedAt: null, pausedElapsed: elapsed };
    }));
  }, []);

  const handleResumeChore = useCallback((id: string) => {
    setChores(prev => prev.map(c =>
      c.id === id ? { ...c, startedAt: new Date().toISOString() } : c
    ));
  }, []);

  const handleEdit = useCallback((id: string, updates: Partial<Pick<Chore, 'title' | 'description' | 'durationMinutes' | 'frequencyDays'>>) => {
    setChores(prev => prev.map(c => {
      if (c.id !== id) return c;
      const updated = { ...c, ...updates };
      // Auto-recalculate priority based on duration
      const dur = updated.durationMinutes;
      updated.priority = (dur >= 5 && dur <= 10) ? 'high' : 'normal';
      return updated;
    }));
  }, []);

  const handleExport = () => {
    const csv = exportChoresToCsv(chores);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const filename = `家务${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}.csv`;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const imported = importChoresFromCsv(content);
      if (imported.length > 0) {
        setChores(prev => {
          const existing = new Map(prev.map(c => [c.id, c]));
          imported.forEach(c => existing.set(c.id, c));
          return Array.from(existing.values());
        });
        alert(`成功导入 ${imported.length} 个家务`);
      } else {
        alert('导入失败，请检查 CSV 格式');
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const formatTime = (isoStr: string) => {
    const d = new Date(isoStr);
    return d.toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const pendingCount = overdueChores.length + activeChores.length + allUpcoming.length + unscheduledChores.length;

  // Calculate daily total durations for today, tomorrow, and day after
  // Include projected future occurrences based on frequency
  const getDayDetails = (dayOffset: number): { total: number; items: { title: string; minutes: number }[] } => {
    const dayStart = new Date(todayStart.getTime() + dayOffset * 24 * 60 * 60 * 1000);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    const items: { title: string; minutes: number }[] = [];

    for (const c of chores) {
      if (c.status === 'done' || c.status === 'skipped') continue;
      if (!c.scheduledAt) continue;

      const baseTime = new Date(c.scheduledAt);
      const freq = c.frequencyDays ?? 1;

      let t = new Date(baseTime);
      while (t < dayStart) {
        t = new Date(t.getTime() + freq * 24 * 60 * 60 * 1000);
      }
      if (t >= dayStart && t < dayEnd) {
        items.push({ title: c.title, minutes: c.durationMinutes });
      }
    }

    return { total: items.reduce((s, i) => s + i.minutes, 0), items };
  };

  // Calculate completed details for today, yesterday, day before
  const getDayCompletedDetails = (dayOffset: number): { total: number; items: { title: string; minutes: number }[] } => {
    const dayStart = new Date(todayStart.getTime() + dayOffset * 24 * 60 * 60 * 1000);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    const items: { title: string; minutes: number }[] = [];
    for (const c of chores) {
      if (c.status !== 'done' || !c.completedAt) continue;
      const t = new Date(c.completedAt);
      if (t >= dayStart && t < dayEnd) {
        items.push({ title: c.title, minutes: c.actualMinutes ?? c.durationMinutes });
      }
    }
    return { total: items.reduce((s, i) => s + i.minutes, 0), items };
  };

  const formatMinutes = (m: number) => {
    if (m === 0) return '0分钟';
    if (m >= 60) {
      const h = Math.floor(m / 60);
      const remain = m % 60;
      return remain > 0 ? `${h}小时${remain}分钟` : `${h}小时`;
    }
    return `${m}分钟`;
  };

  const makeTooltip = (items: { title: string; minutes: number }[]) => {
    if (items.length === 0) return <span>无</span>;
    // Group by 10-minute brackets
    const brackets: { min: number; max: number; entries: typeof items }[] = [];
    const maxMin = Math.max(...items.map(i => i.minutes));
    const topBracket = Math.ceil(maxMin / 10) * 10;
    for (let lo = 1; lo <= topBracket; lo += 10) {
      const hi = lo + 9;
      const entries = items.filter(i => i.minutes >= lo && i.minutes <= hi);
      if (entries.length > 0) {
        brackets.push({ min: lo, max: hi, entries });
      }
    }
    return (
      <>
        {brackets.map((b, idx) => {
          const subtotal = b.entries.reduce((s, e) => s + e.minutes, 0);
          return (
            <div key={idx} className="tooltip-bracket">
              <div className="tooltip-bracket-header">[{b.min}-{b.max}分钟] {b.entries.length}项 共{subtotal}分钟</div>
              {b.entries.map((e, i) => (
                <div key={i} className="tooltip-bracket-item">{e.title}: {e.minutes}′</div>
              ))}
            </div>
          );
        })}
      </>
    );
  };

  const todayPlan = getDayDetails(0);
  const tomorrowPlan = getDayDetails(1);
  const dayAfterPlan = getDayDetails(2);
  const todayDone = getDayCompletedDetails(0);
  const yesterdayDone = getDayCompletedDetails(-1);
  const dayBeforeDone = getDayCompletedDetails(-2);

  return (
    <>
      <header className="app-header">
        <h1>🏠 家务管理器</h1>
        <div className="stats">
          <span className="stat">待完成: <strong>{pendingCount}项</strong></span>
          <span className="stat">已完成: <strong>{doneChores.length}项</strong></span>
        </div>
      </header>

      <div className="chore-stats-grid">
        <div className="stats-card">
          <h4>📅 待办时长</h4>
          {([
            { key: 'plan-0', label: '今天', data: todayPlan },
            { key: 'plan-1', label: '明天', data: tomorrowPlan },
            { key: 'plan-2', label: '后天', data: dayAfterPlan },
          ]).map(({ key, label, data }) => (
            <div key={key} className="stats-collapse">
              <div className="stats-collapse-header" onClick={() => setExpandedStat(expandedStat === key ? null : key)}>
                <span className="stats-collapse-arrow">{expandedStat === key ? '▼' : '▶'}</span>
                <span className="stats-collapse-label">{label}</span>
                <span className="stats-collapse-value">{formatMinutes(data.total)}</span>
              </div>
              {expandedStat === key && <div className="stats-collapse-body">{makeTooltip(data.items)}</div>}
            </div>
          ))}
        </div>
        <div className="stats-card">
          <h4>✅ 已完成时长</h4>
          {([
            { key: 'done-0', label: '今天', data: todayDone },
            { key: 'done-1', label: '昨天', data: yesterdayDone },
            { key: 'done-2', label: '前天', data: dayBeforeDone },
          ]).map(({ key, label, data }) => (
            <div key={key} className="stats-collapse">
              <div className="stats-collapse-header" onClick={() => setExpandedStat(expandedStat === key ? null : key)}>
                <span className="stats-collapse-arrow">{expandedStat === key ? '▼' : '▶'}</span>
                <span className="stats-collapse-label">{label}</span>
                <span className="stats-collapse-value">{formatMinutes(data.total)}</span>
              </div>
              {expandedStat === key && <div className="stats-collapse-body">{makeTooltip(data.items)}</div>}
            </div>
          ))}
        </div>
      </div>

      <nav className="toolbar">
        <div className="toolbar-actions">
          <button className="btn btn-primary" onClick={() => setShowAddForm(true)}>+ 添加家务</button>
          <button className="btn btn-secondary" onClick={handleExport}>导出 CSV</button>
          <label className="btn btn-secondary import-btn">
            导入 CSV
            <input ref={fileInputRef} type="file" accept=".csv" onChange={handleImport} style={{ display: 'none' }} />
          </label>
        </div>
      </nav>

      <ChoreTimeline chores={chores} />

      {showAddForm && (
        <form className="add-task-form" onSubmit={handleAdd}>
          <h2>添加家务</h2>
          <div className="form-group">
            <label htmlFor="chore-title">家务名称</label>
            <input
              id="chore-title"
              type="text"
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              placeholder="例如：拖地、洗衣服..."
              className="form-input"
            />
          </div>
          <div className="form-group">
            <label htmlFor="chore-time">开始时间（可选）</label>
            <input
              id="chore-time"
              type="datetime-local"
              value={newScheduledAt}
              onChange={e => setNewScheduledAt(e.target.value)}
              className="form-input"
            />
          </div>
          <div className="form-group">
            <label htmlFor="chore-duration">时长（分钟）</label>
            <input
              id="chore-duration"
              type="number"
              value={newDuration}
              onChange={e => setNewDuration(parseInt(e.target.value) || 30)}
              min={1}
              max={480}
              className="form-input"
            />
          </div>
          <div className="form-group">
            <label htmlFor="chore-frequency">重复频率（每 N 天）</label>
            <input
              id="chore-frequency"
              type="number"
              value={newFrequency}
              onChange={e => setNewFrequency(parseInt(e.target.value) || 1)}
              min={1}
              max={365}
              className="form-input"
            />
          </div>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary">添加</button>
            <button type="button" className="btn btn-secondary" onClick={() => setShowAddForm(false)}>取消</button>
          </div>
        </form>
      )}

      <div className="task-list">
        {overdueChores.length > 0 && (
          <div className="task-section">
            <h3 className="section-overdue">⚠️ 已过期 ({overdueChores.length})</h3>
            {overdueChores.map(chore => (
              <ChoreCard key={chore.id} chore={chore} category="overdue" formatTime={formatTime}
                onComplete={handleComplete} onSkip={handleSkip} onDelete={handleDelete} onReschedule={handleReschedule} onEdit={handleEdit} onStartChore={handleStartChore} onCancelChore={handleCancelChore} onPauseChore={handlePauseChore} onResumeChore={handleResumeChore} allChores={chores} />
            ))}
          </div>
        )}

        {activeChores.length > 0 && (
          <div className="task-section">
            <h3>🔥 正在进行 ({activeChores.length})</h3>
            {activeChores.map(chore => (
              <ChoreCard key={chore.id} chore={chore} category="active" formatTime={formatTime}
                onComplete={handleComplete} onSkip={handleSkip} onDelete={handleDelete} onReschedule={handleReschedule} onEdit={handleEdit} onStartChore={handleStartChore} onCancelChore={handleCancelChore} onPauseChore={handlePauseChore} onResumeChore={handleResumeChore} allChores={chores} />
            ))}
          </div>
        )}

        {allUpcoming.length > 0 && (
          <div className="task-section">
            <h3>📅 即将进行 ({allUpcoming.length})</h3>
            {(() => {
              let lastDate = '';
              return allUpcoming.map(chore => {
                // Use local date to avoid UTC offset issues
                const choreLocalDate = chore.scheduledAt ? (() => {
                  const d = new Date(chore.scheduledAt!);
                  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                })() : '';
                const showSep = choreLocalDate && choreLocalDate !== lastDate;
                lastDate = choreLocalDate;
                const d = choreLocalDate ? new Date(choreLocalDate + 'T00:00:00') : null;
                const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
                const dayLabel = d ? days[d.getDay()] : '';
                const nowLocal = new Date();
                const todayDate = `${nowLocal.getFullYear()}-${String(nowLocal.getMonth() + 1).padStart(2, '0')}-${String(nowLocal.getDate()).padStart(2, '0')}`;
                const tmr = new Date(nowLocal.getTime() + 86400000);
                const tomorrowDate = `${tmr.getFullYear()}-${String(tmr.getMonth() + 1).padStart(2, '0')}-${String(tmr.getDate()).padStart(2, '0')}`;
                let dateLabel = `${choreLocalDate} (${dayLabel})`;
                if (choreLocalDate === todayDate) dateLabel = `${choreLocalDate} (今天)`;
                else if (choreLocalDate === tomorrowDate) dateLabel = `${choreLocalDate} (明天 ${dayLabel})`;
                return (
                  <div key={chore.id}>
                    {showSep && <div className="meal-day-separator">{dateLabel}</div>}
                    <ChoreCard chore={chore} category="upcoming" formatTime={formatTime}
                      onComplete={handleComplete} onSkip={handleSkip} onDelete={handleDelete} onReschedule={handleReschedule} onEdit={handleEdit} onStartChore={handleStartChore} onCancelChore={handleCancelChore} onPauseChore={handlePauseChore} onResumeChore={handleResumeChore} allChores={chores} />
                  </div>
                );
              });
            })()}
          </div>
        )}

        {unscheduledChores.length > 0 && (
          <div className="task-section">
            <h3>📋 未安排时间 ({unscheduledChores.length})</h3>
            {unscheduledChores.map(chore => (
              <ChoreCard key={chore.id} chore={chore} category="unscheduled" formatTime={formatTime}
                onComplete={handleComplete} onSkip={handleSkip} onDelete={handleDelete} onReschedule={handleReschedule} onEdit={handleEdit} onStartChore={handleStartChore} onCancelChore={handleCancelChore} onPauseChore={handlePauseChore} onResumeChore={handleResumeChore} allChores={chores} />
            ))}
          </div>
        )}

        {skippedChores.length > 0 && (
          <div className="task-section">
            <div className="section-header-with-actions">
              <h3>⏭️ 已跳过 ({skippedChores.length})</h3>
              <div className="batch-actions">
                <label className="batch-select-all">
                  <input type="checkbox" checked={skippedChores.length > 0 && skippedChores.every(c => selectedForDelete.has(c.id))} onChange={() => toggleSelectAll(skippedChores.map(c => c.id))} />
                  全选
                </label>
              </div>
            </div>
            {skippedChores.map(chore => (
              <div key={chore.id} className="batch-item">
                <input type="checkbox" className="batch-checkbox" checked={selectedForDelete.has(chore.id)} onChange={() => toggleSelect(chore.id)} />
                <ChoreCard chore={chore} category="skipped" formatTime={formatTime}
                  onComplete={handleComplete} onSkip={handleSkip} onDelete={handleDelete} onReschedule={handleReschedule} onEdit={handleEdit} onStartChore={handleStartChore} onCancelChore={handleCancelChore} onPauseChore={handlePauseChore} onResumeChore={handleResumeChore} allChores={chores} />
              </div>
            ))}
          </div>
        )}

        {doneChores.length > 0 && (
          <div className="task-section">
            <div className="section-header-with-actions">
              <h3>✅ 已完成 ({doneChores.length})</h3>
              <div className="batch-actions">
                <label className="batch-select-all">
                  <input type="checkbox" checked={doneChores.length > 0 && doneChores.every(c => selectedForDelete.has(c.id))} onChange={() => toggleSelectAll(doneChores.map(c => c.id))} />
                  全选
                </label>
                {selectedForDelete.size > 0 && (
                  <button className="btn btn-danger btn-sm" onClick={handleBatchDelete}>删除选中 ({selectedForDelete.size})</button>
                )}
              </div>
            </div>
            {doneChores.map(chore => (
              <div key={chore.id} className="batch-item">
                <input type="checkbox" className="batch-checkbox" checked={selectedForDelete.has(chore.id)} onChange={() => toggleSelect(chore.id)} />
                <ChoreCard chore={chore} category="done" formatTime={formatTime}
                  onComplete={handleComplete} onSkip={handleSkip} onDelete={handleDelete} onReschedule={handleReschedule} onEdit={handleEdit} onStartChore={handleStartChore} onCancelChore={handleCancelChore} onPauseChore={handlePauseChore} onResumeChore={handleResumeChore} allChores={chores} />
              </div>
            ))}
          </div>
        )}

        {selectedForDelete.size > 0 && (
          <div className="batch-delete-bar">
            <span>已选中 {selectedForDelete.size} 项</span>
            <button className="btn btn-danger" onClick={handleBatchDelete}>🗑 批量删除</button>
            <button className="btn btn-secondary btn-sm" onClick={() => setSelectedForDelete(new Set())}>取消选择</button>
          </div>
        )}

        {chores.length === 0 && (
          <div className="empty-state">
            <p>还没有家务，点击上方"添加家务"开始吧</p>
          </div>
        )}
      </div>
    </>
  );
}

// Sub-component for a single chore card
interface ChoreCardProps {
  chore: Chore;
  category: string;
  formatTime: (s: string) => string;
  onComplete: (id: string) => void;
  onSkip: (id: string) => void;
  onDelete: (id: string) => void;
  onReschedule: (id: string, time: string) => void;
  onEdit: (id: string, updates: Partial<Pick<Chore, 'title' | 'description' | 'durationMinutes' | 'frequencyDays'>>) => void;
  onStartChore: (id: string) => void;
  onCancelChore: (id: string) => void;
  onPauseChore: (id: string) => void;
  onResumeChore: (id: string) => void;
  allChores: Chore[];
}

function ChoreCard({ chore, category, formatTime, onComplete, onSkip, onDelete, onReschedule, onEdit, onStartChore, onCancelChore, onPauseChore, onResumeChore, allChores }: ChoreCardProps) {
  const [editingTime, setEditingTime] = useState(false);
  const [editTime, setEditTime] = useState('');
  const [editingFields, setEditingFields] = useState(false);
  const [editTitle, setEditTitle] = useState(chore.title);
  const [editDescription, setEditDescription] = useState(chore.description ?? '');
  const [editDuration, setEditDuration] = useState(chore.durationMinutes);
  const [editFrequency, setEditFrequency] = useState(chore.frequencyDays ?? 1);
  const [elapsed, setElapsed] = useState(0);

  const isTimeable = chore.durationMinutes > 20;
  const isTimerRunning = isTimeable && !!chore.startedAt && category !== 'done' && category !== 'skipped';
  const isPaused = isTimeable && !chore.startedAt && (chore.pausedElapsed ?? 0) > 0 && category !== 'done' && category !== 'skipped';

  // Live timer
  useEffect(() => {
    if (!isTimerRunning || !chore.startedAt) return;
    const base = chore.pausedElapsed ?? 0;
    const update = () => setElapsed(base + Math.floor((Date.now() - new Date(chore.startedAt!).getTime()) / 1000));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [isTimerRunning, chore.startedAt, chore.pausedElapsed]);

  const formatElapsed = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleSaveTime = () => {
    if (editTime) {
      onReschedule(chore.id, editTime);
      setEditingTime(false);
    }
  };

  const handleSaveFields = () => {
    onEdit(chore.id, {
      title: editTitle.trim() || chore.title,
      description: editDescription,
      durationMinutes: editDuration,
      frequencyDays: editFrequency,
    });
    setEditingFields(false);
  };

  const handleCancelFields = () => {
    setEditTitle(chore.title);
    setEditDescription(chore.description ?? '');
    setEditDuration(chore.durationMinutes);
    setEditFrequency(chore.frequencyDays ?? 1);
    setEditingFields(false);
  };

  const freqLabel = (chore.frequencyDays ?? 1) === 1 ? '每天' : `每${chore.frequencyDays}天`;
  const isHighPriority = chore.priority === 'high';

  return (
    <div className={`task-card chore-card ${category} ${isHighPriority ? 'high-priority' : ''}`}>
      <div className="task-header">
        {!editingFields ? (
          <span className="chore-title">
            {isHighPriority && <span className="priority-icon" title="高优先级（5-10分钟快速任务）">🔥</span>}
            {chore.title}
          </span>
        ) : (
          <input
            type="text"
            value={editTitle}
            onChange={e => setEditTitle(e.target.value)}
            className="form-input-sm edit-title-input"
          />
        )}
        <div className="task-header-right">
          <span className="chore-duration">{chore.durationMinutes}分钟</span>
          <span className="chore-frequency">{freqLabel}</span>
          {category !== 'done' && category !== 'skipped' && (
            <button className="btn-edit" onClick={() => setEditingFields(!editingFields)} title="编辑">✎</button>
          )}
          <button className="btn-delete" onClick={() => onDelete(chore.id)} title="删除">✕</button>
        </div>
      </div>

      {editingFields && (
        <div className="edit-fields-form">
          <div className="edit-row edit-row-full">
            <label>描述</label>
            <textarea value={editDescription} onChange={e => setEditDescription(e.target.value)} className="form-input-sm edit-description" placeholder="写点备注，比如今晚要准备的食材..." rows={2} />
          </div>
          <div className="edit-row">
            <label>时长(分钟)</label>
            <input type="number" value={editDuration} onChange={e => setEditDuration(parseInt(e.target.value) || 30)} min={1} max={480} className="form-input-sm" />
          </div>
          <div className="edit-row">
            <label>频率(每N天)</label>
            <input type="number" value={editFrequency} onChange={e => setEditFrequency(parseInt(e.target.value) || 1)} min={1} max={365} className="form-input-sm" />
          </div>
          <div className="edit-row-actions">
            <button className="btn btn-primary btn-sm" onClick={handleSaveFields}>保存</button>
            <button className="btn btn-secondary btn-sm" onClick={handleCancelFields}>取消</button>
          </div>
        </div>
      )}

      {/* Show description if present */}
      {!editingFields && chore.description && (
        <div className="chore-description">{chore.description}</div>
      )}

      {chore.scheduledAt && (
        <div className="chore-time-info">
          {formatTime(chore.scheduledAt)}
        </div>
      )}

      {category !== 'done' && category !== 'skipped' && (
        <div className="chore-actions">
          {isTimeable && !chore.startedAt && !isPaused && (
            <button className="btn btn-secondary" onClick={() => onStartChore(chore.id)}>▶ 开始</button>
          )}
          {isPaused && (
            <>
              <span className="chore-timer paused">⏸ {formatElapsed(chore.pausedElapsed ?? 0)}</span>
              <button className="btn btn-secondary" onClick={() => onResumeChore(chore.id)}>▶ 继续</button>
            </>
          )}
          {isTimerRunning && (
            <>
              <span className="chore-timer">⏱ {formatElapsed(elapsed)}</span>
              <button className="btn btn-pause" onClick={() => onPauseChore(chore.id)}>⏸ 暂停</button>
              <button className="btn btn-cancel" onClick={() => onCancelChore(chore.id)}>✕ 取消</button>
            </>
          )}
          <button className="btn btn-pass" onClick={() => onComplete(chore.id)}>{isTimerRunning ? '⏹ 完成' : '✓ 完成'}</button>
          <button className="btn btn-skip" onClick={() => onSkip(chore.id)}>⏭ 跳过</button>
          {!editingTime ? (
            <button className="btn btn-secondary" onClick={() => { setEditingTime(true); setEditTime(''); }}>
              {chore.scheduledAt ? '改时间' : '安排时间'}
            </button>
          ) : (
            <div className="reschedule-form">
              <input type="datetime-local" value={editTime} onChange={e => setEditTime(e.target.value)} className="form-input-sm" />
              <button className="btn btn-primary btn-sm" onClick={handleSaveTime}>确定</button>
              <button className="btn btn-secondary btn-sm" onClick={() => setEditingTime(false)}>取消</button>
            </div>
          )}
        </div>
      )}

      {category === 'done' && chore.completedAt && (
        <div className="chore-time-info done-info">
          {chore.actualMinutes ? `实际用时 ${chore.actualMinutes}分钟 · ` : ''}完成于 {formatTime(chore.completedAt)}
        </div>
      )}

      {/* Days since last completion of same task */}
      {category !== 'done' && (() => {
        const lastDone = allChores
          .filter(c => c.title === chore.title && c.status === 'done' && c.completedAt && c.id !== chore.id)
          .sort((a, b) => new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime())[0];
        if (!lastDone) return null;
        const days = Math.floor((Date.now() - new Date(lastDone.completedAt!).getTime()) / (1000 * 60 * 60 * 24));
        return (
          <div className="chore-last-done">
            距上次完成: {days === 0 ? '今天' : `${days}天前`}
          </div>
        );
      })()}
    </div>
  );
}
