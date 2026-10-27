import { useState, type ReactNode } from 'react';
import { Lightbulb } from 'lucide-react';

const KEY = 'qiguang-ui:tips';
const read = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
};

/** 第一次打開某一頁時的小提示（一次只講這一頁的一件事）；按「知道了」就不再出現。 */
export function PageTip({ id, children }: { id: string; children: ReactNode }) {
  const [hidden, setHidden] = useState(() => read().includes(id));
  if (hidden) return null;
  const close = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify([...read(), id]));
    } catch {
      // 只影響提示會不會再出現
    }
    setHidden(true);
  };
  return (
    <div className="page-tip" role="note">
      <Lightbulb size={18} aria-hidden="true" />
      <p>{children}</p>
      <button className="link" onClick={close}>
        知道了
      </button>
    </div>
  );
}
