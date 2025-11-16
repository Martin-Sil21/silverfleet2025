/**
 * 📊 Clean Executive Report
 * 
 * Reporte limpio, legible y enfocado en DATOS CONCRETOS
 * - Base de datos: ANTES/DESPUÉS con valores específicos
 * - Precios: Comparación detallada (mencionado vs BD vs prompt)
 * - Discrepancias: Evidencia clara y específica
 * - Análisis IA: OPCIONAL y colapsable
 */

import React, { useState, useMemo } from 'react';
import type { AuditResult, AuditConfig, DatabaseChange, DatabaseDiscrepancy } from '../types';
import { ChevronDownIcon } from './icons/ChevronDownIcon';
import { ChevronRightIcon } from './icons/ChevronRightIcon';

interface CleanExecutiveReportProps {
  results: AuditResult[];
  config: AuditConfig;
  onReset: () => void;
}

const CleanExecutiveReport: React.FC<CleanExecutiveReportProps> = ({ results, config, onReset }) => {
  const [expandedConversations, setExpandedConversations] = useState<Set<string>>(new Set());
  const [showAIAnalysis, setShowAIAnalysis] = useState(false);

  const toggleConversation = (id: string) => {
    const newSet = new Set(expandedConversations);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setExpandedConversations(newSet);
  };

  // Calcular estadísticas generales
  const stats = useMemo(() => {
    const totalScore = results.reduce((sum, r) => sum + r.analysis.overallScore, 0);
    const avgScore = totalScore / results.length;
    
    const passed = results.filter(r => r.analysis.overallScore >= 7).length;
    const warning = results.filter(r => r.analysis.overallScore >= 5 && r.analysis.overallScore < 7).length;
    const failed = results.filter(r => r.analysis.overallScore < 5).length;
    
    // Cambios en BD
    const allChanges: DatabaseChange[] = [];
    results.forEach(r => {
      if (r.databaseActivity?.changes) {
        allChanges.push(...r.databaseActivity.changes);
      }
    });
    
    // Discrepancias críticas
    const criticalDiscrepancies: (DatabaseDiscrepancy & { conversationTitle: string })[] = [];
    results.forEach(r => {
      if (r.databaseActivity?.discrepancies) {
        r.databaseActivity.discrepancies
          .filter(d => d.severity === 'critical')
          .forEach(d => {
            criticalDiscrepancies.push({ ...d, conversationTitle: r.testCase.title });
          });
      }
    });
    
    return { 
      avgScore, 
      passed, 
      warning, 
      failed, 
      totalChanges: allChanges.length,
      criticalDiscrepancies,
      allChanges 
    };
  }, [results]);

  const getScoreColor = (score: number) => {
    if (score >= 8) return 'text-green-600 bg-green-100 border-green-300';
    if (score >= 5) return 'text-orange-600 bg-orange-100 border-orange-300';
    return 'text-red-600 bg-red-100 border-red-300';
  };

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* HEADER */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              Reporte de Auditoría
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              {results.length} conversaciones analizadas
            </p>
          </div>
          <button
            onClick={onReset}
            className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600"
          >
            Nueva Auditoría
          </button>
        </div>

        {/* Score Overview */}
        <div className="grid grid-cols-4 gap-4 mt-6">
          <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
            <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">
              {stats.avgScore.toFixed(1)}/10
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">Score Promedio</div>
          </div>
          
          <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
            <div className="text-3xl font-bold text-green-600 dark:text-green-400">
              {stats.passed}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">Aprobadas (≥7)</div>
          </div>
          
          <div className="bg-orange-50 dark:bg-orange-900/20 p-4 rounded-lg">
            <div className="text-3xl font-bold text-orange-600 dark:text-orange-400">
              {stats.warning}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">Con Alertas (5-7)</div>
          </div>
          
          <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg">
            <div className="text-3xl font-bold text-red-600 dark:text-red-400">
              {stats.failed}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">Fallidas (&lt;5)</div>
          </div>
        </div>
      </div>

      {/* DISCREPANCIAS CRÍTICAS */}
      {stats.criticalDiscrepancies.length > 0 && (
        <div className="bg-red-50 dark:bg-red-900/20 border-2 border-red-300 dark:border-red-700 rounded-lg p-6">
          <h2 className="text-xl font-bold text-red-800 dark:text-red-200 mb-4 flex items-center gap-2">
            <span>🚨</span>
            <span>Discrepancias Críticas ({stats.criticalDiscrepancies.length})</span>
          </h2>
          
          <div className="space-y-4">
            {stats.criticalDiscrepancies.map((disc, idx) => (
              <div key={idx} className="bg-white dark:bg-gray-800 rounded-lg p-4 border-l-4 border-red-500">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-semibold text-gray-900 dark:text-white">
                    {disc.conversationTitle}
                  </h3>
                  <span className="px-2 py-1 bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200 text-xs rounded">
                    {disc.type}
                  </span>
                </div>
                
                <p className="text-gray-700 dark:text-gray-300 mb-3">
                  {disc.description}
                </p>
                
                {disc.table && (
                  <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                    📋 Tabla: <span className="font-mono">{disc.table}</span>
                  </div>
                )}
                
                {(disc.expected || disc.actual) && (
                  <div className="grid grid-cols-2 gap-4 mt-3 p-3 bg-gray-50 dark:bg-gray-900 rounded">
                    {disc.expected && (
                      <div>
                        <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                          ESPERADO:
                        </div>
                        <pre className="text-xs text-gray-800 dark:text-gray-200 font-mono">
                          {JSON.stringify(disc.expected, null, 2)}
                        </pre>
                      </div>
                    )}
                    
                    {disc.actual && (
                      <div>
                        <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                          REAL:
                        </div>
                        <pre className="text-xs text-gray-800 dark:text-gray-200 font-mono">
                          {JSON.stringify(disc.actual, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ANÁLISIS DE PRECIOS */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <span>💰</span>
          <span>Análisis de Precios</span>
        </h2>
        
        {/* Buscar menciones de precios en las conversaciones */}
        {results.map((result) => {
          const priceMatches: { conversation: string; mentioned: string[]; inDB: string[]; inPrompt: string[] } = {
            conversation: result.testCase.title,
            mentioned: [],
            inDB: [],
            inPrompt: []
          };

          // Buscar precios mencionados en la conversación
          result.executionTrace.forEach(step => {
            const botMessage = step.output?.response || step.output?.message || '';
            const priceRegex = /\$\s*(\d+(?:[.,]\d{3})*(?:[.,]\d{2})?)/g;
            let match;
            while ((match = priceRegex.exec(botMessage)) !== null) {
              priceMatches.mentioned.push(match[1]);
            }
          });

          // Buscar precios en cambios de BD
          if (result.databaseActivity?.changes) {
            result.databaseActivity.changes.forEach(change => {
              const record = change.record || change.after || {};
              ['precio', 'price', 'monto', 'amount', 'total'].forEach(field => {
                if (record[field]) {
                  priceMatches.inDB.push(String(record[field]));
                }
              });
            });
          }

          // Buscar precios en el system prompt
          config.workflow?.forEach(node => {
            if (node.systemPrompt) {
              const priceRegex = /\$\s*(\d+(?:[.,]\d{3})*(?:[.,]\d{2})?)/g;
              let match;
              while ((match = priceRegex.exec(node.systemPrompt)) !== null) {
                priceMatches.inPrompt.push(match[1]);
              }
            }
          });

          const hasPrices = priceMatches.mentioned.length > 0 || 
                           priceMatches.inDB.length > 0 || 
                           priceMatches.inPrompt.length > 0;

          if (!hasPrices) return null;

          return (
            <div key={result.id} className="border border-gray-300 dark:border-gray-600 rounded-lg p-4 mb-4">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-3">
                {result.testCase.title}
              </h3>
              
              <div className="grid grid-cols-3 gap-4">
                {/* Mencionado en conversación */}
                <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded">
                  <div className="text-xs font-semibold text-blue-600 dark:text-blue-400 mb-2">
                    💬 MENCIONADO EN CONVERSACIÓN:
                  </div>
                  {priceMatches.mentioned.length > 0 ? (
                    <ul className="space-y-1">
                      {[...new Set(priceMatches.mentioned)].map((price, idx) => (
                        <li key={idx} className="text-sm font-mono text-gray-800 dark:text-gray-200">
                          ${price}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-gray-500">Sin precios</p>
                  )}
                </div>

                {/* En Base de Datos */}
                <div className="bg-purple-50 dark:bg-purple-900/20 p-3 rounded">
                  <div className="text-xs font-semibold text-purple-600 dark:text-purple-400 mb-2">
                    🗄️ EN BASE DE DATOS:
                  </div>
                  {priceMatches.inDB.length > 0 ? (
                    <ul className="space-y-1">
                      {[...new Set(priceMatches.inDB)].map((price, idx) => (
                        <li key={idx} className="text-sm font-mono text-gray-800 dark:text-gray-200">
                          ${price}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-gray-500">Sin precios</p>
                  )}
                </div>

                {/* En System Prompt */}
                <div className="bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded">
                  <div className="text-xs font-semibold text-yellow-600 dark:text-yellow-400 mb-2">
                    📋 EN SYSTEM PROMPT:
                  </div>
                  {priceMatches.inPrompt.length > 0 ? (
                    <ul className="space-y-1">
                      {[...new Set(priceMatches.inPrompt)].map((price, idx) => (
                        <li key={idx} className="text-sm font-mono text-gray-800 dark:text-gray-200">
                          ${price}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-gray-500">Sin precios</p>
                  )}
                </div>
              </div>

              {/* Verificación de consistencia */}
              {priceMatches.mentioned.length > 0 && priceMatches.inDB.length > 0 && (
                <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-900 rounded">
                  {priceMatches.mentioned.some(m => priceMatches.inDB.includes(m)) ? (
                    <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
                      <span>✅</span>
                      <span className="text-sm font-semibold">Precios consistentes entre conversación y BD</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
                      <span>⚠️</span>
                      <span className="text-sm font-semibold">DISCREPANCIA: Precios diferentes en conversación vs BD</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* CAMBIOS EN BASE DE DATOS */}
      {stats.allChanges.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <span>🗄️</span>
            <span>Actividad en Base de Datos ({stats.allChanges.length} operaciones)</span>
          </h2>
          
          <div className="space-y-3">
            {stats.allChanges.map((change, idx) => (
              <div key={idx} className="border border-gray-300 dark:border-gray-600 rounded-lg p-4">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-2">
                    <span className={`px-3 py-1 rounded text-sm font-semibold ${
                      change.type === 'INSERT' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' :
                      change.type === 'UPDATE' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' :
                      'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                    }`}>
                      {change.type}
                    </span>
                    <span className="font-mono text-sm text-gray-700 dark:text-gray-300">
                      {change.table}
                    </span>
                  </div>
                  <span className="text-xs text-gray-500">
                    {new Date(change.timestamp).toLocaleTimeString()}
                  </span>
                </div>

                {/* ANTES / DESPUÉS para UPDATE */}
                {change.type === 'UPDATE' && (change.before || change.after) && (
                  <div className="grid grid-cols-2 gap-4 p-3 bg-gray-50 dark:bg-gray-900 rounded">
                    <div>
                      <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">
                        ⬅️ ANTES:
                      </div>
                      <pre className="text-xs text-gray-800 dark:text-gray-200 font-mono overflow-x-auto">
                        {JSON.stringify(change.before, null, 2)}
                      </pre>
                    </div>
                    
                    <div>
                      <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">
                        ➡️ DESPUÉS:
                      </div>
                      <pre className="text-xs text-gray-800 dark:text-gray-200 font-mono overflow-x-auto">
                        {JSON.stringify(change.after, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}

                {/* REGISTRO INSERTADO/ELIMINADO */}
                {(change.type === 'INSERT' || change.type === 'DELETE') && change.record && (
                  <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded">
                    <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">
                      {change.type === 'INSERT' ? '➕ REGISTRO INSERTADO:' : '➖ REGISTRO ELIMINADO:'}
                    </div>
                    <pre className="text-xs text-gray-800 dark:text-gray-200 font-mono overflow-x-auto">
                      {JSON.stringify(change.record, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CONVERSACIONES INDIVIDUALES */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
          💬 Conversaciones Detalladas
        </h2>
        
        <div className="space-y-3">
          {results.map((result) => {
            const isExpanded = expandedConversations.has(result.id);
            const scoreColor = getScoreColor(result.analysis.overallScore);

            return (
              <div key={result.id} className="border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
                {/* Header colapsable */}
                <button
                  onClick={() => toggleConversation(result.id)}
                  className="w-full p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? (
                      <ChevronDownIcon className="w-5 h-5 text-gray-500" />
                    ) : (
                      <ChevronRightIcon className="w-5 h-5 text-gray-500" />
                    )}
                    <div className="text-left">
                      <h3 className="font-semibold text-gray-900 dark:text-white">
                        {result.testCase.title}
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {result.testCase.conversationGoal}
                      </p>
                    </div>
                  </div>
                  
                  <div className={`px-4 py-2 rounded-lg font-bold ${scoreColor}`}>
                    {result.analysis.overallScore.toFixed(1)}/10
                  </div>
                </button>

                {/* Contenido expandible */}
                {isExpanded && (
                  <div className="border-t border-gray-300 dark:border-gray-600 p-4 space-y-4 bg-gray-50 dark:bg-gray-900">
                    {/* Resumen del análisis */}
                    <div>
                      <h4 className="font-semibold text-gray-800 dark:text-gray-200 mb-2">
                        📝 Resumen
                      </h4>
                      <p className="text-gray-700 dark:text-gray-300">
                        {result.analysis.summary}
                      </p>
                    </div>

                    {/* Conversación */}
                    <div>
                      <h4 className="font-semibold text-gray-800 dark:text-gray-200 mb-2">
                        💬 Conversación
                      </h4>
                      <div className="space-y-2">
                        {result.executionTrace.map((step, idx) => {
                          const userMessage = step.input?.message || step.input?.body;
                          const botMessage = step.output?.response || step.output?.message || 
                                            (typeof step.output === 'string' ? step.output : '');

                          return (
                            <div key={idx} className="space-y-2">
                              {userMessage && (
                                <div className="bg-blue-100 dark:bg-blue-900/40 p-3 rounded-lg">
                                  <div className="text-xs text-blue-600 dark:text-blue-400 font-semibold mb-1">
                                    👤 Usuario:
                                  </div>
                                  <p className="text-gray-800 dark:text-gray-200">{userMessage}</p>
                                </div>
                              )}
                              
                              {botMessage && (
                                <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded-lg">
                                  <div className="text-xs text-gray-600 dark:text-gray-400 font-semibold mb-1">
                                    🤖 Bot:
                                  </div>
                                  <p className="text-gray-800 dark:text-gray-200">{botMessage}</p>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Cambios en BD de esta conversación */}
                    {result.databaseActivity?.changes && result.databaseActivity.changes.length > 0 && (
                      <div>
                        <h4 className="font-semibold text-gray-800 dark:text-gray-200 mb-2">
                          🗄️ Cambios en BD ({result.databaseActivity.changes.length})
                        </h4>
                        <div className="space-y-2">
                          {result.databaseActivity.changes.map((change, idx) => (
                            <div key={idx} className="text-sm bg-white dark:bg-gray-800 p-2 rounded border border-gray-300 dark:border-gray-600">
                              <span className="font-semibold">{change.type}</span> en <span className="font-mono">{change.table}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ANÁLISIS IA (OPCIONAL - COLAPSABLE) */}
      <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4">
        <button
          onClick={() => setShowAIAnalysis(!showAIAnalysis)}
          className="w-full flex items-center justify-between text-left"
        >
          <div className="flex items-center gap-2">
            {showAIAnalysis ? (
              <ChevronDownIcon className="w-5 h-5 text-gray-500" />
            ) : (
              <ChevronRightIcon className="w-5 h-5 text-gray-500" />
            )}
            <span className="font-semibold text-gray-800 dark:text-gray-200">
              🤖 Análisis IA Detallado (opcional)
            </span>
          </div>
          <span className="text-xs text-gray-500">Click para {showAIAnalysis ? 'ocultar' : 'mostrar'}</span>
        </button>

        {showAIAnalysis && (
          <div className="mt-4 space-y-4">
            {results.map((result) => (
              <div key={result.id} className="bg-white dark:bg-gray-900 p-4 rounded-lg">
                <h4 className="font-semibold text-gray-800 dark:text-gray-200 mb-2">
                  {result.testCase.title}
                </h4>
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <div dangerouslySetInnerHTML={{ __html: result.analysis.detailedReport || '' }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default CleanExecutiveReport;

