import { useState, useEffect, useCallback, useRef } from 'react';
import type { Story, Milestone, StoryStatus, MilestoneStatus } from '../types';
import { loadStories, saveStories, generateStoryId, generateMilestoneId, exportProjectsToCsv, importProjectsFromCsv } from '../projectStore';

export default function ProjectPage() {
  const [stories, setStories] = useState<Story[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [expandedStories, setExpandedStories] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');

  useEffect(() => {
    setStories(loadStories());
    setInitialized(true);
  }, []);

  useEffect(() => {
    if (initialized) saveStories(stories);
  }, [stories, initialized]);

  const toggleExpand = (id: string) => {
    setExpandedStories(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAddStory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    const story: Story = {
      id: generateStoryId(),
      title: newTitle.trim(),
      description: newDescription.trim(),
      status: 'active',
      milestones: [],
      createdAt: new Date().toISOString(),
      completedAt: null,
    };
    setStories(prev => [...prev, story]);
    setNewTitle('');
    setNewDescription('');
    setShowAddForm(false);
  };

  const handleDeleteStory = useCallback((id: string) => {
    if (confirm('确定删除这个项目？所有里程碑也会被删除。')) {
      setStories(prev => prev.filter(s => s.id !== id));
    }
  }, []);

  const handleUpdateStoryStatus = useCallback((id: string, status: StoryStatus) => {
    setStories(prev => prev.map(s =>
      s.id === id ? { ...s, status, completedAt: status === 'done' ? new Date().toISOString() : null } : s
    ));
  }, []);

  const handleEditStory = useCallback((id: string, updates: Partial<Pick<Story, 'title' | 'description'>>) => {
    setStories(prev => prev.map(s =>
      s.id === id ? { ...s, ...updates } : s
    ));
  }, []);

  const handleAddMilestone = useCallback((storyId: string, title: string, dueDate: string | null) => {
    const ms: Milestone = {
      id: generateMilestoneId(),
      title,
      status: 'todo',
      dueDate,
      completedAt: null,
      createdAt: new Date().toISOString(),
    };
    setStories(prev => prev.map(s =>
      s.id === storyId ? { ...s, milestones: [...s.milestones, ms] } : s
    ));
  }, []);

  const handleUpdateMilestone = useCallback((storyId: string, msId: string, updates: Partial<Pick<Milestone, 'title' | 'status' | 'dueDate'>>) => {
    setStories(prev => prev.map(s => {
      if (s.id !== storyId) return s;
      const milestones = s.milestones.map(ms => {
        if (ms.id !== msId) return ms;
        const updated = { ...ms, ...updates };
        if (updates.status === 'done' && !ms.completedAt) {
          updated.completedAt = new Date().toISOString();
        } else if (updates.status && updates.status !== 'done') {
          updated.completedAt = null;
        }
        return updated;
      });
      return { ...s, milestones };
    }));
  }, []);

  const handleDeleteMilestone = useCallback((storyId: string, msId: string) => {
    setStories(prev => prev.map(s =>
      s.id === storyId ? { ...s, milestones: s.milestones.filter(ms => ms.id !== msId) } : s
    ));
  }, []);

  const handleExport = () => {
    const csv = exportProjectsToCsv(stories);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    a.download = `家庭项目${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const imported = importProjectsFromCsv(content);
      if (imported.length > 0) {
        setStories(prev => {
          const existing = new Map(prev.map(s => [s.id, s]));
          imported.forEach(s => existing.set(s.id, s));
          return Array.from(existing.values());
        });
        alert(`成功导入 ${imported.length} 个项目`);
      } else {
        alert('导入失败，请检查 CSV 格式');
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Stats
  const activeStories = stories.filter(s => s.status === 'active');
  const doneStories = stories.filter(s => s.status === 'done');
  const onHoldStories = stories.filter(s => s.status === 'on-hold');

  return (
    <>
      <header className="app-header">
        <h1>🏡 家庭项目</h1>
        <div className="stats">
          <span className="stat">进行中: <strong>{activeStories.length}</strong></span>
          <span className="stat">已完成: <strong>{doneStories.length}</strong></span>
          <span className="stat">搁置: <strong>{onHoldStories.length}</strong></span>
        </div>
      </header>

      <nav className="toolbar">
        <div className="toolbar-actions">
          <button className="btn btn-primary" onClick={() => setShowAddForm(true)}>+ 添加项目</button>
          <button className="btn btn-secondary" onClick={handleExport}>导出 CSV</button>
          <label className="btn btn-secondary import-btn">
            导入 CSV
            <input ref={fileInputRef} type="file" accept=".csv" onChange={handleImport} style={{ display: 'none' }} />
          </label>
        </div>
      </nav>

      {showAddForm && (
        <form className="add-task-form" onSubmit={handleAddStory}>
          <h2>添加项目</h2>
          <div className="form-group">
            <label htmlFor="story-title">项目名称</label>
            <input id="story-title" type="text" value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="例如：装修客厅、孩子升学准备..." className="form-input" />
          </div>
          <div className="form-group">
            <label htmlFor="story-desc">描述（可选）</label>
            <textarea id="story-desc" value={newDescription} onChange={e => setNewDescription(e.target.value)} placeholder="项目背景和目标..." className="form-input" rows={3} />
          </div>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary">添加</button>
            <button type="button" className="btn btn-secondary" onClick={() => setShowAddForm(false)}>取消</button>
          </div>
        </form>
      )}

      <div className="task-list">
        {activeStories.length > 0 && (
          <div className="task-section">
            <h3>🚀 进行中 ({activeStories.length})</h3>
            {activeStories.map(story => (
              <StoryCard key={story.id} story={story} expanded={expandedStories.has(story.id)}
                onToggle={toggleExpand} onDelete={handleDeleteStory} onUpdateStatus={handleUpdateStoryStatus}
                onEdit={handleEditStory} onAddMilestone={handleAddMilestone}
                onUpdateMilestone={handleUpdateMilestone} onDeleteMilestone={handleDeleteMilestone} />
            ))}
          </div>
        )}

        {onHoldStories.length > 0 && (
          <div className="task-section">
            <h3>⏸️ 搁置 ({onHoldStories.length})</h3>
            {onHoldStories.map(story => (
              <StoryCard key={story.id} story={story} expanded={expandedStories.has(story.id)}
                onToggle={toggleExpand} onDelete={handleDeleteStory} onUpdateStatus={handleUpdateStoryStatus}
                onEdit={handleEditStory} onAddMilestone={handleAddMilestone}
                onUpdateMilestone={handleUpdateMilestone} onDeleteMilestone={handleDeleteMilestone} />
            ))}
          </div>
        )}

        {doneStories.length > 0 && (
          <div className="task-section">
            <h3>✅ 已完成 ({doneStories.length})</h3>
            {doneStories.map(story => (
              <StoryCard key={story.id} story={story} expanded={expandedStories.has(story.id)}
                onToggle={toggleExpand} onDelete={handleDeleteStory} onUpdateStatus={handleUpdateStoryStatus}
                onEdit={handleEditStory} onAddMilestone={handleAddMilestone}
                onUpdateMilestone={handleUpdateMilestone} onDeleteMilestone={handleDeleteMilestone} />
            ))}
          </div>
        )}

        {stories.length === 0 && (
          <div className="empty-state">
            <p>还没有家庭项目，点击上方"添加项目"开始吧</p>
          </div>
        )}
      </div>
    </>
  );
}

// Story Card component
interface StoryCardProps {
  story: Story;
  expanded: boolean;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onUpdateStatus: (id: string, status: StoryStatus) => void;
  onEdit: (id: string, updates: Partial<Pick<Story, 'title' | 'description'>>) => void;
  onAddMilestone: (storyId: string, title: string, dueDate: string | null) => void;
  onUpdateMilestone: (storyId: string, msId: string, updates: Partial<Pick<Milestone, 'title' | 'status' | 'dueDate'>>) => void;
  onDeleteMilestone: (storyId: string, msId: string) => void;
}

function StoryCard({ story, expanded, onToggle, onDelete, onUpdateStatus, onEdit, onAddMilestone, onUpdateMilestone, onDeleteMilestone }: StoryCardProps) {
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(story.title);
  const [editDesc, setEditDesc] = useState(story.description);
  const [addingMs, setAddingMs] = useState(false);
  const [newMsTitle, setNewMsTitle] = useState('');
  const [newMsDue, setNewMsDue] = useState('');

  const totalMs = story.milestones.length;
  const doneMs = story.milestones.filter(m => m.status === 'done').length;
  const progress = totalMs > 0 ? Math.round((doneMs / totalMs) * 100) : 0;

  const handleSaveEdit = () => {
    onEdit(story.id, { title: editTitle.trim() || story.title, description: editDesc });
    setEditing(false);
  };

  const handleAddMs = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMsTitle.trim()) return;
    onAddMilestone(story.id, newMsTitle.trim(), newMsDue || null);
    setNewMsTitle('');
    setNewMsDue('');
    setAddingMs(false);
  };

  return (
    <div className={`task-card story-card ${story.status}`}>
      <div className="story-header" onClick={() => onToggle(story.id)}>
        <span className="story-expand-icon">{expanded ? '▼' : '▶'}</span>
        {!editing ? (
          <span className="story-title">{story.title}</span>
        ) : (
          <input type="text" value={editTitle} onChange={e => setEditTitle(e.target.value)} className="form-input-sm edit-title-input" onClick={e => e.stopPropagation()} />
        )}
        <div className="story-meta">
          {totalMs > 0 && (
            <span className="story-progress">{doneMs}/{totalMs} ({progress}%)</span>
          )}
          <select className="story-status-select" value={story.status} onChange={e => { e.stopPropagation(); onUpdateStatus(story.id, e.target.value as StoryStatus); }} onClick={e => e.stopPropagation()}>
            <option value="active">进行中</option>
            <option value="on-hold">搁置</option>
            <option value="done">已完成</option>
          </select>
          <button className="btn-edit" onClick={e => { e.stopPropagation(); setEditing(!editing); }} title="编辑">✎</button>
          <button className="btn-delete" onClick={e => { e.stopPropagation(); onDelete(story.id); }} title="删除">✕</button>
        </div>
      </div>

      {/* Progress bar */}
      {totalMs > 0 && (
        <div className="story-progress-bar">
          <div className="story-progress-fill" style={{ width: `${progress}%` }} />
        </div>
      )}

      {editing && (
        <div className="edit-fields-form" onClick={e => e.stopPropagation()}>
          <div className="edit-row edit-row-full">
            <label>描述</label>
            <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} className="form-input-sm edit-description" rows={2} />
          </div>
          <div className="edit-row-actions">
            <button className="btn btn-primary btn-sm" onClick={handleSaveEdit}>保存</button>
            <button className="btn btn-secondary btn-sm" onClick={() => setEditing(false)}>取消</button>
          </div>
        </div>
      )}

      {!editing && story.description && (
        <div className="chore-description">{story.description}</div>
      )}

      {expanded && (
        <div className="story-milestones">
          {/* Milestone timeline - proportional spacing */}
          {story.milestones.length > 0 && (() => {
            // Get date for each milestone (use dueDate, then completedAt, then createdAt)
            const getMsDate = (ms: Milestone) => new Date(ms.dueDate || ms.completedAt || ms.createdAt).getTime();
            const sorted = [...story.milestones].sort((a, b) => getMsDate(a) - getMsDate(b));
            const dates = sorted.map(getMsDate);
            const minDate = dates[0];
            const maxDate = dates[dates.length - 1];
            const totalSpan = maxDate - minDate;
            // Min height per node: 40px, proportional extra based on time gap
            const MIN_GAP = 40;
            const MAX_EXTRA = 120; // max extra pixels for the longest gap

            return (
              <div className="milestone-timeline proportional">
                {sorted.map((ms, idx) => {
                  // Calculate gap before this node (for spacing)
                  let gapPx = 0;
                  if (idx > 0 && totalSpan > 0) {
                    const timeDiff = dates[idx] - dates[idx - 1];
                    gapPx = Math.round((timeDiff / totalSpan) * MAX_EXTRA);
                  }
                  return (
                    <div key={ms.id} className={`milestone-node ${ms.status}`} style={{ marginTop: idx > 0 ? `${gapPx}px` : '0' }}>
                      <div className="milestone-dot" />
                      {idx < sorted.length - 1 && (
                        <div className="milestone-line" style={{ height: `${MIN_GAP + (totalSpan > 0 ? Math.round(((dates[idx + 1] - dates[idx]) / totalSpan) * MAX_EXTRA) : 0)}px` }} />
                      )}
                      <div className="milestone-content">
                        <MilestoneItem ms={ms} storyId={story.id} onUpdate={onUpdateMilestone} onDelete={onDeleteMilestone} />
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {!addingMs ? (
            <button className="btn btn-secondary btn-sm add-ms-btn" onClick={() => setAddingMs(true)}>+ 添加里程碑</button>
          ) : (
            <form className="add-ms-form" onSubmit={handleAddMs}>
              <input type="text" value={newMsTitle} onChange={e => setNewMsTitle(e.target.value)} placeholder="里程碑名称..." className="form-input-sm" />
              <input type="date" value={newMsDue} onChange={e => setNewMsDue(e.target.value)} className="form-input-sm" />
              <button type="submit" className="btn btn-primary btn-sm">添加</button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAddingMs(false)}>取消</button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

// Milestone item
interface MilestoneItemProps {
  ms: Milestone;
  storyId: string;
  onUpdate: (storyId: string, msId: string, updates: Partial<Pick<Milestone, 'title' | 'status' | 'dueDate'>>) => void;
  onDelete: (storyId: string, msId: string) => void;
}

function MilestoneItem({ ms, storyId, onUpdate, onDelete }: MilestoneItemProps) {
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(ms.title);
  const [editDue, setEditDue] = useState(ms.dueDate ?? '');

  const handleSave = () => {
    onUpdate(storyId, ms.id, { title: editTitle.trim() || ms.title, dueDate: editDue || null });
    setEditing(false);
  };

  const statusIcons: Record<MilestoneStatus, string> = { todo: '○', 'in-progress': '◐', done: '●' };

  return (
    <div className="milestone-item">
      <div className="milestone-header">
        <button className="milestone-status-btn" onClick={() => {
          const next: MilestoneStatus = ms.status === 'todo' ? 'in-progress' : ms.status === 'in-progress' ? 'done' : 'todo';
          onUpdate(storyId, ms.id, { status: next });
        }} title="点击切换状态">
          {statusIcons[ms.status]}
        </button>
        {!editing ? (
          <span className={`milestone-title ${ms.status === 'done' ? 'done' : ''}`}>{ms.title}</span>
        ) : (
          <input type="text" value={editTitle} onChange={e => setEditTitle(e.target.value)} className="form-input-sm" />
        )}
        <div className="milestone-actions">
          {ms.dueDate && <span className="milestone-due">{ms.dueDate}</span>}
          {ms.status === 'done' && ms.completedAt && <span className="milestone-completed">✓ {ms.completedAt.slice(0, 10)}</span>}
          <button className="btn-edit" onClick={() => setEditing(!editing)} title="编辑">✎</button>
          <button className="btn-delete" onClick={() => onDelete(storyId, ms.id)} title="删除">✕</button>
        </div>
      </div>
      {editing && (
        <div className="milestone-edit">
          <input type="date" value={editDue} onChange={e => setEditDue(e.target.value)} className="form-input-sm" />
          <button className="btn btn-primary btn-sm" onClick={handleSave}>保存</button>
          <button className="btn btn-secondary btn-sm" onClick={() => setEditing(false)}>取消</button>
        </div>
      )}
    </div>
  );
}
