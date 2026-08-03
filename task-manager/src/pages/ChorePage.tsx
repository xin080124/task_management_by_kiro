import { useState, useEffect, useCallback, useRef } from 'react';
import type { Chore } from '../types';
import { loadChores, saveChores, generateChoreId, exportChoresToCsv, importChoresFromCsv } from '../choreStore';
import ChoreTimeline from '../components/ChoreTimeline';

export default function ChorePage() {
  const [chores, setChores] = useState<Chore[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
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
  const doneChores = chores.filter(c => getChoreCategory(c) === 'done');
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
          scheduledAt: t.toISOString(),
          durationMinutes: c.durationMinutes,
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
      scheduledAt: newScheduledAt || null,
      durationMinutes: newDuration,
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
      const updated = prev.map(c =>
        c.id === id ? { ...c, status: 'done' as const, completedAt: new Date().toISOString() } : c
      );

      // Auto-create next occurrence based on frequency
      const completed = updated.find(c => c.id === id);
      if (completed && completed.scheduledAt) {
        const freq = completed.frequencyDays ?? 1;
        const prevTime = new Date(completed.scheduledAt);
        const nextTime = new Date(prevTime.getTime() + freq * 24 * 60 * 60 * 1000);

        const nextChore: Chore = {
          id: generateChoreId(),
          title: completed.title,
          scheduledAt: nextTime.toISOString(),
          durationMinutes: completed.durationMinutes,
          frequencyDays: freq,
          priority: completed.priority ?? 'normal',
          skippedDates: completed.skippedDates ?? [],
          status: 'scheduled',
          createdAt: new Date().toISOString(),
          completedAt: null,
        };
        updated.push(nextChore);
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

        const nextChore: Chore = {
          id: generateChoreId(),
          title: skipped.title,
          scheduledAt: nextTime.toISOString(),
          durationMinutes: skipped.durationMinutes,
          frequencyDays: freq,
          priority: skipped.priority ?? 'normal',
          skippedDates: skipped.skippedDates ?? [],
          status: 'scheduled',
          createdAt: new Date().toISOString(),
          completedAt: null,
        };
        updated.push(nextChore);
      }

      return updated;
    });
  }, []);

  const handleDelete = useCallback((id: string) => {
    if (confirm('确定删除这个家务？')) {
      setChores(prev => prev.filter(c => c.id !== id));
    }
  }, []);

  const handleReschedule = useCallback((id: string, newTime: string) => {
    setChores(prev => prev.map(c =>
      c.id === id ? { ...c, scheduledAt: newTime, status: 'scheduled' as const } : c
    ));
  }, []);

  const handleEdit = useCallback((id: string, updates: Partial<Pick<Chore, 'title' | 'durationMinutes' | 'frequencyDays'>>) => {
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
  const getDayMinutes = (dayOffset: number) => {
    const dayStart = new Date(todayStart.getTime() + dayOffset * 24 * 60 * 60 * 1000);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    let total = 0;

    for (const c of chores) {
      if (c.status === 'done' || c.status === 'skipped') continue;
      if (!c.scheduledAt) continue;

      const baseTime = new Date(c.scheduledAt);
      const freq = c.frequencyDays ?? 1;

      // Check if this chore (or a future projected occurrence) falls on the target day
      // Project forward from the scheduled time
      let t = new Date(baseTime);
      // If the base time is before the target day, step forward by frequency
      while (t < dayStart) {
        t = new Date(t.getTime() + freq * 24 * 60 * 60 * 1000);
      }
      // If it lands within the target day, count it
      if (t >= dayStart && t < dayEnd) {
        total += c.durationMinutes;
      }
    }

    return total;
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

  const todayTotalMinutes = getDayMinutes(0);
  const tomorrowTotalMinutes = getDayMinutes(1);
  const dayAfterTotalMinutes = getDayMinutes(2);

  // Calculate completed durations for today, yesterday, day before
  const getDayCompletedMinutes = (dayOffset: number) => {
    const dayStart = new Date(todayStart.getTime() + dayOffset * 24 * 60 * 60 * 1000);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    return chores
      .filter(c => {
        if (c.status !== 'done' || !c.completedAt) return false;
        const t = new Date(c.completedAt);
        return t >= dayStart && t < dayEnd;
      })
      .reduce((sum, c) => sum + c.durationMinutes, 0);
  };

  const todayDoneMinutes = getDayCompletedMinutes(0);
  const yesterdayDoneMinutes = getDayCompletedMinutes(-1);
  const dayBeforeDoneMinutes = getDayCompletedMinutes(-2);

  return (
    <>
      <header className="app-header">
        <h1>🏠 家务管理器</h1>
        <div className="stats">
          <span className="stat">待完成: <strong>{pendingCount}项</strong></span>
          <span className="stat">已完成: <strong>{doneChores.length}项</strong></span>
        </div>
        <div className="stats">
          <span className="stat">📅 今天: <strong>{formatMinutes(todayTotalMinutes)}</strong></span>
          <span className="stat">明天: <strong>{formatMinutes(tomorrowTotalMinutes)}</strong></span>
          <span className="stat">后天: <strong>{formatMinutes(dayAfterTotalMinutes)}</strong></span>
        </div>
        <div className="stats">
          <span className="stat">✅ 今天: <strong>{formatMinutes(todayDoneMinutes)}</strong></span>
          <span className="stat">昨天: <strong>{formatMinutes(yesterdayDoneMinutes)}</strong></span>
          <span className="stat">前天: <strong>{formatMinutes(dayBeforeDoneMinutes)}</strong></span>
        </div>
      </header>

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
              min={5}
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
                onComplete={handleComplete} onSkip={handleSkip} onDelete={handleDelete} onReschedule={handleReschedule} onEdit={handleEdit} />
            ))}
          </div>
        )}

        {activeChores.length > 0 && (
          <div className="task-section">
            <h3>🔥 正在进行 ({activeChores.length})</h3>
            {activeChores.map(chore => (
              <ChoreCard key={chore.id} chore={chore} category="active" formatTime={formatTime}
                onComplete={handleComplete} onSkip={handleSkip} onDelete={handleDelete} onReschedule={handleReschedule} onEdit={handleEdit} />
            ))}
          </div>
        )}

        {allUpcoming.length > 0 && (
          <div className="task-section">
            <h3>📅 即将进行 ({allUpcoming.length})</h3>
            {allUpcoming.map(chore => (
              <ChoreCard key={chore.id} chore={chore} category="upcoming" formatTime={formatTime}
                onComplete={handleComplete} onSkip={handleSkip} onDelete={handleDelete} onReschedule={handleReschedule} onEdit={handleEdit} />
            ))}
          </div>
        )}

        {unscheduledChores.length > 0 && (
          <div className="task-section">
            <h3>📋 未安排时间 ({unscheduledChores.length})</h3>
            {unscheduledChores.map(chore => (
              <ChoreCard key={chore.id} chore={chore} category="unscheduled" formatTime={formatTime}
                onComplete={handleComplete} onSkip={handleSkip} onDelete={handleDelete} onReschedule={handleReschedule} onEdit={handleEdit} />
            ))}
          </div>
        )}

        {skippedChores.length > 0 && (
          <div className="task-section">
            <h3>⏭️ 已跳过 ({skippedChores.length})</h3>
            {skippedChores.slice(0, 10).map(chore => (
              <ChoreCard key={chore.id} chore={chore} category="skipped" formatTime={formatTime}
                onComplete={handleComplete} onSkip={handleSkip} onDelete={handleDelete} onReschedule={handleReschedule} onEdit={handleEdit} />
            ))}
            {skippedChores.length > 10 && <p className="more-hint">...还有 {skippedChores.length - 10} 个已跳过</p>}
          </div>
        )}

        {doneChores.length > 0 && (
          <div className="task-section">
            <h3>✅ 已完成 ({doneChores.length})</h3>
            {doneChores.slice(0, 10).map(chore => (
              <ChoreCard key={chore.id} chore={chore} category="done" formatTime={formatTime}
                onComplete={handleComplete} onSkip={handleSkip} onDelete={handleDelete} onReschedule={handleReschedule} onEdit={handleEdit} />
            ))}
            {doneChores.length > 10 && <p className="more-hint">...还有 {doneChores.length - 10} 个已完成</p>}
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
  onEdit: (id: string, updates: Partial<Pick<Chore, 'title' | 'durationMinutes' | 'frequencyDays'>>) => void;
}

function ChoreCard({ chore, category, formatTime, onComplete, onSkip, onDelete, onReschedule, onEdit }: ChoreCardProps) {
  const [editingTime, setEditingTime] = useState(false);
  const [editTime, setEditTime] = useState('');
  const [editingFields, setEditingFields] = useState(false);
  const [editTitle, setEditTitle] = useState(chore.title);
  const [editDuration, setEditDuration] = useState(chore.durationMinutes);
  const [editFrequency, setEditFrequency] = useState(chore.frequencyDays ?? 1);

  const handleSaveTime = () => {
    if (editTime) {
      onReschedule(chore.id, editTime);
      setEditingTime(false);
    }
  };

  const handleSaveFields = () => {
    onEdit(chore.id, {
      title: editTitle.trim() || chore.title,
      durationMinutes: editDuration,
      frequencyDays: editFrequency,
    });
    setEditingFields(false);
  };

  const handleCancelFields = () => {
    setEditTitle(chore.title);
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
          <div className="edit-row">
            <label>时长(分钟)</label>
            <input type="number" value={editDuration} onChange={e => setEditDuration(parseInt(e.target.value) || 30)} min={5} max={480} className="form-input-sm" />
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

      {chore.scheduledAt && (
        <div className="chore-time-info">
          {formatTime(chore.scheduledAt)}
        </div>
      )}

      {category !== 'done' && category !== 'skipped' && (
        <div className="chore-actions">
          <button className="btn btn-pass" onClick={() => onComplete(chore.id)}>✓ 完成</button>
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
        <div className="chore-time-info done-info">完成于 {formatTime(chore.completedAt)}</div>
      )}
    </div>
  );
}
