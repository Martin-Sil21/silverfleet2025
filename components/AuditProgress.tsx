import React, { useEffect, useRef } from 'react';
import Loader from './Loader';
import Card from './Card';
import { useTranslation } from '../hooks/useTranslation';

interface AuditProgressProps {
  message: string;
  title: string;
  progress?: { current: number; total: number };
  logs: string[];
}

const AuditProgress: React.FC<AuditProgressProps> = ({ message, title, progress, logs }) => {
  const { t } = useTranslation();
  const percentage = progress && progress.total > 0
    ? Math.round((progress.current / progress.total) * 100)
    : 0;
  
  const logContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <Card>
      <div className="flex flex-col items-center justify-center p-8 space-y-6">
        <Loader />
        <h2 className="text-xl font-semibold text-gray-800 dark:text-white">{title}</h2>
        <div className="w-full max-w-2xl text-center">
            <p className="text-gray-600 dark:text-gray-400 font-medium h-6">{message}</p>
            {progress && progress.total > 0 && (
              <div className="mt-4">
                <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
                  <div 
                    className="bg-primary-600 h-2.5 rounded-full transition-all duration-500 ease-out" 
                    style={{ width: `${percentage}%` }}
                  ></div>
                </div>
                <p className="text-sm font-semibold text-gray-500 dark:text-gray-400 mt-2">
                  {percentage}% ({progress.current} / {progress.total})
                </p>
              </div>
            )}
            <div className="mt-6 text-left">
                <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-2">{t('activityLog')}</h3>
                <div 
                    ref={logContainerRef}
                    className="h-48 max-h-48 overflow-y-auto bg-gray-900 text-gray-300 p-3 rounded-lg font-mono text-xs"
                >
                    {logs.map((log, index) => (
                        <p key={index} className="whitespace-pre-wrap leading-relaxed">&raquo; {log}</p>
                    ))}
                </div>
            </div>
        </div>
      </div>
    </Card>
  );
};

export default AuditProgress;