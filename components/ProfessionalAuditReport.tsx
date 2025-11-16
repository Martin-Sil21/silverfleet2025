/**
 * 📊 Professional Audit Report
 * 
 * Reporte profesional con:
 * - PESTAÑAS especializadas por área
 * - GRÁFICOS y métricas visuales
 * - ESTRUCTURA clara para análisis IA
 * - DATOS detallados y evidencias
 */

import React, { useState, useMemo } from 'react';
import type { AuditResult, AuditConfig, DatabaseChange, DatabaseDiscrepancy } from '../types';
import { generatePriceComparison, type PriceComparison } from '../services/priceExtractor';

interface ProfessionalAuditReportProps {
  results: AuditResult[];
  config: AuditConfig;
  onReset: () => void;
}

type TabType = 'overview' | 'database' | 'prices' | 'tools' | 'conversations' | 'ai-analysis';

const ProfessionalAuditReport: React.FC<ProfessionalAuditReportProps> = ({ results, config, onReset }) => {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [expandedConversations, setExpandedConversations] = useState<Set<string>>(new Set());

  // Calcular todas las métricas
  const metrics = useMemo(() => {
    const totalScore = results.reduce((sum, r) => sum + r.analysis.overallScore, 0);
    const avgScore = totalScore / results.length;
    
    const scoreDistribution = {
      excellent: results.filter(r => r.analysis.overallScore >= 9).length,
      good: results.filter(r => r.analysis.overallScore >= 7 && r.analysis.overallScore < 9).length,
      acceptable: results.filter(r => r.analysis.overallScore >= 5 && r.analysis.overallScore < 7).length,
      poor: results.filter(r => r.analysis.overallScore < 5).length,
    };
    
    // Cambios en BD
    const allChanges: DatabaseChange[] = [];
    const changesByTable = new Map<string, DatabaseChange[]>();
    const changesByType = { INSERT: 0, UPDATE: 0, DELETE: 0 };
    
    results.forEach(r => {
      if (r.databaseActivity?.changes) {
        allChanges.push(...r.databaseActivity.changes);
        
        r.databaseActivity.changes.forEach(change => {
          // Por tabla
          const existing = changesByTable.get(change.table) || [];
          changesByTable.set(change.table, [...existing, change]);
          
          // Por tipo
          changesByType[change.type]++;
        });
      }
    });
    
    // Discrepancias
    const allDiscrepancies: (DatabaseDiscrepancy & { conversationTitle: string })[] = [];
    let criticalCount = 0;
    let warningCount = 0;
    
    results.forEach(r => {
      if (r.databaseActivity?.discrepancies) {
        r.databaseActivity.discrepancies.forEach(d => {
          allDiscrepancies.push({ ...d, conversationTitle: r.testCase.title });
          if (d.severity === 'critical') criticalCount++;
          if (d.severity === 'warning') warningCount++;
        });
      }
    });
    
    // 💰 Precios - EXTRACCIÓN AUTOMÁTICA
    const agents = config.agents?.map(a => ({
      name: a.name || 'Agent',
      prompt: a.systemPrompt || ''
    })) || [];
    
    const priceComparisons: PriceComparison[] = results.map(result => 
      generatePriceComparison(result, agents)
    );
    
    const pricesConsistent = priceComparisons.filter(p => p.consistent).length;
    const pricesInconsistent = priceComparisons.filter(p => !p.consistent && (p.mentioned.length > 0 || p.inDB.length > 0)).length;
    
    return {
      avgScore,
      scoreDistribution,
      allChanges,
      changesByTable,
      changesByType,
      allDiscrepancies,
      criticalCount,
      warningCount,
      priceComparisons,
      pricesConsistent,
      pricesInconsistent,
    };
  }, [results, config.agents]);

  const toggleConversation = (id: string) => {
    const newSet = new Set(expandedConversations);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setExpandedConversations(newSet);
  };

  const getScoreColor = (score: number) => {
    if (score >= 9) return 'bg-green-500';
    if (score >= 7) return 'bg-blue-500';
    if (score >= 5) return 'bg-orange-500';
    return 'bg-red-500';
  };

  // Tab Button Component
  const TabButton: React.FC<{ 
    tab: TabType; 
    icon: string; 
    label: string; 
    badge?: number;
    badgeColor?: string;
  }> = ({ tab, icon, label, badge, badgeColor = 'bg-red-500' }) => {
    const isActive = activeTab === tab;
    return (
      <button
        onClick={() => setActiveTab(tab)}
        className={`relative flex items-center gap-2 px-6 py-3 font-semibold transition-all border-b-2 ${
          isActive
            ? 'text-blue-600 dark:text-blue-400 border-blue-600 bg-blue-50 dark:bg-blue-900/20'
            : 'text-gray-600 dark:text-gray-400 border-transparent hover:bg-gray-100 dark:hover:bg-gray-800'
        }`}
      >
        <span className="text-xl">{icon}</span>
        <span>{label}</span>
        {badge !== undefined && badge > 0 && (
          <span className={`${badgeColor} text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center`}>
            {badge}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* HEADER */}
      <div className="bg-white dark:bg-gray-800 shadow-md">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Reporte de Auditoría Profesional
              </h1>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                {results.length} conversaciones · Score promedio: {metrics.avgScore.toFixed(1)}/10
              </p>
            </div>
            <button
              onClick={onReset}
              className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            >
              Nueva Auditoría
            </button>
          </div>
        </div>
      </div>

      {/* TABS */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex space-x-1 overflow-x-auto">
            <TabButton tab="overview" icon="📊" label="General" />
            <TabButton 
              tab="database" 
              icon="🗄️" 
              label="Base de Datos"
              badge={metrics.allChanges.length}
              badgeColor="bg-purple-500"
            />
            <TabButton 
              tab="prices" 
              icon="💰" 
              label="Precios"
              badge={metrics.pricesInconsistent}
              badgeColor={metrics.pricesInconsistent > 0 ? 'bg-red-500' : 'bg-green-500'}
            />
            <TabButton tab="tools" icon="🔧" label="Herramientas" />
            <TabButton tab="conversations" icon="💬" label="Conversaciones" />
            <TabButton tab="ai-analysis" icon="🤖" label="Análisis IA" />
          </div>
        </div>
      </div>

      {/* CONTENT */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        
        {/* TAB: OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="space-y-8">
            {/* Resultado General - SUPER CLARO */}
            <div className="bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl shadow-2xl p-8 text-white">
              <div className="text-center">
                <div className="text-6xl font-black mb-2">
                  {metrics.avgScore.toFixed(1)}<span className="text-3xl">/10</span>
                </div>
                <div className="text-xl font-semibold opacity-90">
                  {metrics.avgScore >= 9 ? '🎉 ¡EXCELENTE! Tu bot está funcionando increíble' :
                   metrics.avgScore >= 7 ? '✅ MUY BIEN. Tu bot funciona bien, con detalles menores' :
                   metrics.avgScore >= 5 ? '⚠️ ACEPTABLE. Hay cosas que mejorar' :
                   '❌ NECESITA MEJORAS. Hay problemas importantes'}
                </div>
              </div>
            </div>

            {/* Qué significa esto? */}
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-6 border-2 border-blue-200 dark:border-blue-800">
              <div className="flex items-start gap-3">
                <span className="text-4xl">💡</span>
                <div>
                  <h3 className="font-bold text-lg text-blue-900 dark:text-blue-100 mb-2">
                    ¿Qué significa este número?
                  </h3>
                  <p className="text-blue-800 dark:text-blue-200 leading-relaxed">
                    Probamos {results.length} conversaciones diferentes con tu bot. 
                    Este número es el promedio de qué tan bien respondió en cada una. 
                    <strong> 10 es perfecto</strong>, <strong>7 es bueno</strong>, menos de <strong>5 necesita atención</strong>.
                  </p>
                </div>
              </div>
            </div>

            {/* Resultado de las Conversaciones - MUY VISUAL */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
                📊 Resultado de las {results.length} Conversaciones
              </h2>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">
                <div className="text-center p-6 bg-green-50 dark:bg-green-900/20 rounded-xl border-2 border-green-300 dark:border-green-700">
                  <div className="text-5xl font-black text-green-600 mb-2">{metrics.scoreDistribution.excellent}</div>
                  <div className="text-sm font-semibold text-green-800 dark:text-green-200">🎉 Excelente</div>
                  <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">9 o más puntos</div>
                </div>
                
                <div className="text-center p-6 bg-blue-50 dark:bg-blue-900/20 rounded-xl border-2 border-blue-300 dark:border-blue-700">
                  <div className="text-5xl font-black text-blue-600 mb-2">{metrics.scoreDistribution.good}</div>
                  <div className="text-sm font-semibold text-blue-800 dark:text-blue-200">✅ Bien</div>
                  <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">7 a 8.9 puntos</div>
                </div>
                
                <div className="text-center p-6 bg-orange-50 dark:bg-orange-900/20 rounded-xl border-2 border-orange-300 dark:border-orange-700">
                  <div className="text-5xl font-black text-orange-600 mb-2">{metrics.scoreDistribution.acceptable}</div>
                  <div className="text-sm font-semibold text-orange-800 dark:text-orange-200">⚠️ Regular</div>
                  <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">5 a 6.9 puntos</div>
                </div>
                
                <div className="text-center p-6 bg-red-50 dark:bg-red-900/20 rounded-xl border-2 border-red-300 dark:border-red-700">
                  <div className="text-5xl font-black text-red-600 mb-2">{metrics.scoreDistribution.poor}</div>
                  <div className="text-sm font-semibold text-red-800 dark:text-red-200">❌ Mal</div>
                  <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">Menos de 5</div>
                </div>
              </div>

              {/* Barra Visual MÁS GRANDE */}
              <div className="h-16 flex rounded-xl overflow-hidden shadow-lg">
                {metrics.scoreDistribution.excellent > 0 && (
                  <div 
                    className="bg-green-500 flex items-center justify-center text-white text-lg font-bold transition-all hover:bg-green-600"
                    style={{ width: `${(metrics.scoreDistribution.excellent / results.length) * 100}%` }}
                  >
                    {metrics.scoreDistribution.excellent}
                  </div>
                )}
                {metrics.scoreDistribution.good > 0 && (
                  <div 
                    className="bg-blue-500 flex items-center justify-center text-white text-lg font-bold transition-all hover:bg-blue-600"
                    style={{ width: `${(metrics.scoreDistribution.good / results.length) * 100}%` }}
                  >
                    {metrics.scoreDistribution.good}
                  </div>
                )}
                {metrics.scoreDistribution.acceptable > 0 && (
                  <div 
                    className="bg-orange-500 flex items-center justify-center text-white text-lg font-bold transition-all hover:bg-orange-600"
                    style={{ width: `${(metrics.scoreDistribution.acceptable / results.length) * 100}%` }}
                  >
                    {metrics.scoreDistribution.acceptable}
                  </div>
                )}
                {metrics.scoreDistribution.poor > 0 && (
                  <div 
                    className="bg-red-500 flex items-center justify-center text-white text-lg font-bold transition-all hover:bg-red-600"
                    style={{ width: `${(metrics.scoreDistribution.poor / results.length) * 100}%` }}
                  >
                    {metrics.scoreDistribution.poor}
                  </div>
                )}
              </div>
            </div>

            {/* Métricas Clave - ULTRA SIMPLES */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Base de Datos */}
              <div className="bg-purple-50 dark:bg-purple-900/20 rounded-2xl shadow-lg p-8 border-2 border-purple-300 dark:border-purple-700">
                <div className="text-center">
                  <div className="text-5xl mb-3">🗄️</div>
                  <div className="text-5xl font-black text-purple-600 mb-3">{metrics.allChanges.length}</div>
                  <div className="text-base font-bold text-purple-800 dark:text-purple-200 mb-2">
                    Cosas que guardó en la Base de Datos
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                    <div>✅ Agregó: {metrics.changesByType.INSERT}</div>
                    <div>📝 Modificó: {metrics.changesByType.UPDATE}</div>
                    <div>🗑️ Borró: {metrics.changesByType.DELETE}</div>
                  </div>
                </div>
              </div>

              {/* Errores */}
              <div className="bg-red-50 dark:bg-red-900/20 rounded-2xl shadow-lg p-8 border-2 border-red-300 dark:border-red-700">
                <div className="text-center">
                  <div className="text-5xl mb-3">
                    {metrics.criticalCount === 0 ? '✅' : '🚨'}
                  </div>
                  <div className="text-5xl font-black text-red-600 mb-3">{metrics.criticalCount}</div>
                  <div className="text-base font-bold text-red-800 dark:text-red-200 mb-2">
                    {metrics.criticalCount === 0 ? '¡Sin errores graves!' : 'Errores que necesitan atención'}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    {metrics.criticalCount === 0 ? 'Todo funcionó bien' : `${metrics.warningCount} problemas menores adicionales`}
                  </div>
                </div>
              </div>

              {/* Precios */}
              <div className={`${metrics.pricesInconsistent > 0 ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-300 dark:border-orange-700' : 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700'} rounded-2xl shadow-lg p-8 border-2`}>
                <div className="text-center">
                  <div className="text-5xl mb-3">{metrics.pricesInconsistent > 0 ? '⚠️' : '✅'}</div>
                  <div className={`text-5xl font-black mb-3 ${metrics.pricesInconsistent > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                    {metrics.pricesConsistent}
                  </div>
                  <div className={`text-base font-bold mb-2 ${metrics.pricesInconsistent > 0 ? 'text-orange-800 dark:text-orange-200' : 'text-green-800 dark:text-green-200'}`}>
                    Precios que coinciden correctamente
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    {metrics.pricesInconsistent > 0 
                      ? `⚠️ ${metrics.pricesInconsistent} no coinciden (revisa la pestaña Precios)` 
                      : '🎉 Todos los precios son consistentes'}
                  </div>
                </div>
              </div>
            </div>

            {/* Discrepancias Críticas */}
            {metrics.criticalCount > 0 && (
              <div className="bg-red-50 dark:bg-red-900/20 rounded-lg shadow p-6 border-2 border-red-300 dark:border-red-700">
                <h2 className="text-xl font-bold text-red-800 dark:text-red-200 mb-4 flex items-center gap-2">
                  <span>🚨</span>
                  <span>Errores Críticos Detectados ({metrics.criticalCount})</span>
                </h2>
                <div className="space-y-3">
                  {metrics.allDiscrepancies
                    .filter(d => d.severity === 'critical')
                    .map((disc, idx) => (
                      <div key={idx} className="bg-white dark:bg-gray-800 rounded-lg p-4 border-l-4 border-red-500">
                        <div className="flex justify-between items-start mb-2">
                          <span className="font-semibold text-gray-900 dark:text-white">{disc.conversationTitle}</span>
                          <span className="px-2 py-1 bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200 text-xs rounded font-semibold">
                            {disc.type}
                          </span>
                        </div>
                        <p className="text-gray-700 dark:text-gray-300 text-sm">{disc.description}</p>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB: DATABASE */}
        {activeTab === 'database' && (
          <div className="space-y-8">
            {/* Explicación */}
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-6 border-2 border-blue-200 dark:border-blue-800">
              <div className="flex items-start gap-3">
                <span className="text-4xl">💾</span>
                <div>
                  <h3 className="font-bold text-lg text-blue-900 dark:text-blue-100 mb-2">
                    ¿Qué estoy viendo aquí?
                  </h3>
                  <p className="text-blue-800 dark:text-blue-200 leading-relaxed">
                    Te mostramos <strong>cómo quedó la base de datos al final</strong> de todas las conversaciones. 
                    Es el estado final, después de todo lo que hizo el bot.
                  </p>
                </div>
              </div>
            </div>

            {/* 🔥 ESTADO DE BD POR CONVERSACIÓN (NO AGREGADO) */}
            <div className="space-y-6">
              {results.map((result, idx) => {
                const conversationChanges = result.databaseActivity?.changes || [];
                if (conversationChanges.length === 0) return null;
                
                const changesByTable = new Map<string, any[]>();
                conversationChanges.forEach(change => {
                  const existing = changesByTable.get(change.table) || [];
                  changesByTable.set(change.table, [...existing, change]);
                });
                
                return (
                  <div key={idx} className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-2xl shadow-2xl p-8 border-2 border-green-300 dark:border-green-700">
                    <div className="flex items-start justify-between mb-6">
                      <div>
                        <h2 className="text-2xl font-black text-green-900 dark:text-green-100 mb-2">
                          💬 {result.testCase.title}
                        </h2>
                        <p className="text-green-700 dark:text-green-300">
                          {result.testCase.conversationGoal}
                        </p>
                      </div>
                      <div className={`px-4 py-2 rounded-lg font-bold text-white ${
                        result.analysis.overallScore >= 9 ? 'bg-green-500' :
                        result.analysis.overallScore >= 7 ? 'bg-blue-500' :
                        result.analysis.overallScore >= 5 ? 'bg-orange-500' : 'bg-red-500'
                      }`}>
                        {result.analysis.overallScore.toFixed(1)}/10
                      </div>
                    </div>

                    {/* Lo que guardó en BD ESTA conversación */}
                    <div className="space-y-4">
                      {Array.from(changesByTable.entries()).map(([table, changes]) => {
                  // Calcular estado final: contar inserts - deletes
                  const inserts = changes.filter(c => c.type === 'INSERT').length;
                  const deletes = changes.filter(c => c.type === 'DELETE').length;
                  const finalCount = inserts - deletes;
                  
                  // Obtener los últimos registros insertados/modificados
                  const recentRecords = changes
                    .filter(c => c.type === 'INSERT' || c.type === 'UPDATE')
                    .slice(-3) // Últimos 3
                    .reverse();

                  return (
                    <div key={table} className="bg-white dark:bg-gray-800 rounded-xl p-6 border-2 border-gray-300 dark:border-gray-600 shadow-lg">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <div className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase">Tabla:</div>
                          <h3 className="text-2xl font-black text-gray-900 dark:text-white font-mono">
                            {table}
                          </h3>
                        </div>
                        <div className="text-right">
                          <div className="text-sm text-gray-500 dark:text-gray-400">Registros finales:</div>
                          <div className="text-5xl font-black text-green-600 dark:text-green-400">
                            {finalCount}
                          </div>
                        </div>
                      </div>

                      {/* Últimos registros */}
                      {recentRecords.length > 0 && (
                        <div className="mt-4">
                          <div className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-3">
                            📋 Últimos registros guardados:
                          </div>
                          <div className="space-y-3">
                            {recentRecords.map((change, idx) => (
                              <div key={idx} className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-300 dark:border-gray-700">
                                <div className="flex items-center gap-2 mb-2">
                                  <span className={`px-2 py-1 rounded text-xs font-bold text-white ${
                                    change.type === 'INSERT' ? 'bg-green-500' : 'bg-blue-500'
                                  }`}>
                                    {change.type === 'INSERT' ? 'NUEVO' : 'MODIFICADO'}
                                  </span>
                                  <span className="text-xs text-gray-500 dark:text-gray-400">
                                    {new Date(change.timestamp).toLocaleString()}
                                  </span>
                                </div>
                                <pre className="text-xs text-gray-800 dark:text-gray-200 font-mono overflow-x-auto whitespace-pre-wrap">
                                  {JSON.stringify(change.after || change.record, null, 2)}
                                </pre>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Resumen de operaciones */}
                      <div className="mt-4 pt-4 border-t border-gray-300 dark:border-gray-600">
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          Total de operaciones: <strong className="text-green-600">{inserts} agregados</strong>
                          {' · '}
                          <strong className="text-blue-600">{changes.filter(c => c.type === 'UPDATE').length} modificados</strong>
                          {deletes > 0 && (
                            <>
                              {' · '}
                              <strong className="text-red-600">{deletes} eliminados</strong>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                    </div>
                    
                    {/* 🔥 ANÁLISIS: Qué dijo vs Qué hizo */}
                    <div className="mt-6 p-6 bg-white dark:bg-gray-800 rounded-xl border-2 border-blue-300 dark:border-blue-700">
                      <h3 className="text-lg font-bold text-blue-900 dark:text-blue-100 mb-4 flex items-center gap-2">
                        <span>🧠</span>
                        <span>Análisis: ¿Hizo lo que dijo?</span>
                      </h3>
                      <div className="text-gray-800 dark:text-gray-200 leading-relaxed">
                        {result.analysis.summary}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Historial completo (COLAPSABLE) */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8">
              <button
                onClick={() => {
                  const section = document.getElementById('db-history-section');
                  if (section) {
                    section.classList.toggle('hidden');
                  }
                }}
                className="w-full flex items-center justify-between p-4 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors mb-4"
              >
                <h3 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
                  <span>📜</span>
                  <span>Historial completo de operaciones (opcional)</span>
                </h3>
                <span className="text-gray-500">▼</span>
              </button>

              <div id="db-history-section" className="hidden">
                <p className="text-gray-600 dark:text-gray-400 mb-6">
                  Todas las operaciones en orden cronológico:
                </p>
                
                {/* Detalle de Cambios - SIMPLIFICADO */}
                <div>
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-3">
                  <span>🔍</span>
                  <span>Detalle completo: ¿Qué cambió exactamente?</span>
                </h3>
                <div className="space-y-6">
                  {metrics.allChanges.map((change, idx) => (
                    <div key={idx} className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 border-2 border-gray-300 dark:border-gray-600 rounded-xl p-6 shadow-md">
                      {/* Header */}
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center gap-3">
                          <span className={`px-4 py-2 rounded-lg font-bold text-white text-lg ${
                            change.type === 'INSERT' ? 'bg-green-500' :
                            change.type === 'UPDATE' ? 'bg-blue-500' :
                            'bg-red-500'
                          }`}>
                            {change.type === 'INSERT' ? '✅ Agregó' : 
                             change.type === 'UPDATE' ? '📝 Modificó' : 
                             '🗑️ Borró'}
                          </span>
                          <div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 uppercase">En la tabla:</div>
                            <div className="font-mono text-base font-bold text-gray-900 dark:text-gray-100">
                              {change.table}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-gray-500 dark:text-gray-400">Cuándo:</div>
                          <div className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                            {new Date(change.timestamp).toLocaleTimeString()}
                          </div>
                        </div>
                      </div>

                      {/* Si es UPDATE, mostrar ANTES/DESPUÉS */}
                      {change.type === 'UPDATE' && (change.before || change.after) && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="bg-red-50 dark:bg-red-900/20 border-2 border-red-300 dark:border-red-700 rounded-lg p-4">
                            <div className="text-sm font-bold text-red-700 dark:text-red-300 mb-3 flex items-center gap-2">
                              <span>⬅️</span>
                              <span>VALOR ANTERIOR:</span>
                            </div>
                            <pre className="text-xs text-gray-800 dark:text-gray-200 font-mono overflow-x-auto whitespace-pre-wrap">
                              {JSON.stringify(change.before, null, 2)}
                            </pre>
                          </div>
                          <div className="bg-green-50 dark:bg-green-900/20 border-2 border-green-300 dark:border-green-700 rounded-lg p-4">
                            <div className="text-sm font-bold text-green-700 dark:text-green-300 mb-3 flex items-center gap-2">
                              <span>➡️</span>
                              <span>VALOR NUEVO:</span>
                            </div>
                            <pre className="text-xs text-gray-800 dark:text-gray-200 font-mono overflow-x-auto whitespace-pre-wrap">
                              {JSON.stringify(change.after, null, 2)}
                            </pre>
                          </div>
                        </div>
                      )}

                      {/* Si es INSERT o DELETE, mostrar el dato */}
                      {(change.type === 'INSERT' || change.type === 'DELETE') && change.record && (
                        <div className={`${change.type === 'INSERT' ? 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700' : 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700'} border-2 rounded-lg p-4`}>
                          <div className={`text-sm font-bold mb-3 ${change.type === 'INSERT' ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}`}>
                            {change.type === 'INSERT' ? '➕ Datos que agregó:' : '➖ Datos que borró:'}
                          </div>
                          <pre className="text-xs text-gray-800 dark:text-gray-200 font-mono overflow-x-auto whitespace-pre-wrap">
                            {JSON.stringify(change.record, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB: PRICES */}
        {activeTab === 'prices' && (
          <div className="space-y-8">
            {/* Explicación */}
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-6 border-2 border-blue-200 dark:border-blue-800">
              <div className="flex items-start gap-3">
                <span className="text-4xl">💰</span>
                <div>
                  <h3 className="font-bold text-lg text-blue-900 dark:text-blue-100 mb-2">
                    ¿Qué estoy comparando?
                  </h3>
                  <p className="text-blue-800 dark:text-blue-200 leading-relaxed">
                    Esto compara <strong>los precios que el bot mencionó al cliente</strong> con <strong>los que guardó en la base de datos</strong>. 
                    Si no coinciden, puede haber un problema de memoria o configuración.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-3">
                <span>🔍</span>
                <span>Comparación por Conversación</span>
              </h2>

              {metrics.priceComparisons.map((comparison, idx) => {
                if (comparison.mentioned.length === 0 && comparison.inDB.length === 0 && comparison.inPrompt.length === 0) return null;

                return (
                  <div key={idx} className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 border-2 border-gray-300 dark:border-gray-600 rounded-xl p-6 mb-6 shadow-md">
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-5 flex items-center gap-2">
                      <span>💬</span>
                      <span>{comparison.conversationTitle}</span>
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-4">
                      {/* Precios Mencionados */}
                      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-6 border-2 border-blue-300 dark:border-blue-700">
                        <div className="text-sm font-bold text-blue-700 dark:text-blue-300 mb-4 flex items-center gap-2">
                          <span className="text-2xl">💬</span>
                          <span>EN CONVERSACIÓN:</span>
                        </div>
                        {comparison.mentioned.length > 0 ? (
                          <div className="space-y-2">
                            {comparison.mentioned.map((price, i) => (
                              <div key={i} className="bg-white dark:bg-gray-800 rounded-lg p-3">
                                <div className="text-2xl font-mono font-black text-blue-900 dark:text-blue-100 text-center">
                                  ${price.value}
                                </div>
                                {price.context && (
                                  <div className="text-xs text-gray-500 dark:text-gray-400 text-center mt-1">
                                    {price.context}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center text-gray-500 py-4">No mencionó precios</div>
                        )}
                      </div>

                      {/* Precios en BD */}
                      <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-6 border-2 border-purple-300 dark:border-purple-700">
                        <div className="text-sm font-bold text-purple-700 dark:text-purple-300 mb-4 flex items-center gap-2">
                          <span className="text-2xl">🗄️</span>
                          <span>EN BASE DE DATOS:</span>
                        </div>
                        {comparison.inDB.length > 0 ? (
                          <div className="space-y-2">
                            {comparison.inDB.map((price, i) => (
                              <div key={i} className="bg-white dark:bg-gray-800 rounded-lg p-3">
                                <div className="text-2xl font-mono font-black text-purple-900 dark:text-purple-100 text-center">
                                  ${price.value}
                                </div>
                                {price.context && (
                                  <div className="text-xs text-gray-500 dark:text-gray-400 text-center mt-1">
                                    {price.context}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center text-gray-500 py-4">No guardó precios</div>
                        )}
                      </div>

                      {/* 🔥 NUEVO: Precios en System Prompt */}
                      <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-xl p-6 border-2 border-yellow-300 dark:border-yellow-700">
                        <div className="text-sm font-bold text-yellow-700 dark:text-yellow-300 mb-4 flex items-center gap-2">
                          <span className="text-2xl">📋</span>
                          <span>EN SYSTEM PROMPT:</span>
                        </div>
                        {comparison.inPrompt.length > 0 ? (
                          <div className="space-y-2">
                            {comparison.inPrompt.map((price, i) => (
                              <div key={i} className="bg-white dark:bg-gray-800 rounded-lg p-3">
                                <div className="text-2xl font-mono font-black text-yellow-900 dark:text-yellow-100 text-center">
                                  ${price.value}
                                </div>
                                {price.context && (
                                  <div className="text-xs text-gray-500 dark:text-gray-400 text-center mt-1">
                                    {price.context}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center text-gray-500 py-4">Sin precios en prompt</div>
                        )}
                      </div>
                    </div>

                    {/* Verificación y Discrepancias */}
                    {(comparison.mentioned.length > 0 || comparison.inDB.length > 0 || comparison.inPrompt.length > 0) && (
                      <div className={`p-5 rounded-xl border-2 ${
                        comparison.consistent
                          ? 'bg-green-100 dark:bg-green-900/20 border-green-400 dark:border-green-600'
                          : 'bg-red-100 dark:bg-red-900/20 border-red-400 dark:border-red-600'
                      }`}>
                        <div className={`flex items-center gap-3 font-bold text-lg ${
                          comparison.consistent
                            ? 'text-green-700 dark:text-green-300'
                            : 'text-red-700 dark:text-red-300'
                        }`}>
                          <span className="text-3xl">{comparison.consistent ? '✅' : '⚠️'}</span>
                          <span>
                            {comparison.consistent 
                              ? '¡Perfecto! Los precios coinciden en todas las fuentes'
                              : '¡ATENCIÓN! Hay discrepancias en los precios'}
                          </span>
                        </div>
                        
                        {/* Mostrar discrepancias detalladas */}
                        {!comparison.consistent && comparison.discrepancies.length > 0 && (
                          <div className="mt-4 space-y-2">
                            <div className="text-sm font-bold text-red-800 dark:text-red-200">
                              Problemas detectados:
                            </div>
                            {comparison.discrepancies.map((disc, i) => (
                              <div key={i} className="text-sm text-red-700 dark:text-red-300 flex items-start gap-2">
                                <span>→</span>
                                <span>{disc}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB: TOOLS */}
        {activeTab === 'tools' && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
              Verificación de Herramientas
            </h2>
            <div className="text-gray-600 dark:text-gray-400">
              {/* TODO: Agregar verificación de herramientas (Gmail, Calendar, etc) */}
              Sección en desarrollo - Mostrará verificación de herramientas externas
            </div>
          </div>
        )}

        {/* TAB: CONVERSATIONS */}
        {activeTab === 'conversations' && (
          <div className="space-y-6">
            {/* Explicación */}
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-6 border-2 border-blue-200 dark:border-blue-800">
              <div className="flex items-start gap-3">
                <span className="text-4xl">💬</span>
                <div>
                  <h3 className="font-bold text-lg text-blue-900 dark:text-blue-100 mb-2">
                    ¿Qué son estas conversaciones?
                  </h3>
                  <p className="text-blue-800 dark:text-blue-200 leading-relaxed">
                    Estas son las <strong>conversaciones de prueba</strong> que usamos para auditar tu bot. 
                    Cada una simula un cliente real. Hacé clic en cada una para ver los mensajes completos, 
                    el análisis y qué guardó en la base de datos.
                  </p>
                </div>
              </div>
            </div>

            {results.map((result) => {
              const isExpanded = expandedConversations.has(result.id);
              
              return (
                <div key={result.id} className="bg-white dark:bg-gray-800 rounded-lg shadow">
                  <button
                    onClick={() => toggleConversation(result.id)}
                    className="w-full p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-16 h-16 rounded-lg flex items-center justify-center text-white font-bold text-2xl ${getScoreColor(result.analysis.overallScore)}`}>
                        {result.analysis.overallScore.toFixed(1)}
                      </div>
                      <div className="text-left">
                        <h3 className="font-semibold text-gray-900 dark:text-white">
                          {result.testCase.title}
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {result.testCase.conversationGoal}
                        </p>
                      </div>
                    </div>
                    <span className="text-gray-400">{isExpanded ? '▼' : '▶'}</span>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-900">
                      {/* Resumen */}
                      <div className="mb-4">
                        <h4 className="font-semibold text-gray-800 dark:text-gray-200 mb-2">📝 Resumen</h4>
                        <p className="text-gray-700 dark:text-gray-300">{result.analysis.summary}</p>
                      </div>

                      {/* Conversación */}
                      <div className="mb-4">
                        <h4 className="font-semibold text-gray-800 dark:text-gray-200 mb-2">💬 Conversación</h4>
                        <div className="space-y-2">
                          {result.executionTrace.map((step, idx) => {
                            const userMessage = step.input?.message || step.input?.body;
                            const botMessage = step.output?.response || step.output?.message || '';

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

                      {/* Cambios en BD */}
                      {result.databaseActivity?.changes && result.databaseActivity.changes.length > 0 && (
                        <div>
                          <h4 className="font-semibold text-gray-800 dark:text-gray-200 mb-2">
                            🗄️ Cambios en BD ({result.databaseActivity.changes.length})
                          </h4>
                          <div className="space-y-2">
                            {result.databaseActivity.changes.map((change, idx) => (
                              <div key={idx} className="text-sm bg-white dark:bg-gray-800 p-2 rounded">
                                <span className="font-semibold">{change.type}</span> en{' '}
                                <span className="font-mono">{change.table}</span>
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
        )}

        {/* TAB: AI ANALYSIS */}
        {activeTab === 'ai-analysis' && (
          <div className="space-y-4">
            {results.map((result) => (
              <div key={result.id} className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-3">
                  {result.testCase.title}
                </h3>
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

export default ProfessionalAuditReport;


