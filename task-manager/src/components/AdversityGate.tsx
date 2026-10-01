import ReflectionGate from './ReflectionGate';

// 违缘处理器：遇到违缘时，逐条读并勾选，全部勾选后"转为道用"。
const DEFAULT_ITEMS = [
  '违缘转为道用',
];

export default function AdversityGate() {
  return (
    <ReflectionGate
      storageKey="task-manager-adversity-reflections"
      defaults={DEFAULT_ITEMS}
      triggerLabel="🌊 遇到违缘了"
      title="违缘处理"
      hint="逐条读一遍并勾选（勾选后开始计时，看你花多久转化这个违缘）："
      approveLabel="🙏 转为道用"
      grantedTitle="已转为道用 🙏"
      grantedNoteFn={(s) => `你花了 ${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')} 转化违缘。`}
      closeLabel="继续前行"
    />
  );
}
