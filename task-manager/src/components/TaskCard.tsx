import { useState } from 'react';
import type { Task } from '../types';

interface Props {
  task: Task;
  onPass: (id: string) => void;
  onFail: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (id: string, updates: Partial<Pick<Task, 'question' | 'answer'>>) => void;
  onToggleStar: (id: string) => void;
}

export default function TaskCard({ task, onPass, onFail, onDelete, onEdit, onToggleStar }: Props) {
  const [showAnswer, setShowAnswer] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editQuestion, setEditQuestion] = useState(task.question);
  const [editAnswer, setEditAnswer] = useState(task.answer);

  const statusLabel = task.status === 'open' ? '待复习' : `等待中 (${task.status.toUpperCase()})`;
  const isOpen = task.status === 'open';
  const isWaiting = !isOpen;

  // Check if a waiting task is due
  const now = new Date();
  const reviewDate = new Date(task.nextReviewDate);
  const isDue = reviewDate <= now;

  // If waiting and not yet due, show countdown
  const daysLeft = isWaiting ? Math.max(0, Math.ceil((reviewDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))) : 0;

  const handleSave = () => {
    onEdit(task.id, {
      question: editQuestion.trim() || task.question,
      answer: editAnswer.trim() || task.answer,
    });
    setEditing(false);
  };

  const handleCancel = () => {
    setEditQuestion(task.question);
    setEditAnswer(task.answer);
    setEditing(false);
  };

  return (
    <div className={`task-card ${task.type} ${isOpen ? 'active' : 'waiting'} ${task.starred ? 'starred' : ''}`}>
      <div className="task-header">
        <button
          className={`btn-star ${task.starred ? 'on' : ''}`}
          onClick={() => onToggleStar(task.id)}
          title={task.starred ? '取消星标' : '标记为重点关注'}
        >
          {task.starred ? '★' : '☆'}
        </button>
        <span className={`type-badge ${task.type}`}>{task.type.toUpperCase()}</span>
        <div className="task-header-right">
          <span className={`status-badge ${task.status}`}>
            {isWaiting && !isDue ? `${task.status.toUpperCase()} · ${daysLeft}天后` : statusLabel}
          </span>
          <button className="btn-edit" onClick={() => setEditing(!editing)} title="编辑">✎</button>
          <button className="btn-delete" onClick={() => onDelete(task.id)} title="删除">✕</button>
        </div>
      </div>

      {!editing ? (
        <>
          <div className="task-question">
            <p>{task.question}</p>
          </div>

          {isOpen && (
            <div className="task-answer-section">
              {showAnswer ? (
                <>
                  <div className="task-answer">
                    <strong>答案：</strong>
                    <p>{task.answer}</p>
                  </div>
                  <div className="task-actions">
                    <button className="btn btn-pass" onClick={() => { onPass(task.id); setShowAnswer(false); }}>
                      ✓ Pass
                    </button>
                    <button className="btn btn-fail" onClick={() => { onFail(task.id); setShowAnswer(false); }}>
                      ✗ Fail
                    </button>
                  </div>
                </>
              ) : (
                <button className="btn btn-reveal" onClick={() => setShowAnswer(true)}>
                  显示答案
                </button>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="edit-fields-form">
          <div className="edit-row edit-row-full">
            <label>题目</label>
            <textarea value={editQuestion} onChange={e => setEditQuestion(e.target.value)} className="form-input-sm edit-description" rows={2} />
          </div>
          <div className="edit-row edit-row-full">
            <label>答案</label>
            <textarea value={editAnswer} onChange={e => setEditAnswer(e.target.value)} className="form-input-sm edit-description" rows={3} />
          </div>
          <div className="edit-row-actions">
            <button className="btn btn-primary btn-sm" onClick={handleSave}>保存</button>
            <button className="btn btn-secondary btn-sm" onClick={handleCancel}>取消</button>
          </div>
        </div>
      )}

      {isWaiting && !editing && (
        <div className="task-meta">
          下次复习: {reviewDate.toLocaleDateString('zh-CN')}
          {isDue && <span className="due-tag"> (已到期)</span>}
        </div>
      )}
    </div>
  );
}
