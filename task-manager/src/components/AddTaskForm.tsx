import { useState } from 'react';
import type { Task, TaskType } from '../types';
import { generateId } from '../store';

interface Props {
  onAdd: (task: Task) => void;
  onCancel: () => void;
}

export default function AddTaskForm({ onAdd, onCancel }: Props) {
  const [type, setType] = useState<TaskType>('gold');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() || !answer.trim()) return;

    const task: Task = {
      id: generateId(),
      type,
      question: question.trim(),
      answer: answer.trim(),
      status: 'open',
      nextReviewDate: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      lastReviewedAt: null,
    };

    onAdd(task);
    setQuestion('');
    setAnswer('');
  };

  return (
    <form className="add-task-form" onSubmit={handleSubmit}>
      <h2>添加新题目</h2>

      <div className="form-group">
        <label htmlFor="task-type">类型</label>
        <select
          id="task-type"
          value={type}
          onChange={(e) => setType(e.target.value as TaskType)}
        >
          <option value="gold">Gold</option>
          <option value="aws">AWS</option>
        </select>
      </div>

      <div className="form-group">
        <label htmlFor="task-question">题目</label>
        <textarea
          id="task-question"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="输入题目..."
          rows={3}
        />
      </div>

      <div className="form-group">
        <label htmlFor="task-answer">答案</label>
        <textarea
          id="task-answer"
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="输入答案..."
          rows={3}
        />
      </div>

      <div className="form-actions">
        <button type="submit" className="btn btn-primary">添加</button>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>取消</button>
      </div>
    </form>
  );
}
