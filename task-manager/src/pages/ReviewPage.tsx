import { useState, useEffect, useCallback } from 'react';
import type { Task, TaskType, TaskStatus } from '../types';
import { MAX_LEVEL, intervalForLevel } from '../types';
import { loadTasks, saveTasks } from '../store';
import TaskList from '../components/TaskList';
import AddTaskForm from '../components/AddTaskForm';
import CsvManager from '../components/CsvManager';

export default function ReviewPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filter, setFilter] = useState<TaskType | 'all'>('all');
  const [starredOnly, setStarredOnly] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    const loaded = loadTasks();
    const updated = promoteDueTasks(loaded);
    setTasks(updated);
    setInitialized(true);
  }, []);

  useEffect(() => {
    if (initialized) {
      saveTasks(tasks);
    }
  }, [tasks, initialized]);

  // 到期(nextReviewDate <= now)的 waiting 题自动变回 open（该复习）。
  // 只改 status，level（熟练度）保持不变 —— 到期不降级。
  const promoteDueTasks = (taskList: Task[]): Task[] => {
    const now = new Date();
    return taskList.map(task => {
      if (task.status === 'waiting' && new Date(task.nextReviewDate) <= now) {
        return { ...task, status: 'open' as TaskStatus };
      }
      return task;
    });
  };

  // 答对：level +1（封顶 MAX_LEVEL），按新 level 的间隔推下次复习，转为 waiting。
  const handlePass = useCallback((id: string) => {
    setTasks(prev => prev.map(task => {
      if (task.id !== id) return task;
      const nextLevel = Math.min(task.level + 1, MAX_LEVEL);
      const interval = intervalForLevel(nextLevel);
      const nextDate = new Date();
      nextDate.setDate(nextDate.getDate() + interval);
      return {
        ...task,
        level: nextLevel,
        status: 'waiting' as TaskStatus,
        nextReviewDate: nextDate.toISOString(),
        lastReviewedAt: new Date().toISOString(),
      };
    }));
  }, []);

  // 答错：level 归 0，立即可复习（open）。
  const handleFail = useCallback((id: string) => {
    setTasks(prev => prev.map(task => {
      if (task.id !== id) return task;
      return {
        ...task,
        level: 0,
        status: 'open' as TaskStatus,
        nextReviewDate: new Date().toISOString(),
        lastReviewedAt: new Date().toISOString(),
      };
    }));
  }, []);

  const handleAdd = (task: Task) => {
    setTasks(prev => [...prev, task]);
    setShowAddForm(false);
  };

  const handleDelete = useCallback((id: string) => {
    if (confirm('确定删除这个题目？')) {
      setTasks(prev => prev.filter(t => t.id !== id));
    }
  }, []);

  const handleEdit = useCallback((id: string, updates: Partial<Pick<Task, 'question' | 'answer'>>) => {
    setTasks(prev => prev.map(t =>
      t.id === id ? { ...t, ...updates } : t
    ));
  }, []);

  const handleToggleStar = useCallback((id: string) => {
    setTasks(prev => prev.map(t =>
      t.id === id ? { ...t, starred: !t.starred } : t
    ));
  }, []);

  const handleImport = (imported: Task[]) => {
    setTasks(prev => {
      const existing = new Map(prev.map(t => [t.id, t]));
      imported.forEach(t => existing.set(t.id, t));
      return Array.from(existing.values());
    });
  };

  const now = new Date();
  const openCount = tasks.filter(t => t.status === 'open' || new Date(t.nextReviewDate) <= now).length;
  const totalCount = tasks.length;
  const starredCount = tasks.filter(t => t.starred).length;

  return (
    <>
      <header className="app-header">
        <h1>📚 复习管理器</h1>
        <div className="stats">
          <span className="stat">待复习: <strong>{openCount}</strong></span>
          <span className="stat">总计: <strong>{totalCount}</strong></span>
          <span className="stat">⭐ 星标: <strong>{starredCount}</strong></span>
        </div>
      </header>

      <nav className="toolbar">
        <div className="filter-tabs">
          <button className={`tab ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>全部</button>
          <button className={`tab ${filter === 'gold' ? 'active' : ''}`} onClick={() => setFilter('gold')}>Gold</button>
          <button className={`tab ${filter === 'aws' ? 'active' : ''}`} onClick={() => setFilter('aws')}>AWS</button>
          <button className={`tab ${starredOnly ? 'active' : ''}`} onClick={() => setStarredOnly(v => !v)}>⭐ 星标</button>
        </div>
        <div className="toolbar-actions">
          <button className="btn btn-primary" onClick={() => setShowAddForm(true)}>+ 添加题目</button>
          <CsvManager tasks={tasks} onImport={handleImport} />
        </div>
      </nav>

      {showAddForm && <AddTaskForm onAdd={handleAdd} onCancel={() => setShowAddForm(false)} />}
      <TaskList tasks={tasks} filter={filter} starredOnly={starredOnly} onPass={handlePass} onFail={handleFail} onDelete={handleDelete} onEdit={handleEdit} onToggleStar={handleToggleStar} />
    </>
  );
}
