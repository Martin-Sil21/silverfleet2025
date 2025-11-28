
import React, { useState, useMemo, useRef, useEffect } from 'react';
import type { AuditResult, CriterionAnalysis, AuditConfig, ExecutionStep } from '../types';
import Card from './Card';
import { useTranslation } from '../hooks/useTranslation';
import DashboardReport from './DashboardReport';
import { generateDiscrepanciesReport } from '../services/intelligentToolVerificator';
import LiveVerificationPanel from './LiveVerificationPanel';

interface AuditReportProps {
  results: AuditResult[];
  onReset: () => void;
  config: AuditConfig;
  isHistoryView?: boolean;
}

const DownloadIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
  </svg>
);


const ScoreIndicator: React.FC<{ score: number, size?: 'normal' | 'large' }> = ({ score, size = 'normal' }) => {
  const scoreColor = useMemo(() => {
    if (score >= 8) return 'text-green-500';
    if (score >= 5) return 'text-yellow-500';
    return 'text-red-500';
  }, [score]);
  
  const bgColor = useMemo(() => {
    if (score >= 8) return 'bg-green-100 dark:bg-green-900/50';
    if (score >= 5) return 'bg-yellow-100 dark:bg-yellow-900/50';
    return 'bg-red-100 dark:bg-red-900/50';
  }, [score]);
  
  const sizeClasses = size === 'large' 
    ? 'w-24 h-24 text-4xl' 
    : 'w-16 h-16 text-2xl';

  return (
    <div className={`flex items-center justify-center rounded-full ${bgColor} ${scoreColor} ${sizeClasses}`}>
        <span className="font-bold">{score.toFixed(1)}</span>
    </div>
  );
};

const NodeTraceViewer: React.FC<{ trace: ExecutionStep[], config: AuditConfig }> = ({ trace, config }) => {
  const { t } = useTranslation();
  return (
    <div className="mt-4 space-y-2 max-h-[500px] overflow-y-auto p-4 bg-gray-900 rounded-lg border border-gray-700 font-mono text-xs">
      {trace.map((step, index) => {
        const node = config.workflow.find(n => n.id === step.nodeId);
        const statusColor = step.status === 'SUCCESS' ? 'text-green-400' : step.status === 'ERROR' ? 'text-red-400' : 'text-yellow-400';
        return (
          <details key={`${step.nodeId}-${index}`} className="p-2 bg-gray-800/50 rounded-md">
            <summary className="cursor-pointer font-semibold flex justify-between items-center">
              <span>Node: {node?.name || step.nodeId}</span>
              <span className={statusColor}>{step.status} ({step.durationMs}ms)</span>
            </summary>
            <div className="mt-2 pl-4 border-l border-gray-600">
                <h5 className="font-semibold text-gray-300 mt-2">{t('inputData')}</h5>
                <pre className="whitespace-pre-wrap text-gray-400">{JSON.stringify(step.input, null, 2)}</pre>
                <h5 className="font-semibold text-gray-300 mt-2">{t('outputData')}</h5>
                <pre className="whitespace-pre-wrap text-cyan-400">{JSON.stringify(step.output, null, 2)}</pre>
                 {step.log && (
                    <>
                    <h5 className="font-semibold text-gray-300 mt-2">{t('executionLogTitle')}</h5>
                    <pre className="whitespace-pre-wrap text-gray-400">{step.log}</pre>
                    </>
                 )}
            </div>
          </details>
        )
      })}
    </div>
  );
};

export const ConversationTraceViewer: React.FC<{ trace: ExecutionStep[] }> = ({ trace }) => {
    const { t } = useTranslation();
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [trace]);

    const findMessage = (data: any, isOutput: boolean = false): string => {
        if (typeof data !== 'object' || data === null) return String(data);
        if (isOutput) {
           if (typeof data.response === 'string') return data.response;
           if (typeof data.output === 'string') return data.output;
           if (typeof data.message === 'string') return data.message;
           if (typeof data.response === 'object' && data.response !== null) {
              return Object.values(data.response).filter(v => typeof v === 'string').join(' ');
           }
           return JSON.stringify(data);
        }
        const messageKey = Object.keys(data).find(k => k.toLowerCase().includes('message') || k.toLowerCase().includes('text') || k.toLowerCase().includes('query'));
        return messageKey ? String(data[messageKey]) : JSON.stringify(data);
    };


    return (
        <div className="flex-1 flex flex-col h-full bg-gray-100 dark:bg-gray-900 rounded-lg p-2 md:p-4">
            <div className="flex-1 overflow-y-auto space-y-4 pr-2">
                {trace.map(turn => (
                    <React.Fragment key={turn.nodeId}>
                        {/* User Message Bubble */}
                        <div className="flex justify-end animate-fade-in">
                            <div className="bg-blue-500 text-white p-3 rounded-l-lg rounded-br-lg max-w-xs md:max-w-md shadow">
                                <p className="text-sm">{findMessage(turn.input)}</p>
                            </div>
                        </div>

                        {/* Agent Message Bubble */}
                        <div className="flex justify-start animate-fade-in">
                            <div className="bg-white dark:bg-gray-700 p-3 rounded-r-lg rounded-bl-lg max-w-xs md:max-w-md shadow">
                                 {turn.status === 'SUCCESS' ? (
                                     <p className="text-sm text-gray-800 dark:text-gray-200">{findMessage(turn.output, true)}</p>
                                 ) : (
                                    <div className="text-red-500 dark:text-red-400">
                                        <p className="font-bold">{t('error')}</p>
                                        <p className="text-xs">{turn.log}</p>
                                    </div>
                                 )}
                            </div>
                        </div>
                    </React.Fragment>
                ))}
                <div ref={messagesEndRef} />
            </div>
        </div>
    );
};

const CriterionBreakdown: React.FC<{ analysis: CriterionAnalysis[] }> = ({ analysis }) => (
    <div className="space-y-3 mt-4">
        {analysis.map((item) => (
            <div key={item.criterion} className="p-3 bg-gray-100 dark:bg-gray-800 rounded-lg">
                <div className="flex justify-between items-center">
                    <p className="font-semibold text-gray-800 dark:text-gray-200">{item.criterion}</p>
                    <ScoreIndicator score={item.score} />
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{item.justification}</p>
            </div>
        ))}
    </div>
);


// 🔥 Tab system for detailed view
type ReportTabType = 'summary' | 'database' | 'verification' | 'conversation' | 'verifications';

