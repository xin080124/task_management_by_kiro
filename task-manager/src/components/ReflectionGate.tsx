import { useState, useEffect, useRef } from 'react';

// 通用"自省闸门"：逐条读并勾选自省句，全部勾选后才允许进行某个动作。
// 每条句子可编辑（持久化），勾选后各自启动正计时，看在克制/转化每个念头上花了多久。
// 散漫申请器、违缘处理器都基于此组件。

interface Props {
  storageKey: string;      // localStorage key（每个用途独立）
  defaults: string[];      // 默认条目
  triggerLabel: string;    // 折叠时的触发按钮文案
  title: string;           // 展开后面板标题
  hint: string;            // 列表上方提示
  approveLabel: string;    // 全部勾选后的确认按钮文案（如“批准散漫”“转为道用”）
  pendingLabelFn?: (remaining: number) => string; // 未勾满时的按钮文案
  giveUpLabel?: string;    // 放弃按钮文案，不传则不显示
  grantedTitle: string;    // 完成后的标题
  grantedNoteFn?: (totalSeconds: number) => string; // 完成后的说明
  closeLabel: string;      // 完成后的收尾按钮文案
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function ReflectionGate({
  storageKey,
  defaults,
  triggerLabel,
  title,
  hint,
  approveLabel,
  pendingLabelFn,
  giveUpLabel,
  grantedTitle,
  grantedNoteFn,
  closeLabel,
}: Props) {
  const load = (): string[] => {
    try {
      const data = localStorage.getItem(storageKey);
      if (!data) return [...defaults];
      const arr = JSON.parse(data);
      if (Array.isArray(arr) && arr.length > 0) return arr;
      return [...defaults];
    } catch {
      return [...defaults];
    }
  };
  const save = (list: string[]) => localStorage.setItem(storageKey, JSON.stringify(list));

  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<string[]>(() => load());
  const [checked, setChecked] = useState<boolean[]>(() => load().map(() => false));
  const [elapsed, setElapsed] = useState<number[]>(() => load().map(() => 0));
  const startRef = useRef<(number | null)[]>(load().map(() => null));
  const [granted, setGranted] = useState(false);
  const [, tick] = useState(0);

  const allChecked = checked.length > 0 && checked.every(Boolean);

  useEffect(() => {
    const id = setInterval(() => {
      if (startRef.current.some(s => s !== null)) tick(n => n + 1);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const secondsOf = (i: number): number => {
    const base = elapsed[i] ?? 0;
    const start = startRef.current[i];
    if (start !== null) return base + Math.floor((Date.now() - start) / 1000);
    return base;
  };

  const toggle = (i: number) => {
    const now = Date.now();
    setChecked(prev => {
      const next = [...prev];
      const willCheck = !next[i];
      next[i] = willCheck;
      if (willCheck) {
        startRef.current[i] = now;
      } else {
        const start = startRef.current[i];
        if (start !== null) {
          setElapsed(e => {
            const ne = [...e];
            ne[i] = (ne[i] ?? 0) + Math.floor((now - start) / 1000);
            return ne;
          });
          startRef.current[i] = null;
        }
      }
      return next;
    });
  };

  const editItem = (i: number, text: string) => {
    setItems(prev => {
      const next = prev.map((v, idx) => (idx === i ? text : v));
      save(next);
      return next;
    });
  };

  const addItem = () => {
    setItems(prev => {
      const next = [...prev, ''];
      save(next);
      return next;
    });
    setChecked(prev => [...prev, false]);
    setElapsed(prev => [...prev, 0]);
    startRef.current = [...startRef.current, null];
  };

  const removeItem = (i: number) => {
    setItems(prev => {
      const next = prev.filter((_, idx) => idx !== i);
      save(next);
      return next;
    });
    setChecked(prev => prev.filter((_, idx) => idx !== i));
    setElapsed(prev => prev.filter((_, idx) => idx !== i));
    startRef.current = startRef.current.filter((_, idx) => idx !== i);
  };

  const reset = () => {
    setChecked(items.map(() => false));
    setElapsed(items.map(() => 0));
    startRef.current = items.map(() => null);
    setGranted(false);
  };

  const handleClose = () => {
    setOpen(false);
    reset();
  };

  const totalSeconds = items.reduce((s, _, i) => s + secondsOf(i), 0);
  const remaining = checked.filter(v => !v).length;

  return (
    <div className="distraction-gate">
      {!open ? (
        <button className="btn btn-distraction-trigger" onClick={() => setOpen(true)}>
          {triggerLabel}
        </button>
      ) : (
        <div className="distraction-panel">
          <div className="distraction-header">
            <span>{title}</span>
            <button className="btn-delete" onClick={handleClose} title="关闭">✕</button>
          </div>

          {!granted ? (
            <>
              <p className="distraction-hint">{hint}</p>
              <div className="distraction-list">
                {items.map((text, i) => (
                  <div key={i} className={`distraction-item ${checked[i] ? 'checked' : ''}`}>
                    <input type="checkbox" checked={checked[i] ?? false} onChange={() => toggle(i)} />
                    <span className="distraction-index">{i + 1}.</span>
                    <textarea
                      className="distraction-text"
                      value={text}
                      rows={2}
                      onChange={e => editItem(i, e.target.value)}
                    />
                    <span className={`distraction-timer ${startRef.current[i] !== null ? 'running' : ''}`}>
                      ⏱ {formatElapsed(secondsOf(i))}
                    </span>
                    <button className="btn-delete distraction-remove" onClick={() => removeItem(i)} title="删除这条">✕</button>
                  </div>
                ))}
                <button className="btn btn-secondary btn-sm distraction-add" onClick={addItem}>+ 添加一条</button>
              </div>
              <div className="distraction-actions">
                <button
                  className="btn btn-primary distraction-approve"
                  disabled={!allChecked}
                  onClick={() => setGranted(true)}
                >
                  {allChecked ? approveLabel : (pendingLabelFn ? pendingLabelFn(remaining) : `还需勾选 ${remaining} 条`)}
                </button>
                {giveUpLabel && (
                  <button className="btn btn-secondary distraction-giveup" onClick={reset}>
                    {giveUpLabel}
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="distraction-granted">
              <p>{grantedTitle}</p>
              {grantedNoteFn && <p className="distraction-granted-note">{grantedNoteFn(totalSeconds)}</p>}
              <button className="btn btn-secondary btn-sm" onClick={handleClose}>{closeLabel}</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
