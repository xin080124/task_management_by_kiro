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

  const getChoreCategory = (chore: Chore): 'overdue' | 'active' | 'upcoming' | 'unscheduled' | 'done' => {
    if (chore.status === 'done') return 'done';
    if (!chore.scheduledAt) return 'unscheduled';

    const start = new Date(chore.scheduledAt);
    const end = new Date(start.getTime() + chore.durationMinutes * 60 * 1000);

    if (end < now && chore.status !== 'done') return 'overdue';
    if (start <= now && end >= now) return 'active';
    return 'upcoming';
  };

  const overdueChores = chores.filter(c => getChoreCategory(c) === 'overdue');
  const activeChores = chores.filter(c => getChoreCategory(c) === 'active');
  const upcomingChores = chores.filter(c => getChoreCategory(c) === 'upcoming');
  const unscheduledChores = chores.filter(c => getChoreCategory(c) === 'unscheduled');
  const doneChores = chores.filter(c => getChoreCategory(c) === 'done');

  // Sort upcoming by scheduled time
  upcomingChores.sort((a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime());
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
      status: newScheduledAt ? 'scheduled' : 'pending',
      createdAt: new Date().toISOString(),
      completedAt: null,
    };

    setChores(prev => [...prev, chore]);
    setNewTitle('');
    setNewScheduledAt('');
    setNewDuration(30);
    setShowAddForm(false);
  };

  const handleComplete = useCallback((id: string) => {
    setChores(prev => prev.map(c =>
      c.id === id ? { ...c, status: 'done' as const, completedAt: new Date().toISOString() } : c
    ));
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

  const pendingCount = overdueChores.length + activeChores.length + upcomingChores.length + unscheduledChores.length;

  return (
    <>
      <header className="app-header">
        <h1>🏠 家务管理器</h1>
        <div className="stats">
          <span className="stat">待完成: <strong>{pendingCount}</strong></span>
          <span className="stat">已完成: <strong>{doneChores.length}</strong></span>
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
                onComplete={handleComplete} onDelete={handleDelete} onReschedule={handleReschedule} />
            ))}
          </div>
        )}

        {activeChores.length > 0 && (
          <div className="task-section">
            <h3>🔥 正在进行 ({activeChores.length})</h3>
            {activeChores.map(chore => (
              <ChoreCard key={chore.id} chore={chore} category="active" formatTime={formatTime}
                onComplete={handleComplete} onDelete={handleDelete} onReschedule={handleReschedule} />
            ))}
          </div>
        )}

        {upcomingChores.length > 0 && (
          <div className="task-section">
            <h3>📅 即将进行 ({upcomingChores.length})</h3>
            {upcomingChores.map(chore => (
              <ChoreCard key={chore.id} chore={chore} category="upcoming" formatTime={formatTime}
                onComplete={handleComplete} onDelete={handleDelete} onReschedule={handleReschedule} />
            ))}
          </div>
        )}

        {unscheduledChores.length > 0 && (
          <div className="task-section">
            <h3>📋 未安排时间 ({unscheduledChores.length})</h3>
            {unscheduledChores.map(chore => (
              <ChoreCard key={chore.id} chore={chore} category="unscheduled" formatTime={formatTime}
                onComplete={handleComplete} onDelete={handleDelete} onReschedule={handleReschedule} />
            ))}
          </div>
        )}

        {doneChores.length > 0 && (
          <div className="task-section">
            <h3>✅ 已完成 ({doneChores.length})</h3>
            {doneChores.slice(0, 10).map(chore => (
              <ChoreCard key={chore.id} chore={chore} category="done" formatTime={formatTime}
                onComplete={handleComplete} onDelete={handleDelete} onReschedule={handleReschedule} />
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
  onDelete: (id: string) => void;
  onReschedule: (id: string, time: string) => void;
}

function ChoreCard({ chore, category, formatTime, onComplete, onDelete, onReschedule }: ChoreCardProps) {
  const [editing, setEditing] = useState(false);
  const [editTime, setEditTime] = useState('');

  const handleSaveTime = () => {
    if (editTime) {
      onReschedule(chore.id, editTime);
      setEditing(false);
    }
  };

  return (
    <div className={`task-card chore-card ${category}`}>
      <div className="task-header">
        <span className="chore-title">{chore.title}</span>
        <div className="task-header-right">
          <span className="chore-duration">{chore.durationMinutes}分钟</span>
          <button className="btn-delete" onClick={() => onDelete(chore.id)} title="删除">✕</button>
        </div>
      </div>

      {chore.scheduledAt && (
        <div className="chore-time-info">
          {formatTime(chore.scheduledAt)}
        </div>
      )}

      {category !== 'done' && (
        <div className="chore-actions">
          <button className="btn btn-pass" onClick={() => onComplete(chore.id)}>✓ 完成</button>
          {!editing ? (
            <button className="btn btn-secondary" onClick={() => { setEditing(true); setEditTime(''); }}>
              {chore.scheduledAt ? '改时间' : '安排时间'}
            </button>
          ) : (
            <div className="reschedule-form">
              <input type="datetime-local" value={editTime} onChange={e => setEditTime(e.target.value)} className="form-input-sm" />
              <button className="btn btn-primary btn-sm" onClick={handleSaveTime}>确定</button>
              <button className="btn btn-secondary btn-sm" onClick={() => setEditing(false)}>取消</button>
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
