import type { Task, TaskType } from '../types';
import TaskCard from './TaskCard';

interface Props {
  tasks: Task[];
  filter: TaskType | 'all';
  onPass: (id: string) => void;
  onFail: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (id: string, updates: Partial<Pick<Task, 'question' | 'answer'>>) => void;
}

export default function TaskList({ tasks, filter, onPass, onFail, onDelete, onEdit }: Props) {
  const filtered = tasks.filter(t => filter === 'all' || t.type === filter);

  // Separate open (due) tasks from waiting tasks
  const now = new Date();
  const openTasks = filtered.filter(t => t.status === 'open' || new Date(t.nextReviewDate) <= now);
  const waitingTasks = filtered.filter(t => t.status !== 'open' && new Date(t.nextReviewDate) > now);

  return (
    <div className="task-list">
      {openTasks.length > 0 && (
        <div className="task-section">
          <h3>待复习 ({openTasks.length})</h3>
          {openTasks.map(task => (
            <TaskCard key={task.id} task={task} onPass={onPass} onFail={onFail} onDelete={onDelete} onEdit={onEdit} />
          ))}
        </div>
      )}

      {waitingTasks.length > 0 && (
        <div className="task-section">
          <h3>等待中 ({waitingTasks.length})</h3>
          {waitingTasks.map(task => (
            <TaskCard key={task.id} task={task} onPass={onPass} onFail={onFail} onDelete={onDelete} onEdit={onEdit} />
          ))}
        </div>
      )}

      {filtered.length === 0 && (
        <div className="empty-state">
          <p>还没有题目，点击上方"添加题目"开始吧</p>
        </div>
      )}
    </div>
  );
}
