
import React, { useState, useMemo } from 'react';
import type { AuditResult, AuditConfig } from '../types';
import { getCostSummary } from '../services/geminiService';

interface ExecutiveReportProps {
  results: AuditResult[];
  config: AuditConfig;
  onReset: () => void;
  onReaudit: (config: AuditConfig) => void;
}

// Helper para obtener color según score
const getScoreColor = (score: number) => {
  if (score >= 8) return { bg: 'bg-green-50 dark:bg-green-900/20', text: 'text-green-800 dark:text-green-200', badge: 'bg-green-500', border: 'border-green-300 dark:border-green-700' };
  if (score >= 5) return { bg: 'bg-orange-50 dark:bg-orange-900/20', text: 'text-orange-800 dark:text-orange-200', badge: 'bg-orange-500', border: 'border-orange-300 dark:border-orange-700' };
  return { bg: 'bg-red-50 dark:bg-red-900/20', text: 'text-red-800 dark:text-red-200', badge: 'bg-red-500', border: 'border-red-300 dark:border-red-700' };
};

// Helper para obtener emoji según score
const getScoreEmoji = (score: number) => {
  if (score >= 9) return '🎉';
  if (score >= 7) return '✅';
  if (score >= 5) return '⚠️';
  return '❌';
};

const ExecutiveReport: React.FC<ExecutiveReportProps> = ({ results, config, onReset, onReaudit }) => {
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  const toggleCard = (id: string) => {
    const newSet = new Set(expandedCards);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setExpandedCards(newSet);
  };

  // Calcular estadísticas generales
  const stats = useMemo(() => {
    const totalScore = results.reduce((sum, r) => sum + r.analysis.overallScore, 0);
    const avgScore = totalScore / results.length;
    
    const passed = results.filter(r => r.analysis.overallScore >= 7).length;
    const warning = results.filter(r => r.analysis.overallScore >= 5 && r.analysis.overallScore < 7).length;
    const failed = results.filter(r => r.analysis.overallScore < 5).length;
    
    const totalDbErrors = results.reduce((sum, r) => 
      (r.databaseActivity?.discrepancies?.filter(d => d.severity === 'critical').length || 0) + sum, 0
    );
    
    const totalDbChanges = results.reduce((sum, r) => 
      (r.databaseActivity?.changes?.length || 0) + sum, 0
    );
    
    // 🗄️ Total de OPERACIONES (lecturas + escrituras + actualizaciones + eliminaciones)
    const totalDbOperations = results.reduce((sum, r) => 
      (r.databaseActivity?.totalOperations || 0) + sum, 0
    );
    
    return { avgScore, passed, warning, failed, totalDbErrors, totalDbChanges, totalDbOperations };
  }, [results]);

  const colors = getScoreColor(stats.avgScore);
  
  // Obtener resumen de costos
  const costSummary = useMemo(() => {
    try {
      return getCostSummary();
    } catch (e) {
      return null; // Si no hay datos de costos, no mostrar sección
    }
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 p-6">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            📊 Reporte de Auditoría
          </h1>
          <div className="flex gap-3">
            <button
              onClick={() => onReaudit(config)}
              className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium flex items-center gap-2"
            >
              🔄 Re-auditar
            </button>
            <button
              onClick={onReset}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              ← Nueva Auditoría
            </button>
          </div>
        </div>

        {/* Resumen Ejecutivo */}
        <div className={`bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-lg border-4 ${colors.border}`}>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {/* Score General */}
            <div className="text-center">
              <div className="text-6xl font-bold ${colors.text} mb-2">
                {stats.avgScore.toFixed(1)}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400 font-medium">
                Puntuación Promedio
              </div>
            </div>

            {/* Conversaciones */}
            <div className="text-center">
              <div className="text-4xl font-bold text-gray-700 dark:text-gray-300 mb-2">
                {results.length}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400 font-medium">
                Conversaciones Testeadas
              </div>
              <div className="flex justify-center gap-2 mt-2">
                <span className="px-2 py-1 bg-green-500 text-white text-xs rounded-full">{stats.passed} ✅</span>
                <span className="px-2 py-1 bg-yellow-500 text-white text-xs rounded-full">{stats.warning} ⚠️</span>
                <span className="px-2 py-1 bg-red-500 text-white text-xs rounded-full">{stats.failed} ❌</span>
              </div>
            </div>

            {/* Base de Datos */}
            <div className="text-center">
              <div className="text-4xl font-bold text-purple-600 dark:text-purple-400 mb-2">
                {stats.totalDbOperations}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400 font-medium">
                Operaciones en BD
              </div>
              {stats.totalDbChanges > 0 && (
                <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                  ({stats.totalDbChanges} cambios detectados)
                </div>
              )}
            </div>

            {/* Errores Críticos */}
            <div className="text-center">
              <div className={`text-4xl font-bold mb-2 ${stats.totalDbErrors > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {stats.totalDbErrors}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400 font-medium">
                Errores Críticos
              </div>
            </div>
          </div>

          {/* 🎭 Agrupación por Sentimiento */}
          <div className="mt-6 pt-6 border-t-2 border-gray-200 dark:border-gray-700">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Distribución por Desempeño</h3>
            <div className="grid grid-cols-3 gap-4">
              {/* Positivas */}
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-lg p-4 border-2 border-green-300 dark:border-green-700">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-3xl">✅</span>
                  <div>
                    <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                      {stats.passed}
                    </div>
                    <div className="text-xs text-green-600 dark:text-green-400">
                      {((stats.passed / results.length) * 100).toFixed(0)}%
                    </div>
                  </div>
                </div>
                <p className="text-sm font-semibold text-green-700 dark:text-green-300">Positivas (8-10)</p>
              </div>

              {/* Neutras */}
              <div className="bg-gradient-to-br from-yellow-50 to-orange-50 dark:from-yellow-900/20 dark:to-orange-900/20 rounded-lg p-4 border-2 border-yellow-300 dark:border-yellow-700">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-3xl">⚠️</span>
                  <div>
                    <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                      {stats.warning}
                    </div>
                    <div className="text-xs text-yellow-600 dark:text-yellow-400">
                      {((stats.warning / results.length) * 100).toFixed(0)}%
                    </div>
                  </div>
                </div>
                <p className="text-sm font-semibold text-yellow-700 dark:text-yellow-300">Neutras (5-7.9)</p>
              </div>

              {/* Negativas */}
              <div className="bg-gradient-to-br from-red-50 to-pink-50 dark:from-red-900/20 dark:to-pink-900/20 rounded-lg p-4 border-2 border-red-300 dark:border-red-700">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-3xl">❌</span>
                  <div>
                    <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                      {stats.failed}
                    </div>
                    <div className="text-xs text-red-600 dark:text-red-400">
                      {((stats.failed / results.length) * 100).toFixed(0)}%
                    </div>
                  </div>
                </div>
                <p className="text-sm font-semibold text-red-700 dark:text-red-300">Negativas (0-4.9)</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 💰 Resumen de Costos */}
      {costSummary && costSummary.totalCostUSD > 0 && (
        <div className="max-w-7xl mx-auto mb-8">
          <div className="bg-gradient-to-r from-yellow-50 to-yellow-100 dark:from-yellow-900/20 dark:to-yellow-800/20 rounded-2xl p-6 shadow-lg border-2 border-yellow-300 dark:border-yellow-700">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-3xl">💰</span>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Resumen de Costos API</h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              {/* Costo Total */}
              <div className="bg-white dark:bg-gray-800 rounded-lg p-4 text-center border-2 border-green-300 dark:border-green-700">
                <div className="text-3xl font-bold text-green-600 dark:text-green-400 mb-1">
                  ${costSummary.totalCostUSD.toFixed(6)}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400 font-medium">
                  💰 Costo Total USD
                </div>
              </div>

              {/* Costo Sistema */}
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 text-center border-2 border-blue-300 dark:border-blue-700">
                <div className="text-2xl font-bold text-blue-600 dark:text-blue-400 mb-1">
                  ${costSummary.systemCostUSD.toFixed(6)}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400 font-medium">
                  🤖 Sistema (Nuestro)
                </div>
              </div>

              {/* Costo Webhook Usuario */}
              <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4 text-center border-2 border-purple-300 dark:border-purple-700">
                <div className="text-2xl font-bold text-purple-600 dark:text-purple-400 mb-1">
                  ${costSummary.webhookCostUSD.toFixed(6)}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400 font-medium">
                  💵 Webhook (Usuario)
                </div>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Tokens Totales */}
              <div className="bg-white dark:bg-gray-800 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-blue-600 dark:text-blue-400 mb-1">
                  {costSummary.totalTokens.toLocaleString()}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400 font-medium">
                  Tokens Totales
                </div>
              </div>

              {/* Input Tokens */}
              <div className="bg-white dark:bg-gray-800 rounded-lg p-4 text-center">
                <div className="text-xl font-bold text-purple-600 dark:text-purple-400 mb-1">
                  {costSummary.promptTokens.toLocaleString()}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400 font-medium">
                  Tokens Input
                </div>
              </div>

              {/* Output Tokens */}
              <div className="bg-white dark:bg-gray-800 rounded-lg p-4 text-center">
                <div className="text-xl font-bold text-orange-600 dark:text-orange-400 mb-1">
                  {costSummary.responseTokens.toLocaleString()}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400 font-medium">
                  Tokens Output
                </div>
              </div>
            </div>

            {/* Desglose por operación */}
            <details className="mt-4">
              <summary className="cursor-pointer text-sm font-semibold text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition">
                📊 Ver desglose detallado por operación
              </summary>
              <div className="mt-3 space-y-2">
                {Object.entries(costSummary.operations).map(([operation, data]) => (
                  <div key={operation} className="bg-white dark:bg-gray-800 rounded-lg p-3 flex items-center justify-between">
                    <div>
                      <span className="font-mono text-sm text-gray-700 dark:text-gray-300">{operation}</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">({data.count} llamadas)</span>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold text-gray-900 dark:text-white">
                        ${data.cost.toFixed(6)}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {data.tokens.toLocaleString()} tokens
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </details>
          </div>
        </div>
      )}

      {/* Lista de Conversaciones */}
      <div className="max-w-7xl mx-auto space-y-4">
        {results.map((result, idx) => {
          const isExpanded = expandedCards.has(result.id);
          const cardColors = getScoreColor(result.analysis.overallScore);
          const hasDbErrors = (result.databaseActivity?.discrepancies?.length || 0) > 0;
          const criticalErrors = result.databaseActivity?.discrepancies?.filter(d => d.severity === 'critical') || [];

          return (
            <div
              key={result.id}
              className="bg-white dark:bg-gray-800 rounded-xl shadow-md hover:shadow-lg transition-all overflow-hidden border border-gray-200 dark:border-gray-700"
            >
              {/* Header Colapsable */}
              <button
                onClick={() => toggleCard(result.id)}
                className="w-full p-6 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors"
              >
                <div className="flex items-center gap-4 flex-1">
                  {/* Score Badge */}
                  <div className={`w-20 h-20 rounded-full ${cardColors.bg} ${cardColors.text} flex flex-col items-center justify-center font-bold shadow-md`}>
                    <div className="text-3xl">{getScoreEmoji(result.analysis.overallScore)}</div>
                    <div className="text-xl">{result.analysis.overallScore.toFixed(1)}</div>
                  </div>

                  {/* Info */}
                  <div className="flex-1 text-left">
                    <div className="flex items-center gap-2">
                      <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                        {result.testCase.title}
                      </h3>
                      {hasDbErrors && (
                        <span className="px-3 py-1 bg-red-500 text-white text-xs font-bold rounded-full animate-pulse">
                          {criticalErrors.length} ERROR{criticalErrors.length > 1 ? 'ES' : ''}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">
                      {result.analysis.summary.split('\n\n')[0]}
                    </p>
                    <div className="flex gap-2 mt-2 flex-wrap">
                      <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs rounded">
                        📱 {result.testCase.initialPayload?.telefono || 'N/A'}
                      </span>
                      <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-xs rounded">
                        💬 {result.executionTrace.length} turnos
                      </span>
                      {result.databaseActivity && (
                        <span className="px-2 py-1 bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 text-xs rounded">
                          🗄️ {result.databaseActivity.changes?.length || 0} cambios BD
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Flecha */}
                <div className={`transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                  <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {/* Contenido Expandido */}
              <div className={`border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 transition-all duration-300 ease-in-out overflow-hidden ${
                isExpanded ? 'max-h-[2000px] opacity-100 p-6' : 'max-h-0 opacity-0 p-0'
              }`}>
                  {/* Resumen Completo */}
                  <div className="mb-6">
                    <h4 className="font-bold text-lg mb-2 text-gray-900 dark:text-white">📝 Resumen</h4>
                    <div className="bg-white dark:bg-gray-800 p-4 rounded-lg whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">
                      {result.analysis.summary}
                    </div>
                  </div>

                  {/* 🎯 NUEVO: Verificación Administrativa - Lenguaje Claro */}
                  {result.databaseActivity && (result.databaseActivity.changes?.length > 0 || result.databaseActivity.discrepancies?.length > 0) && (
                    <div className="mb-6 p-5 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl border-2 border-blue-400 dark:border-blue-600 shadow-lg">
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
                        
                        {/* 📊 Resumen de Inserciones */}
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
                        
                        {/* ✅ Todo OK */}
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

                  {/* Errores Críticos de BD */}
                  {hasDbErrors && criticalErrors.length > 0 && (
                    <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 rounded-lg">
                      <h4 className="font-bold text-lg mb-3 text-red-700 dark:text-red-400 flex items-center gap-2">
                        🚨 Errores Críticos de Base de Datos ({criticalErrors.length})
                      </h4>
                      <div className="space-y-3">
                        {criticalErrors.map((disc, idx) => (
                          <div key={idx} className="bg-white dark:bg-gray-800 p-4 rounded-lg">
                            <div className="flex items-start gap-3">
                              <span className="text-2xl">❌</span>
                              <div className="flex-1">
                                <p className="font-semibold text-gray-900 dark:text-white mb-2">
                                  {disc.description}
                                </p>
                                {disc.type === 'incorrect_data' && disc.expected && disc.actual !== undefined && (
                                  <div className="grid grid-cols-2 gap-3 mt-2">
                                    <div className="bg-red-100 dark:bg-red-900/30 p-3 rounded">
                                      <div className="text-xs text-red-600 dark:text-red-400 font-semibold mb-1">
                                        BOT DIJO:
                                      </div>
                                      <div className="text-lg font-bold text-red-700 dark:text-red-300">
                                        ${typeof disc.expected === 'number' ? disc.expected.toLocaleString() : disc.expected}
                                      </div>
                                    </div>
                                    <div className="bg-green-100 dark:bg-green-900/30 p-3 rounded">
                                      <div className="text-xs text-green-600 dark:text-green-400 font-semibold mb-1">
                                        BD REAL:
                                      </div>
                                      <div className="text-lg font-bold text-green-700 dark:text-green-300">
                                        ${typeof disc.actual === 'number' ? disc.actual.toLocaleString() : disc.actual}
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Criterios */}
                  <div className="mb-6">
                    <h4 className="font-bold text-lg mb-3 text-gray-900 dark:text-white">📊 Desglose por Criterios</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {result.analysis.criteriaBreakdown.map((criterion, idx) => {
                        const criterionColors = getScoreColor(criterion.score);
                        return (
                          <div key={idx} className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-semibold text-gray-900 dark:text-white">{criterion.criterion}</span>
                              <span className={`px-3 py-1 ${criterionColors.bg} ${criterionColors.text} font-bold rounded-full`}>
                                {criterion.score.toFixed(1)}
                              </span>
                            </div>
                            <p className="text-sm text-gray-600 dark:text-gray-400">{criterion.justification}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Actividad de BD */}
                  {result.databaseActivity && (
                    <details className="mb-4">
                      <summary className="font-bold text-lg mb-3 text-gray-900 dark:text-white cursor-pointer hover:text-blue-600">
                        🗄️ Actividad de Base de Datos (click para ver detalles)
                      </summary>
                      <div className="mt-3 bg-white dark:bg-gray-800 p-4 rounded-lg">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                          <div className="text-center p-3 bg-blue-50 dark:bg-blue-900/20 rounded">
                            <div className="text-2xl font-bold text-blue-600">{result.databaseActivity.reads || 0}</div>
                            <div className="text-xs text-gray-600 dark:text-gray-400">Lecturas</div>
                          </div>
                          <div className="text-center p-3 bg-green-50 dark:bg-green-900/20 rounded">
                            <div className="text-2xl font-bold text-green-600">{result.databaseActivity.writes || 0}</div>
                            <div className="text-xs text-gray-600 dark:text-gray-400">Escrituras</div>
                          </div>
                          <div className="text-center p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded">
                            <div className="text-2xl font-bold text-yellow-600">{result.databaseActivity.updates || 0}</div>
                            <div className="text-xs text-gray-600 dark:text-gray-400">Actualizaciones</div>
                          </div>
                          <div className="text-center p-3 bg-red-50 dark:bg-red-900/20 rounded">
                            <div className="text-2xl font-bold text-red-600">{result.databaseActivity.deletes || 0}</div>
                            <div className="text-xs text-gray-600 dark:text-gray-400">Eliminaciones</div>
                          </div>
                        </div>
                        {result.databaseActivity.changes && result.databaseActivity.changes.length > 0 && (
                          <div className="space-y-2">
                            <div className="font-semibold text-sm text-gray-700 dark:text-gray-300 mb-2">
                              Cambios Detectados:
                            </div>
                            {result.databaseActivity.changes.slice(0, 5).map((change, idx) => (
                              <div key={idx} className="text-xs bg-gray-50 dark:bg-gray-750 p-2 rounded">
                                <span className={`font-bold ${
                                  change.type === 'INSERT' ? 'text-green-600' : 
                                  change.type === 'UPDATE' ? 'text-yellow-600' : 
                                  'text-red-600'
                                }`}>
                                  {change.type}
                                </span> en {change.table}
                              </div>
                            ))}
                            {result.databaseActivity.changes.length > 5 && (
                              <div className="text-xs text-gray-500 italic">
                                ... y {result.databaseActivity.changes.length - 5} cambios más
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </details>
                  )}

                  {/* Conversación Completa */}
                  <details className="mb-4">
                    <summary className="font-bold text-lg text-gray-900 dark:text-white cursor-pointer hover:text-blue-600">
                      💬 Ver Conversación Completa
                    </summary>
                    <div className="mt-3 space-y-3 max-h-96 overflow-y-auto">
                      {result.executionTrace.map((step, idx) => {
                        const userMsg = typeof step.input === 'object' && step.input !== null
                          ? Object.values(step.input).find(v => typeof v === 'string') || JSON.stringify(step.input)
                          : String(step.input);
                        
                        const botMsg = typeof step.output === 'object' && step.output !== null
                          ? (step.output.response || step.output.output || step.output.message || JSON.stringify(step.output))
                          : String(step.output);

                        return (
                          <div key={idx} className="space-y-2">
                            <div className="flex justify-end">
                              <div className="bg-blue-500 text-white p-3 rounded-lg max-w-md">
                                <div className="text-xs opacity-75 mb-1">Usuario</div>
                                <div className="text-sm">{userMsg}</div>
                              </div>
                            </div>
                            {step.output && (
                              <div className="flex justify-start">
                                <div className="bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 p-3 rounded-lg max-w-md">
                                  <div className="text-xs opacity-75 mb-1">Bot</div>
                                  <div className="text-sm">{botMsg}</div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </details>
                </div>
              </div>
          );
        })}
      </div>
    </div>
  );
};

export default ExecutiveReport;