const ReportTabButton: React.FC<{ 
  active: boolean; 
  icon: string; 
  label: string; 
  count?: number;
  onClick: () => void 
}> = ({ active, icon, label, count, onClick }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-2 px-4 py-2 font-semibold text-sm rounded-t-lg transition-all ${
      active 
        ? 'bg-white dark:bg-gray-800 text-primary-600 dark:text-primary-400 border-t-2 border-x-2 border-primary-500' 
        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
    }`}
  >
    <span className="text-lg">{icon}</span>
    <span>{label}</span>
    {count !== undefined && count > 0 && (
      <span className={`ml-1 px-2 py-0.5 rounded-full text-xs font-bold ${
        active ? 'bg-primary-500 text-white' : 'bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300'
      }`}>
        {count}
      </span>
    )}
  </button>
);

const ReportCard: React.FC<{ result: AuditResult; config: AuditConfig }> = ({ result, config }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<ReportTabType>('summary');
  const { t, language } = useTranslation();
  
  function getScoreColor(score: number): string {
    if (score >= 8) return 'text-green-600 dark:text-green-400';
    if (score >= 5) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  }
  
  // Contadores para badges
  const dbChangesCount = result.databaseActivity?.changes?.length || 0;
  const dbDiscrepanciesCount = result.databaseActivity?.discrepancies?.length || 0;
  const hasDB = result.databaseActivity && result.databaseActivity.totalOperations > 0;
  const hasVerification = (result.databaseActivity as any)?.intelligentVerification;

  return (
    <Card className="mb-6">
      <div className="cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="flex items-center gap-4">
          <div className="flex-shrink-0">
            <ScoreIndicator score={result.analysis.overallScore} />
          </div>
          <div className="flex-grow min-w-0">
            <h3 className="text-xl font-bold text-gray-800 dark:text-white truncate">{result.testCase.title}</h3>
            <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400 flex-wrap">
              <span>
                {t('finalStatusLabel')}: <span className={result.finalStatus === 'SUCCESS' ? 'font-semibold text-green-600 dark:text-green-400' : 'font-semibold text-red-600 dark:text-red-400'}>{result.finalStatus}</span>
              </span>
              {result.durationMs && (
                <>
                  <span className="text-gray-300 dark:text-gray-600">•</span>
                  <span className="flex items-center gap-1">
                    <span>⏱️</span>
                    <span className="font-medium">{(result.durationMs / 1000).toFixed(1)}s</span>
                  </span>
                </>
              )}
              {result.executionTrace.length > 0 && (
                <>
                  <span className="text-gray-300 dark:text-gray-600">•</span>
                  <span>{result.executionTrace.length} turnos</span>
                </>
              )}
            </div>
          </div>
          <div className="flex-shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={`w-6 h-6 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
            </svg>
          </div>
        </div>
      </div>
      {isExpanded && (
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 animate-fade-in">
          {/* 🔥 Tabs */}
          <div className="flex gap-2 mb-4 border-b-2 border-gray-300 dark:border-gray-600">
            <ReportTabButton 
              active={activeTab === 'summary'} 
              icon="📊" 
              label="Resumen"
              onClick={() => setActiveTab('summary')}
            />
            {hasDB && (
              <ReportTabButton 
                active={activeTab === 'database'} 
                icon="🗄️" 
                label="Base de Datos"
                count={dbChangesCount + dbDiscrepanciesCount}
                onClick={() => setActiveTab('database')}
              />
            )}
            {hasVerification && (
              <ReportTabButton 
                active={activeTab === 'verification'} 
                icon="🔧" 
                label="Verificación"
                onClick={() => setActiveTab('verification')}
              />
            )}
            <ReportTabButton 
              active={activeTab === 'verifications'} 
              icon="🔍" 
              label="Verificaciones Live"
              onClick={() => setActiveTab('verifications')}
            />
            <ReportTabButton 
              active={activeTab === 'conversation'} 
              icon="💬" 
              label="Conversación"
              count={result.executionTrace.length}
              onClick={() => setActiveTab('conversation')}
            />
          </div>
          
          {/* Tab Content */}
          <div className="space-y-6">
            {/* ============================================ */}
            {/* 📊 TAB: RESUMEN GENERAL */}
            {/* ============================================ */}
            {activeTab === 'summary' && (
              <section className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl p-5 border-2 border-blue-300 dark:border-blue-700">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-3xl">📊</span>
              <h3 className="text-2xl font-bold text-blue-900 dark:text-blue-100">
                Resumen General de la Auditoría
              </h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              {/* Información del caso */}
              <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
                <h4 className="font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                  <span>👤</span> Información del Test
                </h4>
                <div className="space-y-2 text-sm">
                  <p><span className="font-medium text-gray-600 dark:text-gray-400">Persona:</span> {result.testCase.persona}</p>
                  <p><span className="font-medium text-gray-600 dark:text-gray-400">Objetivo:</span> {result.testCase.conversationGoal}</p>
                  <p><span className="font-medium text-gray-600 dark:text-gray-400">Estado Final:</span> 
                    <span className={result.finalStatus === 'SUCCESS' ? 'ml-2 font-semibold text-green-600 dark:text-green-400' : 'ml-2 font-semibold text-red-600 dark:text-red-400'}>
                      {result.finalStatus}
                    </span>
                  </p>
                </div>
              </div>
              
              {/* Métricas de tiempo */}
              {(result.startTime || result.durationMs) && (
                <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
                  <h4 className="font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                    <span>⏱️</span> Métricas de Tiempo
                  </h4>
                  <div className="space-y-2 text-sm">
                    {result.startTime && (
                      <p><span className="font-medium text-gray-600 dark:text-gray-400">Inicio:</span> {new Date(result.startTime).toLocaleTimeString('es-AR')}</p>
                    )}
                    {result.endTime && (
                      <p><span className="font-medium text-gray-600 dark:text-gray-400">Fin:</span> {new Date(result.endTime).toLocaleTimeString('es-AR')}</p>
                    )}
                    {result.durationMs && (
                      <p><span className="font-medium text-gray-600 dark:text-gray-400">Duración Total:</span>
                        <span className="ml-2 font-bold text-blue-600 dark:text-blue-400">
                          {(result.durationMs / 1000).toFixed(1)}s
                        </span>
                      </p>
                    )}
                    <p><span className="font-medium text-gray-600 dark:text-gray-400">Turnos:</span> {result.executionTrace.length}</p>
                  </div>
                </div>
              )}
            </div>
            
            {/* Análisis principal */}
            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
              <h4 className="font-semibold text-gray-700 dark:text-gray-300 mb-3">📝 Análisis de Comportamiento</h4>
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed">{result.analysis.summary}</p>
            </div>
            
            {/* Score general */}
            <div className="mt-4 bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-gray-700 dark:text-gray-300">🎯 Puntuación General</h4>
                <div className="flex items-center gap-3">
                  <ScoreIndicator score={result.analysis.overallScore} />
                  <span className="text-2xl font-bold">
                    <span className={getScoreColor(result.analysis.overallScore)}>
                      {result.analysis.overallScore.toFixed(1)}
                    </span>
                    <span className="text-gray-400 dark:text-gray-500">/10</span>
                  </span>
                </div>
              </div>
            </div>
            
            {/* Desglose por criterios */}
            <div className="mt-4">
              <h4 className="font-semibold text-gray-800 dark:text-gray-200 mb-3">📋 Evaluación por Criterios</h4>
              <CriterionBreakdown analysis={result.analysis.criteriaBreakdown} />
            </div>
          </section>
            )}
          
          {/* ============================================ */}
          {/* 🗄️ TAB: BASE DE DATOS */}
          {/* ============================================ */}
          {activeTab === 'database' && result.databaseActivity && (
            <section className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-xl p-5 border-2 border-purple-300 dark:border-purple-700">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-3xl">🗄️</span>
                <h3 className="text-2xl font-bold text-purple-900 dark:text-purple-100">
                  Actividad en Base de Datos
                </h3>
              </div>
              
              {/* Resumen de operaciones */}
              <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow mb-4">
                <h4 className="font-semibold text-gray-700 dark:text-gray-300 mb-3">📊 Resumen de Operaciones</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="text-center p-3 bg-purple-50 dark:bg-purple-900/20 rounded">
                    <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{result.databaseActivity.totalOperations}</p>
                    <p className="text-xs text-gray-600 dark:text-gray-400">Total Operaciones</p>
                  </div>
                  <div className="text-center p-3 bg-green-50 dark:bg-green-900/20 rounded">
                    <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                      {result.databaseActivity.changes?.filter((c: any) => c.type === 'INSERT').length || 0}
                    </p>
                    <p className="text-xs text-gray-600 dark:text-gray-400">Inserciones</p>
                  </div>
                  <div className="text-center p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded">
                    <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                      {result.databaseActivity.changes?.filter((c: any) => c.type === 'UPDATE').length || 0}
                    </p>
                    <p className="text-xs text-gray-600 dark:text-gray-400">Actualizaciones</p>
                  </div>
                  <div className="text-center p-3 bg-red-50 dark:bg-red-900/20 rounded">
                    <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                      {result.databaseActivity.changes?.filter((c: any) => c.type === 'DELETE').length || 0}
                    </p>
                    <p className="text-xs text-gray-600 dark:text-gray-400">Eliminaciones</p>
                  </div>
                </div>
                {result.databaseActivity.tablesUsed && result.databaseActivity.tablesUsed.length > 0 && (
                  <div className="mt-3 text-sm text-gray-600 dark:text-gray-400">
                    <span className="font-medium">Tablas monitoreadas:</span> {result.databaseActivity.tablesUsed.join(', ')}
                  </div>
                )}
              </div>
              
              {/* Cambios detallados */}
              {result.databaseActivity.changes && result.databaseActivity.changes.length > 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow mb-4">
                  <h4 className="font-semibold text-gray-700 dark:text-gray-300 mb-3">📝 Cambios Detectados</h4>
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {result.databaseActivity.changes.slice(0, 10).map((change: any, idx: number) => (
                      <div key={idx} className={`p-3 rounded border-l-4 ${
                        change.type === 'INSERT' ? 'bg-green-50 dark:bg-green-900/10 border-green-500' :
                        change.type === 'UPDATE' ? 'bg-yellow-50 dark:bg-yellow-900/10 border-yellow-500' :
                        'bg-red-50 dark:bg-red-900/10 border-red-500'
                      }`}>
                        <div className="flex items-start gap-2">
                          <span className="text-lg">
                            {change.type === 'INSERT' ? '➕' : change.type === 'UPDATE' ? '🔄' : '❌'}
                          </span>
                          <div className="flex-1">
                            <p className="font-medium text-sm">
                              <span className={`font-bold ${
                                change.type === 'INSERT' ? 'text-green-700 dark:text-green-300' :
                                change.type === 'UPDATE' ? 'text-yellow-700 dark:text-yellow-300' :
                                'text-red-700 dark:text-red-300'
                              }`}>
                                {change.type}
                              </span>
                              {' '}en tabla{' '}
                              <span className="font-mono bg-gray-200 dark:bg-gray-700 px-1 rounded text-xs">
                                {change.table}
                              </span>
                            </p>
                            {change.record && (
                              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 font-mono">
                                {JSON.stringify(change.record).substring(0, 150)}...
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                    {result.databaseActivity.changes.length > 10 && (
                      <p className="text-center text-sm text-gray-500 dark:text-gray-400 italic">
                        ... y {result.databaseActivity.changes.length - 10} cambios más
                      </p>
                    )}
                  </div>
                </div>
              )}
              
              {result.databaseActivity.totalOperations === 0 && !result.databaseActivity.changes?.length && (
                <div className="text-center py-6 text-gray-500 dark:text-gray-400">
                  <p className="text-lg">⚠️ No se detectó actividad en la base de datos</p>
                  <p className="text-sm mt-2">El agente no interactuó con las tablas monitoreadas durante esta conversación</p>
                </div>
              )}
            </section>
          )}

          {/* 🎯 ANTIGUO: Verificación Administrativa - Lo mantengo por ahora para no romper nada */}
          {result.databaseActivity && (result.databaseActivity.changes?.length > 0 || result.databaseActivity.discrepancies?.length > 0) && (
            <div className="mt-4 p-5 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl border-2 border-blue-400 dark:border-blue-600 shadow-lg">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-3xl">🎯</span>
                <h4 className="text-xl font-bold text-blue-800 dark:text-blue-200">
                  Verificación Administrativa - ¿El Bot Hizo Su Trabajo?
                </h4>
              </div>
              
              <div className="space-y-3">
                {/* 📝 Verificar si guardó resumen/conversación */}
                {(() => {
                  const summaryTable = ['resumen_conversaciones', 'conversacion', 'chat_histories', 'n8n_chat_histories'].find(t => 
                    result.databaseActivity?.changes?.some(c => c.table.toLowerCase().includes(t) && c.type === 'INSERT')
                  );
                  const summaryInsert = result.databaseActivity?.changes?.find(c => 
                    summaryTable && c.table.toLowerCase().includes(summaryTable) && c.type === 'INSERT'
                  );
                  
                  if (summaryInsert) {
                    return (
                      <div className="bg-green-50 dark:bg-green-900/20 border-l-4 border-green-500 p-3 rounded">
                        <div className="flex items-start gap-2">
                          <span className="text-2xl">✅</span>
                          <div>
                            <p className="font-bold text-green-800 dark:text-green-200">
                              El resumen de la conversación se guardó correctamente
                            </p>
                            <p className="text-sm text-green-700 dark:text-green-300 mt-1">
                              Se creó un registro en la tabla <span className="font-mono bg-green-100 dark:bg-green-800 px-1 rounded">{summaryInsert.table}</span>
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  }
                  
                  // Si no hay insert pero debería haberlo (hay más de 2 turnos)
                  if (result.executionTrace.length > 2) {
                    return (
                      <div className="bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-500 p-3 rounded">
                        <div className="flex items-start gap-2">
                          <span className="text-2xl">⚠️</span>
                          <div>
                            <p className="font-bold text-yellow-800 dark:text-yellow-200">
                              No se detectó que se guardara el resumen de la conversación
                            </p>
                            <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                              El bot completó {result.executionTrace.length} turnos pero no se registró el guardado en la BD.
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()}
                
                {/* 💰 Verificar precios ofrecidos */}
                {result.databaseActivity?.discrepancies?.filter(d => d.type === 'incorrect_data').map((disc, idx) => (
                  <div key={idx} className="bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 p-3 rounded">
                    <div className="flex items-start gap-2">
                      <span className="text-2xl">❌</span>
                      <div className="flex-1">
                        <p className="font-bold text-red-800 dark:text-red-200">
                          El bot ofreció un precio INCORRECTO
                        </p>
                        <div className="mt-2 bg-white dark:bg-gray-800 rounded-lg p-3">
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <p className="text-xs text-red-600 dark:text-red-400 font-semibold">🤖 BOT DIJO:</p>
                              <p className="text-2xl font-bold text-red-700 dark:text-red-300">
                                ${disc.expected !== undefined ? Number(disc.expected).toLocaleString('es-AR', {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '?'}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-green-600 dark:text-green-400 font-semibold">✅ PRECIO REAL EN BD:</p>
                              <p className="text-2xl font-bold text-green-700 dark:text-green-300">
                                ${disc.actual !== undefined ? Number(disc.actual).toLocaleString('es-AR', {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '?'}
                              </p>
                            </div>
                          </div>
                          {disc.expected !== undefined && disc.actual !== undefined && (
                            <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">
                              <span className="font-semibold">Diferencia:</span> ${Math.abs(disc.expected - disc.actual).toLocaleString('es-AR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                              {' '}({disc.actual !== 0 ? `${Math.abs(((disc.expected - disc.actual) / disc.actual) * 100).toFixed(1)}%` : 'N/A'})
                            </p>
                          )}
                        </div>
                        <p className="text-sm text-red-700 dark:text-red-300 mt-2">
                          📝 {disc.description}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
                
                {/* 📊 Resumen de Inserciones (qué guardó) */}
                {(() => {
                  const inserts = result.databaseActivity?.changes?.filter(c => c.type === 'INSERT') || [];
                  if (inserts.length > 0) {
                    return (
                      <div className="bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500 p-3 rounded">
                        <div className="flex items-start gap-2">
                          <span className="text-2xl">📝</span>
                          <div className="flex-1">
                            <p className="font-bold text-blue-800 dark:text-blue-200">
                              El bot guardó {inserts.length} registro{inserts.length > 1 ? 's' : ''} nuevo{inserts.length > 1 ? 's' : ''} en la base de datos
                            </p>
                            <div className="mt-2 space-y-1">
                              {inserts.slice(0, 3).map((insert, idx) => (
                                <div key={idx} className="text-sm text-blue-700 dark:text-blue-300">
                                  • Insertó en tabla <span className="font-mono bg-blue-100 dark:bg-blue-800 px-1 rounded">{insert.table}</span>
                                  {insert.after && (() => {
                                    const data = insert.after;
                                    const keys = Object.keys(data).filter(k => !k.includes('id') && !k.includes('created_at') && !k.includes('updated_at')).slice(0, 2);
                                    if (keys.length > 0) {
                                      return <span className="ml-1 text-xs">({keys.map(k => `${k}: ${String(data[k]).substring(0, 30)}`).join(', ')})</span>;
                                    }
                                    return null;
                                  })()}
                                </div>
                              ))}
                              {inserts.length > 3 && (
                                <div className="text-xs text-blue-600 dark:text-blue-400 italic">
                                  ... y {inserts.length - 3} inserción{inserts.length - 3 > 1 ? 'es' : ''} más
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()}
                
                {/* 🔄 Resumen de Actualizaciones */}
                {(() => {
                  const updates = result.databaseActivity?.changes?.filter(c => c.type === 'UPDATE') || [];
                  if (updates.length > 0) {
                    return (
                      <div className="bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-500 p-3 rounded">
                        <div className="flex items-start gap-2">
                          <span className="text-2xl">🔄</span>
                          <div className="flex-1">
                            <p className="font-bold text-yellow-800 dark:text-yellow-200">
                              El bot modificó {updates.length} registro{updates.length > 1 ? 's' : ''} existente{updates.length > 1 ? 's' : ''}
                            </p>
                            <div className="mt-2 space-y-1">
                              {updates.slice(0, 3).map((update, idx) => (
                                <div key={idx} className="text-sm text-yellow-700 dark:text-yellow-300">
                                  • Actualizó en tabla <span className="font-mono bg-yellow-100 dark:bg-yellow-800 px-1 rounded">{update.table}</span>
                                  {update.record?.changedFields && update.record.changedFields.length > 0 && (
                                    <span className="ml-1 text-xs">(campos: {update.record.changedFields.join(', ')})</span>
                                  )}
                                </div>
                              ))}
                              {updates.length > 3 && (
                                <div className="text-xs text-yellow-600 dark:text-yellow-400 italic">
                                  ... y {updates.length - 3} actualización{updates.length - 3 > 1 ? 'es' : ''} más
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()}
                
                {/* ✅ Todo OK - Sin problemas */}
                {result.databaseActivity?.changes?.length > 0 && 
                 !result.databaseActivity?.discrepancies?.some(d => d.severity === 'critical') && (
                  <div className="bg-green-50 dark:bg-green-900/20 border-l-4 border-green-500 p-3 rounded">
                    <div className="flex items-start gap-2">
                      <span className="text-2xl">🎉</span>
                      <div>
                        <p className="font-bold text-green-800 dark:text-green-200">
                          Sin errores críticos detectados
                        </p>
                        <p className="text-sm text-green-700 dark:text-green-300 mt-1">
                          El bot guardó la información correctamente y no se detectaron precios incorrectos.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 🧠 NUEVO: Verificación Inteligente con Gemini AI */}
          {result.databaseActivity && (result.databaseActivity as any).intelligentVerification && (
            <div className="mt-4">
              <div dangerouslySetInnerHTML={{ 
                __html: generateDiscrepanciesReport(
                  (result.databaseActivity as any).intelligentVerification,
                  language
                )
              }} />
            </div>
          )}

          {result.databaseActivity && (
            <div className="mt-4 p-4 bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 rounded-lg border border-indigo-200 dark:border-indigo-700">
              <h4 className="font-semibold text-indigo-800 dark:text-indigo-200 flex items-center gap-2 mb-3">
                <span>🗄️</span>
                Actividad de Base de Datos
              </h4>
              
              {result.databaseActivity.totalOperations === 0 && !result.databaseActivity.changes?.length && !result.databaseActivity.discrepancies?.length && (
                <div className="text-center py-4 text-gray-500 dark:text-gray-400">
                  <p className="text-sm">⚠️ No se detectó actividad en la base de datos durante esta conversación</p>
                  <p className="text-xs mt-1">El bot puede no haber interactuado con las tablas monitoreadas</p>
                </div>
              )}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-center text-sm">
                <div className="bg-white/70 dark:bg-gray-800/70 rounded p-2">
                  <p className="text-xl font-bold text-indigo-600 dark:text-indigo-400">{result.databaseActivity.totalOperations}</p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">Total</p>
                </div>
                <div className="bg-white/70 dark:bg-gray-800/70 rounded p-2">
                  <p className="text-xl font-bold text-blue-600 dark:text-blue-400">{result.databaseActivity.reads}</p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">Lecturas</p>
                </div>
                <div className="bg-white/70 dark:bg-gray-800/70 rounded p-2">
                  <p className="text-xl font-bold text-green-600 dark:text-green-400">{result.databaseActivity.writes}</p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">Escrituras</p>
                </div>
                <div className="bg-white/70 dark:bg-gray-800/70 rounded p-2">
                  <p className="text-xl font-bold text-yellow-600 dark:text-yellow-400">{result.databaseActivity.updates}</p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">Actualizaciones</p>
                </div>
                <div className="bg-white/70 dark:bg-gray-800/70 rounded p-2">
                  <p className="text-xl font-bold text-red-600 dark:text-red-400">{result.databaseActivity.deletes}</p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">Eliminaciones</p>
                </div>
              </div>
              {result.databaseActivity.tablesUsed.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 mb-1">Tablas utilizadas:</p>
                  <div className="flex flex-wrap gap-1">
                    {result.databaseActivity.tablesUsed.map(table => (
                      <span key={table} className="bg-indigo-200 dark:bg-indigo-700 text-indigo-800 dark:text-indigo-200 text-xs px-2 py-0.5 rounded">
                        {table}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Modificaciones en la BD */}
              {result.databaseActivity.changes && result.databaseActivity.changes.length > 0 && (
                <div className="mt-4 bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 border-2 border-blue-400 dark:border-blue-600 rounded-xl p-4 shadow-lg">
                  <div className="flex items-center justify-between mb-4">
                    <h5 className="font-bold text-blue-800 dark:text-blue-200 text-base flex items-center gap-2">
                      <span className="text-2xl">📝</span>
                      Modificaciones en Base de Datos
                    </h5>
                    <span className="bg-blue-500 text-white text-xs px-3 py-1 rounded-full font-bold">
                      {result.databaseActivity.changes.length} Cambio{result.databaseActivity.changes.length > 1 ? 's' : ''}
                    </span>
                  </div>
                  
                  <div className="space-y-2 max-h-[400px] overflow-y-auto">
                    {result.databaseActivity.changes.map((change, idx) => (
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
                                <pre className="text-green-700 dark:text-green-300 whitespace-pre-wrap break-all">
                                  {JSON.stringify(change.after, null, 2).substring(0, 200)}
                                  {JSON.stringify(change.after).length > 200 ? '...' : ''}
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
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                  <div className="bg-white dark:bg-gray-800 rounded p-2">
                                    <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Antes:</p>
                                    <pre className="text-xs font-mono text-red-600 dark:text-red-400 whitespace-pre-wrap break-all">
                                      {JSON.stringify(change.before, null, 2).substring(0, 120)}
                                    </pre>
                                  </div>
                                  <div className="bg-white dark:bg-gray-800 rounded p-2">
                                    <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Después:</p>
                                    <pre className="text-xs font-mono text-green-600 dark:text-green-400 whitespace-pre-wrap break-all">
                                      {JSON.stringify(change.after, null, 2).substring(0, 120)}
                                    </pre>
                                  </div>
                                </div>
                              </div>
                            )}
                            
                            {change.type === 'DELETE' && change.before && (
                              <div className="bg-white dark:bg-gray-800 rounded p-2 text-xs font-mono">
                                <pre className="text-red-700 dark:text-red-300 whitespace-pre-wrap break-all">
                                  {JSON.stringify(change.before, null, 2).substring(0, 200)}
                                  {JSON.stringify(change.before).length > 200 ? '...' : ''}
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
              
              {result.databaseActivity.discrepancies && result.databaseActivity.discrepancies.length > 0 && (
                <div className="mt-4 bg-gradient-to-br from-red-50 to-orange-50 dark:from-red-900/20 dark:to-orange-900/20 border-2 border-red-400 dark:border-red-600 rounded-xl p-4 shadow-lg">
                  <div className="flex items-center justify-between mb-4">
                    <h5 className="font-bold text-red-800 dark:text-red-200 text-base flex items-center gap-2">
                      <span className="text-2xl">🚨</span>
                      Verificación de Precios - Reporte Final
                    </h5>
                    <span className="bg-red-500 text-white text-xs px-3 py-1 rounded-full font-bold">
                      {result.databaseActivity.discrepancies.length} Error{result.databaseActivity.discrepancies.length > 1 ? 'es' : ''}
                    </span>
                  </div>
                  
                  <div className="space-y-3 max-h-[500px] overflow-y-auto">
                    {result.databaseActivity.discrepancies.map((disc, idx) => (
                      <div key={idx} className="bg-white dark:bg-gray-800 rounded-lg border-2 border-red-300 dark:border-red-700 overflow-hidden">
                        {/* Header con producto */}
                        <div className="bg-red-100 dark:bg-red-900/30 px-4 py-2 border-b-2 border-red-300 dark:border-red-700 flex items-center justify-between">
                          <p className="font-bold text-gray-800 dark:text-gray-200 text-sm">
                            #{idx + 1} - {disc.table || 'Producto'}
                          </p>
                          <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                            disc.severity === 'critical' ? 'bg-red-500 text-white' :
                            disc.severity === 'warning' ? 'bg-yellow-500 text-white' :
                            'bg-blue-500 text-white'
                          }`}>
                            {disc.severity.toUpperCase()}
                          </span>
                        </div>
                        
                        {/* Comparación de datos */}
                        <div className="p-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
                            {/* Lo que dijo el bot */}
                            <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3 border border-red-200 dark:border-red-800">
                              <p className="text-xs text-red-600 dark:text-red-400 font-semibold mb-2">🤖 BOT OFRECIÓ</p>
                              <p className="text-3xl font-bold text-red-700 dark:text-red-300">
                                ${disc.expected !== undefined ? Number(disc.expected).toLocaleString('es-AR', {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '?'}
                              </p>
                              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">por unidad</p>
                            </div>
                            
                            {/* Lo que está en BD */}
                            <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 border border-green-200 dark:border-green-800">
                              <p className="text-xs text-green-600 dark:text-green-400 font-semibold mb-2">✅ BASE DE DATOS REAL</p>
                              <p className="text-3xl font-bold text-green-700 dark:text-green-300">
                                ${disc.actual !== undefined ? Number(disc.actual).toLocaleString('es-AR', {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '?'}
                              </p>
                              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">precio correcto</p>
                            </div>
                          </div>
                          
                          {/* Diferencia y Estado */}
                          {disc.expected !== undefined && disc.actual !== undefined && (
                            <div className="bg-gray-100 dark:bg-gray-900/30 rounded-lg p-4 border border-gray-300 dark:border-gray-700">
                              <div className="grid grid-cols-3 gap-4">
                                <div>
                                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">💰 Diferencia</p>
                                  <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                                    {disc.expected > disc.actual ? '+' : ''}${(disc.expected - disc.actual).toLocaleString('es-AR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">📊 Porcentaje</p>
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
                          
                          {/* Descripción detallada */}
                          <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-200 dark:border-blue-700">
                            <p className="text-xs text-blue-600 dark:text-blue-400 font-semibold mb-1">📝 Detalle</p>
                            <p className="text-xs text-gray-700 dark:text-gray-300">
                              {disc.description}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ============================================ */}
          {/* 🔧 SECCIÓN 3: HERRAMIENTAS EXTERNAS */}
          {/* ============================================ */}
          {result.databaseActivity && (result.databaseActivity as any).intelligentVerification && (
            <section className="bg-gradient-to-r from-orange-50 to-yellow-50 dark:from-orange-900/20 dark:to-yellow-900/20 rounded-xl p-5 border-2 border-orange-300 dark:border-orange-700">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-3xl">🔧</span>
                <h3 className="text-2xl font-bold text-orange-900 dark:text-orange-100">
                  Verificación de Herramientas y Acciones
                </h3>
              </div>
              
              {/* Render del reporte inteligente */}
              <div dangerouslySetInnerHTML={{ 
                __html: generateDiscrepanciesReport(
                  (result.databaseActivity as any).intelligentVerification,
                  language
                )
              }} />
              
              {/* Score de precisión */}
              {((result.databaseActivity as any).intelligentVerification as any).overallScore !== undefined && (
                <div className="mt-4 bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-gray-700 dark:text-gray-300">🎯 Precisión en Acciones</h4>
                    <div className="flex items-center gap-3">
                      <ScoreIndicator score={((result.databaseActivity as any).intelligentVerification as any).overallScore} />
                      <span className="text-2xl font-bold">
                        <span className={getScoreColor(((result.databaseActivity as any).intelligentVerification as any).overallScore)}>
                          {((result.databaseActivity as any).intelligentVerification as any).overallScore.toFixed(1)}
                        </span>
                        <span className="text-gray-400 dark:text-gray-500">/10</span>
                      </span>
                    </div>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                    Evaluación de la coherencia entre lo que el bot prometió hacer y lo que realmente ejecutó
                  </p>
                </div>
              )}
            </section>
          )}

          {/* ============================================ */}
          {/* 🔧 SECCIÓN: VERIFICACIÓN DE HERRAMIENTAS EXTERNAS (GMAIL, CALENDAR, ETC.) */}
          {/* ============================================ */}
          {result.toolVerifications && result.toolVerifications.length > 0 && (
            <section className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-xl p-5 border-2 border-purple-300 dark:border-purple-700">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-3xl">🔧</span>
                <h3 className="text-2xl font-bold text-purple-900 dark:text-purple-100">
                  {language === 'es' ? 'Verificación de Herramientas Externas' : 'External Tools Verification'}
                </h3>
              </div>
              
              <div className="space-y-3">
                {result.toolVerifications.map((verification, idx) => (
                  <div 
                    key={idx} 
                    className={`p-4 rounded-lg border-2 ${
                      verification.verified 
                        ? 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700' 
                        : 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-2xl">{verification.verified ? '✅' : '❌'}</span>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-bold text-lg">
                            {verification.claim.type === 'email' && '📧 Email'}
                            {verification.claim.type === 'calendar' && '📅 Calendar'}
                            {verification.claim.type === 'other' && '🔧 Other Tool'}
                          </h4>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {language === 'es' ? 'Método' : 'Method'}: {verification.verificationMethod}
                          </span>
                        </div>
                        
                        <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                          <strong>{language === 'es' ? 'Acción prometida' : 'Promised action'}:</strong> {verification.claim.description}
                        </p>
                        
                        <p className={`text-sm font-medium ${verification.verified ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}`}>
                          {verification.message}
                        </p>
                        
                        {verification.evidence && (
                          <details className="mt-2">
                            <summary className="cursor-pointer text-xs text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200">
                              {language === 'es' ? 'Ver evidencia' : 'Show evidence'}
                            </summary>
                            <pre className="mt-2 p-2 bg-gray-100 dark:bg-gray-800 rounded text-xs overflow-auto">
                              {JSON.stringify(verification.evidence, null, 2)}
                            </pre>
                          </details>
                        )}
                        
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                          {language === 'es' ? 'Verificado en' : 'Verified at'}: {new Date(verification.timestamp).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              
              {/* Resumen de verificaciones */}
              <div className="mt-4 p-4 bg-white dark:bg-gray-800 rounded-lg shadow">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-2xl font-bold text-gray-700 dark:text-gray-300">
                      {result.toolVerifications.length}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      {language === 'es' ? 'Total' : 'Total'}
                    </div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                      {result.toolVerifications.filter(v => v.verified).length}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      {language === 'es' ? 'Verificadas' : 'Verified'}
                    </div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                      {result.toolVerifications.filter(v => !v.verified).length}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      {language === 'es' ? 'Fallidas' : 'Failed'}
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}

            </>
          )}
          
          {/* ============================================ */}
          {/* ============================================ */}
          {/* 🔍 TAB: VERIFICACIONES LIVE */}
          {/* ============================================ */}
          {activeTab === 'verifications' && (
            <section className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-xl p-5 border-2 border-purple-300 dark:border-purple-700">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-3xl">🔍</span>
                <h3 className="text-2xl font-bold text-purple-900 dark:text-purple-100">
                  Verificaciones en Tiempo Real
                </h3>
              </div>
              
              <LiveVerificationPanel 
                steps={result.executionTrace} 
                isActive={false}
              />
            </section>
          )}

          {/* ============================================ */}
          {/* 💬 TAB: CONVERSACIÓN */}
          {/* ============================================ */}
          {activeTab === 'conversation' && (
            <section className="bg-gradient-to-r from-green-50 to-teal-50 dark:from-green-900/20 dark:to-teal-900/20 rounded-xl p-5 border-2 border-green-300 dark:border-green-700">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-3xl">💬</span>
                <h3 className="text-2xl font-bold text-green-900 dark:text-green-100">
                  Conversación Completa
                </h3>
              </div>
              
              {/* Vista de conversación */}
              {config.auditType === 'real' ? (
                <ConversationTraceViewer trace={result.executionTrace} />
              ) : (
                <NodeTraceViewer trace={result.executionTrace} config={config} />
              )}
              
              {/* Métricas adicionales */}
              <div className="mt-6">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-3xl">📈</span>
              <h3 className="text-2xl font-bold text-green-900 dark:text-green-100">
                Métricas y Estadísticas de Rendimiento
              </h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Métricas de conversación */}
              <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
                <h4 className="font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                  <span>💬</span> Conversación
                </h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Total de turnos:</span>
                    <span className="font-bold text-green-600 dark:text-green-400">{result.executionTrace.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Exitosos:</span>
                    <span className="font-bold text-green-600 dark:text-green-400">
                      {result.executionTrace.filter(t => t.status === 'SUCCESS').length}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Con errores:</span>
                    <span className="font-bold text-red-600 dark:text-red-400">
                      {result.executionTrace.filter(t => t.status === 'ERROR').length}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Tasa de éxito:</span>
                    <span className="font-bold">
                      {((result.executionTrace.filter(t => t.status === 'SUCCESS').length / result.executionTrace.length) * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>
              
              {/* Métricas de tiempo */}
              {result.durationMs && (
                <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
                  <h4 className="font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                    <span>⏱️</span> Rendimiento
                  </h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Duración total:</span>
                      <span className="font-bold text-blue-600 dark:text-blue-400">
                        {(result.durationMs / 1000).toFixed(1)}s
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Tiempo por turno:</span>
                      <span className="font-bold">
                        {(result.durationMs / result.executionTrace.length / 1000).toFixed(2)}s
                      </span>
                    </div>
                    {result.startTime && (
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">Inicio:</span>
                        <span className="font-mono text-xs">
                          {new Date(result.startTime).toLocaleTimeString('es-AR')}
                        </span>
                      </div>
                    )}
                    {result.endTime && (
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">Fin:</span>
                        <span className="font-mono text-xs">
                          {new Date(result.endTime).toLocaleTimeString('es-AR')}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              {/* Métricas de base de datos */}
              {result.databaseActivity && (
                <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
                  <h4 className="font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                    <span>🗄️</span> Base de Datos
                  </h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Operaciones:</span>
                      <span className="font-bold text-purple-600 dark:text-purple-400">
                        {result.databaseActivity.totalOperations}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Cambios:</span>
                      <span className="font-bold">
                        {result.databaseActivity.changes?.length || 0}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Tablas usadas:</span>
                      <span className="font-bold">
                        {result.databaseActivity.tablesUsed?.length || 0}
                      </span>
                    </div>
                    {result.databaseActivity.discrepancies && result.databaseActivity.discrepancies.length > 0 && (
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">Discrepancias:</span>
                        <span className="font-bold text-red-600 dark:text-red-400">
                          {result.databaseActivity.discrepancies.length}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            
            {/* Resumen general de calidad */}
            <div className="mt-4 bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
              <h4 className="font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                <span>🎯</span> Evaluación General de Calidad
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Puntuación de Comportamiento:</p>
                  <div className="flex items-center gap-3">
                    <ScoreIndicator score={result.analysis.overallScore} />
                    <span className="text-3xl font-bold">
                      <span className={getScoreColor(result.analysis.overallScore)}>
                        {result.analysis.overallScore.toFixed(1)}
                      </span>
                      <span className="text-gray-400 dark:text-gray-500 text-xl">/10</span>
                    </span>
                  </div>
                </div>
                {result.databaseActivity && (result.databaseActivity as any).intelligentVerification && (
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Precisión en Acciones:</p>
                    <div className="flex items-center gap-3">
                      <ScoreIndicator score={((result.databaseActivity as any).intelligentVerification as any).overallScore} />
                      <span className="text-3xl font-bold">
                        <span className={getScoreColor(((result.databaseActivity as any).intelligentVerification as any).overallScore)}>
                          {((result.databaseActivity as any).intelligentVerification as any).overallScore.toFixed(1)}
                        </span>
                        <span className="text-gray-400 dark:text-gray-500 text-xl">/10</span>
                      </span>
                    </div>
                  </div>
                )}
              </div>
              
              {/* Indicador visual de calidad general */}
              <div className="mt-4">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Indicador de Calidad:</p>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-4 overflow-hidden">
                  <div 
                    className={`h-full transition-all duration-500 ${
                      result.analysis.overallScore >= 8 ? 'bg-green-500' :
                      result.analysis.overallScore >= 5 ? 'bg-yellow-500' :
                      'bg-red-500'
                    }`}
                    style={{ width: `${result.analysis.overallScore * 10}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 text-right">
                  {result.analysis.overallScore >= 8 ? '✅ Excelente' :
                   result.analysis.overallScore >= 5 ? '⚠️ Necesita Mejoras' :
                   '❌ Deficiente'}
                </p>
              </div>
            </div>
          </section>
          )}
          </div>
        </div>
      )}
    </Card>
  );
};

const AuditReport: React.FC<AuditReportProps> = ({ results, onReset, config, isHistoryView = false }) => {
  const { t } = useTranslation();
  const [activeView, setActiveView] = useState<'dashboard' | 'conversations' | 'detailed'>('dashboard');
  const [selectedConversationIndex, setSelectedConversationIndex] = useState(0);
  
  const overallAverageScore = useMemo(() => {
    if (results.length === 0) return 0;
    const total = results.reduce((sum, r) => sum + r.analysis.overallScore, 0);
    return total / results.length;
  }, [results]);

  // 🗄️ Calcular estadísticas globales de BD
  const databaseStats = useMemo(() => {
    const stats = {
      totalOperations: 0,
      reads: 0,
      writes: 0,
      updates: 0,
      deletes: 0,
      changes: 0,
      discrepancies: 0,
      conversationsWithActivity: 0
    };

    results.forEach(result => {
      if (result.databaseActivity) {
        stats.totalOperations += result.databaseActivity.totalOperations;
        stats.reads += result.databaseActivity.reads;
        stats.writes += result.databaseActivity.writes;
        stats.updates += result.databaseActivity.updates;
        stats.deletes += result.databaseActivity.deletes;
        stats.changes += result.databaseActivity.changes?.length || 0;
        stats.discrepancies += result.databaseActivity.discrepancies?.length || 0;
        if (result.databaseActivity.totalOperations > 0) {
          stats.conversationsWithActivity++;
        }
      }
    });

    return stats;
  }, [results]);

  // ⏱️ Calcular estadísticas de tiempos
  const timeStats = useMemo(() => {
    const conversationsWithTiming = results.filter(r => r.durationMs);
    const durations = conversationsWithTiming.map(r => r.durationMs!);
    
    const stats = {
      totalConversations: results.length,
      withTiming: conversationsWithTiming.length,
      avgDuration: durations.length > 0 ? durations.reduce((sum, d) => sum + d, 0) / durations.length : 0,
      minDuration: durations.length > 0 ? Math.min(...durations) : 0,
      maxDuration: durations.length > 0 ? Math.max(...durations) : 0,
      totalDuration: durations.reduce((sum, d) => sum + d, 0),
    };
    
    return stats;
  }, [results]);

  const escapeCsvField = (field: any): string => {
    let str = String(field ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      str = `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const handleExport = () => {
    const headers = [
      'test_case_id', 'test_case_title', 'persona', 'conversation_goal', 'initial_payload',
      'turn_number', 'user_message', 'agent_response', 'turn_status',
      'final_test_status', 'overall_score', 'analysis_summary', 'criteria_breakdown'
    ];

    const findMessage = (data: any, isOutput: boolean = false): string => {
        if (typeof data !== 'object' || data === null) return String(data);
        if (isOutput) {
           if (typeof data.response === 'string') return data.response;
           if (typeof data.output === 'string') return data.output;
           if (typeof data.message === 'string') return data.message;
           if (typeof data.response === 'object' && data.response !== null) {
              return Object.values(data.response).filter(v => typeof v === 'string').join(' ');
           }
           return JSON.stringify(data);
        }
        const messageKey = Object.keys(data).find(k => k.toLowerCase().includes('message') || k.toLowerCase().includes('text') || k.toLowerCase().includes('query'));
        return messageKey ? String(data[messageKey]) : JSON.stringify(data);
    };

    const rows = results.flatMap(result => {
      const baseRow = [
        result.id,
        result.testCase.title,
        result.testCase.persona,
        result.testCase.conversationGoal,
        JSON.stringify(result.testCase.initialPayload),
      ];

      if (result.executionTrace.length === 0) {
        return [[
          ...baseRow,
          'N/A', 'N/A', 'N/A', 'N/A', // Turn data
          result.finalStatus,
          result.analysis.overallScore,
          result.analysis.summary,
          JSON.stringify(result.analysis.criteriaBreakdown)
        ].map(escapeCsvField).join(',')];
      }

      return result.executionTrace.map(turn => {
        const turnRow = [
          turn.nodeId,
          findMessage(turn.input),
          findMessage(turn.output, true),
          turn.status,
          result.finalStatus,
          result.analysis.overallScore,
          result.analysis.summary,
          JSON.stringify(result.analysis.criteriaBreakdown)
        ];
        return [...baseRow, ...turnRow].map(escapeCsvField).join(',');
      });
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `audit_report_${new Date().toISOString()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div>
        <Card className="mb-8">
            <div className="flex flex-col gap-6">
                <div className="w-full flex flex-col md:flex-row items-center justify-between">
                    <div>
                        <h2 className="text-3xl font-bold text-gray-800 dark:text-white">{t('auditReportTitle')}</h2>
                        <p className="text-gray-600 dark:text-gray-400 mt-1">{t('auditReportDescription')}</p>
                    </div>
                    <div className="text-center">
                        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('overallAverageScore')}</p>
                        <ScoreIndicator score={overallAverageScore} size="large" />
                    </div>
                </div>

                {/* 🔥 Pestañas de Vista */}
                <div className="flex gap-2 border-b-2 border-gray-200 dark:border-gray-700">
                  <button
                    onClick={() => setActiveView('dashboard')}
                    className={`px-6 py-3 font-semibold transition-all ${
                      activeView === 'dashboard'
                        ? 'border-b-4 border-blue-500 text-blue-600 dark:text-blue-400 -mb-0.5'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                    }`}
                  >
                    📊 Dashboard
                  </button>
                  <button
                    onClick={() => setActiveView('conversations')}
                    className={`px-6 py-3 font-semibold transition-all ${
                      activeView === 'conversations'
                        ? 'border-b-4 border-blue-500 text-blue-600 dark:text-blue-400 -mb-0.5'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                    }`}
                  >
                    💬 Conversaciones ({results.length})
                  </button>
                  <button
                    onClick={() => setActiveView('detailed')}
                    className={`px-6 py-3 font-semibold transition-all ${
                      activeView === 'detailed'
                        ? 'border-b-4 border-blue-500 text-blue-600 dark:text-blue-400 -mb-0.5'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                    }`}
                  >
                    📝 Reporte Completo
                  </button>
                </div>
            </div>
        </Card>

        {/* 🔥 Vista de Dashboard */}
        {activeView === 'dashboard' && (
          <DashboardReport results={results} config={config} />
        )}

        {/* 🔥 NUEVA: Vista de Conversaciones Individuales */}
        {activeView === 'conversations' && (
          <div>
            {/* Navegador de conversaciones */}
            <Card className="mb-6">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">
                Selecciona una Conversación
              </h3>
              <div className="flex flex-wrap gap-2">
                {results.map((result, index) => {
                  const scoreColor = result.analysis.overallScore >= 8 
                    ? 'bg-green-100 border-green-400 text-green-800 dark:bg-green-900/30 dark:border-green-600 dark:text-green-300'
                    : result.analysis.overallScore >= 5
                    ? 'bg-yellow-100 border-yellow-400 text-yellow-800 dark:bg-yellow-900/30 dark:border-yellow-600 dark:text-yellow-300'
                    : 'bg-red-100 border-red-400 text-red-800 dark:bg-red-900/30 dark:border-red-600 dark:text-red-300';
                  
                  const isActive = selectedConversationIndex === index;
                  
                  return (
                    <button
                      key={result.id}
                      onClick={() => setSelectedConversationIndex(index)}
                      className={`px-4 py-3 rounded-lg border-2 transition-all font-medium ${
                        isActive
                          ? 'ring-4 ring-blue-300 dark:ring-blue-700 scale-105'
                          : 'hover:scale-102'
                      } ${scoreColor}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-2xl font-bold">{result.analysis.overallScore.toFixed(1)}</span>
                        <div className="text-left">
                          <div className="text-sm font-semibold">{result.testCase.persona}</div>
                          <div className="text-xs opacity-75">{result.executionTrace.length} turnos</div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </Card>
            
            {/* Detalle de la conversación seleccionada */}
            <ResultCard result={results[selectedConversationIndex]} config={config} />
          </div>
        )}

        {/* 🔥 Vista Detallada (contenido original) */}
        {activeView === 'detailed' && (
          <div>
            <Card className="mb-8">
              <div className="flex flex-col items-center gap-6">

                {/* 📊 Resumen compacto de métricas */}
                <div className="w-full grid grid-cols-3 gap-4">
                    <div className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                        <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{results.length}</p>
                        <p className="text-xs text-gray-600 dark:text-gray-400">Conversaciones Testeadas</p>
                    </div>
                    
                    {config.realDatabaseConfig && (
                        <div className="text-center p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border border-indigo-200 dark:border-indigo-700">
                            <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{databaseStats.totalOperations}</p>
                            <p className="text-xs text-gray-600 dark:text-gray-400">Operaciones en BD</p>
                        </div>
                    )}
                    
                    {databaseStats.discrepancies > 0 && (
                        <div className="text-center p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-700">
                            <p className="text-2xl font-bold text-red-600 dark:text-red-400">{databaseStats.discrepancies}</p>
                            <p className="text-xs text-gray-600 dark:text-gray-400">Errores Críticos</p>
                        </div>
                    )}
                </div>

                {/* 🎭 Agrupación por Sentimiento */}
                <div className="w-full">
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Agrupación por Desempeño</h3>
                  <div className="grid grid-cols-3 gap-3">
                    {/* Positivas (8-10) */}
                    <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-lg p-4 border-2 border-green-300 dark:border-green-700">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-2xl">✅</span>
                        <span className="text-3xl font-bold text-green-600 dark:text-green-400">
                          {results.filter(r => r.analysis.overallScore >= 8).length}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-green-700 dark:text-green-300">Positivas (8-10)</p>
                      <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                        {((results.filter(r => r.analysis.overallScore >= 8).length / results.length) * 100).toFixed(0)}% del total
                      </p>
                    </div>

                    {/* Neutras (5-7.9) */}
                    <div className="bg-gradient-to-br from-yellow-50 to-orange-50 dark:from-yellow-900/20 dark:to-orange-900/20 rounded-lg p-4 border-2 border-yellow-300 dark:border-yellow-700">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-2xl">⚠️</span>
                        <span className="text-3xl font-bold text-yellow-600 dark:text-yellow-400">
                          {results.filter(r => r.analysis.overallScore >= 5 && r.analysis.overallScore < 8).length}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-yellow-700 dark:text-yellow-300">Neutras (5-7.9)</p>
                      <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
                        {((results.filter(r => r.analysis.overallScore >= 5 && r.analysis.overallScore < 8).length / results.length) * 100).toFixed(0)}% del total
                      </p>
                    </div>

                    {/* Negativas (0-4.9) */}
                    <div className="bg-gradient-to-br from-red-50 to-pink-50 dark:from-red-900/20 dark:to-pink-900/20 rounded-lg p-4 border-2 border-red-300 dark:border-red-700">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-2xl">❌</span>
                        <span className="text-3xl font-bold text-red-600 dark:text-red-400">
                          {results.filter(r => r.analysis.overallScore < 5).length}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-red-700 dark:text-red-300">Negativas (0-4.9)</p>
                      <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                        {((results.filter(r => r.analysis.overallScore < 5).length / results.length) * 100).toFixed(0)}% del total
                      </p>
                    </div>
                  </div>
                </div>
            </div>
        </Card>

        {/* 🗄️ Resumen Global de Base de Datos */}
        {config.realDatabaseConfig && databaseStats.conversationsWithActivity > 0 && (
          <Card className="mb-8 border-2 border-indigo-300 dark:border-indigo-700">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-4xl">🗄️</span>
              <div>
                <h3 className="text-2xl font-bold text-gray-800 dark:text-white">Actividad Global de Base de Datos</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Resumen de todas las operaciones en {databaseStats.conversationsWithActivity} de {results.length} conversaciones
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 rounded-lg p-4 text-center border border-indigo-200 dark:border-indigo-700">
                <p className="text-4xl font-bold text-indigo-600 dark:text-indigo-400">{databaseStats.totalOperations}</p>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Operaciones Totales</p>
              </div>
              
              <div className="bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 rounded-lg p-4 text-center border border-blue-200 dark:border-blue-700">
                <p className="text-4xl font-bold text-blue-600 dark:text-blue-400">{databaseStats.reads}</p>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Lecturas</p>
              </div>
              
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-lg p-4 text-center border border-green-200 dark:border-green-700">
                <p className="text-4xl font-bold text-green-600 dark:text-green-400">{databaseStats.writes}</p>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Escrituras</p>
              </div>
              
              <div className="bg-gradient-to-br from-yellow-50 to-orange-50 dark:from-yellow-900/20 dark:to-orange-900/20 rounded-lg p-4 text-center border border-yellow-200 dark:border-yellow-700">
                <p className="text-4xl font-bold text-yellow-600 dark:text-yellow-400">{databaseStats.updates}</p>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Actualizaciones</p>
              </div>
            </div>

            {databaseStats.changes > 0 && (
              <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">📝</span>
                    <span className="font-semibold text-blue-800 dark:text-blue-200">Cambios Detectados</span>
                  </div>
                  <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">{databaseStats.changes}</span>
                </div>
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                  Modificaciones rastreadas en tiempo real durante las conversaciones
                </p>
              </div>
            )}

            {databaseStats.discrepancies > 0 && (
              <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border-2 border-red-300 dark:border-red-700">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">🚨</span>
                    <span className="font-bold text-red-800 dark:text-red-200">Errores Críticos</span>
                  </div>
                  <span className="text-3xl font-bold text-red-600 dark:text-red-400">{databaseStats.discrepancies}</span>
                </div>
                <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                  ⚠️ El bot ofreció información incorrecta que no coincide con la base de datos real
                </p>
              </div>
            )}
          </Card>
        )}

        {/* ⏱️ Resumen de Tiempos */}
        {timeStats.withTiming > 0 && (
          <Card className="mb-8 border-2 border-blue-300 dark:border-blue-700">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-4xl">⏱️</span>
              <div>
                <h3 className="text-2xl font-bold text-gray-800 dark:text-white">Análisis de Tiempos</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Duración de las {timeStats.withTiming} conversaciones
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 rounded-lg p-4 text-center border border-blue-200 dark:border-blue-700">
                <p className="text-4xl font-bold text-blue-600 dark:text-blue-400">{(timeStats.avgDuration / 1000).toFixed(1)}s</p>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Promedio</p>
              </div>
              
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-lg p-4 text-center border border-green-200 dark:border-green-700">
                <p className="text-4xl font-bold text-green-600 dark:text-green-400">{(timeStats.minDuration / 1000).toFixed(1)}s</p>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Más Rápida</p>
              </div>
              
              <div className="bg-gradient-to-br from-orange-50 to-red-50 dark:from-orange-900/20 dark:to-red-900/20 rounded-lg p-4 text-center border border-orange-200 dark:border-orange-700">
                <p className="text-4xl font-bold text-orange-600 dark:text-orange-400">{(timeStats.maxDuration / 1000).toFixed(1)}s</p>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Más Lenta</p>
              </div>
              
              <div className="bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-lg p-4 text-center border border-purple-200 dark:border-purple-700">
                <p className="text-4xl font-bold text-purple-600 dark:text-purple-400">{(timeStats.totalDuration / 1000).toFixed(0)}s</p>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Total Acumulado</p>
              </div>
            </div>

            <div className="mt-4 p-4 bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 rounded-lg border border-blue-200 dark:border-blue-700">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-700 dark:text-gray-300">
                    <span className="font-semibold">⚡ Eficiencia:</span> Las conversaciones se ejecutaron en paralelo
                  </p>
                </div>
                <div>
                  <p className="text-gray-700 dark:text-gray-300">
                    <span className="font-semibold">📊 Tiempo ahorrado:</span>{' '}
                    {((timeStats.totalDuration - timeStats.maxDuration) / 1000).toFixed(0)}s vs secuencial
                  </p>
                </div>
              </div>
            </div>
          </Card>
        )}

          {results.map((result) => (
            <ReportCard key={result.id} result={result} config={config} />
          ))}
          </div>
        )}

        {/* 🔥 Botones de Acción (siempre visibles) */}
        <div className="text-center mt-8 flex flex-col sm:flex-row justify-center items-center gap-4">
          <button
            onClick={onReset}
            className="py-3 px-6 bg-primary-600 text-white font-semibold rounded-lg shadow-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-transform transform hover:scale-105"
          >
            {isHistoryView ? t('backToConfig') : t('runNewAudit')}
          </button>
          <button
            onClick={handleExport}
            className="flex items-center justify-center gap-2 py-3 px-6 bg-green-600 text-white font-semibold rounded-lg shadow-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-transform transform hover:scale-105"
          >
            <DownloadIcon className="w-5 h-5" />
            {t('exportCsv')}
          </button>
        </div>
    </div>
  );
};

export default AuditReport;