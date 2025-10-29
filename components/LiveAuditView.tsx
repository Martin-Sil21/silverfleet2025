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
            
            <p className="text-xs text-gray-500 dark:text-gray-500 italic mb-1 truncate">
                {typeof result.testCase.persona === 'string' 
                    ? result.testCase.persona 
                    : JSON.stringify(result.testCase.persona)}
            </p>
            
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

const DatabaseActivityCard: React.FC<{ result: AuditResult }> = ({ result }) => {
    if (!result.databaseActivity) return null;
    
    const { databaseActivity } = result;
    const hasOperations = databaseActivity.totalOperations > 0;
    const hasDiscrepancies = databaseActivity.discrepancies && databaseActivity.discrepancies.length > 0;
    const criticalIssues = databaseActivity.discrepancies?.filter(d => d.severity === 'critical').length || 0;
    
    return (
        <div className="mt-4 flex-shrink-0 bg-gradient-to-r from-indigo-100 to-purple-100 dark:from-indigo-900/30 dark:to-purple-900/30 rounded-lg p-4 border border-indigo-200 dark:border-indigo-700 shadow-md">
            <h3 className="text-lg font-bold text-indigo-800 dark:text-indigo-200 flex items-center gap-2 mb-3">
                <span className="text-2xl">🗄️</span>
                Actividad de Base de Datos
                {criticalIssues > 0 && (
                    <span className="ml-auto bg-red-500 text-white text-xs px-2 py-1 rounded-full animate-pulse">
                        {criticalIssues} Críticas
                    </span>
                )}
            </h3>
            
            {hasOperations ? (
                <div className="space-y-3">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        <div className="bg-white/60 dark:bg-gray-800/60 rounded-lg p-3 text-center">
                            <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{databaseActivity.totalOperations}</p>
                            <p className="text-xs text-gray-600 dark:text-gray-400">Total</p>
                        </div>
                        <div className="bg-white/60 dark:bg-gray-800/60 rounded-lg p-3 text-center">
                            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{databaseActivity.reads}</p>
                            <p className="text-xs text-gray-600 dark:text-gray-400">Lecturas</p>
                        </div>
                        <div className="bg-white/60 dark:bg-gray-800/60 rounded-lg p-3 text-center">
                            <p className="text-2xl font-bold text-green-600 dark:text-green-400">{databaseActivity.writes}</p>
                            <p className="text-xs text-gray-600 dark:text-gray-400">Escrituras</p>
                        </div>
                        <div className="bg-white/60 dark:bg-gray-800/60 rounded-lg p-3 text-center">
                            <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{databaseActivity.updates}</p>
                            <p className="text-xs text-gray-600 dark:text-gray-400">Actualizaciones</p>
                        </div>
                    </div>
                    
                    {hasDiscrepancies && (
                        <div className="bg-gradient-to-br from-red-50 to-orange-50 dark:from-red-900/20 dark:to-orange-900/20 border-2 border-red-400 dark:border-red-600 rounded-xl p-4 shadow-lg">
                            <div className="flex items-center justify-between mb-4">
                                <h4 className="font-bold text-red-800 dark:text-red-200 text-base flex items-center gap-2">
                                    <span className="text-2xl">🚨</span>
                                    Verificación de Precios
                                </h4>
                                <span className="bg-red-500 text-white text-xs px-3 py-1 rounded-full font-bold">
                                    {databaseActivity.discrepancies!.length} Error{databaseActivity.discrepancies!.length > 1 ? 'es' : ''}
                                </span>
                            </div>
                            
                            <div className="space-y-3 max-h-96 overflow-y-auto">
                                {databaseActivity.discrepancies!.map((disc, idx) => {
                                    // Extraer datos del description
                                    const isIncorrect = disc.type === 'incorrect_data';
                                    
                                    return (
                                        <div key={idx} className="bg-white dark:bg-gray-800 rounded-lg border-2 border-red-300 dark:border-red-700 overflow-hidden">
                                            {/* Header con producto */}
                                            <div className="bg-red-100 dark:bg-red-900/30 px-4 py-2 border-b-2 border-red-300 dark:border-red-700">
                                                <p className="font-bold text-gray-800 dark:text-gray-200 text-sm">
                                                    #{idx + 1} - {disc.table || 'Producto'}
                                                </p>
                                            </div>
                                            
                                            {/* Comparación de datos */}
                                            <div className="p-4">
                                                <div className="grid grid-cols-2 gap-4 mb-3">
                                                    {/* Lo que dijo el bot */}
                                                    <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3 border border-red-200 dark:border-red-800">
                                                        <p className="text-xs text-red-600 dark:text-red-400 font-semibold mb-1">🤖 BOT OFRECIÓ</p>
                                                        <p className="text-2xl font-bold text-red-700 dark:text-red-300">
                                                            ${disc.expected !== undefined ? Number(disc.expected).toLocaleString('es-AR', {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '?'}
                                                        </p>
                                                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">por unidad</p>
                                                    </div>
                                                    
                                                    {/* Lo que está en BD */}
                                                    <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 border border-green-200 dark:border-green-800">
                                                        <p className="text-xs text-green-600 dark:text-green-400 font-semibold mb-1">✅ BASE DE DATOS</p>
                                                        <p className="text-2xl font-bold text-green-700 dark:text-green-300">
                                                            ${disc.actual !== undefined ? Number(disc.actual).toLocaleString('es-AR', {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '?'}
                                                        </p>
                                                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">precio real</p>
                                                    </div>
                                                </div>
                                                
                                                {/* Diferencia */}
                                                {disc.expected !== undefined && disc.actual !== undefined && (
                                                    <div className="bg-gray-100 dark:bg-gray-900/30 rounded-lg p-3 border border-gray-300 dark:border-gray-700">
                                                        <div className="flex items-center justify-between">
                                                            <div>
                                                                <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Diferencia</p>
                                                                <p className="text-xl font-bold text-orange-600 dark:text-orange-400">
                                                                    {disc.expected > disc.actual ? '+' : '-'}${Math.abs(disc.expected - disc.actual).toLocaleString('es-AR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                                                                </p>
                                                            </div>
                                                            <div className="text-right">
                                                                <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Porcentaje</p>
                                                                <p className="text-xl font-bold text-orange-600 dark:text-orange-400">
                                                                    {disc.actual !== 0 ? `${(((disc.expected - disc.actual) / disc.actual) * 100).toFixed(1)}%` : 'N/A'}
                                                                </p>
                                                            </div>
                                                            <div className="text-right">
                                                                <div className={`text-3xl ${disc.expected === disc.actual ? 'text-green-500' : 'text-red-500'}`}>
                                                                    {disc.expected === disc.actual ? '✓' : '✗'}
                                                                </div>
                                                                <p className={`text-xs font-bold mt-1 ${disc.expected === disc.actual ? 'text-green-600' : 'text-red-600'}`}>
                                                                    {disc.expected === disc.actual ? 'CORRECTO' : 'INCORRECTO'}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                                
                                                {/* Descripción adicional (más pequeña) */}
                                                <p className="text-xs text-gray-600 dark:text-gray-400 mt-2 italic">
                                                    {disc.description}
                                                </p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                    
                    {/* Modificaciones en la BD */}
                    {databaseActivity.changes && databaseActivity.changes.length > 0 && (
                        <div className="bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 border-2 border-blue-400 dark:border-blue-600 rounded-xl p-4 shadow-lg">
                            <div className="flex items-center justify-between mb-4">
                                <h4 className="font-bold text-blue-800 dark:text-blue-200 text-base flex items-center gap-2">
                                    <span className="text-2xl">📝</span>
                                    Modificaciones en Base de Datos
                                </h4>
                                <span className="bg-blue-500 text-white text-xs px-3 py-1 rounded-full font-bold">
                                    {databaseActivity.changes.length} Cambio{databaseActivity.changes.length > 1 ? 's' : ''}
                                </span>
                            </div>
                            
                            <div className="space-y-2 max-h-80 overflow-y-auto">
                                {databaseActivity.changes.map((change, idx) => (
                                    <div key={idx} className={`rounded-lg p-3 border-2 ${
                                        change.type === 'INSERT' ? 'bg-green-50 dark:bg-green-900/20 border-green-400' :
                                        change.type === 'UPDATE' ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-400' :
                                        'bg-red-50 dark:bg-red-900/20 border-red-400'
                                    }`}>
                                        <div className="flex items-start justify-between">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <span className="text-lg">
                                                        {change.type === 'INSERT' ? '➕' : change.type === 'UPDATE' ? '🔄' : '➖'}
                                                    </span>
                                                    <span className={`font-bold text-sm ${
                                                        change.type === 'INSERT' ? 'text-green-700 dark:text-green-300' :
                                                        change.type === 'UPDATE' ? 'text-yellow-700 dark:text-yellow-300' :
                                                        'text-red-700 dark:text-red-300'
                                                    }`}>
                                                        {change.type === 'INSERT' ? 'INSERTÓ' : change.type === 'UPDATE' ? 'MODIFICÓ' : 'ELIMINÓ'}
                                                    </span>
                                                    <span className="text-xs text-gray-600 dark:text-gray-400">
                                                        en tabla <span className="font-mono font-semibold">{change.table}</span>
                                                    </span>
                                                </div>
                                                
                                                {/* Datos del registro */}
                                                {change.type === 'INSERT' && change.after && (
                                                    <div className="bg-white dark:bg-gray-800 rounded p-2 text-xs font-mono">
                                                        <pre className="text-green-700 dark:text-green-300 whitespace-pre-wrap">
                                                            {JSON.stringify(change.after, null, 2).substring(0, 300)}
                                                            {JSON.stringify(change.after).length > 300 ? '...' : ''}
                                                        </pre>
                                                    </div>
                                                )}
                                                
                                                {change.type === 'UPDATE' && (
                                                    <div className="space-y-2">
                                                        {change.record.changedFields && (
                                                            <div className="text-xs text-yellow-700 dark:text-yellow-300">
                                                                Campos modificados: <span className="font-semibold">{change.record.changedFields.join(', ')}</span>
                                                            </div>
                                                        )}
                                                        <div className="grid grid-cols-2 gap-2">
                                                            <div className="bg-white dark:bg-gray-800 rounded p-2">
                                                                <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Antes:</p>
                                                                <pre className="text-xs font-mono text-red-600 dark:text-red-400 whitespace-pre-wrap">
                                                                    {JSON.stringify(change.before, null, 2).substring(0, 150)}
                                                                </pre>
                                                            </div>
                                                            <div className="bg-white dark:bg-gray-800 rounded p-2">
                                                                <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Después:</p>
                                                                <pre className="text-xs font-mono text-green-600 dark:text-green-400 whitespace-pre-wrap">
                                                                    {JSON.stringify(change.after, null, 2).substring(0, 150)}
                                                                </pre>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                                
                                                {change.type === 'DELETE' && change.before && (
                                                    <div className="bg-white dark:bg-gray-800 rounded p-2 text-xs font-mono">
                                                        <pre className="text-red-700 dark:text-red-300 whitespace-pre-wrap">
                                                            {JSON.stringify(change.before, null, 2).substring(0, 300)}
                                                            {JSON.stringify(change.before).length > 300 ? '...' : ''}
                                                        </pre>
                                                    </div>
                                                )}
                                            </div>
                                            
                                            <span className={`ml-2 px-2 py-0.5 rounded text-xs font-bold ${
                                                change.type === 'INSERT' ? 'bg-green-500 text-white' :
                                                change.type === 'UPDATE' ? 'bg-yellow-500 text-white' :
                                                'bg-red-500 text-white'
                                            }`}>
                                                {change.type}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    
                    {databaseActivity.tablesUsed.length > 0 && (
                        <div className="bg-white/60 dark:bg-gray-800/60 rounded-lg p-3">
                            <p className="font-semibold text-indigo-700 dark:text-indigo-300 mb-2 text-sm">Tablas utilizadas:</p>
                            <div className="flex flex-wrap gap-2">
                                {databaseActivity.tablesUsed.map(table => (
                                    <span key={table} className="bg-indigo-200 dark:bg-indigo-700 text-indigo-800 dark:text-indigo-200 text-xs px-2 py-1 rounded-full">
                                        {table}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                    
                    <div className="bg-white/60 dark:bg-gray-800/60 rounded-lg p-3 max-h-40 overflow-y-auto">
                        <p className="font-semibold text-indigo-700 dark:text-indigo-300 mb-2 text-sm">Registro de operaciones:</p>
                        <div className="space-y-1 text-xs font-mono">
                            {databaseActivity.operations.slice(-10).map((op, idx) => (
                                <div key={idx} className="flex justify-between items-center py-1 border-b border-gray-200 dark:border-gray-700">
                                    <span className={`font-semibold ${
                                        op.type === 'READ' ? 'text-blue-600' :
                                        op.type === 'WRITE' ? 'text-green-600' :
                                        op.type === 'UPDATE' ? 'text-yellow-600' :
                                        'text-red-600'
                                    }`}>{op.type}</span>
                                    <span className="text-gray-600 dark:text-gray-400">{op.table}</span>
                                    <span className="text-gray-500 dark:text-gray-500">{new Date(op.timestamp).toLocaleTimeString()}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            ) : (
                <div className="text-center py-4 text-gray-500 dark:text-gray-400">
                    <p>No se detectaron operaciones de base de datos</p>
                </div>
            )}
        </div>
    );
};

interface LiveAuditViewProps {
    results: AuditResult[];
    logs: string[];
    onCancel: () => void;
    totalCases: number;
    completedCases: number;
    config?: any; // AuditConfig
}

const LiveAuditView: React.FC<LiveAuditViewProps> = ({ results, logs, onCancel, totalCases, completedCases, config }) => {
    const { t } = useTranslation();
    const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
    const logContainerRef = useRef<HTMLDivElement>(null);
    const chatContainerRef = useRef<HTMLDivElement>(null);
    const progressPercentage = totalCases > 0 ? (completedCases / totalCases) * 100 : 0;
    
    // 🗄️ Check if database auditing is active
    const isDatabaseActive = config?.realDatabaseConfig && config.realDatabaseConfig.url && config.realDatabaseConfig.tables.length > 0;

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

                {/* 🔥 NUEVO: Indicador de auditoría de BD activa */}
                {isDatabaseActive && (
                    <div className="mt-3 p-3 bg-indigo-50 dark:bg-indigo-900/20 border-2 border-indigo-300 dark:border-indigo-700 rounded-lg">
                        <div className="flex items-center gap-3">
                            <div className="relative">
                                <div className="w-3 h-3 bg-indigo-500 rounded-full animate-pulse"></div>
                                <div className="absolute inset-0 w-3 h-3 bg-indigo-500 rounded-full animate-ping opacity-75"></div>
                            </div>
                            <div className="flex-1">
                                <div className="flex items-center gap-2">
                                    <span className="text-lg">🗄️</span>
                                    <span className="font-semibold text-indigo-800 dark:text-indigo-200 text-sm">
                                        Auditoría de Base de Datos Activa
                                    </span>
                                </div>
                                <p className="text-xs text-indigo-600 dark:text-indigo-300 mt-0.5">
                                    Monitoreando {config.realDatabaseConfig.tables.length} tabla(s): {config.realDatabaseConfig.tables.join(', ')}
                                </p>
                            </div>
                            <span className="text-xs font-mono bg-indigo-200 dark:bg-indigo-800 text-indigo-800 dark:text-indigo-200 px-2 py-1 rounded">
                                {config.realDatabaseConfig.type.toUpperCase()}
                            </span>
                        </div>
                    </div>
                )}
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
                           <DatabaseActivityCard result={selectedResult} />
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
                            
                            // 🗄️ ESPECIAL: Logs de Base de Datos
                            const isDBLog = log.includes('BD:') || log.includes('➕') || log.includes('🔄') || log.includes('➖');
                            const isDBInsert = log.includes('INSERT') || log.includes('➕');
                            const isDBUpdate = log.includes('UPDATE') || log.includes('🔄');
                            const isDBDelete = log.includes('DELETE') || log.includes('➖');
                            const isDBDiscrepancy = log.includes('DISCREPANCIAS') || log.includes('🚨');
                            const isDBModifications = log.includes('modificaciones detectadas') || log.includes('📝');
                            
                            const color = isDBDiscrepancy 
                                ? 'text-red-500 font-bold bg-red-900/20 px-2 py-1 rounded border-l-4 border-red-500'
                                : isDBModifications
                                ? 'text-cyan-400 font-bold bg-cyan-900/20 px-2 py-1 rounded border-l-4 border-cyan-500'
                                : isDBInsert
                                ? 'text-green-400 font-semibold bg-green-900/20 px-2 py-1 rounded'
                                : isDBUpdate
                                ? 'text-yellow-400 font-semibold bg-yellow-900/20 px-2 py-1 rounded'
                                : isDBDelete
                                ? 'text-red-400 font-semibold bg-red-900/20 px-2 py-1 rounded'
                                : log.includes('Error') || log.includes('failed') 
                                ? 'text-red-400' 
                                : log.includes('Success') || log.includes('complete') 
                                ? 'text-green-400' 
                                : log.includes('Generating') || log.includes('Sending')
                                ? 'text-yellow-400'
                                : 'text-gray-400';
                            
                            return (
                                <p key={index} className={`whitespace-pre-wrap leading-relaxed transition-all duration-300 ${color} ${isRecent ? 'animate-slide-in font-semibold' : 'opacity-70'}`}>
                                    {!isDBLog && <span className="text-green-500 mr-2">›</span>}
                                    {log}
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