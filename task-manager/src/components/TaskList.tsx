import type { Task, TaskType } from '../types';
import TaskCard from './TaskCard';

interface Props {
  tasks: Task[];
  filter: TaskType | 'all';
  starredOnly?: boolean;
  onPass: (id: string) => void;
  onFail: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (id: string, updates: Partial<Pick<Task, 'question' | 'answer'>>) => void;
  onToggleStar: (id: string) => void;
}

export default function TaskList({ tasks, filter, starredOnly, onPass, onFail, onDelete, onEdit, onToggleStar }: Props) {
  let filtered = tasks.filter(t => filter === 'all' || t.type === filter);
  if (starredOnly) filtered = filtered.filter(t => t.starred);

  // Separate open (due) tasks from waiting tasks
  const now = new Date();
  const openTasks = filtered.filter(t => t.status === 'open' || new Date(t.nextReviewDate) <= now);
  const waitingTasks = filtered.filter(t => t.status !== 'open' && new Date(t.nextReviewDate) > now);

  // 星标题目单独置顶（未开启“只看星标”时才需要，避免重复）
  const starredTasks = !starredOnly ? filtered.filter(t => t.starred) : [];

  return (
    <div className="task-list">
      {starredTasks.length > 0 && (
        <div className="task-section">
          <h3>⭐ 重点关注 ({starredTasks.length})</h3>
          {starredTasks.map(task => (
            <TaskCard key={task.id} task={task} onPass={onPass} onFail={onFail} onDelete={onDelete} onEdit={onEdit} onToggleStar={onToggleStar} />
          ))}
        </div>
      )}

      {openTasks.length > 0 && (
        <div className="task-section">
          <h3>待复习 ({openTasks.length})</h3>
          {openTasks.map(task => (
            <TaskCard key={task.id} task={task} onPass={onPass} onFail={onFail} onDelete={onDelete} onEdit={onEdit} onToggleStar={onToggleStar} />
          ))}
        </div>
      )}

      {waitingTasks.length > 0 && (
        <div className="task-section">
          <h3>等待中 ({waitingTasks.length})</h3>
          {waitingTasks.map(task => (
            <TaskCard key={task.id} task={task} onPass={onPass} onFail={onFail} onDelete={onDelete} onEdit={onEdit} onToggleStar={onToggleStar} />
          ))}
        </div>
      )}

      {filtered.length === 0 && (
        <div className="empty-state">
          <p>{starredOnly ? '还没有星标题目，点题目左上角的 ☆ 标记重点' : '还没有题目，点击上方"添加题目"开始吧'}</p>
        </div>
      )}
    </div>
  );
}
