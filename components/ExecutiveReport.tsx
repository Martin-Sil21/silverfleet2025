
import React, { useState, useMemo } from 'react';
import type { AuditResult, AuditConfig } from '../types';
import { getCostSummary } from '../services/geminiService';
import { classifyTable, analyzeChanges, shouldShowNoSaveWarning, type TableType } from '../services/tableClassifier';
import { aggregateDatabaseChanges, generateDatabaseSummaryText, type ConversationDatabaseTimeline } from '../services/databaseChangeAggregator';
import AuditMetrics from './AuditMetrics';

interface ExecutiveReportProps {
  results: AuditResult[];
  config: AuditConfig;
  onReset: () => void;
  onReaudit: (config: AuditConfig) => void;
  onRepeatAudit?: (config: AuditConfig) => void;
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

const ExecutiveReport: React.FC<ExecutiveReportProps> = ({ results, config, onReset, onReaudit, onRepeatAudit }) => {
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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-gray-900 dark:via-gray-800 dark:to-slate-900 p-4 sm:p-6 lg:p-8">
      {/* Header con mejor diseño */}
      <div className="max-w-7xl mx-auto mb-6 sm:mb-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-2 flex items-center gap-3">
              <span className="text-4xl sm:text-5xl">📊</span>
              <span>Reporte de Auditoría</span>
            </h1>
            <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">
              Análisis detallado de {results.length} conversacion{results.length > 1 ? 'es' : ''}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full sm:w-auto">
            {onRepeatAudit && (
              <button
                onClick={() => onRepeatAudit(config)}
                className="px-4 sm:px-6 py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl hover:from-purple-700 hover:to-pink-700 transition-all duration-200 font-medium flex items-center justify-center gap-2 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                title="Ejecuta nuevamente con la misma configuración sin editar"
              >
                <span className="text-xl">🔁</span>
                <span>Repetir Auditoría</span>
              </button>
            )}
            <button
              onClick={() => onReaudit(config)}
              className="px-4 sm:px-6 py-2.5 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl hover:from-green-700 hover:to-emerald-700 transition-all duration-200 font-medium flex items-center justify-center gap-2 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
              title="Vuelve a configuración para editar parámetros"
            >
              <span className="text-xl">🔄</span>
              <span>Re-auditar</span>
            </button>
            <button
              onClick={onReset}
              className="px-4 sm:px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all duration-200 font-medium flex items-center justify-center gap-2 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
            >
              <span className="text-xl">←</span>
              <span>Nueva Auditoría</span>
            </button>
          </div>
        </div>

        {/* Resumen Ejecutivo - Rediseñado */}
        <div className={`bg-white dark:bg-gray-800 rounded-2xl p-6 sm:p-8 shadow-2xl border-2 ${colors.border} transition-all duration-300 hover:shadow-3xl`}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
            {/* Score General - Más destacado */}
            <div className="col-span-2 md:col-span-1 text-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-700 dark:to-gray-600 rounded-xl p-4 sm:p-6 border-2 border-gray-200 dark:border-gray-600 transition-transform duration-200 hover:scale-105">
              <div className="text-5xl sm:text-6xl mb-2">
                {getScoreEmoji(stats.avgScore)}
              </div>
              <div className={`text-5xl sm:text-6xl font-bold ${colors.text} mb-2 transition-colors duration-300`}>
                {stats.avgScore.toFixed(1)}
              </div>
              <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 font-semibold uppercase tracking-wide">
                Score Promedio
              </div>
            </div>

            {/* Conversaciones - Mejorado */}
            <div className="col-span-2 md:col-span-1 text-center bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/30 rounded-xl p-4 sm:p-6 border-2 border-blue-200 dark:border-blue-700 transition-transform duration-200 hover:scale-105">
              <div className="text-4xl sm:text-5xl mb-2">💬</div>
              <div className="text-4xl sm:text-5xl font-bold text-blue-600 dark:text-blue-400 mb-2">
                {results.length}
              </div>
              <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 font-semibold uppercase tracking-wide mb-3">
                Conversaciones
              </div>
              <div className="flex flex-wrap justify-center gap-1.5">
                <span className="px-2 py-1 bg-green-500 text-white text-xs rounded-lg font-bold shadow-sm">{stats.passed} ✅</span>
                <span className="px-2 py-1 bg-yellow-500 text-white text-xs rounded-lg font-bold shadow-sm">{stats.warning} ⚠️</span>
                <span className="px-2 py-1 bg-red-500 text-white text-xs rounded-lg font-bold shadow-sm">{stats.failed} ❌</span>
              </div>
            </div>

            {/* Base de Datos - Rediseñado */}
            <div className="col-span-2 md:col-span-1 text-center bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/30 dark:to-pink-900/30 rounded-xl p-4 sm:p-6 border-2 border-purple-200 dark:border-purple-700 transition-transform duration-200 hover:scale-105">
              <div className="text-4xl sm:text-5xl mb-2">🗄️</div>
              <div className="text-4xl sm:text-5xl font-bold text-purple-600 dark:text-purple-400 mb-2">
                {stats.totalDbOperations}
              </div>
              <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 font-semibold uppercase tracking-wide">
                Operaciones BD
              </div>
              {stats.totalDbChanges > 0 && (
                <div className="text-xs text-purple-600 dark:text-purple-400 mt-2 font-medium">
                  📝 {stats.totalDbChanges} cambios
                </div>
              )}
            </div>

            {/* Errores Críticos - Más visual */}
            <div className={`col-span-2 md:col-span-1 text-center rounded-xl p-4 sm:p-6 border-2 transition-all duration-200 hover:scale-105 ${
              stats.totalDbErrors > 0 
                ? 'bg-gradient-to-br from-red-50 to-pink-50 dark:from-red-900/30 dark:to-pink-900/30 border-red-200 dark:border-red-700' 
                : 'bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/30 dark:to-emerald-900/30 border-green-200 dark:border-green-700'
            }`}>
              <div className="text-4xl sm:text-5xl mb-2">
                {stats.totalDbErrors > 0 ? '⚠️' : '✨'}
              </div>
              <div className={`text-4xl sm:text-5xl font-bold mb-2 ${
                stats.totalDbErrors > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'
              }`}>
                {stats.totalDbErrors}
              </div>
              <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 font-semibold uppercase tracking-wide">
                {stats.totalDbErrors > 0 ? 'Errores Críticos' : 'Sin Errores'}
              </div>
            </div>
          </div>

          {/* 🎭 Distribución por Desempeño - Mejorado */}
          <div className="mt-6 pt-6 border-t-2 border-gray-200 dark:border-gray-700">
            <h3 className="text-sm sm:text-base font-bold text-gray-700 dark:text-gray-200 mb-4 flex items-center gap-2">
              <span className="text-xl">📈</span>
              <span>Distribución por Desempeño</span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
              {/* Positivas - Mejorado */}
              <div className="bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50 dark:from-green-900/20 dark:via-emerald-900/20 dark:to-teal-900/20 rounded-xl p-4 sm:p-5 border-2 border-green-300 dark:border-green-600 shadow-md hover:shadow-lg transition-all duration-200 transform hover:-translate-y-1">
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-4xl sm:text-5xl">✅</span>
                  <div className="flex-1">
                    <div className="text-3xl sm:text-4xl font-bold text-green-600 dark:text-green-400">
                      {stats.passed}
                    </div>
                    <div className="text-lg sm:text-xl font-bold text-green-500 dark:text-green-300">
                      {((stats.passed / results.length) * 100).toFixed(0)}%
                    </div>
                  </div>
                </div>
                <p className="text-sm sm:text-base font-bold text-green-700 dark:text-green-300">Positivas</p>
                <p className="text-xs text-green-600 dark:text-green-400 mt-1">Score 8-10</p>
              </div>

              {/* Neutras - Mejorado */}
              <div className="bg-gradient-to-br from-yellow-50 via-amber-50 to-orange-50 dark:from-yellow-900/20 dark:via-amber-900/20 dark:to-orange-900/20 rounded-xl p-4 sm:p-5 border-2 border-yellow-300 dark:border-yellow-600 shadow-md hover:shadow-lg transition-all duration-200 transform hover:-translate-y-1">
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-4xl sm:text-5xl">⚠️</span>
                  <div className="flex-1">
                    <div className="text-3xl sm:text-4xl font-bold text-yellow-600 dark:text-yellow-400">
                      {stats.warning}
                    </div>
                    <div className="text-lg sm:text-xl font-bold text-yellow-500 dark:text-yellow-300">
                      {((stats.warning / results.length) * 100).toFixed(0)}%
                    </div>
                  </div>
                </div>
                <p className="text-sm sm:text-base font-bold text-yellow-700 dark:text-yellow-300">Neutras</p>
                <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">Score 5-7.9</p>
              </div>

              {/* Negativas - Mejorado */}
              <div className="bg-gradient-to-br from-red-50 via-rose-50 to-pink-50 dark:from-red-900/20 dark:via-rose-900/20 dark:to-pink-900/20 rounded-xl p-4 sm:p-5 border-2 border-red-300 dark:border-red-600 shadow-md hover:shadow-lg transition-all duration-200 transform hover:-translate-y-1">
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-4xl sm:text-5xl">❌</span>
                  <div className="flex-1">
                    <div className="text-3xl sm:text-4xl font-bold text-red-600 dark:text-red-400">
                      {stats.failed}
                    </div>
                    <div className="text-lg sm:text-xl font-bold text-red-500 dark:text-red-300">
                      {((stats.failed / results.length) * 100).toFixed(0)}%
                    </div>
                  </div>
                </div>
                <p className="text-sm sm:text-base font-bold text-red-700 dark:text-red-300">Negativas</p>
                <p className="text-xs text-red-600 dark:text-red-400 mt-1">Score 0-4.9</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* � MÉTRICAS PROFESIONALES - NUEVO */}
      <div className="max-w-7xl mx-auto mb-6 sm:mb-8">
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 sm:p-8 shadow-2xl border-2 border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3 mb-6">
            <span className="text-4xl sm:text-5xl">📊</span>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Métricas de Auditoría</h2>
          </div>
          <AuditMetrics results={results} config={config} />
        </div>
      </div>

