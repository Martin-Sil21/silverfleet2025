import React, { useState, useRef, useEffect, useMemo } from 'react';
import type { AuditResult, TestCase } from '../types';
import { useTranslation } from '../hooks/useTranslation';
import Card from './Card';
import { ConversationTraceViewer } from './AuditReport';

const getStatus = (result: AuditResult) => {
    const lastStep = result.executionTrace.length > 0 ? result.executionTrace[result.executionTrace.length - 1] : null;
    if (lastStep?.status === 'ERROR') {
        return { text: 'Failed', color: 'bg-red-500', textColor: 'text-red-500' };
    }
    if (result.executionTrace.length > 0) {
        return { text: 'Running', color: 'bg-blue-500 animate-pulse', textColor: 'text-blue-500' };
    }
    return { text: 'Pending', color: 'bg-gray-400', textColor: 'text-gray-500' };
};

const getPayloadExceprt = (payload: Record<string, any>): string => {
    const keysToShow = Object.keys(payload).filter(k => k.toLowerCase() !== 'message' && !k.toLowerCase().includes('id'));
    if (keysToShow.length > 0) {
        const key = keysToShow[0];
        return `${key}: ${payload[key]}`;
    }
    return `ID: ${payload.conversationId || 'N/A'}`;
}

const ChatListItem: React.FC<{ result: AuditResult; isSelected: boolean; onClick: () => void; }> = ({ result, isSelected, onClick }) => {
    const { text: statusText, color: statusColor } = getStatus(result);
    const lastMessage = result.executionTrace.length > 0 ? result.executionTrace[result.executionTrace.length - 1] : null;

    return (
        <div
            onClick={onClick}
            className={`p-3 rounded-lg cursor-pointer transition-colors border-l-4 ${isSelected ? 'bg-primary-100 dark:bg-primary-900/50 border-primary-500' : 'bg-gray-50 dark:bg-gray-800/50 border-transparent hover:bg-gray-200 dark:hover:bg-gray-700/50'}`}
        >
            <div className="flex justify-between items-center mb-1">
                <h4 className="font-bold text-sm text-gray-800 dark:text-white truncate pr-2">{result.testCase.title}</h4>
                <div className={`flex items-center flex-shrink-0 gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full`}>
                    <div className={`w-2 h-2 rounded-full ${statusColor}`}></div>
                    {statusText}
                </div>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{getPayloadExceprt(result.testCase.initialPayload)}</p>
            {lastMessage && <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                {new Date(lastMessage.timestamp!).toLocaleTimeString()}
            </p>}
        </div>
    );
};

const TestCaseInfoCard: React.FC<{ testCase: TestCase }> = ({ testCase }) => {
    const { t } = useTranslation();
    return (
        <Card className="mb-4 flex-shrink-0">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-3">{t('testCaseInfo')}</h3>
            <div className="space-y-2 text-sm">
                <p><span className="font-semibold text-gray-600 dark:text-gray-400">{t('personaLabel')}: </span>{testCase.persona}</p>
                <p><span className="font-semibold text-gray-600 dark:text-gray-400">{t('personaGoal')}: </span>{testCase.conversationGoal}</p>
                <div>
                     <span className="font-semibold text-gray-600 dark:text-gray-400">{t('initialData')}: </span>
                     <pre className="text-xs p-2 mt-1 bg-gray-100 dark:bg-gray-900 rounded-md whitespace-pre-wrap max-h-24 overflow-auto">{JSON.stringify(testCase.initialPayload, null, 2)}</pre>
                </div>
            </div>
        </Card>
    )
}

interface LiveAuditViewProps {
    results: AuditResult[];
    logs: string[];
    onCancel: () => void;
    totalCases: number;
    completedCases: number;
}

const LiveAuditView: React.FC<LiveAuditViewProps> = ({ results, logs, onCancel, totalCases, completedCases }) => {
    const { t } = useTranslation();
    const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
    const logContainerRef = useRef<HTMLDivElement>(null);
    const progressPercentage = totalCases > 0 ? (completedCases / totalCases) * 100 : 0;

    const sortedResults = useMemo(() => {
        return [...results].sort((a, b) => {
            const lastA = a.executionTrace[a.executionTrace.length - 1]?.timestamp || 0;
            const lastB = b.executionTrace[b.executionTrace.length - 1]?.timestamp || 0;
            return lastB - lastA;
        });
    }, [results]);
    
    useEffect(() => {
        if (!selectedCaseId && sortedResults.length > 0 && sortedResults[0].executionTrace.length > 0) {
            setSelectedCaseId(sortedResults[0].id);
        }
    }, [sortedResults, selectedCaseId]);

    const selectedResult = useMemo(() => {
        return results.find(r => r.id === selectedCaseId);
    }, [selectedCaseId, results]);

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
                {/* Left Panel: Chat List */}
                <aside className="w-full md:w-1/3 lg:w-1/4 xl:w-1/5 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
                    <h3 className="font-bold text-lg text-gray-800 dark:text-white p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">{t('conversations')}</h3>
                    <div className="overflow-y-auto p-2 space-y-2">
                        {sortedResults.map(result => (
                            <ChatListItem 
                                key={result.id} 
                                result={result}
                                isSelected={selectedCaseId === result.id}
                                onClick={() => setSelectedCaseId(result.id)}
                            />
                        ))}
                    </div>
                </aside>

                {/* Center Panel: Active Chat */}
                <main className="flex-1 flex flex-col p-4 sm:p-6 lg:p-8 overflow-y-auto">
                    {selectedResult ? (
                        <>
                           <TestCaseInfoCard testCase={selectedResult.testCase} />
                           <ConversationTraceViewer trace={selectedResult.executionTrace} />
                        </>
                    ) : (
                        <div className="flex-1 flex items-center justify-center text-center">
                            <p className="text-gray-500 dark:text-gray-400">{t('selectConversation')}</p>
                        </div>
                    )}
                </main>

                {/* Right Panel: Activity Log */}
                <aside ref={logContainerRef} className="hidden lg:block w-full lg:w-1/3 xl:w-1/4 bg-gray-900 text-gray-300 font-mono text-xs p-4 overflow-y-auto border-l border-gray-700">
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