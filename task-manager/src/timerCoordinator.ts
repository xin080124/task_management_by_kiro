// 全局计时器协调中心：保证任意时刻最多只有一个计时器在跑。
// 家务、工作等各类计时器在“开始/恢复”前调用 activate()，
// 协调中心会先让上一个活跃计时器执行它自己的“暂停/停止”回调，再登记新的活跃者。
//
// 各计时器互不 import，只依赖这个中心，避免跨组件耦合。

type StopCallback = () => void;

interface ActiveTimer {
  id: string;
  stop: StopCallback;
}

let active: ActiveTimer | null = null;

/**
 * 登记一个计时器为当前活跃者。会先停掉上一个正在跑的计时器（若存在且不是自己）。
 * @param id 计时器唯一标识（如 'chore', 'work'）
 * @param stop 当这个计时器被别人挤下来时应执行的回调（暂停或结束并记录）
 */
export function activateTimer(id: string, stop: StopCallback): void {
  if (active && active.id !== id) {
    const prevStop = active.stop;
    // 先清空再调用，避免回调里又触发 deactivate 造成递归清错
    active = null;
    prevStop();
  }
  active = { id, stop };
}

/**
 * 主动注销当前活跃者（比如用户自己点了暂停/停止/完成）。
 * 只有当前活跃者是自己时才清空，避免误清别人。
 */
export function deactivateTimer(id: string): void {
  if (active && active.id === id) {
    active = null;
  }
}

/** 当前活跃计时器的 id（用于调试/展示，可选） */
export function getActiveTimerId(): string | null {
  return active ? active.id : null;
}
