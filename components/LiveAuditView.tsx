import React, { useState, useRef, useEffect } from 'react';
import type { AuditResult } from '../types';
import { useTranslation } from '../hooks/useTranslation';
import Card from './Card';
import { ConversationTraceViewer } from './AuditReport';

const LiveTestCaseCard: React.FC<{ result: AuditResult }> = ({ result }) => {
    const { t } = useTranslation();
    const [isExpanded, setIsExpanded] = useState(false);

    const lastStep = result.executionTrace.length > 0 ? result.executionTrace[result.executionTrace.length - 1] : null;
    const turn = result.executionTrace.length;
    
    const getStatus = () => {
        if (lastStep?.status === 'ERROR') {
            return { text: 'Failed', color: 'bg-red-500', textColor: 'text-red-500' };
        }
        if (turn > 0) {
            return { text: `Running - Turn ${turn}`, color: 'bg-blue-500 animate-pulse', textColor: 'text-blue-500' };
        }
        return { text: 'Pending', color: 'bg-gray-400', textColor: 'text-gray-500' };
    };
    
    const { text: statusText, color: statusColor, textColor: statusTextColor } = getStatus();

    return (
        <Card className="flex flex-col transition-all duration-300">
            <div onClick={() => setIsExpanded(!isExpanded)} className="cursor-pointer">
                <div className="flex justify-between items-start gap-2">
                    <h3 className="text-lg font-bold text-gray-800 dark:text-white flex-1 pr-2">{result.testCase.title}</h3>
                    <div className={`flex items-center flex-shrink-0 gap-2 text-xs font-semibold px-2 py-1 rounded-full bg-opacity-20 ${statusColor.replace('bg-','bg-')} ${statusTextColor}`}>
                        <div className={`w-2 h-2 rounded-full ${statusColor}`}></div>
                        {statusText}
                    </div>
                </div>
                {!isExpanded && (
                    <div className="space-y-1 mt-2">
                        <p className="text-sm text-gray-500 dark:text-gray-400 truncate"><span className="font-semibold">{t('personaLabel')}: </span>{result.testCase.persona}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400 truncate"><span className="font-semibold">{t('personaGoal')}: </span>{result.testCase.conversationGoal}</p>
                    </div>
                )}
            </div>
            {isExpanded && (
                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 flex-1 flex flex-col min-h-[400px]">
                    <ConversationTraceViewer trace={result.executionTrace} />
                </div>
            )}
        </Card>
    );
};

interface LiveAuditViewProps {
    results: AuditResult[];
    logs: string[];
    onCancel: () => void;
    totalCases: number;
    completedCases: number;
}

const LiveAuditView: React.FC<LiveAuditViewProps> = ({ results, logs, onCancel, totalCases, completedCases }) => {
    const { t } = useTranslation();
    const logContainerRef = useRef<HTMLDivElement>(null);
    const progressPercentage = totalCases > 0 ? (completedCases / totalCases) * 100 : 0;

    useEffect(() => {
        if (logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [logs]);

    return (
        <div className="w-screen h-screen bg-gray-100 dark:bg-gray-900 flex flex-col font-sans">
            <header className="flex-shrink-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4 z-10 shadow-sm">
                 <div className="flex items-center justify-between gap-4">
                    <div className="flex-grow">
                        <h2 className="text-xl font-bold text-gray-800 dark:text-white">{t('liveAuditTitle')}</h2>
                        <p className="text-sm text-gray-600 dark:text-gray-400">{t('liveAuditDescription')}</p>
                    </div>
                    <button onClick={onCancel} className="px-4 py-2 bg-gray-600 text-white font-semibold rounded-lg shadow-md hover:bg-gray-700 transition-colors">{t('cancelAudit')}</button>
                </div>
                 <div className="mt-4">
                    <div className="flex justify-between items-center mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">
                        <span>{t('progress')}</span>
                        <span>{completedCases} / {totalCases}</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                    <div 
                        className="bg-primary-600 h-2.5 rounded-full transition-all duration-500" 
                        style={{ width: `${progressPercentage}%` }}
                    ></div>
                    </div>
                </div>
            </header>

            <div className="flex-grow flex relative overflow-hidden">
                <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
                     <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-6">
                        {results.map(result => (
                            <LiveTestCaseCard key={result.id} result={result} />
                        ))}
                    </div>
                </main>
                <aside ref={logContainerRef} className="w-full lg:w-1/3 xl:w-1/4 bg-gray-900 text-gray-300 font-mono text-xs p-4 overflow-y-auto border-l border-gray-700">
                    <h3 className="font-bold text-lg text-white mb-4 sticky top-0 bg-gray-900 pb-2">{t('activityLog')}</h3>
                    {logs.map((log, index) => (
                        <p key={index} className="whitespace-pre-wrap animate-fade-in">&gt; {log}</p>
                    ))}
                </aside>
            </div>
        </div>
    );
};

export default LiveAuditView;