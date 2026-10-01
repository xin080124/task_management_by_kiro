import ReflectionGate from './ReflectionGate';

// 散漫申请器：想散漫前，逐条读并勾选自省句，全部勾选后才"批准散漫"。
// 默认留一条空白条目供起步；已有数据的用户以 localStorage 里保存的为准，不受此影响。
const DEFAULT_REFLECTIONS = [''];

export default function DistractionGate() {
  return (
    <ReflectionGate
      storageKey="task-manager-distraction-reflections"
      defaults={DEFAULT_REFLECTIONS}
      triggerLabel="😮‍💨 我想散漫一下"
      title="散漫申请"
      hint="逐条读一遍并勾选（勾选后开始计时，看你花多久克制这个念头）："
      approveLabel="✓ 批准散漫"
      giveUpLabel="🛑 放弃散漫"
      grantedTitle="好吧，批准你散漫一小会儿 😌"
      grantedNoteFn={(s) => `你花了 ${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')} 克制念头。记得回来。`}
      closeLabel="我回来了"
    />
  );
}
