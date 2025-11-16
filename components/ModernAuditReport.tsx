/**
 * 🎨 Modern Audit Report - UX CLARA Y FUNCIONAL
 * 
 * Diseño moderno con:
 * - Cards limpias y espaciadas
 * - Jerarquía visual clara
 * - Colores que comunican
 * - Info colapsable para no abrumar
 */

import React, { useState } from 'react';
import type { AuditResult, AuditConfig } from '../types';
import { generatePriceComparison } from '../services/priceExtractor';
import { analyzeDBSemantically, type TableSemanticInfo } from '../services/databaseSemanticAnalyzer';

interface ModernAuditReportProps {
  results: AuditResult[];
  config: AuditConfig;
  onReset: () => void;
}

const ModernAuditReport: React.FC<ModernAuditReportProps> = ({ results, config, onReset }) => {
  const [expandedConv, setExpandedConv] = useState<string | null>(null);

  // Score general
  const avgScore = results.reduce((sum, r) => sum + r.analysis.overallScore, 0) / results.length;
  
  // Colores por score
  const getScoreColor = (score: number) => {
    if (score >= 9) return { bg: 'bg-green-500', text: 'text-green-500', label: 'Excelente' };
    if (score >= 7) return { bg: 'bg-blue-500', text: 'text-blue-500', label: 'Bueno' };
    if (score >= 5) return { bg: 'bg-yellow-500', text: 'text-yellow-500', label: 'Regular' };
    return { bg: 'bg-red-500', text: 'text-red-500', label: 'Malo' };
  };

  const overallColor = getScoreColor(avgScore);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-gray-900 dark:to-gray-950 p-8">
      <div className="max-w-7xl mx-auto">
        
        {/* 🎯 HEADER - Score General */}
        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl p-8 mb-8 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-black text-gray-900 dark:text-white mb-2">
                Reporte de Auditoría
              </h1>
              <p className="text-gray-600 dark:text-gray-400 text-lg">
                {results.length} conversaciones auditadas
              </p>
            </div>
            <div className="text-center">
              <div className={`text-7xl font-black ${overallColor.text} mb-2`}>
                {avgScore.toFixed(1)}
              </div>
              <div className={`${overallColor.bg} text-white px-6 py-2 rounded-full font-bold text-lg`}>
                {overallColor.label}
              </div>
            </div>
          </div>
        </div>

        {/* 🔍 CONVERSACIONES - Una por una */}
        <div className="space-y-6">
          {results.map((result, idx) => {
            const isExpanded = expandedConv === result.id;
            const scoreColor = getScoreColor(result.analysis.overallScore);
            const changes = result.databaseActivity?.changes || [];
            const priceComparison = generatePriceComparison(
              result,
              config.agents?.map(a => ({ name: a.name || 'Agent', prompt: a.systemPrompt || '' })) || []
            );

            return (
              <div 
                key={result.id}
                className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden"
              >
                {/* HEADER de la conversación */}
                <button
                  onClick={() => setExpandedConv(isExpanded ? null : result.id)}
                  className="w-full p-6 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                >
                  <div className="flex items-center gap-4 flex-1 text-left">
                    <div className={`w-16 h-16 rounded-2xl ${scoreColor.bg} flex items-center justify-center text-white text-2xl font-black shadow-lg`}>
                      {result.analysis.overallScore.toFixed(1)}
                    </div>
                    
                    <div className="flex-1">
                      <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
                        {result.testCase.title}
                      </h2>
                      <p className="text-gray-600 dark:text-gray-400">
                        🎯 {result.testCase.conversationGoal}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    {/* Quick stats */}
                    <div className="text-center">
                      <div className="text-3xl font-black text-gray-900 dark:text-white">
                        {changes.length}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 uppercase">
                        Cambios BD
                      </div>
                    </div>

                    <div className="text-3xl text-gray-400">
                      {isExpanded ? '▼' : '▶'}
                    </div>
                  </div>
                </button>

                {/* CONTENIDO EXPANDIDO */}
                {isExpanded && (
                  <div className="border-t-2 border-gray-200 dark:border-gray-700">
                    
                    {/* 📊 Análisis Principal */}
                    <div className="p-6 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20">
                      <div className="flex items-start gap-4">
                        <div className="text-5xl">🧠</div>
                        <div className="flex-1">
                          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3">
                            ¿Hizo lo que prometió?
                          </h3>
                          <div className="text-lg text-gray-700 dark:text-gray-300 leading-relaxed bg-white dark:bg-gray-800 rounded-xl p-4">
                            {result.analysis.summary}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 🗄️ Base de Datos */}
                    {changes.length > 0 && (
                      <div className="p-6 border-t border-gray-200 dark:border-gray-700">
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                          <span>🗄️</span>
                          <span>Cambios en Base de Datos</span>
                        </h3>

                        {/* 🧠 Análisis Semántico */}
                        {(() => {
                          const conversationMessages = result.executionTrace.map(step => ({
                            user: step.input?.message || step.input?.body,
                            bot: step.output?.response || step.output?.message
                          }));
                          
                          const semanticAnalysis = analyzeDBSemantically(
                            changes,
                            result.testCase.conversationGoal,
                            conversationMessages
                          );

                          return (
                            <div className="mb-6 space-y-3">
                              {semanticAnalysis.map((tableInfo, idx) => (
                                <div key={idx} className={`rounded-xl p-4 border-2 ${
                                  tableInfo.analysis.concerns.length > 0
                                    ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-400 dark:border-yellow-700'
                                    : 'bg-green-50 dark:bg-green-900/20 border-green-400 dark:border-green-700'
                                }`}>
                                  <div className="flex items-start gap-3">
                                    <div className="text-3xl">
                                      {tableInfo.analysis.understood ? '🧠' : '📊'}
                                    </div>
                                    <div className="flex-1">
                                      <div className="text-xs font-mono text-gray-600 dark:text-gray-400 mb-1">
                                        {tableInfo.purpose}
                                      </div>
                                      <div className="text-lg font-bold text-gray-900 dark:text-white mb-2">
                                        {tableInfo.table}
                                      </div>
                                      <div className="text-sm text-gray-700 dark:text-gray-300 mb-3">
                                        {tableInfo.analysis.summary}
                                      </div>

                                      {/* Fortalezas */}
                                      {tableInfo.analysis.strengths.length > 0 && (
                                        <div className="space-y-1 mb-2">
                                          {tableInfo.analysis.strengths.map((s, i) => (
                                            <div key={i} className="text-xs text-green-700 dark:text-green-300 flex items-start gap-1">
                                              <span>✅</span>
                                              <span>{s}</span>
                                            </div>
                                          ))}
                                        </div>
                                      )}

                                      {/* Problemas */}
                                      {tableInfo.analysis.concerns.length > 0 && (
                                        <div className="space-y-1 mb-2">
                                          {tableInfo.analysis.concerns.map((c, i) => (
                                            <div key={i} className="text-xs text-yellow-700 dark:text-yellow-300 flex items-start gap-1">
                                              <span>⚠️</span>
                                              <span>{c}</span>
                                            </div>
                                          ))}
                                        </div>
                                      )}

                                      {/* Faltantes */}
                                      {tableInfo.analysis.missing.length > 0 && (
                                        <div className="space-y-1">
                                          {tableInfo.analysis.missing.map((m, i) => (
                                            <div key={i} className="text-xs text-red-700 dark:text-red-300 flex items-start gap-1">
                                              <span>❌</span>
                                              <span>{m}</span>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          );
                        })()}

                        {/* Operaciones técnicas (colapsable) */}
                        <details className="mb-4">
                          <summary className="cursor-pointer text-sm font-bold text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200">
                            📋 Ver operaciones técnicas
                          </summary>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
                          {(() => {
                            const byTable = new Map<string, any[]>();
                            changes.forEach(c => {
                              const existing = byTable.get(c.table) || [];
                              byTable.set(c.table, [...existing, c]);
                            });

                            return Array.from(byTable.entries()).map(([table, tableChanges]) => {
                              const inserts = tableChanges.filter(c => c.type === 'INSERT').length;
                              const updates = tableChanges.filter(c => c.type === 'UPDATE').length;
                              const deletes = tableChanges.filter(c => c.type === 'DELETE').length;

                              return (
                                <div 
                                  key={table}
                                  className="bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-700 dark:to-gray-800 rounded-xl p-5 border-2 border-gray-300 dark:border-gray-600"
                                >
                                  <div className="text-sm font-mono text-gray-500 dark:text-gray-400 mb-2">
                                    TABLA
                                  </div>
                                  <h4 className="text-lg font-black text-gray-900 dark:text-white mb-4 truncate">
                                    {table}
                                  </h4>

                                  <div className="space-y-2">
                                    {inserts > 0 && (
                                      <div className="flex items-center justify-between bg-green-100 dark:bg-green-900/30 rounded-lg px-3 py-2">
                                        <span className="text-sm font-bold text-green-700 dark:text-green-300">
                                          ✅ Agregados
                                        </span>
                                        <span className="text-2xl font-black text-green-600 dark:text-green-400">
                                          {inserts}
                                        </span>
                                      </div>
                                    )}

                                    {updates > 0 && (
                                      <div className="flex items-center justify-between bg-blue-100 dark:bg-blue-900/30 rounded-lg px-3 py-2">
                                        <span className="text-sm font-bold text-blue-700 dark:text-blue-300">
                                          📝 Modificados
                                        </span>
                                        <span className="text-2xl font-black text-blue-600 dark:text-blue-400">
                                          {updates}
                                        </span>
                                      </div>
                                    )}

                                    {deletes > 0 && (
                                      <div className="flex items-center justify-between bg-red-100 dark:bg-red-900/30 rounded-lg px-3 py-2">
                                        <span className="text-sm font-bold text-red-700 dark:text-red-300">
                                          🗑️ Eliminados
                                        </span>
                                        <span className="text-2xl font-black text-red-600 dark:text-red-400">
                                          {deletes}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            });
                          })()}
                        </div>
                        </details>
                      </div>
                    )}

                    {/* 💰 Precios */}
                    {(priceComparison.mentioned.length > 0 || priceComparison.inDB.length > 0 || priceComparison.inPrompt.length > 0) && (
                      <div className="p-6 border-t border-gray-200 dark:border-gray-700 bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-900/20 dark:to-amber-900/20">
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                          <span>💰</span>
                          <span>Análisis de Precios</span>
                        </h3>

                        <div className="grid grid-cols-3 gap-4 mb-4">
                          {/* Conversación */}
                          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border-2 border-blue-300 dark:border-blue-700">
                            <div className="text-xs font-bold text-blue-600 dark:text-blue-400 mb-3 uppercase">
                              💬 Le dijo al cliente
                            </div>
                            {priceComparison.mentioned.length > 0 ? (
                              <div className="space-y-2">
                                {priceComparison.mentioned.map((p, i) => (
                                  <div key={i} className="text-2xl font-black text-blue-600 dark:text-blue-400">
                                    ${p.value}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="text-sm text-gray-400">Sin precios</div>
                            )}
                          </div>

                          {/* BD */}
                          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border-2 border-purple-300 dark:border-purple-700">
                            <div className="text-xs font-bold text-purple-600 dark:text-purple-400 mb-3 uppercase">
                              🗄️ Guardó en BD
                            </div>
                            {priceComparison.inDB.length > 0 ? (
                              <div className="space-y-2">
                                {priceComparison.inDB.map((p, i) => (
                                  <div key={i} className="text-2xl font-black text-purple-600 dark:text-purple-400">
                                    ${p.value}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="text-sm text-gray-400">Sin precios</div>
                            )}
                          </div>

                          {/* Prompt */}
                          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border-2 border-amber-300 dark:border-amber-700">
                            <div className="text-xs font-bold text-amber-600 dark:text-amber-400 mb-3 uppercase">
                              📋 En su configuración
                            </div>
                            {priceComparison.inPrompt.length > 0 ? (
                              <div className="space-y-2">
                                {priceComparison.inPrompt.map((p, i) => (
                                  <div key={i} className="text-2xl font-black text-amber-600 dark:text-amber-400">
                                    ${p.value}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="text-sm text-gray-400">Sin precios</div>
                            )}
                          </div>
                        </div>

                        {/* Verificación */}
                        {!priceComparison.consistent && priceComparison.discrepancies.length > 0 && (
                          <div className="bg-red-100 dark:bg-red-900/30 border-2 border-red-400 dark:border-red-700 rounded-xl p-4">
                            <div className="flex items-center gap-2 text-red-700 dark:text-red-300 font-bold mb-2">
                              <span className="text-2xl">⚠️</span>
                              <span>Problemas detectados:</span>
                            </div>
                            <ul className="space-y-1 text-sm text-red-600 dark:text-red-400">
                              {priceComparison.discrepancies.map((d, i) => (
                                <li key={i}>• {d}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {priceComparison.consistent && (
                          <div className="bg-green-100 dark:bg-green-900/30 border-2 border-green-400 dark:border-green-700 rounded-xl p-4 flex items-center gap-3">
                            <span className="text-3xl">✅</span>
                            <span className="text-green-700 dark:text-green-300 font-bold">
                              Todos los precios coinciden correctamente
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* 💬 Conversación completa */}
                    <details className="border-t border-gray-200 dark:border-gray-700">
                      <summary className="p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 font-bold text-gray-700 dark:text-gray-300">
                        💬 Ver conversación completa ({result.executionTrace.length} mensajes)
                      </summary>
                      <div className="p-6 bg-gray-50 dark:bg-gray-900/50 space-y-4 max-h-96 overflow-y-auto">
                        {result.executionTrace.map((step, i) => (
                          <div key={i} className="space-y-2">
                            {/* Usuario */}
                            {step.input?.message && (
                              <div className="flex justify-end">
                                <div className="bg-blue-500 text-white rounded-2xl rounded-tr-sm px-4 py-2 max-w-md">
                                  {step.input.message}
                                </div>
                              </div>
                            )}
                            
                            {/* Bot */}
                            {step.output?.response && (
                              <div className="flex justify-start">
                                <div className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-2xl rounded-tl-sm px-4 py-2 max-w-md border border-gray-300 dark:border-gray-600">
                                  {step.output.response}
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </details>

                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="mt-8 text-center">
          <button
            onClick={onReset}
            className="px-8 py-3 bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-900 rounded-xl font-bold hover:bg-gray-700 dark:hover:bg-gray-300 transition-colors"
          >
            Nueva Auditoría
          </button>
        </div>

      </div>
    </div>
  );
};

export default ModernAuditReport;

