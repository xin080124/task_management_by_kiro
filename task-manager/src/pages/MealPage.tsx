import { useState, useEffect, useCallback, useRef } from 'react';
import type { Meal, MealTime } from '../types';
import { loadMeals, saveMeals, generateMealId, exportMealsToCsv, importMealsFromCsv } from '../mealStore';
import MealTimeline from '../components/MealTimeline';

const MEAL_TIME_LABELS: Record<MealTime, string> = {
  breakfast: '🌅 早餐',
  lunch: '☀️ 午餐',
  dinner: '🌙 晚餐',
  snack: '🍪 零食/加餐',
};

export default function MealPage() {
  const [meals, setMeals] = useState<Meal[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [newDish, setNewDish] = useState('');
  const [newMealTime, setNewMealTime] = useState<MealTime>('dinner');
  const [newDate, setNewDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [newPrepMinutes, setNewPrepMinutes] = useState(30);
  const [newFrequency, setNewFrequency] = useState(0);

  useEffect(() => {
    const loaded = loadMeals();
    setMeals(loaded);
    setInitialized(true);
  }, []);

  useEffect(() => {
    if (initialized) {
      saveMeals(meals);
    }
  }, [meals, initialized]);

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  // Group meals by date
  const getMealCategory = (meal: Meal): 'today' | 'upcoming' | 'past' | 'done' | 'skipped' => {
    if (meal.status === 'done') return 'done';
    if (meal.status === 'skipped') return 'skipped';
    if (meal.scheduledDate === todayStr) return 'today';
    if (meal.scheduledDate > todayStr) return 'upcoming';
    return 'past';
  };

  const todayMeals = meals.filter(m => getMealCategory(m) === 'today');
  const upcomingMeals = meals.filter(m => getMealCategory(m) === 'upcoming');
  const pastMeals = meals.filter(m => getMealCategory(m) === 'past');
  const doneMeals = meals.filter(m => getMealCategory(m) === 'done');
  const skippedMeals = meals.filter(m => getMealCategory(m) === 'skipped');

  // Sort
  todayMeals.sort((a, b) => mealTimeOrder(a.mealTime) - mealTimeOrder(b.mealTime));
  upcomingMeals.sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate) || mealTimeOrder(a.mealTime) - mealTimeOrder(b.mealTime));

  // Project future meals based on frequency (3 days)
  const projectedMeals: Meal[] = [];
  const todayDate = new Date(todayStr);
  for (const m of meals) {
    if (m.status === 'done' || m.status === 'skipped') continue;
    if (m.frequencyDays <= 0) continue;
    const baseDate = new Date(m.scheduledDate);
    let d = new Date(baseDate.getTime() + m.frequencyDays * 24 * 60 * 60 * 1000);
    const limit = new Date(todayDate.getTime() + 3 * 24 * 60 * 60 * 1000);
    while (d <= limit) {
      const dStr = d.toISOString().slice(0, 10);
      if (dStr > todayStr) {
        const exists = meals.some(existing =>
          existing.dish === m.dish &&
          existing.scheduledDate === dStr &&
          existing.mealTime === m.mealTime &&
          existing.status !== 'done' && existing.status !== 'skipped'
        );
        if (!exists) {
          projectedMeals.push({
            id: `proj-${m.id}-${dStr}`,
            dish: m.dish,
            mealTime: m.mealTime,
            scheduledDate: dStr,
            prepMinutes: m.prepMinutes,
            frequencyDays: m.frequencyDays,
            skippedDates: m.skippedDates,
            status: 'planned',
            createdAt: m.createdAt,
            completedAt: null,
          });
        }
      }
      d = new Date(d.getTime() + m.frequencyDays * 24 * 60 * 60 * 1000);
    }
  }

  const allUpcoming = [...upcomingMeals, ...projectedMeals];
  allUpcoming.sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate) || mealTimeOrder(a.mealTime) - mealTimeOrder(b.mealTime));

  // Stats
  const todayPrepMinutes = todayMeals.reduce((s, m) => s + m.prepMinutes, 0);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDish.trim()) return;

    const meal: Meal = {
      id: generateMealId(),
      dish: newDish.trim(),
      mealTime: newMealTime,
      scheduledDate: newDate,
      prepMinutes: newPrepMinutes,
      frequencyDays: newFrequency,
      skippedDates: [],
      status: 'planned',
      createdAt: new Date().toISOString(),
      completedAt: null,
    };

    setMeals(prev => [...prev, meal]);
    setNewDish('');
    setNewPrepMinutes(30);
    setNewFrequency(0);
    setShowAddForm(false);
  };

  const handleComplete = useCallback((id: string) => {
    setMeals(prev => {
      const updated = prev.map(m =>
        m.id === id ? { ...m, status: 'done' as const, completedAt: new Date().toISOString() } : m
      );

      const completed = updated.find(m => m.id === id);
      if (completed && completed.frequencyDays > 0) {
        const nextDate = new Date(new Date(completed.scheduledDate).getTime() + completed.frequencyDays * 24 * 60 * 60 * 1000);
        const nextMeal: Meal = {
          id: generateMealId(),
          dish: completed.dish,
          mealTime: completed.mealTime,
          scheduledDate: nextDate.toISOString().slice(0, 10),
          prepMinutes: completed.prepMinutes,
          frequencyDays: completed.frequencyDays,
          skippedDates: completed.skippedDates ?? [],
          status: 'planned',
          createdAt: new Date().toISOString(),
          completedAt: null,
        };
        updated.push(nextMeal);
      }

      return updated;
    });
  }, []);

  const handleSkip = useCallback((id: string) => {
    setMeals(prev => {
      const today = new Date().toISOString().slice(0, 10);
      const updated = prev.map(m =>
        m.id === id ? {
          ...m,
          status: 'skipped' as const,
          skippedDates: [...(m.skippedDates ?? []), today],
        } : m
      );

      const skipped = updated.find(m => m.id === id);
      if (skipped && skipped.frequencyDays > 0) {
        const nextDate = new Date(new Date(skipped.scheduledDate).getTime() + skipped.frequencyDays * 24 * 60 * 60 * 1000);
        const nextMeal: Meal = {
          id: generateMealId(),
          dish: skipped.dish,
          mealTime: skipped.mealTime,
          scheduledDate: nextDate.toISOString().slice(0, 10),
          prepMinutes: skipped.prepMinutes,
          frequencyDays: skipped.frequencyDays,
          skippedDates: skipped.skippedDates ?? [],
          status: 'planned',
          createdAt: new Date().toISOString(),
          completedAt: null,
        };
        updated.push(nextMeal);
      }

      return updated;
    });
  }, []);

  const handleDelete = useCallback((id: string) => {
    if (confirm('确定删除这道菜？')) {
      setMeals(prev => prev.filter(m => m.id !== id));
    }
  }, []);

  const handleEdit = useCallback((id: string, updates: Partial<Pick<Meal, 'dish' | 'prepMinutes' | 'frequencyDays' | 'mealTime' | 'scheduledDate'>>) => {
    setMeals(prev => prev.map(m =>
      m.id === id ? { ...m, ...updates } : m
    ));
  }, []);

  const handleExport = () => {
    const csv = exportMealsToCsv(meals);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const pad = (n: number) => n.toString().padStart(2, '0');
    const filename = `饮食${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}.csv`;
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
      const imported = importMealsFromCsv(content);
      if (imported.length > 0) {
        setMeals(prev => {
          const existing = new Map(prev.map(m => [m.id, m]));
          imported.forEach(m => existing.set(m.id, m));
          return Array.from(existing.values());
        });
        alert(`成功导入 ${imported.length} 道菜`);
      } else {
        alert('导入失败，请检查 CSV 格式');
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
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

  const pendingCount = todayMeals.length + pastMeals.length + allUpcoming.length;

  return (
    <>
      <header className="app-header">
        <h1>🍽️ 饮食安排</h1>
        <div className="stats">
          <span className="stat">待做: <strong>{pendingCount}道</strong></span>
          <span className="stat">已完成: <strong>{doneMeals.length}道</strong></span>
          <span className="stat">今日备餐: <strong>{formatMinutes(todayPrepMinutes)}</strong></span>
        </div>
      </header>

      <nav className="toolbar">
        <div className="toolbar-actions">
          <button className="btn btn-primary" onClick={() => setShowAddForm(true)}>+ 添加菜品</button>
          <button className="btn btn-secondary" onClick={handleExport}>导出 CSV</button>
          <label className="btn btn-secondary import-btn">
            导入 CSV
            <input ref={fileInputRef} type="file" accept=".csv" onChange={handleImport} style={{ display: 'none' }} />
          </label>
        </div>
      </nav>

      <MealTimeline meals={meals} />

      {showAddForm && (
        <form className="add-task-form" onSubmit={handleAdd}>
          <h2>添加菜品</h2>
          <div className="form-group">
            <label htmlFor="meal-dish">菜名</label>
            <input
              id="meal-dish"
              type="text"
              value={newDish}
              onChange={e => setNewDish(e.target.value)}
              placeholder="例如：红烧鸡腿、番茄炒蛋..."
              className="form-input"
            />
          </div>
          <div className="form-group">
            <label htmlFor="meal-time">哪一餐</label>
            <select
              id="meal-time"
              value={newMealTime}
              onChange={e => setNewMealTime(e.target.value as MealTime)}
              className="form-input"
            >
              <option value="breakfast">早餐</option>
              <option value="lunch">午餐</option>
              <option value="dinner">晚餐</option>
              <option value="snack">零食/加餐</option>
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="meal-date">日期</label>
            <input
              id="meal-date"
              type="date"
              value={newDate}
              onChange={e => setNewDate(e.target.value)}
              className="form-input"
            />
          </div>
          <div className="form-group">
            <label htmlFor="meal-prep">准备时间（分钟）</label>
            <input
              id="meal-prep"
              type="number"
              value={newPrepMinutes}
              onChange={e => setNewPrepMinutes(parseInt(e.target.value) || 30)}
              min={5}
              max={480}
              className="form-input"
            />
          </div>
          <div className="form-group">
            <label htmlFor="meal-frequency">重复频率（每 N 天，0=不重复）</label>
            <input
              id="meal-frequency"
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
        {pastMeals.length > 0 && (
          <div className="task-section">
            <h3 className="section-overdue">⚠️ 过期未做 ({pastMeals.length})</h3>
            {pastMeals.map(meal => (
              <MealCard key={meal.id} meal={meal} onComplete={handleComplete} onSkip={handleSkip} onDelete={handleDelete} onEdit={handleEdit} />
            ))}
          </div>
        )}

        {todayMeals.length > 0 && (
          <div className="task-section">
            <h3>🍳 今天 ({todayMeals.length})</h3>
            {todayMeals.map(meal => (
              <MealCard key={meal.id} meal={meal} onComplete={handleComplete} onSkip={handleSkip} onDelete={handleDelete} onEdit={handleEdit} />
            ))}
          </div>
        )}

        {allUpcoming.length > 0 && (
          <div className="task-section">
            <h3>📅 之后 ({allUpcoming.length})</h3>
            {allUpcoming.map(meal => (
              <MealCard key={meal.id} meal={meal} onComplete={handleComplete} onSkip={handleSkip} onDelete={handleDelete} onEdit={handleEdit} />
            ))}
          </div>
        )}

        {skippedMeals.length > 0 && (
          <div className="task-section">
            <h3>⏭️ 已跳过 ({skippedMeals.length})</h3>
            {skippedMeals.slice(0, 10).map(meal => (
              <MealCard key={meal.id} meal={meal} onComplete={handleComplete} onSkip={handleSkip} onDelete={handleDelete} onEdit={handleEdit} />
            ))}
          </div>
        )}

        {doneMeals.length > 0 && (
          <div className="task-section">
            <h3>✅ 已完成 ({doneMeals.length})</h3>
            {doneMeals.slice(0, 10).map(meal => (
              <MealCard key={meal.id} meal={meal} onComplete={handleComplete} onSkip={handleSkip} onDelete={handleDelete} onEdit={handleEdit} />
            ))}
            {doneMeals.length > 10 && <p className="more-hint">...还有 {doneMeals.length - 10} 道已完成</p>}
          </div>
        )}

        {meals.length === 0 && (
          <div className="empty-state">
            <p>还没有饮食安排，点击上方"添加菜品"开始吧</p>
          </div>
        )}
      </div>
    </>
  );
}

function mealTimeOrder(mt: MealTime): number {
  const order: Record<MealTime, number> = { breakfast: 0, lunch: 1, dinner: 2, snack: 3 };
  return order[mt];
}

// Meal card sub-component
interface MealCardProps {
  meal: Meal;
  onComplete: (id: string) => void;
  onSkip: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (id: string, updates: Partial<Pick<Meal, 'dish' | 'prepMinutes' | 'frequencyDays' | 'mealTime' | 'scheduledDate'>>) => void;
}

function MealCard({ meal, onComplete, onSkip, onDelete, onEdit }: MealCardProps) {
  const [editing, setEditing] = useState(false);
  const [editDish, setEditDish] = useState(meal.dish);
  const [editPrep, setEditPrep] = useState(meal.prepMinutes);
  const [editFreq, setEditFreq] = useState(meal.frequencyDays);
  const [editMealTime, setEditMealTime] = useState(meal.mealTime);
  const [editDate, setEditDate] = useState(meal.scheduledDate);

  const handleSave = () => {
    onEdit(meal.id, {
      dish: editDish.trim() || meal.dish,
      prepMinutes: editPrep,
      frequencyDays: editFreq,
      mealTime: editMealTime,
      scheduledDate: editDate,
    });
    setEditing(false);
  };

  const handleCancel = () => {
    setEditDish(meal.dish);
    setEditPrep(meal.prepMinutes);
    setEditFreq(meal.frequencyDays);
    setEditMealTime(meal.mealTime);
    setEditDate(meal.scheduledDate);
    setEditing(false);
  };

  const isDone = meal.status === 'done';
  const isSkipped = meal.status === 'skipped';
  const freqLabel = meal.frequencyDays > 0 ? `每${meal.frequencyDays}天` : '不重复';
  const skipCount = meal.skippedDates?.length ?? 0;

  return (
    <div className={`task-card meal-card ${isDone ? 'done' : ''} ${isSkipped ? 'skipped' : ''}`}>
      <div className="task-header">
        {!editing ? (
          <span className="chore-title">
            <span className="meal-time-badge">{MEAL_TIME_LABELS[meal.mealTime]}</span>
            {meal.dish}
          </span>
        ) : (
          <input type="text" value={editDish} onChange={e => setEditDish(e.target.value)} className="form-input-sm edit-title-input" />
        )}
        <div className="task-header-right">
          <span className="chore-duration">{meal.prepMinutes}分钟</span>
          <span className="chore-frequency">{freqLabel}</span>
          {!isDone && !isSkipped && (
            <button className="btn-edit" onClick={() => setEditing(!editing)} title="编辑">✎</button>
          )}
          <button className="btn-delete" onClick={() => onDelete(meal.id)} title="删除">✕</button>
        </div>
      </div>

      {editing && (
        <div className="edit-fields-form">
          <div className="edit-row">
            <label>餐次</label>
            <select value={editMealTime} onChange={e => setEditMealTime(e.target.value as MealTime)} className="form-input-sm">
              <option value="breakfast">早餐</option>
              <option value="lunch">午餐</option>
              <option value="dinner">晚餐</option>
              <option value="snack">零食</option>
            </select>
          </div>
          <div className="edit-row">
            <label>日期</label>
            <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} className="form-input-sm" />
          </div>
          <div className="edit-row">
            <label>时长</label>
            <input type="number" value={editPrep} onChange={e => setEditPrep(parseInt(e.target.value) || 30)} min={5} max={480} className="form-input-sm" />
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

      <div className="chore-time-info">
        {meal.scheduledDate} {(() => {
          const d = new Date(meal.scheduledDate + 'T00:00:00');
          const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
          const dayLabel = days[d.getDay()];
          if (meal.scheduledDate === new Date().toISOString().slice(0, 10)) return '(今天)';
          const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
          if (meal.scheduledDate === tomorrow) return `(明天 ${dayLabel})`;
          return `(${dayLabel})`;
        })()}
      </div>

      {!isDone && !isSkipped && (
        <div className="chore-actions">
          <button className="btn btn-pass" onClick={() => onComplete(meal.id)}>✓ 做了</button>
          <button className="btn btn-skip" onClick={() => onSkip(meal.id)}>⏭ 跳过</button>
        </div>
      )}

      {skipCount > 0 && (
        <div className="skip-streak">⚠️ 已跳过 {skipCount} 次</div>
      )}

      {isDone && meal.completedAt && (
        <div className="chore-time-info done-info">完成于 {new Date(meal.completedAt).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
      )}
    </div>
  );
}
