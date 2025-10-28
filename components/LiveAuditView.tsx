import React, { useState, useRef, useEffect, useMemo } from 'react';
import type { AuditResult, TestCase, ExecutionStep } from '../types';
import { useTranslation } from '../hooks/useTranslation';
import Card from './Card';

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

const findUserMessageText = (data: any): string => {
    if (typeof data !== 'object' || data === null) return String(data);
    const messageKey = Object.keys(data).find(k => k.toLowerCase().includes('message') || k.toLowerCase().includes('text') || k.toLowerCase().includes('query'));
    return messageKey && typeof data[messageKey] === 'string' ? data[messageKey] : JSON.stringify(data);
};

const findAgentMessageText = (data: any): string => {
    if (!data) return "(No response)";
    if (typeof data === 'string') return data;
    if (typeof data.response === 'string') return data.response;
    if (typeof data.output === 'string') return data.output;
    if (typeof data.message === 'string') return data.message;
    
    if (typeof data.response === 'object' && data.response !== null) {
        return Object.values(data.response).filter(v => typeof v === 'string').join(' ');
    }
    if (typeof data.output === 'object' && data.output !== null) {
       return JSON.stringify(data.output);
    }
    
    return JSON.stringify(data);
};

const ChatMessage: React.FC<{ step: ExecutionStep; isLast: boolean }> = ({ step, isLast }) => {
    const userMsg = findUserMessageText(step.input);
    const agentMsg = findAgentMessageText(step.output);
    const time = step.timestamp ? new Date(step.timestamp).toLocaleTimeString() : '';

    return (
        <div className={`space-y-3 mb-4 ${isLast ? 'animate-slide-in' : ''}`}>
            {/* User message */}
            <div className="flex justify-end">
                <div className="max-w-[80%]">
                    <div className="bg-primary-500 text-white rounded-2xl rounded-tr-sm px-4 py-2 shadow-md">
                        <p className="text-sm whitespace-pre-wrap">{userMsg}</p>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 text-right">{time}</p>
                </div>
            </div>
            
            {/* Agent message - SUCCESS */}
            {step.status === 'SUCCESS' && (
                <div className="flex justify-start">
                    <div className="max-w-[80%]">
                        <div className="bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-2xl rounded-tl-sm px-4 py-2 shadow-md">
                            <p className="text-sm whitespace-pre-wrap">{agentMsg}</p>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{time}</p>
                    </div>
                </div>
            )}
            
            {/* Agent message - RUNNING (waiting for response) */}
            {step.status === 'RUNNING' && (
                <div className="flex justify-start">
                    <div className="max-w-[80%]">
                        <div className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 rounded-2xl rounded-tl-sm px-4 py-2 shadow-md">
                            <div className="flex items-center gap-2">
                                <div className="flex gap-1">
                                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                                </div>
                                <p className="text-xs italic">Escribiendo...</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            
            {/* Agent message - ERROR */}
            {step.status === 'ERROR' && (
                <div className="flex justify-start">
                    <div className="max-w-[80%]">
                        <div className="bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 text-red-800 dark:text-red-200 rounded-2xl rounded-tl-sm px-4 py-2 shadow-md">
                            <p className="text-sm font-semibold">Error</p>
                            <p className="text-xs whitespace-pre-wrap">{step.log}</p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
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
    const messageCount = result.executionTrace.length;
    
    // Extract name and phone from payload
    const payload = result.testCase.initialPayload;
    const nombre = payload.nombre || payload.name || 'Sin nombre';
    const telefono = payload.telefono || payload.phone || payload.telefonos || 'N/A';

    return (
        <div
            onClick={onClick}
            className={`p-3 rounded-lg cursor-pointer transition-all border-l-4 transform hover:scale-[1.02] ${isSelected ? 'bg-primary-100 dark:bg-primary-900/50 border-primary-500 shadow-lg' : 'bg-gray-50 dark:bg-gray-800/50 border-transparent hover:bg-gray-200 dark:hover:bg-gray-700/50 hover:shadow-md'}`}
        >
            <div className="flex justify-between items-center mb-1">
                <h4 className="font-bold text-sm text-gray-800 dark:text-white truncate pr-2">{result.testCase.title}</h4>
                <div className={`flex items-center flex-shrink-0 gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full`}>
                    <div className={`w-2 h-2 rounded-full ${statusColor}`}></div>
                </div>
            </div>
            
            <div className="text-xs space-y-0.5 mb-1">
                <p className="text-gray-700 dark:text-gray-300 font-medium">👤 {nombre}</p>
                <p className="text-gray-600 dark:text-gray-400">📱 {telefono}</p>
            </div>
            
            <p className="text-xs text-gray-500 dark:text-gray-500 italic mb-1 truncate">{result.testCase.persona}</p>
            
            <div className="flex justify-between items-center">
                {lastMessage && <p className="text-xs text-gray-400 dark:text-gray-500">
                    {new Date(lastMessage.timestamp!).toLocaleTimeString()}
                </p>}
                {messageCount > 0 && (
                    <span className="text-xs bg-blue-500 text-white px-2 py-0.5 rounded-full ml-auto">{messageCount}</span>
                )}
            </div>
        </div>
    );
};

const TestCaseInfoCard: React.FC<{ testCase: TestCase }> = ({ testCase }) => {
    const { t } = useTranslation();
    const payload = testCase.initialPayload;
    const nombre = payload.nombre || payload.name || 'Sin nombre';
    const telefono = payload.telefono || payload.phone || payload.telefonos || 'N/A';
    
    return (
        <div className="mb-4 flex-shrink-0 bg-gradient-to-r from-purple-100 to-pink-100 dark:from-purple-900/30 dark:to-pink-900/30 rounded-lg p-4 border border-purple-200 dark:border-purple-700 shadow-md">
            <div className="flex items-start justify-between mb-3">
                <h3 className="text-lg font-bold text-purple-800 dark:text-purple-200 flex items-center gap-2">
                    <span className="text-2xl">👤</span>
                    {testCase.title}
                </h3>
                <div className="text-right text-sm bg-white/70 dark:bg-gray-800/70 rounded-lg px-3 py-2">
                    <p className="font-semibold text-purple-700 dark:text-purple-300">{nombre}</p>
                    <p className="text-gray-600 dark:text-gray-400">📱 {telefono}</p>
                </div>
            </div>
            <div className="space-y-2 text-sm">
                <div className="bg-white/60 dark:bg-gray-800/60 rounded-lg p-3">
                    <p className="font-semibold text-purple-700 dark:text-purple-300 mb-1">Personalidad:</p>
                    <p className="text-gray-700 dark:text-gray-200">{testCase.persona}</p>
                </div>
                <div className="bg-white/60 dark:bg-gray-800/60 rounded-lg p-3">
                    <p className="font-semibold text-pink-700 dark:text-pink-300 mb-1">Objetivo:</p>
                    <p className="text-gray-700 dark:text-gray-200">{testCase.conversationGoal}</p>
                </div>
            </div>
        </div>
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
    const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
    const logContainerRef = useRef<HTMLDivElement>(null);
    const chatContainerRef = useRef<HTMLDivElement>(null);
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

    useEffect(() => {
        if (chatContainerRef.current && selectedResult) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    }, [selectedResult?.executionTrace.length]);

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
                <main className="flex-1 flex flex-col p-4 sm:p-6 lg:p-8 overflow-y-auto bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
                    {selectedResult ? (
                        <>
                           <TestCaseInfoCard testCase={selectedResult.testCase} />
                           <div ref={chatContainerRef} className="flex-1 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 overflow-y-auto scroll-smooth">
                               <div className="space-y-4">
                                   {selectedResult.executionTrace.length === 0 ? (
                                       <div className="flex items-center justify-center h-32 text-gray-400 dark:text-gray-500">
                                           <p className="animate-pulse">Esperando primer mensaje...</p>
                                       </div>
                                   ) : (
                                       selectedResult.executionTrace.map((step, idx) => (
                                           <ChatMessage 
                                               key={`${step.nodeId}-${idx}`} 
                                               step={step} 
                                               isLast={idx === selectedResult.executionTrace.length - 1}
                                           />
                                       ))
                                   )}
                               </div>
                           </div>
                        </>
                    ) : (
                        <div className="flex-1 flex items-center justify-center text-center">
                            <div>
                                <div className="text-6xl mb-4 animate-bounce">💬</div>
                                <p className="text-gray-500 dark:text-gray-400 text-lg">{t('selectConversation')}</p>
                            </div>
                        </div>
                    )}
                </main>

                {/* Right Panel: Activity Log */}
                <aside ref={logContainerRef} className="hidden lg:block w-full lg:w-1/3 xl:w-1/4 bg-gradient-to-b from-gray-900 via-gray-800 to-gray-900 text-gray-300 font-mono text-xs p-4 overflow-y-auto border-l-2 border-green-500/30 shadow-2xl">
                    <div className="sticky top-0 bg-gray-900/95 pb-3 mb-4 border-b-2 border-green-500/50">
                        <h3 className="font-bold text-lg text-green-400 mb-1 flex items-center gap-2">
                            <span className="animate-pulse">⚡</span>
                            {t('activityLog')}
                        </h3>
                        <div className="flex gap-2 items-center">
                            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                            <span className="text-green-400 text-xs">Sistema activo</span>
                        </div>
                    </div>
                    <div className="space-y-1">
                        {logs.map((log, index) => {
                            const isRecent = index >= logs.length - 3;
                            const color = log.includes('Error') || log.includes('failed') 
                                ? 'text-red-400' 
                                : log.includes('Success') || log.includes('complete') 
                                ? 'text-green-400' 
                                : log.includes('Generating') || log.includes('Sending')
                                ? 'text-yellow-400'
                                : 'text-gray-400';
                            
                            return (
                                <p key={index} className={`whitespace-pre-wrap leading-relaxed transition-all duration-300 ${color} ${isRecent ? 'animate-slide-in font-semibold' : 'opacity-70'}`}>
                                    <span className="text-green-500 mr-2">›</span>{log}
                                </p>
                            );
                        })}
                        {logs.length === 0 && (
                            <p className="text-gray-500 italic text-center py-4">Esperando actividad...</p>
                        )}
                    </div>
                </aside>
            </div>
        </div>
    );
};

export default LiveAuditView;