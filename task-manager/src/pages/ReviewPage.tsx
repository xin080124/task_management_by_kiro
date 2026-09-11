import { useState, useEffect, useCallback } from 'react';
import type { Task, TaskType, TaskStatus } from '../types';
import { REVIEW_INTERVALS } from '../types';
import { loadTasks, saveTasks } from '../store';
import TaskList from '../components/TaskList';
import AddTaskForm from '../components/AddTaskForm';
import CsvManager from '../components/CsvManager';

export default function ReviewPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filter, setFilter] = useState<TaskType | 'all'>('all');
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

  const promoteDueTasks = (taskList: Task[]): Task[] => {
    const now = new Date();
    return taskList.map(task => {
      if (task.status !== 'open' && new Date(task.nextReviewDate) <= now) {
        return { ...task, status: 'open' as TaskStatus };
      }
      return task;
    });
  };

  const handlePass = useCallback((id: string) => {
    setTasks(prev => prev.map(task => {
      if (task.id !== id) return task;
      const levels: TaskStatus[] = ['open', 'p1', 'p2', 'p3', 'p4', 'p5'];
      const currentIdx = levels.indexOf(task.status);
      const nextStatus: TaskStatus = currentIdx < 5 ? levels[currentIdx + 1] : 'p5';
      const interval = REVIEW_INTERVALS[nextStatus];
      const nextDate = new Date();
      nextDate.setDate(nextDate.getDate() + interval);
      return {
        ...task,
        status: nextStatus,
        nextReviewDate: nextDate.toISOString(),
        lastReviewedAt: new Date().toISOString(),
      };
    }));
  }, []);

  const handleFail = useCallback((id: string) => {
    setTasks(prev => prev.map(task => {
      if (task.id !== id) return task;
      return {
        ...task,
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

  const handleImport = (imported: Task[]) => {
    setTasks(prev => {
      const existing = new Map(prev.map(t => [t.id, t]));
      imported.forEach(t => existing.set(t.id, t));
      return Array.from(existing.values());
    });
  };

  const openCount = tasks.filter(t => t.status === 'open' || new Date(t.nextReviewDate) <= new Date()).length;
  const totalCount = tasks.length;

  return (
    <>
      <header className="app-header">
        <h1>📚 复习管理器</h1>
        <div className="stats">
          <span className="stat">待复习: <strong>{openCount}</strong></span>
          <span className="stat">总计: <strong>{totalCount}</strong></span>
        </div>
      </header>

      <nav className="toolbar">
        <div className="filter-tabs">
          <button className={`tab ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>全部</button>
          <button className={`tab ${filter === 'gold' ? 'active' : ''}`} onClick={() => setFilter('gold')}>Gold</button>
          <button className={`tab ${filter === 'aws' ? 'active' : ''}`} onClick={() => setFilter('aws')}>AWS</button>
        </div>
        <div className="toolbar-actions">
          <button className="btn btn-primary" onClick={() => setShowAddForm(true)}>+ 添加题目</button>
          <CsvManager tasks={tasks} onImport={handleImport} />
        </div>
      </nav>

      {showAddForm && <AddTaskForm onAdd={handleAdd} onCancel={() => setShowAddForm(false)} />}
      <TaskList tasks={tasks} filter={filter} onPass={handlePass} onFail={handleFail} onDelete={handleDelete} onEdit={handleEdit} />
    </>
  );
}
