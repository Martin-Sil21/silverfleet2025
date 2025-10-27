import React, { useEffect, useState } from 'react';

interface HistoryEntry {
  id: string;
  testCase: { title: string; persona: string; conversationGoal: string };
  finalStatus: string;
  analysis: { overallScore: number; summary: string };
}

const HistoryViewer: React.FC = () => {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [selected, setSelected] = useState<HistoryEntry | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // @ts-ignore
    window.electronAPI?.readHistoryFiles?.()
      .then((data: HistoryEntry[]) => setEntries(data))
      .catch((e: any) => setError('No se pudo leer el historial.'));
  }, []);

  return (
    <div className="p-6">
      <h2 className="text-xl font-bold mb-4">Historial de Tests</h2>
      {error && <div className="text-red-500 mb-2">{error}</div>}
      <div className="flex gap-8">
        <div className="w-80">
          <ul className="divide-y divide-gray-200 border rounded-lg bg-white">
            {entries.map(entry => (
              <li key={entry.id} className={`p-3 cursor-pointer hover:bg-blue-50 ${selected?.id === entry.id ? 'bg-blue-100' : ''}`}
                  onClick={() => setSelected(entry)}>
                <div className="font-semibold">{entry.testCase.title}</div>
                <div className="text-xs text-gray-500">{entry.id}</div>
                <div className="text-sm">{entry.finalStatus === 'SUCCESS' ? '✅' : '❌'} {entry.analysis?.overallScore ?? '-'} pts</div>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex-1">
          {selected ? (
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-bold mb-2">{selected.testCase.title}</h3>
              <div className="mb-2 text-sm text-gray-600">{selected.testCase.persona}</div>
              <div className="mb-2 text-sm text-gray-600">🎯 {selected.testCase.conversationGoal}</div>
              <div className="mb-2 text-sm">Estado: {selected.finalStatus}</div>
              <div className="mb-2 text-sm">Puntaje: {selected.analysis?.overallScore ?? '-'}</div>
              <div className="mb-2 text-sm">Resumen: {selected.analysis?.summary}</div>
            </div>
          ) : (
            <div className="text-gray-500">Selecciona un test para ver detalles.</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default HistoryViewer;
