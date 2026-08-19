import { useState, useEffect, useCallback, useRef } from 'react';
import type { WorkEntry, WorkCategory } from '../types';
import { loadWorkEntries, saveWorkEntries, generateWorkId, exportWorkToCsv, importWorkFromCsv } from '../workStore';
import WorkTimeline from '../components/WorkTimeline';

const CATEGORY_LABELS: Record<WorkCategory, string> = {
  coding: '💻 编码',
  meeting: '🗣️ 会议',
  review: '👀 代码审查',
  planning: '📋 规划',
  ops: '🔧 运维',
  other: '📎 其他',
};

export default function WorkPage() {
  const [entries, setEntries] = useState<WorkEntry[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedForDelete, setSelectedForDelete] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [newTask, setNewTask] = useState('');
  const [newProject, setNewProject] = useState('');
  const [newCategory, setNewCategory] = useState<WorkCategory>('coding');
  const [newDate, setNewDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [newDuration, setNewDuration] = useState(60);
  const [newFrequency, setNewFrequency] = useState(0);

  useEffect(() => {
    const loaded = loadWorkEntries();
    setEntries(loaded);
    setInitialized(true);
  }, []);

  useEffect(() => {
    if (initialized) {
      saveWorkEntries(entries);
    }
  }, [entries, initialized]);

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const getCategory = (entry: WorkEntry): 'today' | 'upcoming' | 'overdue' | 'done' | 'skipped' => {
    if (entry.status === 'done') return 'done';
    if (entry.status === 'skipped') return 'skipped';
    if (entry.scheduledDate === todayStr || entry.status === 'in-progress') return 'today';
    if (entry.scheduledDate > todayStr) return 'upcoming';
    return 'overdue';
  };

  const todayEntries = entries.filter(e => getCategory(e) === 'today');
  const upcomingEntries = entries.filter(e => getCategory(e) === 'upcoming');
  const overdueEntries = entries.filter(e => getCategory(e) === 'overdue');
  const doneEntries = entries.filter(e => getCategory(e) === 'done')
    .sort((a, b) => new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime());
  const skippedEntries = entries.filter(e => getCategory(e) === 'skipped');

  todayEntries.sort((a, b) => categoryOrder(a.category) - categoryOrder(b.category));
  upcomingEntries.sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));

  // Project future recurring entries (3 days)
  const projectedEntries: WorkEntry[] = [];
  const projectionEnd = new Date(todayStart.getTime() + 3 * 24 * 60 * 60 * 1000);
  for (const e of entries) {
    if (e.status === 'done' || e.status === 'skipped') continue;
    if (e.frequencyDays <= 0) continue;
    const baseDate = new Date(e.scheduledDate);
    let d = new Date(baseDate.getTime() + e.frequencyDays * 24 * 60 * 60 * 1000);
    while (d < projectionEnd) {
      const dStr = d.toISOString().slice(0, 10);
      if (dStr > todayStr) {
        const exists = entries.some(existing =>
          existing.task === e.task && existing.scheduledDate === dStr &&
          existing.status !== 'done' && existing.status !== 'skipped'
        );
        if (!exists) {
          projectedEntries.push({
            id: `proj-${e.id}-${dStr}`,
            task: e.task,
            project: e.project ?? '',
            category: e.category,
            scheduledDate: dStr,
            durationMinutes: e.durationMinutes,
            actualMinutes: null,
            startedAt: null,
            pausedElapsed: 0,
            frequencyDays: e.frequencyDays,
            skippedDates: e.skippedDates,
            status: 'planned',
            createdAt: e.createdAt,
            completedAt: null,
          });
        }
      }
      d = new Date(d.getTime() + e.frequencyDays * 24 * 60 * 60 * 1000);
    }
  }

  const allUpcoming = [...upcomingEntries, ...projectedEntries];
  allUpcoming.sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));

  // Stats
  const todayPlannedMinutes = todayEntries.reduce((s, e) => s + e.durationMinutes, 0);
  const todayActualMinutes = doneEntries
    .filter(e => e.completedAt && e.completedAt.slice(0, 10) === todayStr)
    .reduce((s, e) => s + (e.actualMinutes ?? e.durationMinutes), 0);

  const formatMinutes = (m: number) => {
    if (m === 0) return '0分钟';
    if (m >= 60) {
      const h = Math.floor(m / 60);
      const remain = m % 60;
      return remain > 0 ? `${h}小时${remain}分钟` : `${h}小时`;
    }
    return `${m}分钟`;
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTask.trim()) return;

    const entry: WorkEntry = {
      id: generateWorkId(),
      task: newTask.trim(),
      project: newProject.trim(),
      category: newCategory,
      scheduledDate: newDate,
      durationMinutes: newDuration,
      actualMinutes: null,
      startedAt: null,
      pausedElapsed: 0,
      frequencyDays: newFrequency,
      skippedDates: [],
      status: 'planned',
      createdAt: new Date().toISOString(),
      completedAt: null,
    };

    setEntries(prev => [...prev, entry]);
    setNewTask('');
    setNewProject('');
    setNewDuration(60);
    setNewFrequency(0);
    setShowAddForm(false);
  };

  const handleStart = useCallback((id: string) => {
    setEntries(prev => prev.map(e =>
      e.id === id ? { ...e, status: 'in-progress' as const, startedAt: new Date().toISOString() } : e
    ));
  }, []);

  const handlePause = useCallback((id: string) => {
    setEntries(prev => prev.map(e => {
      if (e.id !== id || !e.startedAt) return e;
      const elapsed = Math.floor((Date.now() - new Date(e.startedAt).getTime()) / 1000) + (e.pausedElapsed ?? 0);
      return { ...e, startedAt: null, pausedElapsed: elapsed };
    }));
  }, []);

  const handleResume = useCallback((id: string) => {
    setEntries(prev => prev.map(e =>
      e.id === id ? { ...e, status: 'in-progress' as const, startedAt: new Date().toISOString() } : e
    ));
  }, []);

  const handleComplete = useCallback((id: string) => {
    setEntries(prev => {
      const updated = prev.map(e => {
        if (e.id !== id) return e;
        // Auto-calculate actual minutes: pausedElapsed + current running time
        const paused = e.pausedElapsed ?? 0;
        let totalSeconds = paused;
        if (e.startedAt) {
          totalSeconds += Math.floor((Date.now() - new Date(e.startedAt).getTime()) / 1000);
        }
        const actual = Math.max(1, Math.round(totalSeconds / 60));
        return {
          ...e,
          status: 'done' as const,
          completedAt: new Date().toISOString(),
          startedAt: null,
          pausedElapsed: 0,
          actualMinutes: actual,
        };
      });

      const completed = updated.find(e => e.id === id);
      if (completed && completed.frequencyDays > 0) {
        const nextDate = new Date(new Date(completed.scheduledDate).getTime() + completed.frequencyDays * 24 * 60 * 60 * 1000);
        const next: WorkEntry = {
          id: generateWorkId(),
          task: completed.task,
          project: completed.project ?? '',
          category: completed.category,
          scheduledDate: nextDate.toISOString().slice(0, 10),
          durationMinutes: completed.durationMinutes,
          actualMinutes: null,
          startedAt: null,
          pausedElapsed: 0,
          frequencyDays: completed.frequencyDays,
          skippedDates: completed.skippedDates ?? [],
          status: 'planned',
          createdAt: new Date().toISOString(),
          completedAt: null,
        };
        updated.push(next);
      }

      return updated;
    });
  }, []);

  const handleSkip = useCallback((id: string) => {
    setEntries(prev => {
      const today = new Date().toISOString().slice(0, 10);
      const updated = prev.map(e =>
        e.id === id ? {
          ...e,
          status: 'skipped' as const,
          skippedDates: [...(e.skippedDates ?? []), today],
        } : e
      );

      const skipped = updated.find(e => e.id === id);
      if (skipped && skipped.frequencyDays > 0) {
        const nextDate = new Date(new Date(skipped.scheduledDate).getTime() + skipped.frequencyDays * 24 * 60 * 60 * 1000);
        const next: WorkEntry = {
          id: generateWorkId(),
          task: skipped.task,
          project: skipped.project ?? '',
          category: skipped.category,
          scheduledDate: nextDate.toISOString().slice(0, 10),
          durationMinutes: skipped.durationMinutes,
          actualMinutes: null,
          startedAt: null,
          pausedElapsed: 0,
          frequencyDays: skipped.frequencyDays,
          skippedDates: skipped.skippedDates ?? [],
          status: 'planned',
          createdAt: new Date().toISOString(),
          completedAt: null,
        };
        updated.push(next);
      }

      return updated;
    });
  }, []);

  const handleDelete = useCallback((id: string) => {
    if (confirm('确定删除？')) {
      setEntries(prev => prev.filter(e => e.id !== id));
    }
  }, []);

  const handleBatchDelete = useCallback(() => {
    if (selectedForDelete.size === 0) return;
    if (confirm(`确定删除选中的 ${selectedForDelete.size} 项？`)) {
      setEntries(prev => prev.filter(e => !selectedForDelete.has(e.id)));
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

  const handleEdit = useCallback((id: string, updates: Partial<Pick<WorkEntry, 'task' | 'project' | 'category' | 'durationMinutes' | 'frequencyDays' | 'scheduledDate'>>) => {
    setEntries(prev => prev.map(e =>
      e.id === id ? { ...e, ...updates } : e
    ));
  }, []);

  const handleExport = () => {
    const csv = exportWorkToCsv(entries);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const pad = (n: number) => n.toString().padStart(2, '0');
    const filename = `工作${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}.csv`;
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
      const imported = importWorkFromCsv(content);
      if (imported.length > 0) {
        setEntries(prev => {
          const existing = new Map(prev.map(x => [x.id, x]));
          imported.forEach(x => existing.set(x.id, x));
          return Array.from(existing.values());
        });
        alert(`成功导入 ${imported.length} 条工作记录`);
      } else {
        alert('导入失败，请检查 CSV 格式');
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const pendingCount = todayEntries.length + overdueEntries.length + allUpcoming.length;

  return (
    <>
      <header className="app-header">
        <h1>💼 工作记录</h1>
        <div className="stats">
          <span className="stat">待办: <strong>{pendingCount}项</strong></span>
          <span className="stat">已完成: <strong>{doneEntries.length}项</strong></span>
        </div>
        <div className="stats">
          <span className="stat">今日计划: <strong>{formatMinutes(todayPlannedMinutes)}</strong></span>
          <span className="stat">今日实际: <strong>{formatMinutes(todayActualMinutes)}</strong></span>
        </div>
      </header>

      <nav className="toolbar">
        <div className="toolbar-actions">
          <button className="btn btn-primary" onClick={() => setShowAddForm(true)}>+ 添加任务</button>
          <button className="btn btn-secondary" onClick={handleExport}>导出 CSV</button>
          <label className="btn btn-secondary import-btn">
            导入 CSV
            <input ref={fileInputRef} type="file" accept=".csv" onChange={handleImport} style={{ display: 'none' }} />
          </label>
        </div>
      </nav>

      <WorkTimeline entries={entries} />

      {showAddForm && (
        <form className="add-task-form" onSubmit={handleAdd}>
          <h2>添加工作任务</h2>
          <div className="form-group">
            <label htmlFor="work-task">任务描述</label>
            <input
              id="work-task"
              type="text"
              value={newTask}
              onChange={e => setNewTask(e.target.value)}
              placeholder="例如：完成 API 接口、参加站会..."
              className="form-input"
            />
          </div>
          <div className="form-group">
            <label htmlFor="work-project">项目</label>
            <input
              id="work-project"
              type="text"
              value={newProject}
              onChange={e => setNewProject(e.target.value)}
              placeholder="例如：客户A后台、客户B小程序..."
              className="form-input"
            />
          </div>
          <div className="form-group">
            <label htmlFor="work-category">类别</label>
            <select
              id="work-category"
              value={newCategory}
              onChange={e => setNewCategory(e.target.value as WorkCategory)}
              className="form-input"
            >
              <option value="coding">编码</option>
              <option value="meeting">会议</option>
              <option value="review">代码审查</option>
              <option value="planning">规划</option>
              <option value="ops">运维</option>
              <option value="other">其他</option>
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="work-date">日期</label>
            <input
              id="work-date"
              type="date"
              value={newDate}
              onChange={e => setNewDate(e.target.value)}
              className="form-input"
            />
          </div>
          <div className="form-group">
            <label htmlFor="work-duration">预估时长（分钟）</label>
            <input
              id="work-duration"
              type="number"
              value={newDuration}
              onChange={e => setNewDuration(parseInt(e.target.value) || 60)}
              min={5}
              max={480}
              className="form-input"
            />
          </div>
          <div className="form-group">
            <label htmlFor="work-frequency">重复频率（每 N 天，0=不重复）</label>
            <input
              id="work-frequency"
              type="number"
              value={newFrequency}
              onChange={e => setNewFrequency(parseInt(e.target.value) || 0)}
              min={0}
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
        {overdueEntries.length > 0 && (
          <div className="task-section">
            <h3 className="section-overdue">⚠️ 过期未完成 ({overdueEntries.length})</h3>
            {overdueEntries.map(entry => (
              <WorkCard key={entry.id} entry={entry} onStart={handleStart} onPause={handlePause} onResume={handleResume} onComplete={handleComplete} onSkip={handleSkip} onDelete={handleDelete} onEdit={handleEdit} />
            ))}
          </div>
        )}

        {todayEntries.length > 0 && (
          <div className="task-section">
            <h3>🔥 今天 ({todayEntries.length})</h3>
            {todayEntries.map(entry => (
              <WorkCard key={entry.id} entry={entry} onStart={handleStart} onPause={handlePause} onResume={handleResume} onComplete={handleComplete} onSkip={handleSkip} onDelete={handleDelete} onEdit={handleEdit} />
            ))}
          </div>
        )}

        {allUpcoming.length > 0 && (
          <div className="task-section">
            <h3>📅 之后 ({allUpcoming.length})</h3>
            {allUpcoming.map(entry => (
              <WorkCard key={entry.id} entry={entry} onStart={handleStart} onPause={handlePause} onResume={handleResume} onComplete={handleComplete} onSkip={handleSkip} onDelete={handleDelete} onEdit={handleEdit} />
            ))}
          </div>
        )}

        {skippedEntries.length > 0 && (
          <div className="task-section">
            <h3>⏭️ 已跳过 ({skippedEntries.length})</h3>
            {skippedEntries.map(entry => (
              <WorkCard key={entry.id} entry={entry} onStart={handleStart} onPause={handlePause} onResume={handleResume} onComplete={handleComplete} onSkip={handleSkip} onDelete={handleDelete} onEdit={handleEdit} />
            ))}
          </div>
        )}

        {doneEntries.length > 0 && (
          <div className="task-section">
            <div className="section-header-with-actions">
              <h3>✅ 已完成 ({doneEntries.length})</h3>
              <div className="batch-actions">
                <label className="batch-select-all">
                  <input type="checkbox" checked={doneEntries.length > 0 && doneEntries.every(e => selectedForDelete.has(e.id))} onChange={() => toggleSelectAll(doneEntries.map(e => e.id))} />
                  全选
                </label>
                {selectedForDelete.size > 0 && (
                  <button className="btn btn-danger btn-sm" onClick={handleBatchDelete}>删除选中 ({selectedForDelete.size})</button>
                )}
              </div>
            </div>
            {doneEntries.map(entry => (
              <div key={entry.id} className="batch-item">
                <input type="checkbox" className="batch-checkbox" checked={selectedForDelete.has(entry.id)} onChange={() => toggleSelect(entry.id)} />
                <WorkCard entry={entry} onStart={handleStart} onPause={handlePause} onResume={handleResume} onComplete={handleComplete} onSkip={handleSkip} onDelete={handleDelete} onEdit={handleEdit} />
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

        {entries.length === 0 && (
          <div className="empty-state">
            <p>还没有工作记录，点击上方"添加任务"开始吧</p>
          </div>
        )}
      </div>
    </>
  );
}

function categoryOrder(cat: WorkCategory): number {
  const order: Record<WorkCategory, number> = { coding: 0, review: 1, meeting: 2, planning: 3, ops: 4, other: 5 };
  return order[cat];
}

// Work card sub-component
interface WorkCardProps {
  entry: WorkEntry;
  onStart: (id: string) => void;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onComplete: (id: string) => void;
  onSkip: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (id: string, updates: Partial<Pick<WorkEntry, 'task' | 'project' | 'category' | 'durationMinutes' | 'frequencyDays' | 'scheduledDate'>>) => void;
}

function WorkCard({ entry, onStart, onPause, onResume, onComplete, onSkip, onDelete, onEdit }: WorkCardProps) {
  const [editing, setEditing] = useState(false);
  const [editTask, setEditTask] = useState(entry.task);
  const [editProject, setEditProject] = useState(entry.project ?? '');
  const [editDuration, setEditDuration] = useState(entry.durationMinutes);
  const [editFreq, setEditFreq] = useState(entry.frequencyDays);
  const [editCategory, setEditCategory] = useState(entry.category);
  const [editDate, setEditDate] = useState(entry.scheduledDate);
  const [elapsed, setElapsed] = useState(0);

  const isInProgress = entry.status === 'in-progress';
  const isPaused = !entry.startedAt && (entry.pausedElapsed ?? 0) > 0 && entry.status === 'in-progress';

  // Live timer for in-progress entries
  useEffect(() => {
    if (!isInProgress || !entry.startedAt) return;
    const base = entry.pausedElapsed ?? 0;
    const update = () => setElapsed(base + Math.floor((Date.now() - new Date(entry.startedAt!).getTime()) / 1000));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [isInProgress, entry.startedAt, entry.pausedElapsed]);

  const handleSave = () => {
    onEdit(entry.id, {
      task: editTask.trim() || entry.task,
      project: editProject.trim(),
      durationMinutes: editDuration,
      frequencyDays: editFreq,
      category: editCategory,
      scheduledDate: editDate,
    });
    setEditing(false);
  };

  const handleCancel = () => {
    setEditTask(entry.task);
    setEditProject(entry.project ?? '');
    setEditDuration(entry.durationMinutes);
    setEditFreq(entry.frequencyDays);
    setEditCategory(entry.category);
    setEditDate(entry.scheduledDate);
    setEditing(false);
  };

  const isDone = entry.status === 'done';
  const isSkipped = entry.status === 'skipped';
  const freqLabel = entry.frequencyDays > 0 ? `每${entry.frequencyDays}天` : '';
  const skipCount = entry.skippedDates?.length ?? 0;

  const formatElapsed = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className={`task-card work-card ${isDone ? 'done' : ''} ${isSkipped ? 'skipped' : ''} ${isInProgress ? 'in-progress' : ''}`}>
      <div className="task-header">
        {!editing ? (
          <span className="chore-title">
            <span className="work-category-badge">{CATEGORY_LABELS[entry.category]}</span>
            {entry.project && <span className="work-project-badge">[{entry.project}]</span>}
            {entry.task}
          </span>
        ) : (
          <input type="text" value={editTask} onChange={e => setEditTask(e.target.value)} className="form-input-sm edit-title-input" />
        )}
        <div className="task-header-right">
          <span className="chore-duration">{entry.durationMinutes}分钟</span>
          {freqLabel && <span className="chore-frequency">{freqLabel}</span>}
          {isInProgress && <span className="in-progress-badge">⏱ {formatElapsed(elapsed)}</span>}
          {!isDone && !isSkipped && (
            <button className="btn-edit" onClick={() => setEditing(!editing)} title="编辑">✎</button>
          )}
          <button className="btn-delete" onClick={() => onDelete(entry.id)} title="删除">✕</button>
        </div>
      </div>

      {editing && (
        <div className="edit-fields-form">
          <div className="edit-row">
            <label>项目</label>
            <input type="text" value={editProject} onChange={e => setEditProject(e.target.value)} className="form-input-sm" placeholder="项目名" />
          </div>
          <div className="edit-row">
            <label>类别</label>
            <select value={editCategory} onChange={e => setEditCategory(e.target.value as WorkCategory)} className="form-input-sm">
              <option value="coding">编码</option>
              <option value="meeting">会议</option>
              <option value="review">审查</option>
              <option value="planning">规划</option>
              <option value="ops">运维</option>
              <option value="other">其他</option>
            </select>
          </div>
          <div className="edit-row">
            <label>日期</label>
            <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} className="form-input-sm" />
          </div>
          <div className="edit-row">
            <label>预估(分)</label>
            <input type="number" value={editDuration} onChange={e => setEditDuration(parseInt(e.target.value) || 60)} min={5} max={480} className="form-input-sm" />
          </div>
          <div className="edit-row">
            <label>频率(天)</label>
            <input type="number" value={editFreq} onChange={e => setEditFreq(parseInt(e.target.value) || 0)} min={0} max={365} className="form-input-sm" />
          </div>
          <div className="edit-row-actions">
            <button className="btn btn-primary btn-sm" onClick={handleSave}>保存</button>
            <button className="btn btn-secondary btn-sm" onClick={handleCancel}>取消</button>
          </div>
        </div>
      )}

      <div className="chore-time-info">{entry.scheduledDate}</div>

      {!isDone && !isSkipped && (
        <div className="chore-actions">
          {!isInProgress && !isPaused && (
            <button className="btn btn-secondary" onClick={() => onStart(entry.id)}>▶ 开始</button>
          )}
          {isPaused && (
            <>
              <span className="chore-timer paused">⏸ {formatElapsed(entry.pausedElapsed ?? 0)}</span>
              <button className="btn btn-secondary" onClick={() => onResume(entry.id)}>▶ 继续</button>
            </>
          )}
          {isInProgress && entry.startedAt && (
            <>
              <span className="chore-timer">⏱ {formatElapsed(elapsed)}</span>
              <button className="btn btn-pause" onClick={() => onPause(entry.id)}>⏸ 暂停</button>
              <button className="btn btn-pass" onClick={() => onComplete(entry.id)}>⏹ 完成</button>
            </>
          )}
          <button className="btn btn-skip" onClick={() => onSkip(entry.id)}>⏭ 跳过</button>
        </div>
      )}

      {skipCount > 0 && (
        <div className="skip-streak">⚠️ 已跳过 {skipCount} 次</div>
      )}

      {isDone && (
        <div className="chore-time-info done-info">
          实际用时 {entry.actualMinutes ?? 0}分钟
          {entry.completedAt && ` · 完成于 ${new Date(entry.completedAt).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`}
        </div>
      )}

    </div>
  );
}