      {/* �💰 Resumen de Costos - Rediseñado */}
      {costSummary && costSummary.totalCostUSD > 0 && (
        <div className="max-w-7xl mx-auto mb-6 sm:mb-8">
          <div className="bg-gradient-to-r from-yellow-50 via-amber-50 to-orange-50 dark:from-yellow-900/20 dark:via-amber-900/20 dark:to-orange-800/20 rounded-2xl p-6 sm:p-8 shadow-2xl border-2 border-yellow-300 dark:border-yellow-600 hover:shadow-3xl transition-all duration-300">
            <div className="flex items-center gap-3 mb-6">
              <span className="text-4xl sm:text-5xl">💰</span>
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Resumen de Costos API</h2>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
              {/* Costo Total - Destacado */}
              <div className="bg-white dark:bg-gray-800 rounded-xl p-5 sm:p-6 text-center border-2 border-green-400 dark:border-green-600 shadow-lg hover:shadow-xl transition-all duration-200 transform hover:-translate-y-1">
                <div className="text-3xl mb-2">💵</div>
                <div className="text-3xl sm:text-4xl font-bold text-green-600 dark:text-green-400 mb-2">
                  ${costSummary.totalCostUSD.toFixed(6)}
                </div>
                <div className="text-sm sm:text-base text-gray-600 dark:text-gray-300 font-semibold">
                  Costo Total USD
                </div>
              </div>

              {/* Costo Sistema */}
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/30 rounded-xl p-5 sm:p-6 text-center border-2 border-blue-300 dark:border-blue-600 shadow-lg hover:shadow-xl transition-all duration-200 transform hover:-translate-y-1">
                <div className="text-3xl mb-2">🤖</div>
                <div className="text-2xl sm:text-3xl font-bold text-blue-600 dark:text-blue-400 mb-2">
                  ${costSummary.systemCostUSD.toFixed(6)}
                </div>
                <div className="text-sm sm:text-base text-gray-600 dark:text-gray-300 font-semibold">
                  Sistema (Nuestro)
                </div>
              </div>

              {/* Costo Webhook Usuario */}
              <div className="bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/30 dark:to-pink-900/30 rounded-xl p-5 sm:p-6 text-center border-2 border-purple-300 dark:border-purple-600 shadow-lg hover:shadow-xl transition-all duration-200 transform hover:-translate-y-1 sm:col-span-2 lg:col-span-1">
                <div className="text-3xl mb-2">💵</div>
                <div className="text-2xl sm:text-3xl font-bold text-purple-600 dark:text-purple-400 mb-2">
                  ${costSummary.webhookCostUSD.toFixed(6)}
                </div>
                <div className="text-sm sm:text-base text-gray-600 dark:text-gray-300 font-semibold">
                  Webhook (Usuario)
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

      {/* Lista de Conversaciones - Rediseñada */}
      <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6">
        <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3 px-2">
          <span className="text-3xl sm:text-4xl">💬</span>
          <span>Detalle de Conversaciones</span>
        </h2>
        
        {results.map((result, idx) => {
          const isExpanded = expandedCards.has(result.id);
          const cardColors = getScoreColor(result.analysis.overallScore);
          const hasDbErrors = (result.databaseActivity?.discrepancies?.length || 0) > 0;
          const criticalErrors = result.databaseActivity?.discrepancies?.filter(d => d.severity === 'critical') || [];

          return (
            <div
              key={result.id}
              className={`bg-white dark:bg-gray-800 rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-300 overflow-hidden border-2 ${cardColors.border} ${isExpanded ? 'ring-4 ring-blue-200 dark:ring-blue-800' : ''}`}
            >
              {/* Header Colapsable - Mejorado */}
              <button
                onClick={() => toggleCard(result.id)}
                className="w-full p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-750 transition-all duration-200 gap-4"
              >
                <div className="flex items-start sm:items-center gap-4 flex-1 w-full">
                  {/* Score Badge - Más grande y visual */}
                  <div className={`w-16 h-16 sm:w-20 sm:h-20 rounded-2xl ${cardColors.bg} flex flex-col items-center justify-center font-bold shadow-xl border-2 ${cardColors.border} transition-transform duration-200 hover:scale-110 flex-shrink-0`}>
                    <div className="text-3xl sm:text-4xl">{getScoreEmoji(result.analysis.overallScore)}</div>
                    <div className="text-lg sm:text-xl font-black">{result.analysis.overallScore.toFixed(1)}</div>
                  </div>

                  {/* Info - Mejor organizada */}
                  <div className="flex-1 text-left min-w-0">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-2">
                      <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white truncate">
                        {result.testCase.title}
                      </h3>
                      {hasDbErrors && (
                        <span className="px-3 py-1.5 bg-gradient-to-r from-red-500 to-pink-500 text-white text-xs font-bold rounded-lg shadow-md animate-pulse flex items-center gap-1 w-fit">
                          <span>⚠️</span>
                          <span>{criticalErrors.length} ERROR{criticalErrors.length > 1 ? 'ES' : ''}</span>
                        </span>
                      )}
                    </div>
                    <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">
                      {result.analysis.summary.split('\n\n')[0]}
                    </p>
                    <div className="flex gap-2 mt-3 flex-wrap">
                      <span className="px-2.5 py-1 bg-gradient-to-r from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-600 text-gray-700 dark:text-gray-200 text-xs rounded-lg font-medium shadow-sm">
                        📱 {result.testCase.initialPayload?.telefono || 'N/A'}
                      </span>
                      <span className="px-2.5 py-1 bg-gradient-to-r from-blue-100 to-indigo-100 dark:from-blue-900 dark:to-indigo-900 text-blue-700 dark:text-blue-200 text-xs rounded-lg font-medium shadow-sm">
                        💬 {result.executionTrace.length} turnos
                      </span>
                      {result.databaseActivity && (
                        <span className="px-2.5 py-1 bg-gradient-to-r from-purple-100 to-pink-100 dark:from-purple-900 dark:to-pink-900 text-purple-700 dark:text-purple-200 text-xs rounded-lg font-medium shadow-sm">
                          🗄️ {result.databaseActivity.changes?.length || 0} cambios BD
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Flecha - Animada */}
                <div className={`transform transition-transform duration-300 flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`}>
                  <svg className="w-6 h-6 sm:w-8 sm:h-8 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {/* Contenido Expandido - Mejorado */}
              <div className={`border-t-2 border-gray-200 dark:border-gray-700 bg-gradient-to-br from-gray-50 to-slate-50 dark:from-gray-900 dark:to-slate-900 transition-all duration-500 ease-in-out overflow-hidden ${
                isExpanded ? 'max-h-[5000px] opacity-100 p-5 sm:p-6' : 'max-h-0 opacity-0 p-0'
              }`}>
                  {/* Resumen Completo - Rediseñado */}
                  <div className="mb-6">
                    <h4 className="font-bold text-lg sm:text-xl mb-3 text-gray-900 dark:text-white flex items-center gap-2">
                      <span className="text-2xl">📝</span>
                      <span>Resumen Completo</span>
                    </h4>
                    <div className="bg-white dark:bg-gray-800 p-4 sm:p-5 rounded-xl shadow-md border border-gray-200 dark:border-gray-700 whitespace-pre-wrap text-sm sm:text-base text-gray-700 dark:text-gray-300 leading-relaxed">
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
                        {/* 📝 Verificar si guardó resumen/conversación - VERSIÓN INTELIGENTE */}
                        {(() => {
                          if (!result.databaseActivity?.changes) return null;
                          
                          // Analizar cambios con clasificador inteligente
                          const analysis = analyzeChanges(result.databaseActivity.changes);
                          
                          // Mostrar advertencia SOLO si no hay cambios en BD de negocio
                          const showWarning = shouldShowNoSaveWarning(
                            result.databaseActivity.changes,
                            result.executionTrace.length
                          );
                          
                          if (analysis.hasBusinessChanges) {
                            // ✅ Guardó en BD de negocio
                            return (
                              <div className="bg-green-50 dark:bg-green-900/20 border-l-4 border-green-500 p-3 rounded">
                                <div className="flex items-start gap-2">
                                  <span className="text-2xl">✅</span>
                                  <div>
                                    <p className="font-bold text-green-800 dark:text-green-200">
                                      El bot guardó la información correctamente
                                    </p>
                                    <p className="text-sm text-green-700 dark:text-green-300 mt-1">
                                      {analysis.summary}
                                    </p>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                      {analysis.businessTables.map(table => {
                                        const classification = classifyTable(table);
                                        return (
                                          <span key={table} className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-800 rounded text-xs">
                                            <span>{classification.icon}</span>
                                            <span className="font-mono">{table}</span>
                                          </span>
                                        );
                                      })}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          }
                          
                          if (analysis.hasTemporaryChanges && !showWarning) {
                            // ⚠️ Solo guardó en memoria temporal (pero no es crítico si conversación corta)
                            return (
                              <div className="bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500 p-3 rounded">
                                <div className="flex items-start gap-2">
                                  <span className="text-2xl">ℹ️</span>
                                  <div>
                                    <p className="font-bold text-blue-800 dark:text-blue-200">
                                      El bot guardó en memoria temporal
                                    </p>
                                    <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                                      {analysis.summary}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            );
                          }
                          
                          if (showWarning) {
                            // ⚠️ No guardó en BD de negocio (conversación suficientemente larga)
                            return (
                              <div className="bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-500 p-3 rounded">
                                <div className="flex items-start gap-2">
                                  <span className="text-2xl">⚠️</span>
                                  <div>
                                    <p className="font-bold text-yellow-800 dark:text-yellow-200">
                                      No se detectó guardado en base de datos de negocio
                                    </p>
                                    <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                                      El bot completó {result.executionTrace.length} turnos{' '}
                                      {analysis.hasTemporaryChanges 
                                        ? 'pero solo guardó en memoria temporal (no persistente)' 
                                        : 'sin guardar información permanente en la BD'}
                                    </p>
                                    {analysis.temporaryTables.length > 0 && (
                                      <div className="mt-2 flex flex-wrap gap-2">
                                        {analysis.temporaryTables.map(table => {
                                          const classification = classifyTable(table);
                                          return (
                                            <span key={table} className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-100 dark:bg-yellow-800 rounded text-xs">
                                              <span>{classification.icon}</span>
                                              <span className="font-mono">{table}</span>
                                              <span className="text-yellow-600 dark:text-yellow-400">(temporal)</span>
                                            </span>
                                          );
                                        })}
                                      </div>
                                    )}
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
                        
                        {/* 📊 ACTIVIDAD DETALLADA DE BASE DE DATOS - VERSIÓN AGREGADA INTELIGENTE */}
                        {(() => {
                          const changes = result.databaseActivity?.changes || [];
                          if (changes.length === 0) return null;
                          
                          // 🔥 AGREGAR cambios por registro único
                          const timeline = aggregateDatabaseChanges(changes);
                          const summary = generateDatabaseSummaryText(timeline, 'es'); // Spanish por defecto
                          
                          return (
                            <div className="space-y-3">
                              {/* Resumen general */}
                              <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 border-l-4 border-blue-500 p-4 rounded-lg">
                                <div className="flex items-start gap-3">
                                  <span className="text-3xl">📊</span>
                                  <div className="flex-1">
                                    <p className="font-bold text-blue-800 dark:text-blue-200 text-lg mb-2">
                                      {summary.title}
                                    </p>
                                    <ul className="space-y-1">
                                      {summary.details.map((detail, idx) => (
                                        <li key={idx} className="text-sm text-blue-700 dark:text-blue-300">
                                          {detail}
                                        </li>
                                      ))}
                                    </ul>
                                    {summary.warnings.length > 0 && (
                                      <div className="mt-3 space-y-1">
                                        {summary.warnings.map((warning, idx) => (
                                          <p key={idx} className="text-sm text-orange-700 dark:text-orange-300 font-semibold">
                                            {warning}
                                          </p>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                              
                              {/* Detalles expandibles por tabla */}
                              <details className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                                <summary className="cursor-pointer p-3 font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
                                  📋 Ver detalles por tabla ({timeline.byTable.size} tablas afectadas)
                                </summary>
                                <div className="p-3 space-y-3 border-t border-gray-200 dark:border-gray-700">
                                  {Array.from(timeline.byTable.entries())
                                    .sort(([, a], [, b]) => a.classification.priority - b.classification.priority)
                                    .map(([table, stats]) => (
                                      <div key={table} className="bg-gray-50 dark:bg-gray-900/50 p-3 rounded">
                                        <div className="flex items-center gap-2 mb-2">
                                          <span className="text-2xl">{stats.classification.icon}</span>
                                          <span className="font-mono font-bold text-gray-800 dark:text-gray-200">{table}</span>
                                          <span className="text-xs bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded">
                                            {stats.classification.type}
                                          </span>
                                        </div>
                                        <div className="ml-8 grid grid-cols-2 gap-2 text-sm">
                                          {stats.inserts > 0 && (
                                            <div className="text-green-700 dark:text-green-300">
                                              ➕ {stats.inserts} inserción{stats.inserts > 1 ? 'es' : ''}
                                            </div>
                                          )}
                                          {stats.uniqueRecordsUpdated > 0 && (
                                            <div className="text-yellow-700 dark:text-yellow-300">
                                              🔄 {stats.uniqueRecordsUpdated} registro{stats.uniqueRecordsUpdated > 1 ? 's' : ''} modificado{stats.uniqueRecordsUpdated > 1 ? 's' : ''}
                                              {stats.totalUpdateOperations > stats.uniqueRecordsUpdated && (
                                                <span className="text-xs ml-1">
                                                  ({stats.totalUpdateOperations} operaciones)
                                                </span>
                                              )}
                                            </div>
                                          )}
                                          {stats.deletes > 0 && (
                                            <div className={
                                              stats.classification.type === 'TEMPORARY' 
                                                ? 'text-blue-700 dark:text-blue-300' 
                                                : 'text-red-700 dark:text-red-300'
                                            }>
                                              {stats.classification.type === 'TEMPORARY' ? '🧹' : '🗑️'} {stats.deletes} eliminación{stats.deletes > 1 ? 'es' : ''}
                                              {stats.classification.type === 'TEMPORARY' && (
                                                <span className="text-xs ml-1">(limpieza)</span>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                        <p className="ml-8 text-xs text-gray-600 dark:text-gray-400 mt-1">
                                          {stats.classification.reason}
                                        </p>
                                      </div>
                                    ))}
                                </div>
                              </details>
                              
                              {/* Registros con ciclo de vida completo (temporal cleanup) */}
                              {timeline.fullLifecycle.length > 0 && (
                                <details className="bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700">
                                  <summary className="cursor-pointer p-3 font-semibold text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-800/30">
                                    ⏱️ Registros temporales (creados y limpiados durante la conversación)
                                  </summary>
                                  <div className="p-3 space-y-2 border-t border-blue-200 dark:border-blue-700">
                                    {timeline.fullLifecycle.slice(0, 5).map((lc, idx) => (
                                      <div key={idx} className="bg-white dark:bg-gray-800 p-2 rounded text-sm">
                                        <div className="flex items-center gap-2">
                                          <span>{lc.classification.icon}</span>
                                          <span className="font-mono font-bold">{lc.table}</span>
                                          <span className="text-xs text-gray-500">
                                            {lc.recordId.substring(0, 20)}...
                                          </span>
                                        </div>
                                        <div className="ml-6 text-xs text-gray-600 dark:text-gray-400 mt-1">
                                          Creado → {lc.updated ? `${lc.updated.updateCount} actualizaciones → ` : ''}Eliminado
                                          ({Math.round(lc.duration / 1000)}s de vida)
                                        </div>
                                      </div>
                                    ))}
                                    {timeline.fullLifecycle.length > 5 && (
                                      <p className="text-xs text-blue-600 dark:text-blue-400 italic">
                                        ... y {timeline.fullLifecycle.length - 5} registros más
                                      </p>
                                    )}
                                  </div>
                                </details>
                              )}
                              
                              {/* Updates a registros existentes (el caso problemático: mismo registro 12 veces) */}
                              {timeline.existingRecordUpdates.length > 0 && (
                                <details className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-700">
                                  <summary className="cursor-pointer p-3 font-semibold text-yellow-700 dark:text-yellow-300 hover:bg-yellow-100 dark:hover:bg-yellow-800/30">
                                    🔄 Actualizaciones a registros existentes ({timeline.existingRecordUpdates.length} registro{timeline.existingRecordUpdates.length > 1 ? 's' : ''})
                                  </summary>
                                  <div className="p-3 space-y-2 border-t border-yellow-200 dark:border-yellow-700">
                                    {timeline.existingRecordUpdates.slice(0, 10).map((upd, idx) => {
                                      const classification = classifyTable(upd.table);
                                      return (
                                        <div key={idx} className="bg-white dark:bg-gray-800 p-3 rounded">
                                          <div className="flex items-center gap-2 mb-1">
                                            <span>{classification.icon}</span>
                                            <span className="font-mono font-bold text-gray-800 dark:text-gray-200">{upd.table}</span>
                                            <span className="text-xs font-mono text-gray-500">
                                              ID: {upd.recordId.substring(0, 30)}...
                                            </span>
                                          </div>
                                          <div className="ml-6">
                                            <p className="text-sm text-yellow-700 dark:text-yellow-300">
                                              <strong>{upd.updateCount}</strong> actualización{upd.updateCount > 1 ? 'es' : ''} 
                                              {upd.updateCount > 1 && ` al mismo registro`}
                                            </p>
                                            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                                              Campos modificados: {Array.from(upd.fieldsChanged).join(', ')}
                                            </p>
                                            {upd.updateCount > 1 && (
                                              <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
                                                Timeline: {upd.timeline}
                                              </p>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })}
                                    {timeline.existingRecordUpdates.length > 10 && (
                                      <p className="text-xs text-yellow-600 dark:text-yellow-400 italic">
                                        ... y {timeline.existingRecordUpdates.length - 10} registros más
                                      </p>
                                    )}
                                  </div>
                                </details>
                              )}
                            </div>
                          );
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

                  {/* 🔧 Verificación de Herramientas Externas (Email, Calendar, etc.) */}
                  {(() => {
                    const toolVerifications = (result as any).toolVerifications || [];
                    if (toolVerifications.length === 0) return null;
                    
                    const verified = toolVerifications.filter((v: any) => v.verified).length;
                    const failed = toolVerifications.filter((v: any) => v.verified === false).length;
                    
                    return (
                      <div className="mb-6 p-5 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-xl border-2 border-purple-400 dark:border-purple-600 shadow-lg">
                        <div className="flex items-center gap-3 mb-4">
                          <span className="text-3xl">🔧</span>
                          <h4 className="text-xl font-bold text-purple-800 dark:text-purple-200">
                            Verificación de Herramientas - ¿Se Ejecutaron las Acciones?
                          </h4>
                        </div>
                        
                        <div className="mb-4 flex items-center gap-4">
                          <div className="flex items-center gap-2">
                            <span className="text-2xl">✅</span>
                            <span className="font-bold text-green-700 dark:text-green-300">{verified} Verificadas</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-2xl">❌</span>
                            <span className="font-bold text-red-700 dark:text-red-300">{failed} Fallidas</span>
                          </div>
                        </div>
                        
                        <div className="space-y-3">
                          {toolVerifications.map((verification: any, idx: number) => {
                            const isVerified = verification.verified;
                            const bgColor = isVerified ? 'bg-green-50 dark:bg-green-900/20 border-green-500' : 'bg-red-50 dark:bg-red-900/20 border-red-500';
                            const textColor = isVerified ? 'text-green-800 dark:text-green-200' : 'text-red-800 dark:text-red-200';
                            const icon = isVerified ? '✅' : '❌';
                            
                            return (
                              <div key={idx} className={`${bgColor} border-l-4 p-3 rounded`}>
                                <div className="flex items-start gap-2">
                                  <span className="text-2xl">{icon}</span>
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className={`font-bold ${textColor}`}>
                                        {verification.claim.type.replace(/_/g, ' ').toUpperCase()}
                                      </span>
                                      <span className="text-xs bg-purple-200 dark:bg-purple-800 px-2 py-1 rounded">
                                        Turn {verification.claim.turnNumber}
                                      </span>
                                    </div>
                                    <p className={`text-sm ${textColor} mb-2`}>
                                      <strong>Promesa:</strong> {verification.claim.description}
                                    </p>
                                    <p className={`text-sm ${textColor}`}>
                                      <strong>Resultado:</strong> {verification.message}
                                    </p>
                                    {verification.evidence && (
                                      <details className="mt-2">
                                        <summary className="text-xs cursor-pointer hover:underline text-purple-700 dark:text-purple-300">
                                          Ver evidencia
                                        </summary>
                                        <pre className="text-xs mt-2 bg-white dark:bg-gray-800 p-2 rounded overflow-auto max-h-40">
                                          {JSON.stringify(verification.evidence, null, 2)}
                                        </pre>
                                      </details>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        
                        {failed > 0 && (
                          <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-500 rounded">
                            <p className="text-sm text-yellow-800 dark:text-yellow-200">
                              ⚠️ <strong>Advertencia:</strong> El bot prometió ejecutar {failed} acción(es) pero no hay evidencia de que se hayan realizado.
                              Esto puede indicar un problema en la configuración de las integraciones o en la ejecución del workflow.
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })()}

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

