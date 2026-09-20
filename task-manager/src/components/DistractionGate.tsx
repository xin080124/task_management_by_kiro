import { useState } from 'react';

// 散漫申请器：想散漫前，必须逐条勾选下面的自省句，全部勾选后才"批准散漫"。
// 用一道有摩擦的仪式，把冲动拦在延迟满足的门口。
const REFLECTIONS = [
  '散漫不是自由，只是自己被挟持，不要让分别念牵着自己走',
  '散漫不如念咒更让自己放松',
  '群聊不如自查小红书、GPT、YouTube',
  '我只要争取闻思修的时间，这是活着的唯一目的，其余都要靠运气，不必强求',
  '不要犯同样的错误，想想复习题',
];

export default function DistractionGate() {
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState<boolean[]>(() => REFLECTIONS.map(() => false));
  const [granted, setGranted] = useState(false);

  const allChecked = checked.every(Boolean);

  const toggle = (i: number) => {
    setChecked(prev => prev.map((v, idx) => (idx === i ? !v : v)));
  };

  const reset = () => {
    setChecked(REFLECTIONS.map(() => false));
    setGranted(false);
  };

  const handleClose = () => {
    setOpen(false);
    reset();
  };

  return (
    <div className="distraction-gate">
      {!open ? (
        <button className="btn btn-distraction-trigger" onClick={() => setOpen(true)}>
          😮‍💨 我想散漫一下
        </button>
      ) : (
        <div className="distraction-panel">
          <div className="distraction-header">
            <span>散漫申请</span>
            <button className="btn-delete" onClick={handleClose} title="关闭">✕</button>
          </div>

          {!granted ? (
            <>
              <p className="distraction-hint">逐条读一遍，勾选后才能批准散漫：</p>
              <div className="distraction-list">
                {REFLECTIONS.map((text, i) => (
                  <label key={i} className={`distraction-item ${checked[i] ? 'checked' : ''}`}>
                    <input type="checkbox" checked={checked[i]} onChange={() => toggle(i)} />
                    <span>{i + 1}. {text}</span>
                  </label>
                ))}
              </div>
              <button
                className="btn btn-primary distraction-approve"
                disabled={!allChecked}
                onClick={() => setGranted(true)}
              >
                {allChecked ? '✓ 批准散漫' : `还需勾选 ${checked.filter(v => !v).length} 条`}
              </button>
            </>
          ) : (
            <div className="distraction-granted">
              <p>好吧，批准你散漫一小会儿 😌</p>
              <p className="distraction-granted-note">记得回来。散漫不如念咒更让自己放松。</p>
              <button className="btn btn-secondary btn-sm" onClick={handleClose}>我回来了</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
