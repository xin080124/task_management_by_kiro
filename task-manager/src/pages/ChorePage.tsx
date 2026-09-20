import { useState, useEffect, useCallback, useRef } from 'react';
import type { Chore } from '../types';
import { loadChores, saveChores, generateChoreId, exportChoresToCsv, importChoresFromCsv } from '../choreStore';
import ChoreTimeline from '../components/ChoreTimeline';
import ChoreTimesheet from '../components/ChoreTimesheet';
import { activateTimer, deactivateTimer } from '../timerCoordinator';
import type { Subtask, WorkSegment } from '../types';

const TIMER_ID = 'chore';

function genSubtaskId(): string {
  return 'csub-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function segSecondsC(segments: WorkSegment[], nowMs: number): number {
  return segments.reduce((sum, seg) => {
    const start = new Date(seg.start).getTime();
    const end = seg.end ? new Date(seg.end).getTime() : nowMs;
    return sum + Math.max(0, Math.floor((end - start) / 1000));
  }, 0);
}

function choreTotalSeconds(chore: Chore, nowMs: number = Date.now()): number {
  return (chore.subtasks ?? []).reduce((s, sub) => s + segSecondsC(sub.segments, nowMs), 0);
}

// 关闭家务当前进行中的时间段（活跃子步骤里 end=null 的那段）
function closeOpenSegmentC(chore: Chore, endIso: string): Chore {
  if (!chore.startedAt) return chore;
  const subtasks = (chore.subtasks ?? []).map(sub => ({
    ...sub,
    segments: sub.segments.map(seg => (seg.end === null ? { ...seg, end: endIso } : seg)),
  }));
  const pausedElapsed = choreTotalSeconds({ ...chore, subtasks }, new Date(endIso).getTime());
  return { ...chore, startedAt: null, subtasks, pausedElapsed };
}

// 给指定子步骤开一段新的计时段
function openSegmentForSubtaskC(chore: Chore, subtaskId: string, startIso: string): Chore {
  const subtasks = (chore.subtasks ?? []).map(sub =>
    sub.id === subtaskId ? { ...sub, segments: [...sub.segments, { start: startIso, end: null }] } : sub
  );
  return { ...chore, startedAt: startIso, activeSubtaskId: subtaskId, subtasks };
}

function defaultChoreSubtasks(): Subtask[] {
  return [{ id: genSubtaskId(), label: '做家务', segments: [] }];
}

