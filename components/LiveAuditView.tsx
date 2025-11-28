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
};

const ChatListItem: React.FC<{ result: AuditResult; isSelected: boolean; onClick: () => void; }> = ({ result, isSelected, onClick }) => {
    const { text: statusText, color: statusColor } = getStatus(result);
    const lastMessage = result.executionTrace.length > 0 ? result.executionTrace[result.executionTrace.length - 1] : null;
    const messageCount = result.executionTrace.length;
    
    // Extract name and phone from payload
    const payload = result.testCase.initialPayload;
    const nombre = payload.nombre || payload.name || payload.pushName || 'Sin nombre';
    const telefono = payload.telefono || payload.phone || payload.telefonos || payload.from || payload.session_id || 'N/A';

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
                <p className="text-gray-600 dark:text-gray-400">📞 {telefono}</p>
            </div>
            
            {lastMessage && (
                <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-600">
                    <p className="text-xs text-gray-600 dark:text-gray-400 truncate">
                        {messageCount} mensaje{messageCount !== 1 ? 's' : ''}
                    </p>
                </div>
            )}
        </div>
    );
};

const TestCaseInfoCard: React.FC<{ testCase: TestCase }> = ({ testCase }) => {
    const { t } = useTranslation();
    const payload = testCase.initialPayload;
    const nombre = payload.nombre || payload.name || payload.pushName || 'Sin nombre';
    const telefono = payload.telefono || payload.phone || payload.telefonos || payload.from || payload.session_id || 'N/A';
    
    return (
        <div className="mb-3 flex-shrink-0 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-lg px-4 py-2 border border-purple-200 dark:border-purple-700">
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span className="text-xl">🎯</span>
                    <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-purple-800 dark:text-purple-200 truncate">{testCase.title}</h3>
                        <p className="text-xs text-purple-600 dark:text-purple-400 truncate">{testCase.conversationGoal}</p>
                    </div>
                </div>
                <div className="flex items-center gap-4 text-xs flex-shrink-0">
                    <div className="text-right">
                        <p className="text-purple-600 dark:text-purple-400 font-semibold">👤 {nombre}</p>
                        <p className="text-purple-500 dark:text-purple-500 font-mono">📞 {telefono}</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

// 🔥 NUEVO: Sistema de Tabs Horizontales Rediseñado
type TabType = 'conversation' | 'objectives' | 'prices' | 'database' | 'summary' | 'ai-report';

const TabButton: React.FC<{ 
    active: boolean; 
    icon: string; 
    label: string; 
    count?: number;
    badge?: string;
    onClick: () => void 
}> = ({ active, icon, label, count, badge, onClick }) => (
    <button
        onClick={onClick}
        className={`relative flex flex-col items-center gap-1 px-3 py-2.5 font-semibold text-xs transition-all min-w-[90px] ${
            active 
                ? 'bg-white dark:bg-gray-800 text-primary-600 dark:text-primary-400 border-b-3 border-primary-500 shadow-sm' 
                : 'bg-transparent text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/50 border-b-3 border-transparent'
        }`}
    >
        <span className="text-2xl">{icon}</span>
        <span className="text-center leading-tight">{label}</span>
        {count !== undefined && count > 0 && (
            <span className={`absolute -top-1 -right-1 w-5 h-5 flex items-center justify-center rounded-full text-xs font-bold ${
                active ? 'bg-primary-500 text-white' : 'bg-red-500 text-white animate-pulse'
            }`}>
                {count}
            </span>
        )}
        {badge && (
            <span className={`absolute -top-1 -right-1 px-1.5 py-0.5 rounded-full text-xs font-bold ${
                badge === 'NEW' ? 'bg-green-500 text-white' : 'bg-blue-500 text-white'
            }`}>
                {badge}
            </span>
        )}
    </button>
);

// 🎯 Tab: Verificación de Objetivos
const ObjectivesTab: React.FC<{ result: AuditResult }> = ({ result }) => {
    const goal = result.testCase.conversationGoal;
    const totalTurns = result.executionTrace.length;
    const hasErrors = result.executionTrace.some(s => s.status === 'ERROR');
    const dbChanges = result.databaseActivity?.changes?.length || 0;
    const score = result.analysis?.overallScore;
    
    // Si no hay análisis aún, mostrar estado de espera
    if (!result.analysis || score === undefined) {
        return (
            <div className="space-y-6 max-w-3xl mx-auto">
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-2xl p-6 border-2 border-blue-300 dark:border-blue-700 shadow-lg text-center">
                    <div className="text-4xl mb-4 animate-pulse">🎯</div>
                    <h3 className="text-lg font-bold text-blue-800 dark:text-blue-200 mb-3">
                        Analizando Objetivos...
                    </h3>
                    <p className="text-blue-700 dark:text-blue-300">
                        Esperando que la conversación finalice para analizar si se cumplió el objetivo
                    </p>
                    <div className="mt-6">
                        <p className="text-sm text-blue-600 dark:text-blue-400 mb-2">Progreso: {totalTurns} turnos completados</p>
                        <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-2">
                            <div className="bg-blue-500 h-2 rounded-full animate-pulse" style={{ width: '60%' }}></div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
    
    // Determinar si se cumplió el objetivo basado en análisis
    const objectiveAchieved = score >= 7 && !hasErrors;
    
    return (
        <div className="space-y-6 max-w-3xl mx-auto">
            {/* Header del objetivo */}
            <div className="bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 rounded-2xl p-6 border-2 border-purple-300 dark:border-purple-700 shadow-lg">
                <div className="flex items-start gap-4">
                    <span className="text-3xl">🎯</span>
                    <div className="flex-1">
                        <h3 className="text-lg font-bold text-purple-800 dark:text-purple-200 mb-2">
                            Objetivo de la Conversación
                        </h3>
                        <p className="text-lg text-purple-700 dark:text-purple-300">
                            {goal}
                        </p>
                    </div>
                </div>
            </div>
            
            {/* Resultado del objetivo */}
            <div className={`rounded-2xl p-8 border-4 shadow-2xl text-center ${
                objectiveAchieved 
                    ? 'bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/30 dark:to-emerald-900/30 border-green-400 dark:border-green-600' 
                    : 'bg-gradient-to-br from-red-50 to-pink-50 dark:from-red-900/30 dark:to-pink-900/30 border-red-400 dark:border-red-600'
            }`}>
                <div className="text-5xl mb-4">{objectiveAchieved ? '✅' : '❌'}</div>
                <h4 className={`text-xl font-bold mb-3 ${
                    objectiveAchieved ? 'text-green-800 dark:text-green-200' : 'text-red-800 dark:text-red-200'
                }`}>
                    {objectiveAchieved ? 'Objetivo Cumplido' : 'Objetivo NO Cumplido'}
                </h4>
                <p className={`text-lg ${
                    objectiveAchieved ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'
                }`}>
                    {objectiveAchieved 
                        ? 'El bot completó exitosamente la conversación según los criterios establecidos.' 
                        : 'El bot no logró completar satisfactoriamente el objetivo de la conversación.'}
                </p>
            </div>
            
            {/* Evidencias */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-lg border-2 border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-3 mb-3">
                        <span className="text-2xl">📊</span>
                        <div>
                            <p className="text-sm text-gray-600 dark:text-gray-400 font-semibold">Score Final</p>
                            <p className={`text-3xl font-bold ${
                                score >= 8 ? 'text-green-600' : score >= 5 ? 'text-yellow-600' : 'text-red-600'
                            }`}>{score.toFixed(1)}/10</p>
                        </div>
                    </div>
                </div>
                
                <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-lg border-2 border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-3 mb-3">
                        <span className="text-3xl">💬</span>
                        <div>
                            <p className="text-sm text-gray-600 dark:text-gray-400 font-semibold">Turnos de Conversación</p>
                            <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">{totalTurns}</p>
                        </div>
                    </div>
                </div>
                
                <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-lg border-2 border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-3 mb-3">
                        <span className="text-3xl">🗄️</span>
                        <div>
                            <p className="text-sm text-gray-600 dark:text-gray-400 font-semibold">Cambios en BD</p>
                            <p className="text-3xl font-bold text-purple-600 dark:text-purple-400">{dbChanges}</p>
                        </div>
                    </div>
                </div>
            </div>
            
            {/* Análisis detallado */}
            {result.analysis?.summary && (
                <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-200 dark:border-gray-700">
                    <h4 className="text-xl font-bold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2">
                        <span className="text-2xl">📝</span>
                        Análisis Detallado
                    </h4>
                    <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                        {result.analysis.summary}
                    </p>
                </div>
            )}
        </div>
    );
};

// 💰 Tab: Análisis de Precios vs Base de Datos
const PricesTab: React.FC<{ result: AuditResult }> = ({ result }) => {
    const totalTurns = result.executionTrace.length;
    
    // Si no hay actividad de BD aún, mostrar estado de espera
    if (!result.databaseActivity || result.databaseActivity.totalOperations === 0) {
        return (
            <div className="space-y-6 max-w-3xl mx-auto">
                <div className="bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-900/20 dark:to-yellow-900/20 rounded-2xl p-12 border-2 border-amber-300 dark:border-amber-700 shadow-lg text-center">
                    <div className="text-6xl mb-4 animate-pulse">💰</div>
                    <h3 className="text-2xl font-bold text-amber-800 dark:text-amber-200 mb-3">
                        Esperando Consultas de Precios...
                    </h3>
                    <p className="text-amber-700 dark:text-amber-300">
                        El bot aún no ha consultado precios en la base de datos
                    </p>
                    <div className="mt-6">
                        <p className="text-sm text-amber-600 dark:text-amber-400">Turnos: {totalTurns}</p>
                    </div>
                </div>
            </div>
        );
    }
    
    const discrepancies = result.databaseActivity?.discrepancies?.filter(d => d.type === 'incorrect_data') || [];
    const hasDiscrepancies = discrepancies.length > 0;
    
    return (
        <div className="space-y-6 max-w-3xl mx-auto">
            {/* Header */}
            <div className={`rounded-2xl p-8 border-4 shadow-2xl text-center ${
                hasDiscrepancies 
                    ? 'bg-gradient-to-br from-red-50 to-pink-50 dark:from-red-900/30 dark:to-pink-900/30 border-red-400 dark:border-red-600' 
                    : 'bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/30 dark:to-emerald-900/30 border-green-400 dark:border-green-600'
            }`}>
                <div className="text-8xl mb-4">{hasDiscrepancies ? '⚠️' : '✅'}</div>
                <h3 className={`text-3xl font-bold mb-3 ${
                    hasDiscrepancies ? 'text-red-800 dark:text-red-200' : 'text-green-800 dark:text-green-200'
                }`}>
                    {hasDiscrepancies ? `${discrepancies.length} Error${discrepancies.length > 1 ? 'es' : ''} de Precio Detectado${discrepancies.length > 1 ? 's' : ''}` : 'Todos los Precios Correctos'}
                </h3>
                <p className={`text-lg ${
                    hasDiscrepancies ? 'text-red-700 dark:text-red-300' : 'text-green-700 dark:text-green-300'
                }`}>
                    {hasDiscrepancies 
                        ? 'El bot ofreció precios que NO coinciden con la base de datos' 
                        : 'Todos los precios ofrecidos coinciden con la base de datos'}
                </p>
            </div>
            
            {/* Discrepancias */}
            {hasDiscrepancies ? (
                <div className="space-y-4">
                    {discrepancies.map((disc, idx) => (
                        <div key={idx} className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-xl border-2 border-red-300 dark:border-red-700">
                            <div className="flex items-start gap-4 mb-4">
                                <span className="text-4xl">❌</span>
                                <div className="flex-1">
                                    <h4 className="text-xl font-bold text-red-800 dark:text-red-200 mb-2">
                                        Error #{idx + 1} - {disc.table || 'Producto'}
                                    </h4>
                                    <p className="text-gray-700 dark:text-gray-300">{disc.description}</p>
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-6">
                                {/* Bot dijo */}
                                <div className="bg-gradient-to-br from-red-50 to-pink-50 dark:from-red-900/20 dark:to-pink-900/20 rounded-xl p-6 border-2 border-red-300 dark:border-red-700">
                                    <p className="text-sm font-bold text-red-600 dark:text-red-400 mb-3 flex items-center gap-2">
                                        <span className="text-2xl">🤖</span> BOT OFRECIÓ
                                    </p>
                                    <p className="text-5xl font-bold text-red-700 dark:text-red-300">
                                        ${disc.expected !== undefined ? Number(disc.expected).toLocaleString('es-AR', {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '?'}
                                    </p>
                                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">por unidad</p>
                                </div>
                                
                                {/* BD real */}
                                <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-xl p-6 border-2 border-green-300 dark:border-green-700">
                                    <p className="text-sm font-bold text-green-600 dark:text-green-400 mb-3 flex items-center gap-2">
                                        <span className="text-2xl">✅</span> PRECIO REAL EN BD
                                    </p>
                                    <p className="text-5xl font-bold text-green-700 dark:text-green-300">
                                        ${disc.actual !== undefined ? Number(disc.actual).toLocaleString('es-AR', {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '?'}
                                    </p>
                                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">precio correcto</p>
                                </div>
                            </div>
                            
                            {/* Diferencia */}
                            {disc.expected !== undefined && disc.actual !== undefined && (
                                <div className="mt-6 bg-gray-50 dark:bg-gray-900 rounded-xl p-5">
                                    <div className="grid grid-cols-3 gap-4 text-center">
                                        <div>
                                            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1 font-semibold">Diferencia</p>
                                            <p className="text-3xl font-bold text-orange-600 dark:text-orange-400">
                                                {disc.expected > disc.actual ? '+' : '-'}${Math.abs(disc.expected - disc.actual).toLocaleString('es-AR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1 font-semibold">Porcentaje</p>
                                            <p className="text-3xl font-bold text-orange-600 dark:text-orange-400">
                                                {disc.actual !== 0 ? `${Math.abs(((disc.expected - disc.actual) / disc.actual) * 100).toFixed(1)}%` : 'N/A'}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1 font-semibold">Estado</p>
                                            <div className="text-5xl text-red-500">✗</div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            ) : (
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-12 text-center shadow-lg border border-gray-200 dark:border-gray-700">
                    <span className="text-8xl mb-4 block">🎉</span>
                    <h4 className="text-2xl font-bold text-gray-800 dark:text-gray-200 mb-2">
                        ¡Excelente! No se detectaron errores de precio
                    </h4>
                    <p className="text-gray-600 dark:text-gray-400">
                        Todos los precios ofrecidos por el bot coinciden exactamente con los valores en la base de datos.
                    </p>
                </div>
            )}
        </div>
    );
};

// 🤖 Tab: Resumen para IA (Cursor, Copilot, etc.)
const AIReportTab: React.FC<{ result: AuditResult }> = ({ result }) => {
    // Si no hay análisis aún, mostrar estado de espera
    if (!result.analysis) {
        return (
            <div className="space-y-6 max-w-3xl mx-auto">
                <div className="bg-gradient-to-r from-cyan-50 to-blue-50 dark:from-cyan-900/20 dark:to-blue-900/20 rounded-2xl p-12 border-2 border-cyan-300 dark:border-cyan-700 shadow-lg text-center">
                    <div className="text-6xl mb-4 animate-pulse">🤖</div>
                    <h3 className="text-2xl font-bold text-cyan-800 dark:text-cyan-200 mb-3">
                        Generando Reporte para IA...
                    </h3>
                    <p className="text-cyan-700 dark:text-cyan-300">
                        Esperando que finalice el análisis para generar el reporte
                    </p>
                </div>
            </div>
        );
    }
    
    const generateAIReport = () => {
        const lines: string[] = [];
        lines.push('# AUDIT REPORT - BOT CONVERSATION ANALYSIS');
        lines.push('');
        lines.push('## METADATA');
        lines.push(`- Test Case: ${result.testCase.title}`);
        lines.push(`- Goal: ${result.testCase.conversationGoal}`);
        lines.push(`- Total Turns: ${result.executionTrace.length}`);
        lines.push(`- Overall Score: ${result.analysis?.overallScore || 0}/10`);
        lines.push(`- Status: ${result.finalStatus}`);
        lines.push('');
        
        lines.push('## OBJECTIVE VERIFICATION');
        const objectiveAchieved = (result.analysis?.overallScore || 0) >= 7;
        lines.push(`- Objective Achieved: ${objectiveAchieved ? 'YES ✅' : 'NO ❌'}`);
        lines.push(`- Confidence: ${result.analysis?.overallScore || 0}/10`);
        lines.push('');
        
        lines.push('## PRICE VERIFICATION');
        const priceErrors = result.databaseActivity?.discrepancies?.filter(d => d.type === 'incorrect_data') || [];
        lines.push(`- Price Errors Found: ${priceErrors.length}`);
        if (priceErrors.length > 0) {
            lines.push('- Details:');
            priceErrors.forEach((err, idx) => {
                lines.push(`  ${idx + 1}. ${err.description}`);
                if (err.expected !== undefined && err.actual !== undefined) {
                    lines.push(`     - Bot offered: $${err.expected}`);
                    lines.push(`     - DB real price: $${err.actual}`);
                    lines.push(`     - Difference: $${Math.abs(err.expected - err.actual)}`);
                }
            });
        } else {
            lines.push('- All prices correct ✅');
        }
        lines.push('');
        
        lines.push('## DATABASE ACTIVITY');
        if (result.databaseActivity) {
            lines.push(`- Total Operations: ${result.databaseActivity.totalOperations}`);
            lines.push(`- Reads: ${result.databaseActivity.reads}`);
            lines.push(`- Writes: ${result.databaseActivity.writes}`);
            lines.push(`- Updates: ${result.databaseActivity.updates}`);
            lines.push(`- Deletes: ${result.databaseActivity.deletes}`);
            lines.push(`- Tables Used: ${result.databaseActivity.tablesUsed.join(', ')}`);
            
            if (result.databaseActivity.changes && result.databaseActivity.changes.length > 0) {
                lines.push('- Changes:');
                result.databaseActivity.changes.forEach((change, idx) => {
                    lines.push(`  ${idx + 1}. ${change.type} in ${change.table}`);
                });
            }
        } else {
            lines.push('- No database activity tracked');
        }
        lines.push('');
        
        lines.push('## CONVERSATION SUMMARY');
        if (result.analysis?.summary) {
            lines.push(result.analysis.summary);
        }
        lines.push('');
        
        lines.push('## CRITERIA BREAKDOWN');
        if (result.analysis?.criteriaBreakdown) {
            result.analysis.criteriaBreakdown.forEach((criterion, idx) => {
                lines.push(`${idx + 1}. ${criterion.criterion}: ${criterion.score}/10`);
                lines.push(`   - ${criterion.justification}`);
            });
        }
        lines.push('');
        
        lines.push('## RECOMMENDATIONS');
        lines.push('Based on the audit:');
        if (objectiveAchieved && priceErrors.length === 0) {
            lines.push('- Bot performance is EXCELLENT');
            lines.push('- No critical issues found');
            lines.push('- System is working as expected');
        } else {
            if (!objectiveAchieved) {
                lines.push('- CRITICAL: Bot did not achieve conversation objective');
                lines.push('- Review conversation flow and prompts');
            }
            if (priceErrors.length > 0) {
                lines.push(`- CRITICAL: ${priceErrors.length} price error(s) detected`);
                lines.push('- Verify database connection and price retrieval logic');
            }
        }
        
        return lines.join('\n');
    };
    
    const reportText = generateAIReport();
    
    const handleCopy = () => {
        navigator.clipboard.writeText(reportText);
        alert('Reporte copiado al portapapeles');
    };
    
    return (
        <div className="space-y-6 max-w-3xl mx-auto">
            <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-2xl p-6 border-2 border-blue-300 dark:border-blue-700 shadow-lg">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <span className="text-5xl">🤖</span>
                        <div>
                            <h3 className="text-2xl font-bold text-blue-800 dark:text-blue-200">
                                Resumen para IA
                            </h3>
                            <p className="text-blue-700 dark:text-blue-300 text-sm">
                                Formato optimizado para Cursor, GitHub Copilot, y otras herramientas de IA
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={handleCopy}
                        className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl hover:from-blue-700 hover:to-purple-700 transition-all font-semibold shadow-lg flex items-center gap-2"
                    >
                        <span className="text-xl">📋</span>
                        Copiar Reporte
                    </button>
                </div>
            </div>
            
            <div className="bg-gray-900 rounded-2xl p-6 shadow-2xl border-2 border-gray-700">
                <pre className="text-green-400 font-mono text-sm overflow-x-auto whitespace-pre-wrap leading-relaxed">
                    {reportText}
                </pre>
            </div>
            
            <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-xl p-5 border-2 border-yellow-300 dark:border-yellow-700">
                <div className="flex items-start gap-3">
                    <span className="text-3xl">💡</span>
                    <div>
                        <h4 className="font-bold text-yellow-800 dark:text-yellow-200 mb-2">
                            Cómo usar este reporte
                        </h4>
                        <ul className="text-sm text-yellow-700 dark:text-yellow-300 space-y-1">
                            <li>• Copia el reporte y pégalo en el contexto de Cursor o GitHub Copilot</li>
                            <li>• Usa este formato para analizar rápidamente el estado del bot</li>
                            <li>• Ideal para generar reports automáticos o integrar con CI/CD</li>
                            <li>• Formato markdown estándar, fácil de parsear programáticamente</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Tab: Resumen Visual (sin timeline porque ya está en Conversación)
const SummaryTab: React.FC<{ result: AuditResult }> = ({ result }) => {
    const totalMessages = result.executionTrace.length;
    
    // Si no hay mensajes aún, mostrar estado de espera
    if (totalMessages === 0) {
        return (
            <div className="space-y-6 max-w-3xl mx-auto">
                <div className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-2xl p-12 border-2 border-purple-300 dark:border-purple-700 shadow-lg text-center">
                    <div className="text-6xl mb-4 animate-pulse">📊</div>
                    <h3 className="text-2xl font-bold text-purple-800 dark:text-purple-200 mb-3">
                        Esperando Conversación...
                    </h3>
                    <p className="text-purple-700 dark:text-purple-300">
                        La conversación aún no ha comenzado
                    </p>
                </div>
            </div>
        );
    }
    
    const errors = result.executionTrace.filter(s => s.status === 'ERROR').length;
    const avgResponseTime = result.executionTrace.length > 0 
        ? result.executionTrace.reduce((acc, s) => acc + (s.durationMs || 0), 0) / result.executionTrace.length 
        : 0;
    
    const dbActivity = result.databaseActivity;
    const hasDB = dbActivity && dbActivity.totalOperations > 0;
    
    // Calcular métricas adicionales
    const successRate = totalMessages > 0 ? ((totalMessages - errors) / totalMessages * 100).toFixed(1) : '0';
    const totalDuration = result.executionTrace.reduce((acc, s) => acc + (s.durationMs || 0), 0);
    
    return (
        <div className="space-y-6 max-w-3xl mx-auto">
            {/* Estadísticas Generales */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/30 rounded-xl p-4 border-2 border-blue-300 dark:border-blue-700 shadow-lg">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-3xl">💬</span>
                        <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase">Mensajes</span>
                    </div>
                    <p className="text-4xl font-bold text-blue-700 dark:text-blue-300">{totalMessages}</p>
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">Total de turnos</p>
                </div>
                
                <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/30 dark:to-green-800/30 rounded-xl p-4 border-2 border-green-300 dark:border-green-700 shadow-lg">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-3xl">⚡</span>
                        <span className="text-xs font-semibold text-green-600 dark:text-green-400 uppercase">Velocidad</span>
                    </div>
                    <p className="text-4xl font-bold text-green-700 dark:text-green-300">{avgResponseTime.toFixed(0)}<span className="text-lg">ms</span></p>
                    <p className="text-xs text-green-600 dark:text-green-400 mt-1">Tiempo promedio</p>
                </div>
                
                {hasDB && (
                    <>
                        <div className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/30 dark:to-purple-800/30 rounded-xl p-4 border-2 border-purple-300 dark:border-purple-700 shadow-lg">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-3xl">🗄️</span>
                                <span className="text-xs font-semibold text-purple-600 dark:text-purple-400 uppercase">Base de Datos</span>
                            </div>
                            <p className="text-4xl font-bold text-purple-700 dark:text-purple-300">{dbActivity.totalOperations}</p>
                            <p className="text-xs text-purple-600 dark:text-purple-400 mt-1">Operaciones</p>
                        </div>
                        
                        <div className={`bg-gradient-to-br ${
                            (dbActivity.discrepancies?.length || 0) > 0 
                                ? 'from-red-50 to-red-100 dark:from-red-900/30 dark:to-red-800/30 border-red-300 dark:border-red-700' 
                                : 'from-green-50 to-green-100 dark:from-green-900/30 dark:to-green-800/30 border-green-300 dark:border-green-700'
                        } rounded-xl p-4 border-2 shadow-lg`}>
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-3xl">{(dbActivity.discrepancies?.length || 0) > 0 ? '🚨' : '✅'}</span>
                                <span className={`text-xs font-semibold uppercase ${
                                    (dbActivity.discrepancies?.length || 0) > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'
                                }`}>Verificación</span>
                            </div>
                            <p className={`text-4xl font-bold ${
                                (dbActivity.discrepancies?.length || 0) > 0 ? 'text-red-700 dark:text-red-300' : 'text-green-700 dark:text-green-300'
                            }`}>{dbActivity.discrepancies?.length || 0}</p>
                            <p className={`text-xs mt-1 ${
                                (dbActivity.discrepancies?.length || 0) > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'
                            }`}>{(dbActivity.discrepancies?.length || 0) > 0 ? 'Errores detectados' : 'Sin errores'}</p>
                        </div>
                    </>
                )}
                
                {!hasDB && (
                    <div className="bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800/30 dark:to-gray-700/30 rounded-xl p-4 border-2 border-gray-300 dark:border-gray-600 shadow-lg">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-3xl">{errors > 0 ? '❌' : '✅'}</span>
                            <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Estado</span>
                        </div>
                        <p className="text-4xl font-bold text-gray-700 dark:text-gray-300">{errors}</p>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Errores</p>
                    </div>
                )}
            </div>
            
            {/* Métricas de rendimiento detalladas */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-lg border border-gray-200 dark:border-gray-700">
                    <h4 className="text-sm font-bold text-gray-600 dark:text-gray-400 mb-2">⚡ Velocidad Promedio</h4>
                    <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">{avgResponseTime.toFixed(0)}<span className="text-lg">ms</span></p>
                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">Por respuesta</p>
                </div>
                
                <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-lg border border-gray-200 dark:border-gray-700">
                    <h4 className="text-sm font-bold text-gray-600 dark:text-gray-400 mb-2">✅ Tasa de Éxito</h4>
                    <p className="text-3xl font-bold text-green-600 dark:text-green-400">{successRate}<span className="text-lg">%</span></p>
                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">{totalMessages - errors} de {totalMessages} exitosos</p>
                </div>
                
                <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-lg border border-gray-200 dark:border-gray-700">
                    <h4 className="text-sm font-bold text-gray-600 dark:text-gray-400 mb-2">⏱️ Duración Total</h4>
                    <p className="text-3xl font-bold text-purple-600 dark:text-purple-400">{(totalDuration / 1000).toFixed(1)}<span className="text-lg">s</span></p>
                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">Tiempo de conversación</p>
                </div>
            </div>
            
            {/* Resumen escrito */}
            <div className="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 rounded-xl p-6 shadow-lg border-2 border-indigo-200 dark:border-indigo-700">
                <h4 className="text-lg font-bold text-indigo-800 dark:text-indigo-200 mb-4 flex items-center gap-2">
                    <span className="text-2xl">📝</span>
                    Resumen de la Conversación
                </h4>
                <div className="space-y-3">
                    <div className="bg-white/60 dark:bg-gray-800/60 rounded-lg p-4">
                        <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                            <span className="font-semibold text-indigo-700 dark:text-indigo-300">Objetivo: </span>
                            {result.testCase.conversationGoal}
                        </p>
                    </div>
                    <div className="bg-white/60 dark:bg-gray-800/60 rounded-lg p-4">
                        <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                            <span className="font-semibold text-purple-700 dark:text-purple-300">Resultado: </span>
                            {totalMessages > 0 ? `Se completaron ${totalMessages} intercambios` : 'Conversación en progreso'}
                            {errors > 0 && ` con ${errors} error(es)`}.
                            {hasDB && ` Se detectaron ${dbActivity.totalOperations} operaciones de base de datos`}
                            {dbActivity?.discrepancies && dbActivity.discrepancies.length > 0 && 
                                ` con ${dbActivity.discrepancies.length} discrepancia(s) en la verificación de datos`}.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Tab: Conversación
const ConversationTab: React.FC<{ result: AuditResult; chatContainerRef: React.RefObject<HTMLDivElement> }> = ({ result, chatContainerRef }) => {
    return (
        <div ref={chatContainerRef} className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 overflow-y-auto scroll-smooth h-full scrollbar-thin scrollbar-thumb-gray-400 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent hover:scrollbar-thumb-gray-500 dark:hover:scrollbar-thumb-gray-500">
            <div className="space-y-4">
                {result.executionTrace.length === 0 ? (
                    <div className="flex items-center justify-center h-32 text-gray-400 dark:text-gray-500">
                        <p className="animate-pulse">Esperando primer mensaje...</p>
                    </div>
                ) : (
                    result.executionTrace.map((step, idx) => (
                        <ChatMessage 
                            key={`${step.nodeId}-${idx}`} 
                            step={step} 
                            isLast={idx === result.executionTrace.length - 1}
                        />
                    ))
                )}
            </div>
        </div>
    );
};

// Tab: Base de Datos (contenido ampliado del DatabaseActivityCard)
const DatabaseTab: React.FC<{ result: AuditResult }> = ({ result }) => {
    if (!result.databaseActivity || result.databaseActivity.totalOperations === 0) {
        return (
            <div className="flex items-center justify-center h-64 bg-white dark:bg-gray-800 rounded-xl shadow-lg border-2 border-dashed border-gray-300 dark:border-gray-600">
                <div className="text-center p-8">
                    <span className="text-6xl mb-4 block opacity-50">🗄️</span>
                    <p className="text-gray-600 dark:text-gray-400 text-lg font-semibold mb-2">
                        {!result.databaseActivity ? 'Auditoría de BD no configurada' : 'Sin actividad de BD detectada'}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-500">
                        {!result.databaseActivity 
                            ? 'Esta conversación no tiene configurada la auditoría de base de datos' 
                            : 'El agente no realizó ninguna operación en la base de datos durante esta conversación'
                        }
                    </p>
                </div>
            </div>
        );
    }
    
    const { databaseActivity } = result;
    const hasOperations = databaseActivity.totalOperations > 0;
    const hasDiscrepancies = databaseActivity.discrepancies && databaseActivity.discrepancies.length > 0;
    const criticalIssues = databaseActivity.discrepancies?.filter(d => d.severity === 'critical').length || 0;
    
    return (
        <div className="space-y-6">
            {/* Estadísticas de BD */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 dark:from-indigo-900/30 dark:to-indigo-800/30 rounded-xl p-4 border-2 border-indigo-300 dark:border-indigo-700 shadow-lg text-center">
                    <p className="text-4xl font-bold text-indigo-600 dark:text-indigo-400">{databaseActivity.totalOperations}</p>
                    <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-1 font-semibold">Total Operaciones</p>
                </div>
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/30 rounded-xl p-4 border-2 border-blue-300 dark:border-blue-700 shadow-lg text-center">
                    <p className="text-4xl font-bold text-blue-600 dark:text-blue-400">{databaseActivity.reads}</p>
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-1 font-semibold">Lecturas</p>
                </div>
                <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/30 dark:to-green-800/30 rounded-xl p-4 border-2 border-green-300 dark:border-green-700 shadow-lg text-center">
                    <p className="text-4xl font-bold text-green-600 dark:text-green-400">{databaseActivity.writes}</p>
                    <p className="text-xs text-green-600 dark:text-green-400 mt-1 font-semibold">Escrituras</p>
                </div>
                <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 dark:from-yellow-900/30 dark:to-yellow-800/30 rounded-xl p-4 border-2 border-yellow-300 dark:border-yellow-700 shadow-lg text-center">
                    <p className="text-4xl font-bold text-yellow-600 dark:text-yellow-400">{databaseActivity.updates}</p>
                    <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1 font-semibold">Actualizaciones</p>
                </div>
            </div>
            
            {/* Discrepancias */}
            {hasDiscrepancies && (
                <div className="bg-gradient-to-br from-red-50 to-orange-50 dark:from-red-900/20 dark:to-orange-900/20 border-2 border-red-400 dark:border-red-600 rounded-xl p-6 shadow-lg">
                    <div className="flex items-center justify-between mb-6">
                        <h4 className="font-bold text-red-800 dark:text-red-200 text-xl flex items-center gap-2">
                            <span className="text-3xl">🚨</span>
                            Verificación Inteligente de Datos
                        </h4>
                        <span className="bg-red-500 text-white text-sm px-4 py-2 rounded-full font-bold shadow-md">
                            {databaseActivity.discrepancies!.length} Error{databaseActivity.discrepancies!.length > 1 ? 'es' : ''}
                        </span>
                    </div>
                    
                    <div className="space-y-4 max-h-[600px] overflow-y-auto">
                        {databaseActivity.discrepancies!.map((disc, idx) => (
                            <div key={idx} className="bg-white dark:bg-gray-800 rounded-xl border-2 border-red-300 dark:border-red-700 overflow-hidden shadow-lg">
                                {/* Header */}
                                <div className="bg-red-100 dark:bg-red-900/30 px-6 py-3 border-b-2 border-red-300 dark:border-red-700">
                                    <p className="font-bold text-gray-800 dark:text-gray-200">
                                        #{idx + 1} - {disc.table || 'Producto'}
                                    </p>
                                </div>
                                
                                {/* Comparación */}
                                <div className="p-6">
                                    <div className="grid grid-cols-2 gap-6 mb-4">
                                        {/* Bot */}
                                        <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-4 border-2 border-red-200 dark:border-red-800">
                                            <p className="text-xs text-red-600 dark:text-red-400 font-bold mb-2 flex items-center gap-2">
                                                <span className="text-lg">🤖</span> BOT OFRECIÓ
                                            </p>
                                            <p className="text-3xl font-bold text-red-700 dark:text-red-300">
                                                ${disc.expected !== undefined ? Number(disc.expected).toLocaleString('es-AR', {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '?'}
                                            </p>
                                            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">por unidad</p>
                                        </div>
                                        
                                        {/* BD */}
                                        <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-4 border-2 border-green-200 dark:border-green-800">
                                            <p className="text-xs text-green-600 dark:text-green-400 font-bold mb-2 flex items-center gap-2">
                                                <span className="text-lg">✅</span> BASE DE DATOS
                                            </p>
                                            <p className="text-3xl font-bold text-green-700 dark:text-green-300">
                                                ${disc.actual !== undefined ? Number(disc.actual).toLocaleString('es-AR', {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '?'}
                                            </p>
                                            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">precio real</p>
                                        </div>
                                    </div>
                                    
                                    {/* Diferencia */}
                                    {disc.expected !== undefined && disc.actual !== undefined && (
                                        <div className="bg-gray-100 dark:bg-gray-900/30 rounded-xl p-4 border-2 border-gray-300 dark:border-gray-700">
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <p className="text-xs text-gray-600 dark:text-gray-400 mb-1 font-semibold">Diferencia</p>
                                                    <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                                                        {disc.expected > disc.actual ? '+' : '-'}${Math.abs(disc.expected - disc.actual).toLocaleString('es-AR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                                                    </p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-xs text-gray-600 dark:text-gray-400 mb-1 font-semibold">Porcentaje</p>
                                                    <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                                                        {disc.actual !== 0 ? `${(((disc.expected - disc.actual) / disc.actual) * 100).toFixed(1)}%` : 'N/A'}
                                                    </p>
                                                </div>
                                                <div className="text-center">
                                                    <div className={`text-5xl ${disc.expected === disc.actual ? 'text-green-500' : 'text-red-500'}`}>
                                                        {disc.expected === disc.actual ? '✓' : '✗'}
                                                    </div>
                                                    <p className={`text-xs font-bold mt-1 ${disc.expected === disc.actual ? 'text-green-600' : 'text-red-600'}`}>
                                                        {disc.expected === disc.actual ? 'CORRECTO' : 'INCORRECTO'}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                    
                                    {/* Descripción */}
                                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-4 italic bg-gray-50 dark:bg-gray-800/50 p-3 rounded-lg">
                                        {disc.description}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
            
            {/* Modificaciones en BD */}
            {databaseActivity.changes && databaseActivity.changes.length > 0 && (
                <div className="bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 border-2 border-blue-400 dark:border-blue-600 rounded-xl p-6 shadow-lg">
                    <div className="flex items-center justify-between mb-6">
                        <h4 className="font-bold text-blue-800 dark:text-blue-200 text-xl flex items-center gap-2">
                            <span className="text-3xl">📝</span>
                            Cambios en Base de Datos
                        </h4>
                        <span className="bg-blue-500 text-white text-sm px-4 py-2 rounded-full font-bold shadow-md">
                            {databaseActivity.changes.length} Cambio{databaseActivity.changes.length > 1 ? 's' : ''}
                        </span>
                    </div>
                    
                    <div className="space-y-3 max-h-[500px] overflow-y-auto">
                        {databaseActivity.changes.map((change, idx) => (
                            <div key={idx} className={`rounded-xl p-4 border-2 shadow-md ${
                                change.type === 'INSERT' ? 'bg-green-50 dark:bg-green-900/20 border-green-400' :
                                change.type === 'UPDATE' ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-400' :
                                'bg-red-50 dark:bg-red-900/20 border-red-400'
                            }`}>
                                <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-3">
                                            <span className="text-2xl">
                                                {change.type === 'INSERT' ? '➕' : change.type === 'UPDATE' ? '🔄' : '➖'}
                                            </span>
                                            <span className={`font-bold ${
                                                change.type === 'INSERT' ? 'text-green-700 dark:text-green-300' :
                                                change.type === 'UPDATE' ? 'text-yellow-700 dark:text-yellow-300' :
                                                'text-red-700 dark:text-red-300'
                                            }`}>
                                                {change.type === 'INSERT' ? 'INSERTÓ' : change.type === 'UPDATE' ? 'MODIFICÓ' : 'ELIMINÓ'}
                                            </span>
                                            <span className="text-sm text-gray-600 dark:text-gray-400">
                                                en tabla <span className="font-mono font-semibold text-gray-800 dark:text-gray-200">{change.table}</span>
                                            </span>
                                        </div>
                                        
                                        {/* INSERT */}
                                        {change.type === 'INSERT' && change.after && (
                                            <div className="bg-white dark:bg-gray-800 rounded-lg p-3 text-xs font-mono border border-green-300 dark:border-green-700">
                                                <pre className="text-green-700 dark:text-green-300 whitespace-pre-wrap overflow-x-auto">
                                                    {JSON.stringify(change.after, null, 2).substring(0, 400)}
                                                    {JSON.stringify(change.after).length > 400 ? '\n...' : ''}
                                                </pre>
                                            </div>
                                        )}
                                        
                                        {/* UPDATE */}
                                        {change.type === 'UPDATE' && (
                                            <div className="space-y-3">
                                                {change.record.changedFields && (
                                                    <div className="text-sm text-yellow-700 dark:text-yellow-300 bg-yellow-100 dark:bg-yellow-900/30 p-2 rounded">
                                                        <span className="font-semibold">Campos modificados:</span> {change.record.changedFields.join(', ')}
                                                    </div>
                                                )}
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-red-300 dark:border-red-700">
                                                        <p className="text-xs font-bold text-red-600 dark:text-red-400 mb-2">❌ Antes:</p>
                                                        <pre className="text-xs font-mono text-gray-700 dark:text-gray-300 whitespace-pre-wrap overflow-x-auto">
                                                            {JSON.stringify(change.before, null, 2).substring(0, 200)}
                                                        </pre>
                                                    </div>
                                                    <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-green-300 dark:border-green-700">
                                                        <p className="text-xs font-bold text-green-600 dark:text-green-400 mb-2">✅ Después:</p>
                                                        <pre className="text-xs font-mono text-gray-700 dark:text-gray-300 whitespace-pre-wrap overflow-x-auto">
                                                            {JSON.stringify(change.after, null, 2).substring(0, 200)}
                                                        </pre>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                        
                                        {/* DELETE */}
                                        {change.type === 'DELETE' && change.before && (
                                            <div className="bg-white dark:bg-gray-800 rounded-lg p-3 text-xs font-mono border border-red-300 dark:border-red-700">
                                                <pre className="text-red-700 dark:text-red-300 whitespace-pre-wrap overflow-x-auto">
                                                    {JSON.stringify(change.before, null, 2).substring(0, 400)}
                                                    {JSON.stringify(change.before).length > 400 ? '\n...' : ''}
                                                </pre>
                                            </div>
                                        )}
                                    </div>
                                    
                                    <span className={`ml-3 px-3 py-1 rounded-lg text-xs font-bold shadow-md ${
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
            
            {/* Tablas utilizadas */}
            {databaseActivity.tablesUsed.length > 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-200 dark:border-gray-700">
                    <h4 className="font-bold text-indigo-700 dark:text-indigo-300 mb-4 text-lg flex items-center gap-2">
                        <span className="text-2xl">📊</span>
                        Tablas Utilizadas
                    </h4>
                    <div className="flex flex-wrap gap-2">
                        {databaseActivity.tablesUsed.map(table => (
                            <span key={table} className="bg-indigo-100 dark:bg-indigo-900/30 border-2 border-indigo-300 dark:border-indigo-700 text-indigo-800 dark:text-indigo-200 px-3 py-1.5 rounded-lg font-mono text-sm font-semibold">
                                {table}
                            </span>
                        ))}
                    </div>
                </div>
            )}
            
            {/* Log de operaciones */}
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-200 dark:border-gray-700">
                <h4 className="font-bold text-gray-700 dark:text-gray-300 mb-4 text-lg flex items-center gap-2">
                    <span className="text-2xl">📜</span>
                    Registro de Operaciones
                </h4>
                <div className="space-y-2 max-h-80 overflow-y-auto text-sm font-mono">
                    {databaseActivity.operations.slice(-20).map((op, idx) => (
                        <div key={idx} className="flex justify-between items-center py-2 px-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                            <span className={`font-bold px-2 py-1 rounded text-xs ${
                                op.type === 'READ' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' :
                                op.type === 'WRITE' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' :
                                op.type === 'UPDATE' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300' :
                                'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                            }`}>{op.type}</span>
                            <span className="text-gray-700 dark:text-gray-300 font-semibold">{op.table}</span>
                            <span className="text-gray-500 dark:text-gray-500 text-xs">{new Date(op.timestamp).toLocaleTimeString()}</span>
                        </div>
                    ))}
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
    config?: any;
}

const LiveAuditView: React.FC<LiveAuditViewProps> = ({ results, logs, onCancel, totalCases, completedCases, config }) => {
    const { t } = useTranslation();
    const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<TabType>('conversation');
    const logContainerRef = useRef<HTMLDivElement>(null);
    const chatContainerRef = useRef<HTMLDivElement>(null);
    const progressPercentage = totalCases > 0 ? (completedCases / totalCases) * 100 : 0;
    
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
        if (chatContainerRef.current && selectedResult && activeTab === 'conversation') {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    }, [selectedResult?.executionTrace.length, activeTab]);

    // Contadores para badges
    const dbChangesCount = selectedResult?.databaseActivity?.changes?.length || 0;
    const dbDiscrepanciesCount = selectedResult?.databaseActivity?.discrepancies?.length || 0;

    return (
        <div className="w-screen h-screen bg-gray-100 dark:bg-gray-900 flex flex-col font-sans overflow-hidden">
            {/* HEADER */}
            <header className="flex-shrink-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4 z-10 shadow-sm">
                <div className="flex items-center justify-between gap-4">
                    <div className="flex-grow">
                        <h2 className="text-xl font-bold text-gray-800 dark:text-white">{t('liveAuditTitle')}</h2>
                        <p className="text-sm text-gray-600 dark:text-gray-400">{t('liveAuditDescription')}</p>
                    </div>
                    <button onClick={onCancel} className="px-4 py-2 bg-gray-600 text-white font-semibold rounded-lg shadow-md hover:bg-gray-700 transition-colors">
                        {t('cancelAudit')}
                    </button>
                </div>
                
                {/* Progress Bar */}
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

                {/* Indicadores */}
                {isDatabaseActive && (
                    <div className="mt-3">
                        <div className="p-3 bg-indigo-50 dark:bg-indigo-900/20 border-2 border-indigo-300 dark:border-indigo-700 rounded-lg">
                            <div className="flex items-center gap-3">
                                <div className="relative">
                                    <div className="w-3 h-3 bg-indigo-500 rounded-full animate-pulse"></div>
                                    <div className="absolute inset-0 w-3 h-3 bg-indigo-500 rounded-full animate-ping opacity-75"></div>
                                </div>
                                <div className="flex-1">
                                    <span className="font-semibold text-indigo-800 dark:text-indigo-200 text-sm">
                                        🗄️ Auditoría de Base de Datos Activa
                                    </span>
                                    <p className="text-xs text-indigo-600 dark:text-indigo-300 mt-0.5">
                                        Monitoreando {config.realDatabaseConfig.tables.length} tabla(s): {config.realDatabaseConfig.tables.join(', ')}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </header>

            {/* MAIN CONTENT */}
            <div className="flex-grow flex relative overflow-hidden">
                {/* LEFT: Chat List - Oculto en móvil */}
                <aside className="hidden md:flex md:w-64 lg:w-72 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex-col">
                    <h3 className="font-bold text-sm text-gray-800 dark:text-white p-3 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
                        {t('conversations')} ({sortedResults.length})
                    </h3>
                    <div className="overflow-y-auto p-2 space-y-2 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-700 scrollbar-track-transparent">
                        {sortedResults.length === 0 ? (
                            <div className="p-4 text-center text-gray-500 dark:text-gray-400">
                                <div className="text-4xl mb-2 animate-pulse">⏳</div>
                                <p className="text-sm">Esperando conversaciones...</p>
                            </div>
                        ) : (
                            sortedResults.map(result => (
                                <ChatListItem 
                                    key={result.id} 
                                    result={result}
                                    isSelected={selectedCaseId === result.id}
                                    onClick={() => setSelectedCaseId(result.id)}
                                />
                            ))
                        )}
                    </div>
                </aside>

                {/* CENTER: Content with Tabs - 30% más estrecho para mejor legibilidad */}
                <main className="flex-1 flex flex-col bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 overflow-hidden">
                    {selectedResult ? (
                        <div className="flex flex-col h-full max-w-4xl w-full mx-auto">
                            {/* Test Case Info */}
                            <div className="flex-shrink-0 p-4 pb-0">
                                <TestCaseInfoCard testCase={selectedResult.testCase} />
                            </div>
                            
                            {/* Tabs - Rediseñadas horizontalmente */}
                            <div className="flex-shrink-0 px-4 pt-2 flex gap-1 border-b-2 border-gray-300 dark:border-gray-600 overflow-x-auto">
                                <TabButton 
                                    active={activeTab === 'conversation'} 
                                    icon="💬" 
                                    label="Conversación"
                                    count={selectedResult.executionTrace.length}
                                    onClick={() => setActiveTab('conversation')}
                                />
                                <TabButton 
                                    active={activeTab === 'objectives'} 
                                    icon="🎯" 
                                    label="Objetivos"
                                    onClick={() => setActiveTab('objectives')}
                                />
                                <TabButton 
                                    active={activeTab === 'prices'} 
                                    icon="💰" 
                                    label="Precios"
                                    count={selectedResult.databaseActivity?.discrepancies?.filter(d => d.type === 'incorrect_data').length}
                                    onClick={() => setActiveTab('prices')}
                                />
                                {isDatabaseActive && (
                                    <TabButton 
                                        active={activeTab === 'database'} 
                                        icon="🗄️" 
                                        label="Base Datos"
                                        count={dbChangesCount}
                                        onClick={() => setActiveTab('database')}
                                    />
                                )}
                                <TabButton 
                                    active={activeTab === 'summary'} 
                                    icon="📊" 
                                    label="Resumen"
                                    onClick={() => setActiveTab('summary')}
                                />
                                <TabButton 
                                    active={activeTab === 'ai-report'} 
                                    icon="🤖" 
                                    label="IA Report"
                                    onClick={() => setActiveTab('ai-report')}
                                />
                            </div>
                            
                            {/* Tab Content - Scroll mejorado */}
                            <div className="flex-1 overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-700 scrollbar-track-transparent hover:scrollbar-thumb-gray-400 dark:hover:scrollbar-thumb-gray-600">
                                {activeTab === 'conversation' && (
                                    <ConversationTab result={selectedResult} chatContainerRef={chatContainerRef} />
                                )}
                                {activeTab === 'objectives' && <ObjectivesTab result={selectedResult} />}
                                {activeTab === 'prices' && <PricesTab result={selectedResult} />}
                                {activeTab === 'database' && <DatabaseTab result={selectedResult} />}
                                {activeTab === 'summary' && <SummaryTab result={selectedResult} />}
                                {activeTab === 'ai-report' && <AIReportTab result={selectedResult} />}
                            </div>
                        </div>
                    ) : (
                        <div className="flex-1 flex items-center justify-center text-center">
                            <div className="animate-pulse">
                                <div className="text-8xl mb-6">⏳</div>
                                <h3 className="text-2xl font-bold text-gray-700 dark:text-gray-300 mb-2">
                                    Esperando Conversaciones
                                </h3>
                                <p className="text-gray-500 dark:text-gray-400">Las conversaciones aparecerán aquí cuando comiencen...</p>
                            </div>
                        </div>
                    )}
                </main>

                {/* RIGHT: Activity Log - Oculto en móvil y tablet */}
                <aside ref={logContainerRef} className="hidden xl:block w-80 bg-gradient-to-b from-gray-900 via-gray-800 to-gray-900 text-gray-300 font-mono text-xs p-4 overflow-y-auto border-l-2 border-green-500/30 shadow-2xl scrollbar-thin scrollbar-thumb-green-600 scrollbar-track-gray-800">
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
                            const isDBLog = log.includes('BD:') || log.includes('➕') || log.includes('🔄') || log.includes('➖');
                            const isDBDiscrepancy = log.includes('DISCREPANCIAS') || log.includes('🚨');
                            const isDBModifications = log.includes('modificaciones detectadas') || log.includes('📝');
                            
                            const color = isDBDiscrepancy 
                                ? 'text-red-500 font-bold bg-red-900/20 px-2 py-1 rounded border-l-4 border-red-500'
                                : isDBModifications
                                ? 'text-cyan-400 font-bold bg-cyan-900/20 px-2 py-1 rounded border-l-4 border-cyan-500'
                                : log.includes('INSERT') || log.includes('➕')
                                ? 'text-green-400 font-semibold bg-green-900/20 px-2 py-1 rounded'
                                : log.includes('UPDATE') || log.includes('🔄')
                                ? 'text-yellow-400 font-semibold bg-yellow-900/20 px-2 py-1 rounded'
                                : log.includes('DELETE') || log.includes('➖')
                                ? 'text-red-400 font-semibold bg-red-900/20 px-2 py-1 rounded'
                                : log.includes('Error') || log.includes('failed') 
                                ? 'text-red-400' 
                                : log.includes('Success') || log.includes('complete') 
                                ? 'text-green-400' 
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
