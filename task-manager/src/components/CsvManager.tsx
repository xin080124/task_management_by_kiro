import { useRef } from 'react';
import type { Task } from '../types';
import { exportToCsv, importFromCsv } from '../store';

interface Props {
  tasks: Task[];
  onImport: (tasks: Task[]) => void;
}

export default function CsvManager({ tasks, onImport }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = () => {
    const csv = exportToCsv(tasks);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const filename = `复习${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}.csv`;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const imported = importFromCsv(content);
      if (imported.length > 0) {
        onImport(imported);
        alert(`成功导入 ${imported.length} 个题目`);
      } else {
        alert('导入失败，请检查 CSV 格式');
      }
    };
    reader.readAsText(file);

    // Reset input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="csv-manager">
      <button className="btn btn-secondary" onClick={handleExport}>
        导出 CSV
      </button>
      <label className="btn btn-secondary import-btn">
        导入 CSV
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleImport}
          style={{ display: 'none' }}
        />
      </label>
    </div>
  );
}