export default function ChorePage() {
  const [chores, setChores] = useState<Chore[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedForDelete, setSelectedForDelete] = useState<Set<string>>(new Set());
  const [expandedStat, setExpandedStat] = useState<string | null>(null);
  // 已完成区视图：'list' 列表 | 'title' 按标题分组表格 | 'date' 按日期分组
  const [doneViewMode, setDoneViewMode] = useState<'list' | 'title' | 'date'>('list');
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

  // 滚动定位到某个任务卡片，并短暂高亮
  const scrollToTask = useCallback((id: string) => {
    const el = document.querySelector(`[data-chore-id="${id}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('task-flash');
    setTimeout(() => el.classList.remove('task-flash'), 1500);
  }, []);

  // 暂停当前正在跑的家务（供全局协调中心在别的计时器启动时回调）
  const pauseRunningChores = useCallback(() => {
    const nowIso = new Date().toISOString();
    setChores(prev => prev.map(c => (c.startedAt ? closeOpenSegmentC(c, nowIso) : c)));
  }, []);

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
          description: c.description ?? '',
          scheduledAt: t.toISOString(),
          durationMinutes: c.durationMinutes,
          actualMinutes: null,
          startedAt: null,
          pausedElapsed: 0,
          subtasks: defaultChoreSubtasks(),
          activeSubtaskId: null,
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
      subtasks: defaultChoreSubtasks(),
      activeSubtaskId: null,
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
    deactivateTimer(TIMER_ID);
    setChores(prev => {
      const nowIso = new Date().toISOString();
      const updated = prev.map(c => {
        if (c.id !== id) return c;
        // 关闭进行中的段，再按所有子步骤总和算实际用时
        const closed = closeOpenSegmentC(c, nowIso);
        const totalSeconds = choreTotalSeconds(closed);
        const actual = totalSeconds > 0 ? Math.max(1, Math.round(totalSeconds / 60)) : null;
        return { ...closed, status: 'done' as const, completedAt: nowIso, actualMinutes: actual, activeSubtaskId: null };
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
            description: completed.description ?? '',
            scheduledAt: nextTime.toISOString(),
            durationMinutes: completed.durationMinutes,
            actualMinutes: null,
            startedAt: null,
            pausedElapsed: 0,
            subtasks: defaultChoreSubtasks(),
            activeSubtaskId: null,
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
            description: skipped.description ?? '',
            scheduledAt: nextTime.toISOString(),
            durationMinutes: skipped.durationMinutes,
            actualMinutes: null,
            startedAt: null,
            pausedElapsed: 0,
            subtasks: defaultChoreSubtasks(),
            activeSubtaskId: null,
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

  // 选择/取消一组 id（按标题或按日期分组的全选）
  const toggleSelectGroup = useCallback((ids: string[]) => {
    setSelectedForDelete(prev => {
      const next = new Set(prev);
      const allSelected = ids.every(id => next.has(id));
      if (allSelected) {
        ids.forEach(id => next.delete(id));
      } else {
        ids.forEach(id => next.add(id));
      }
      return next;
    });
  }, []);

  const handleReschedule = useCallback((id: string, newTime: string) => {
    setChores(prev => prev.map(c =>
      c.id === id ? { ...c, scheduledAt: newTime, status: 'scheduled' as const } : c
    ));
  }, []);

  // 开始/继续：单一活跃计时器——先暂停其它所有正在跑的家务，再给目标家务的活跃子步骤开一段
  const startChoreTimer = useCallback((id: string) => {
    // 全局互斥：先停掉别的类型的计时器（工作等）
    activateTimer(TIMER_ID, pauseRunningChores);
    const nowIso = new Date().toISOString();
    setChores(prev => prev.map(c => {
      if (c.id === id) {
        const targetSubId = c.activeSubtaskId ?? c.subtasks[0]?.id;
        if (!targetSubId) return c;
        return openSegmentForSubtaskC(c, targetSubId, nowIso);
      }
      // 其它正在跑的家务：自动暂停（关闭其进行中的段）
      if (c.startedAt) {
        return closeOpenSegmentC(c, nowIso);
      }
      return c;
    }));
  }, [pauseRunningChores]);

  const handleStartChore = startChoreTimer;
  const handleResumeChore = startChoreTimer;

  // 添加子步骤（记录分心念头）：结束当前段、新建子步骤并开始计时
  const handleAddChoreSubtask = useCallback((id: string, label: string) => {
    const trimmed = label.trim();
    if (!trimmed) return;
    activateTimer(TIMER_ID, pauseRunningChores);
    const nowIso = new Date().toISOString();
    setChores(prev => prev.map(c => {
      if (c.id !== id) {
        if (c.startedAt) return closeOpenSegmentC(c, nowIso);
        return c;
      }
      const closed = closeOpenSegmentC(c, nowIso);
      const newSub: Subtask = { id: genSubtaskId(), label: trimmed, segments: [{ start: nowIso, end: null }] };
      return { ...closed, startedAt: nowIso, activeSubtaskId: newSub.id, subtasks: [...closed.subtasks, newSub] };
    }));
  }, [pauseRunningChores]);

  const handleRenameChoreSubtask = useCallback((choreId: string, subId: string, label: string) => {
    setChores(prev => prev.map(c =>
      c.id === choreId
        ? { ...c, subtasks: c.subtasks.map(s => s.id === subId ? { ...s, label: label.trim() || s.label } : s) }
        : c
    ));
  }, []);

  const handleCancelChore = useCallback((id: string) => {
    deactivateTimer(TIMER_ID);
    setChores(prev => prev.map(c =>
      c.id === id ? { ...c, startedAt: null, pausedElapsed: 0, subtasks: defaultChoreSubtasks(), activeSubtaskId: null } : c
    ));
  }, []);

  const handlePauseChore = useCallback((id: string) => {
    deactivateTimer(TIMER_ID);
    setChores(prev => prev.map(c => {
      if (c.id !== id || !c.startedAt) return c;
      return closeOpenSegmentC(c, new Date().toISOString());
    }));
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
        <ChoreTimesheet chores={chores} />
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

      {(() => {
        const active = chores.find(c => c.startedAt);
        if (!active) return null;
        return (
          <div className="active-timer-banner">
            <span>⏱ 正在计时：</span>
            <strong>{active.title}</strong>
            <span style={{ marginLeft: 'auto', fontSize: 12, opacity: 0.8 }}>开始另一个任务会自动暂停它</span>
          </div>
        );
      })()}

      {(() => {
        // 进行中 + 已暂停的任务，提供快速定位链接
        const running = chores.filter(c => c.startedAt);
        const paused = chores.filter(c => !c.startedAt && (c.pausedElapsed ?? 0) > 0 && c.status !== 'done' && c.status !== 'skipped');
        if (running.length === 0 && paused.length === 0) return null;
        return (
          <div className="jump-panel">
            <span className="jump-panel-label">⚡ 快速定位：</span>
            {running.map(c => (
              <button key={c.id} className="jump-chip running" onClick={() => scrollToTask(c.id)} title="跳到该任务">
                ⏱ {c.title}
              </button>
            ))}
            {paused.map(c => (
              <button key={c.id} className="jump-chip paused" onClick={() => scrollToTask(c.id)} title="跳到该任务">
                ⏸ {c.title}
              </button>
            ))}
          </div>
        );
      })()}

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
                onComplete={handleComplete} onSkip={handleSkip} onDelete={handleDelete} onReschedule={handleReschedule} onEdit={handleEdit} onStartChore={handleStartChore} onCancelChore={handleCancelChore} onPauseChore={handlePauseChore} onResumeChore={handleResumeChore} onAddSubtask={handleAddChoreSubtask} onRenameSubtask={handleRenameChoreSubtask} allChores={chores} />
            ))}
          </div>
        )}

        {activeChores.length > 0 && (
          <div className="task-section">
            <h3>🔥 正在进行 ({activeChores.length})</h3>
            {activeChores.map(chore => (
              <ChoreCard key={chore.id} chore={chore} category="active" formatTime={formatTime}
                onComplete={handleComplete} onSkip={handleSkip} onDelete={handleDelete} onReschedule={handleReschedule} onEdit={handleEdit} onStartChore={handleStartChore} onCancelChore={handleCancelChore} onPauseChore={handlePauseChore} onResumeChore={handleResumeChore} onAddSubtask={handleAddChoreSubtask} onRenameSubtask={handleRenameChoreSubtask} allChores={chores} />
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
                      onComplete={handleComplete} onSkip={handleSkip} onDelete={handleDelete} onReschedule={handleReschedule} onEdit={handleEdit} onStartChore={handleStartChore} onCancelChore={handleCancelChore} onPauseChore={handlePauseChore} onResumeChore={handleResumeChore} onAddSubtask={handleAddChoreSubtask} onRenameSubtask={handleRenameChoreSubtask} allChores={chores} />
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
                onComplete={handleComplete} onSkip={handleSkip} onDelete={handleDelete} onReschedule={handleReschedule} onEdit={handleEdit} onStartChore={handleStartChore} onCancelChore={handleCancelChore} onPauseChore={handlePauseChore} onResumeChore={handleResumeChore} onAddSubtask={handleAddChoreSubtask} onRenameSubtask={handleRenameChoreSubtask} allChores={chores} />
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
                  onComplete={handleComplete} onSkip={handleSkip} onDelete={handleDelete} onReschedule={handleReschedule} onEdit={handleEdit} onStartChore={handleStartChore} onCancelChore={handleCancelChore} onPauseChore={handlePauseChore} onResumeChore={handleResumeChore} onAddSubtask={handleAddChoreSubtask} onRenameSubtask={handleRenameChoreSubtask} allChores={chores} />
              </div>
            ))}
          </div>
        )}

        {doneChores.length > 0 && (
          <div className="task-section">
            <div className="section-header-with-actions">
              <h3>✅ 已完成 ({doneChores.length})</h3>
              <div className="batch-actions">
                <div className="view-mode-tabs">
                  <button className={`view-mode-tab ${doneViewMode === 'list' ? 'active' : ''}`} onClick={() => setDoneViewMode('list')}>列表</button>
                  <button className={`view-mode-tab ${doneViewMode === 'title' ? 'active' : ''}`} onClick={() => setDoneViewMode('title')}>按标题</button>
                  <button className={`view-mode-tab ${doneViewMode === 'date' ? 'active' : ''}`} onClick={() => setDoneViewMode('date')}>按日期</button>
                </div>
                {doneViewMode === 'list' && (
                  <label className="batch-select-all">
                    <input type="checkbox" checked={doneChores.length > 0 && doneChores.every(c => selectedForDelete.has(c.id))} onChange={() => toggleSelectAll(doneChores.map(c => c.id))} />
                    全选
                  </label>
                )}
                {selectedForDelete.size > 0 && (
                  <button className="btn btn-danger btn-sm" onClick={handleBatchDelete}>删除选中 ({selectedForDelete.size})</button>
                )}
              </div>
            </div>

            {doneViewMode === 'list' && doneChores.map(chore => (
              <div key={chore.id} className="batch-item">
                <input type="checkbox" className="batch-checkbox" checked={selectedForDelete.has(chore.id)} onChange={() => toggleSelect(chore.id)} />
                <ChoreCard chore={chore} category="done" formatTime={formatTime}
                  onComplete={handleComplete} onSkip={handleSkip} onDelete={handleDelete} onReschedule={handleReschedule} onEdit={handleEdit} onStartChore={handleStartChore} onCancelChore={handleCancelChore} onPauseChore={handlePauseChore} onResumeChore={handleResumeChore} onAddSubtask={handleAddChoreSubtask} onRenameSubtask={handleRenameChoreSubtask} allChores={chores} />
              </div>
            ))}

            {doneViewMode === 'title' && (
              <DoneByTitleTable
                doneChores={doneChores}
                selected={selectedForDelete}
                onToggle={toggleSelect}
                onToggleGroup={toggleSelectGroup}
                formatTime={formatTime}
              />
            )}

            {doneViewMode === 'date' && (
              <DoneByDateGroups
                doneChores={doneChores}
                selected={selectedForDelete}
                onToggle={toggleSelect}
                onToggleGroup={toggleSelectGroup}
                formatTime={formatTime}
                onDelete={handleDelete}
              />
            )}
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
  onAddSubtask: (id: string, label: string) => void;
  onRenameSubtask: (choreId: string, subId: string, label: string) => void;
  allChores: Chore[];
}

function ChoreCard({ chore, category, formatTime, onComplete, onSkip, onDelete, onReschedule, onEdit, onStartChore, onCancelChore, onPauseChore, onResumeChore, onAddSubtask, onRenameSubtask, allChores }: ChoreCardProps) {
  const [newSubLabel, setNewSubLabel] = useState('');
  const [editingSubId, setEditingSubId] = useState<string | null>(null);
  const [editSubLabel, setEditSubLabel] = useState('');
  const [showDistractionReminder, setShowDistractionReminder] = useState(false);
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
    <div className={`task-card chore-card ${category} ${isHighPriority ? 'high-priority' : ''}`} data-chore-id={chore.id}>
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

      {/* 分心记录时间线：正经做家务 + 中途冒出的念头 */}
      {chore.subtasks && chore.subtasks.length > 1 && (
        <div className="subtask-timeline">
          <div className="subtask-timeline-title">🧩 过程记录（含分心念头）</div>
          {chore.subtasks.map((sub, idx) => {
            const isActive = chore.activeSubtaskId === sub.id && isTimerRunning;
            const secs = sub.segments.reduce((s, seg) => {
              const start = new Date(seg.start).getTime();
              const end = seg.end ? new Date(seg.end).getTime() : (isActive ? Date.now() : start);
              return s + Math.max(0, Math.floor((end - start) / 1000));
            }, 0);
            const isDistraction = idx > 0; // 第一个是正经家务，之后的都是分心记录
            return (
              <div key={sub.id} className={`subtask-row ${isActive ? 'active' : ''}`}>
                <span className="subtask-dot" />
                <span className="subtask-index">{isDistraction ? '💭' : `${idx + 1}.`}</span>
                {editingSubId === sub.id ? (
                  <input
                    type="text"
                    className="form-input-sm subtask-edit-input"
                    value={editSubLabel}
                    autoFocus
                    onChange={e => setEditSubLabel(e.target.value)}
                    onBlur={() => { onRenameSubtask(chore.id, sub.id, editSubLabel); setEditingSubId(null); }}
                    onKeyDown={e => { if (e.key === 'Enter') { onRenameSubtask(chore.id, sub.id, editSubLabel); setEditingSubId(null); } }}
                  />
                ) : (
                  <span className="subtask-label" title="点击重命名" onClick={() => { setEditingSubId(sub.id); setEditSubLabel(sub.label); }}>
                    {sub.label}{isActive && ' ⏱'}
                  </span>
                )}
                <span className="subtask-time">{formatElapsed(secs)}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* 分心记录输入：做家务中途冒出念头，记一笔、别急着去做 */}
      {(isTimerRunning || isPaused) && (
        <>
          <form
            className="add-subtask-form"
            onSubmit={e => {
              e.preventDefault();
              if (newSubLabel.trim()) {
                onAddSubtask(chore.id, newSubLabel);
                setNewSubLabel('');
                setShowDistractionReminder(true);
                setTimeout(() => setShowDistractionReminder(false), 8000);
              }
            }}
          >
            <input
              type="text"
              className="form-input-sm"
              value={newSubLabel}
              onChange={e => setNewSubLabel(e.target.value)}
              placeholder="💭 冒出什么念头？记一笔，别急着去做…"
            />
            <button type="submit" className="btn btn-primary btn-sm" disabled={!newSubLabel.trim()}>记下</button>
          </form>
          {showDistractionReminder && (
            <div className="distraction-reminder">😌 记下了。三分钟后再散漫哦～冲动过了往往就不想了。</div>
          )}
        </>
      )}
    </div>
  );
}

// ===== 按标题分组表格：可看到出现频率超过 10 的 records =====
interface DoneGroupProps {
  doneChores: Chore[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleGroup: (ids: string[]) => void;
  formatTime: (s: string) => string;
}

function DoneByTitleTable({ doneChores, selected, onToggle, onToggleGroup, formatTime }: DoneGroupProps) {
  const [expandedTitle, setExpandedTitle] = useState<string | null>(null);
  const [onlyFrequent, setOnlyFrequent] = useState(false);

  // 按标题分组
  const groups = new Map<string, Chore[]>();
  for (const c of doneChores) {
    if (!groups.has(c.title)) groups.set(c.title, []);
    groups.get(c.title)!.push(c);
  }

  let rows = Array.from(groups.entries()).map(([title, items]) => ({
    title,
    items: [...items].sort((a, b) => new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime()),
    count: items.length,
    totalMinutes: items.reduce((s, i) => s + (i.actualMinutes ?? i.durationMinutes), 0),
  }));

  // 按出现次数降序
  rows.sort((a, b) => b.count - a.count);

  const frequentRows = rows.filter(r => r.count > 10);
  if (onlyFrequent) rows = frequentRows;

  const avg = (r: typeof rows[0]) => Math.round(r.totalMinutes / r.count);

  return (
    <div className="done-title-view">
      <div className="done-title-toolbar">
        <label className="batch-select-all">
          <input type="checkbox" checked={onlyFrequent} onChange={() => setOnlyFrequent(v => !v)} />
          只看高频（出现 &gt; 10 次）
        </label>
        <span className="done-title-hint">共 {rows.length} 类，高频 {frequentRows.length} 类</span>
      </div>
      <table className="chore-table">
        <thead>
          <tr>
            <th></th>
            <th>家务标题</th>
            <th>出现次数</th>
            <th>总时长</th>
            <th>平均时长</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const ids = r.items.map(i => i.id);
            const allSelected = ids.every(id => selected.has(id));
            const isFrequent = r.count > 10;
            const isExpanded = expandedTitle === r.title;
            return (
              <>
                <tr key={r.title} className={isFrequent ? 'row-frequent' : ''}>
                  <td>
                    <input type="checkbox" checked={allSelected} onChange={() => onToggleGroup(ids)} title="按标题全选这一类" />
                  </td>
                  <td className="cell-title">
                    {isFrequent && <span className="freq-badge" title="出现频率超过 10 次">🔥</span>}
                    {r.title}
                  </td>
                  <td className={isFrequent ? 'cell-count frequent' : 'cell-count'}>{r.count}</td>
                  <td>{r.totalMinutes} 分钟</td>
                  <td>{avg(r)} 分钟</td>
                  <td>
                    <button className="btn btn-secondary btn-sm" onClick={() => setExpandedTitle(isExpanded ? null : r.title)}>
                      {isExpanded ? '收起' : '展开'}
                    </button>
                  </td>
                </tr>
                {isExpanded && (
                  <tr className="detail-row">
                    <td></td>
                    <td colSpan={5}>
                      <table className="chore-subtable">
                        <thead>
                          <tr>
                            <th></th>
                            <th>完成时间</th>
                            <th>用时</th>
                          </tr>
                        </thead>
                        <tbody>
                          {r.items.map(item => (
                            <tr key={item.id}>
                              <td>
                                <input type="checkbox" checked={selected.has(item.id)} onChange={() => onToggle(item.id)} />
                              </td>
                              <td>{item.completedAt ? formatTime(item.completedAt) : '-'}</td>
                              <td>{item.actualMinutes ?? item.durationMinutes} 分钟</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ===== 按日期分组：可按日期全选 =====
interface DoneByDateProps extends DoneGroupProps {
  onDelete: (id: string) => void;
}

function DoneByDateGroups({ doneChores, selected, onToggle, onToggleGroup, formatTime, onDelete }: DoneByDateProps) {
  // 按完成日期(YYYY-MM-DD, 本地时区)分组
  const groups = new Map<string, Chore[]>();
  for (const c of doneChores) {
    if (!c.completedAt) continue;
    const d = new Date(c.completedAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(c);
  }

  const sortedDates = Array.from(groups.keys()).sort((a, b) => b.localeCompare(a));
  const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  return (
    <div className="done-date-view">
      {sortedDates.map(date => {
        const items = groups.get(date)!;
        const ids = items.map(i => i.id);
        const allSelected = ids.every(id => selected.has(id));
        const d = new Date(date + 'T00:00:00');
        const total = items.reduce((s, i) => s + (i.actualMinutes ?? i.durationMinutes), 0);
        return (
          <div key={date} className="date-group">
            <div className="date-group-header">
              <label className="batch-select-all">
                <input type="checkbox" checked={allSelected} onChange={() => onToggleGroup(ids)} title="按日期全选" />
                {date} ({days[d.getDay()]})
              </label>
              <span className="date-group-summary">{items.length} 项 · 共 {total} 分钟</span>
            </div>
            {items
              .sort((a, b) => new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime())
              .map(chore => (
                <div key={chore.id} className="batch-item">
                  <input type="checkbox" className="batch-checkbox" checked={selected.has(chore.id)} onChange={() => onToggle(chore.id)} />
                  <ChoreCard chore={chore} category="done" formatTime={formatTime}
                    onComplete={() => {}} onSkip={() => {}} onDelete={onDelete} onReschedule={() => {}} onEdit={() => {}} onStartChore={() => {}} onCancelChore={() => {}} onPauseChore={() => {}} onResumeChore={() => {}} onAddSubtask={() => {}} onRenameSubtask={() => {}} allChores={doneChores} />
                </div>
              ))}
          </div>
        );
      })}
    </div>
  );
}
