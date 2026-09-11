import { useState, useEffect, useCallback, useRef } from 'react';
import type { ListenItem, ListenStatus } from '../types';
import { LISTEN_INTERVALS } from '../types';
import { loadListenItems, saveListenItems, generateListenId, exportListenToCsv, importListenFromCsv } from '../listenStore';

export default function ListenPage() {
  const [items, setItems] = useState<ListenItem[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form
  const [newText, setNewText] = useState('');
  const [newTranslation, setNewTranslation] = useState('');
  const [newLang, setNewLang] = useState('en-US');

  useEffect(() => {
    const loaded = loadListenItems();
    // Promote due items
    const now = new Date();
    const promoted = loaded.map(item => {
      if (item.status !== 'open' && new Date(item.nextReviewDate) <= now) {
        return { ...item, status: 'open' as ListenStatus };
      }
      return item;
    });
    setItems(promoted);
    setInitialized(true);
  }, []);

  useEffect(() => {
    if (initialized) saveListenItems(items);
  }, [items, initialized]);

  const openItems = items.filter(i => i.status === 'open' || new Date(i.nextReviewDate) <= new Date());
  const waitingItems = items.filter(i => i.status !== 'open' && new Date(i.nextReviewDate) > new Date());

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newText.trim()) return;
    const item: ListenItem = {
      id: generateListenId(),
      text: newText.trim(),
      translation: newTranslation.trim(),
      lang: newLang,
      status: 'open',
      nextReviewDate: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      lastReviewedAt: null,
    };
    setItems(prev => [...prev, item]);
    setNewText('');
    setNewTranslation('');
    setShowAddForm(false);
  };

  const handlePass = useCallback((id: string) => {
    setItems(prev => prev.map(item => {
      if (item.id !== id) return item;
      const levels: ListenStatus[] = ['open', 'p1', 'p2', 'p3', 'p4', 'p5'];
      const idx = levels.indexOf(item.status);
      const nextStatus: ListenStatus = idx < 5 ? levels[idx + 1] : 'p5';
      const interval = LISTEN_INTERVALS[nextStatus];
      const nextDate = new Date();
      nextDate.setDate(nextDate.getDate() + interval);
      return { ...item, status: nextStatus, nextReviewDate: nextDate.toISOString(), lastReviewedAt: new Date().toISOString() };
    }));
  }, []);

  const handleFail = useCallback((id: string) => {
    setItems(prev => prev.map(item => {
      if (item.id !== id) return item;
      return { ...item, status: 'open' as ListenStatus, nextReviewDate: new Date().toISOString(), lastReviewedAt: new Date().toISOString() };
    }));
  }, []);

  const handleDelete = useCallback((id: string) => {
    if (confirm('确定删除？')) {
      setItems(prev => prev.filter(i => i.id !== id));
    }
  }, []);

  const handleEdit = useCallback((id: string, updates: Partial<Pick<ListenItem, 'text' | 'translation' | 'lang'>>) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...updates } : i));
  }, []);

  const handleExport = () => {
    const csv = exportListenToCsv(items);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    a.download = `听力${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const imported = importListenFromCsv(content);
      if (imported.length > 0) {
        setItems(prev => {
          const existing = new Map(prev.map(i => [i.id, i]));
          imported.forEach(i => existing.set(i.id, i));
          return Array.from(existing.values());
        });
        alert(`成功导入 ${imported.length} 条`);
      } else {
        alert('导入失败');
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <>
      <header className="app-header">
        <h1>👂 听力练习</h1>
        <div className="stats">
          <span className="stat">待练习: <strong>{openItems.length}</strong></span>
          <span className="stat">总计: <strong>{items.length}</strong></span>
        </div>
      </header>

      <nav className="toolbar">
        <div className="toolbar-actions">
          <button className="btn btn-primary" onClick={() => setShowAddForm(true)}>+ 添加句子</button>
          <button className="btn btn-secondary" onClick={handleExport}>导出 CSV</button>
          <label className="btn btn-secondary import-btn">
            导入 CSV
            <input ref={fileInputRef} type="file" accept=".csv" onChange={handleImport} style={{ display: 'none' }} />
          </label>
        </div>
      </nav>

      {showAddForm && (
        <form className="add-task-form" onSubmit={handleAdd}>
          <h2>添加听力句子</h2>
          <div className="form-group">
            <label htmlFor="listen-text">句子（会被朗读）</label>
            <textarea id="listen-text" value={newText} onChange={e => setNewText(e.target.value)} placeholder="The quick brown fox jumps over the lazy dog." className="form-input" rows={2} />
          </div>
          <div className="form-group">
            <label htmlFor="listen-translation">翻译/提示（可选）</label>
            <input id="listen-translation" type="text" value={newTranslation} onChange={e => setNewTranslation(e.target.value)} placeholder="那只敏捷的棕色狐狸跳过了那只懒狗" className="form-input" />
          </div>
          <div className="form-group">
            <label htmlFor="listen-lang">语言</label>
            <select id="listen-lang" value={newLang} onChange={e => setNewLang(e.target.value)} className="form-input">
              <option value="en-US">英语 (美)</option>
              <option value="en-GB">英语 (英)</option>
              <option value="ja-JP">日语</option>
              <option value="zh-CN">中文</option>
              <option value="ko-KR">韩语</option>
              <option value="fr-FR">法语</option>
              <option value="de-DE">德语</option>
              <option value="es-ES">西班牙语</option>
            </select>
          </div>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary">添加</button>
            <button type="button" className="btn btn-secondary" onClick={() => setShowAddForm(false)}>取消</button>
          </div>
        </form>
      )}

      <div className="task-list">
        {openItems.length > 0 && (
          <div className="task-section">
            <h3>🎧 待练习 ({openItems.length})</h3>
            {openItems.map(item => (
              <ListenCard key={item.id} item={item} onPass={handlePass} onFail={handleFail} onDelete={handleDelete} onEdit={handleEdit} />
            ))}
          </div>
        )}

        {waitingItems.length > 0 && (
          <div className="task-section">
            <h3>⏳ 等待中 ({waitingItems.length})</h3>
            {waitingItems.map(item => (
              <ListenCard key={item.id} item={item} onPass={handlePass} onFail={handleFail} onDelete={handleDelete} onEdit={handleEdit} />
            ))}
          </div>
        )}

        {items.length === 0 && (
          <div className="empty-state">
            <p>还没有听力素材，点击上方"添加句子"开始吧</p>
          </div>
        )}
      </div>
    </>
  );
}

// Listen Card
interface ListenCardProps {
  item: ListenItem;
  onPass: (id: string) => void;
  onFail: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (id: string, updates: Partial<Pick<ListenItem, 'text' | 'translation' | 'lang'>>) => void;
}

function ListenCard({ item, onPass, onFail, onDelete, onEdit }: ListenCardProps) {
  const [showText, setShowText] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(item.text);
  const [editTranslation, setEditTranslation] = useState(item.translation);
  const [editLang, setEditLang] = useState(item.lang);

  const isOpen = item.status === 'open' || new Date(item.nextReviewDate) <= new Date();
  const isWaiting = !isOpen;

  const daysLeft = isWaiting ? Math.max(0, Math.ceil((new Date(item.nextReviewDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))) : 0;

  const handleSpeak = () => {
    if (speaking) {
      speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(item.text);
    utterance.lang = item.lang;
    utterance.rate = 0.9;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    setSpeaking(true);
    speechSynthesis.speak(utterance);
  };

  const handleSave = () => {
    onEdit(item.id, { text: editText.trim() || item.text, translation: editTranslation, lang: editLang });
    setEditing(false);
  };

  return (
    <div className={`task-card listen-card ${isOpen ? 'active' : 'waiting'}`}>
      <div className="task-header">
        <span className="listen-lang-badge">{item.lang.split('-')[0].toUpperCase()}</span>
        <div className="task-header-right">
          <span className={`status-badge ${item.status}`}>
            {isWaiting ? `${item.status.toUpperCase()} · ${daysLeft}天后` : '待练习'}
          </span>
          <button className="btn-edit" onClick={() => setEditing(!editing)} title="编辑">✎</button>
          <button className="btn-delete" onClick={() => onDelete(item.id)} title="删除">✕</button>
        </div>
      </div>

      {!editing ? (
        <>
          {/* Play button - always visible */}
          <div className="listen-controls">
            <button className={`btn btn-listen ${speaking ? 'speaking' : ''}`} onClick={handleSpeak}>
              {speaking ? '⏹ 停止' : '🔊 播放'}
            </button>
            {item.translation && <span className="listen-hint">提示: {item.translation}</span>}
          </div>

          {/* Text - hidden by default for open items */}
          {isOpen && (
            <div className="listen-answer-section">
              {showText ? (
                <>
                  <div className="listen-text-reveal">
                    <p>{item.text}</p>
                  </div>
                  <div className="task-actions">
                    <button className="btn btn-pass" onClick={() => { onPass(item.id); setShowText(false); }}>✓ 听懂了</button>
                    <button className="btn btn-fail" onClick={() => { onFail(item.id); setShowText(false); }}>✗ 没听懂</button>
                  </div>
                </>
              ) : (
                <button className="btn btn-reveal" onClick={() => setShowText(true)}>显示原文</button>
              )}
            </div>
          )}

          {isWaiting && (
            <div className="task-meta">
              <span className="listen-text-preview">{item.text.slice(0, 50)}{item.text.length > 50 ? '...' : ''}</span>
            </div>
          )}
        </>
      ) : (
        <div className="edit-fields-form">
          <div className="edit-row edit-row-full">
            <label>句子</label>
            <textarea value={editText} onChange={e => setEditText(e.target.value)} className="form-input-sm edit-description" rows={2} />
          </div>
          <div className="edit-row edit-row-full">
            <label>翻译</label>
            <input type="text" value={editTranslation} onChange={e => setEditTranslation(e.target.value)} className="form-input-sm" />
          </div>
          <div className="edit-row">
            <label>语言</label>
            <select value={editLang} onChange={e => setEditLang(e.target.value)} className="form-input-sm">
              <option value="en-US">英语(美)</option>
              <option value="en-GB">英语(英)</option>
              <option value="ja-JP">日语</option>
              <option value="zh-CN">中文</option>
              <option value="ko-KR">韩语</option>
              <option value="fr-FR">法语</option>
              <option value="de-DE">德语</option>
              <option value="es-ES">西班牙语</option>
            </select>
          </div>
          <div className="edit-row-actions">
            <button className="btn btn-primary btn-sm" onClick={handleSave}>保存</button>
            <button className="btn btn-secondary btn-sm" onClick={() => setEditing(false)}>取消</button>
          </div>
        </div>
      )}
    </div>
  );
}
