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
    
    // Precios
    const priceAnalysis = results.map(result => {
      const mentioned: string[] = [];
      const inDB: string[] = [];
      
      // Precios mencionados
      result.executionTrace.forEach(step => {
        const botMessage = step.output?.response || step.output?.message || '';
        const priceRegex = /\$\s*(\d+(?:[.,]\d{3})*(?:[.,]\d{2})?)/g;
        let match;
        while ((match = priceRegex.exec(botMessage)) !== null) {
          mentioned.push(match[1]);
        }
      });
      
      // Precios en BD
      if (result.databaseActivity?.changes) {
        result.databaseActivity.changes.forEach(change => {
          const record = change.record || change.after || {};
          ['precio', 'price', 'monto', 'amount', 'total'].forEach(field => {
            if (record[field]) {
              inDB.push(String(record[field]));
            }
          });
        });
      }
      
      return {
        conversation: result.testCase.title,
        mentioned: [...new Set(mentioned)],
        inDB: [...new Set(inDB)],
        consistent: mentioned.length > 0 && inDB.length > 0 && mentioned.some(m => inDB.includes(m))
      };
    });
    
    const pricesConsistent = priceAnalysis.filter(p => p.consistent).length;
    const pricesInconsistent = priceAnalysis.filter(p => p.mentioned.length > 0 && p.inDB.length > 0 && !p.consistent).length;
    
    return {
      avgScore,
      scoreDistribution,
      allChanges,
      changesByTable,
      changesByType,
      allDiscrepancies,
      criticalCount,
      warningCount,
      priceAnalysis,
      pricesConsistent,
      pricesInconsistent,
    };
  }, [results]);

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
          <div className="space-y-6">
            {/* Score Distribution */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                Distribución de Scores
              </h2>
              
              <div className="grid grid-cols-4 gap-4 mb-6">
                <div className="text-center">
                  <div className="text-4xl font-bold text-green-600">{metrics.scoreDistribution.excellent}</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">Excelente (9-10)</div>
                </div>
                <div className="text-center">
                  <div className="text-4xl font-bold text-blue-600">{metrics.scoreDistribution.good}</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">Bueno (7-8.9)</div>
                </div>
                <div className="text-center">
                  <div className="text-4xl font-bold text-orange-600">{metrics.scoreDistribution.acceptable}</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">Aceptable (5-6.9)</div>
                </div>
                <div className="text-center">
                  <div className="text-4xl font-bold text-red-600">{metrics.scoreDistribution.poor}</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">Pobre (&lt;5)</div>
                </div>
              </div>

              {/* Visual Bar */}
              <div className="h-8 flex rounded-lg overflow-hidden">
                {metrics.scoreDistribution.excellent > 0 && (
                  <div 
                    className="bg-green-500 flex items-center justify-center text-white text-sm font-bold"
                    style={{ width: `${(metrics.scoreDistribution.excellent / results.length) * 100}%` }}
                  >
                    {metrics.scoreDistribution.excellent}
                  </div>
                )}
                {metrics.scoreDistribution.good > 0 && (
                  <div 
                    className="bg-blue-500 flex items-center justify-center text-white text-sm font-bold"
                    style={{ width: `${(metrics.scoreDistribution.good / results.length) * 100}%` }}
                  >
                    {metrics.scoreDistribution.good}
                  </div>
                )}
                {metrics.scoreDistribution.acceptable > 0 && (
                  <div 
                    className="bg-orange-500 flex items-center justify-center text-white text-sm font-bold"
                    style={{ width: `${(metrics.scoreDistribution.acceptable / results.length) * 100}%` }}
                  >
                    {metrics.scoreDistribution.acceptable}
                  </div>
                )}
                {metrics.scoreDistribution.poor > 0 && (
                  <div 
                    className="bg-red-500 flex items-center justify-center text-white text-sm font-bold"
                    style={{ width: `${(metrics.scoreDistribution.poor / results.length) * 100}%` }}
                  >
                    {metrics.scoreDistribution.poor}
                  </div>
                )}
              </div>
            </div>

            {/* Métricas Clave */}
            <div className="grid grid-cols-3 gap-6">
              <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg shadow p-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-purple-600 dark:text-purple-400 text-3xl">🗄️</span>
                  <span className="text-3xl font-bold text-purple-600 dark:text-purple-400">
                    {metrics.allChanges.length}
                  </span>
                </div>
                <div className="text-gray-700 dark:text-gray-300 font-semibold">Operaciones en BD</div>
                <div className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                  {metrics.changesByType.INSERT} inserts · {metrics.changesByType.UPDATE} updates · {metrics.changesByType.DELETE} deletes
                </div>
              </div>

              <div className="bg-red-50 dark:bg-red-900/20 rounded-lg shadow p-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-red-600 dark:text-red-400 text-3xl">🚨</span>
                  <span className="text-3xl font-bold text-red-600 dark:text-red-400">
                    {metrics.criticalCount}
                  </span>
                </div>
                <div className="text-gray-700 dark:text-gray-300 font-semibold">Errores Críticos</div>
                <div className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                  {metrics.warningCount} advertencias adicionales
                </div>
              </div>

              <div className={`${metrics.pricesInconsistent > 0 ? 'bg-orange-50 dark:bg-orange-900/20' : 'bg-green-50 dark:bg-green-900/20'} rounded-lg shadow p-6`}>
                <div className="flex items-center justify-between mb-2">
                  <span className={`${metrics.pricesInconsistent > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-green-600 dark:text-green-400'} text-3xl`}>💰</span>
                  <span className={`text-3xl font-bold ${metrics.pricesInconsistent > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-green-600 dark:text-green-400'}`}>
                    {metrics.pricesConsistent}
                  </span>
                </div>
                <div className="text-gray-700 dark:text-gray-300 font-semibold">Precios Consistentes</div>
                <div className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                  {metrics.pricesInconsistent} inconsistencias detectadas
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
          <div className="space-y-6">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                Actividad en Base de Datos
              </h2>

              {/* Resumen por Tabla */}
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-3">
                  Operaciones por Tabla
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  {Array.from(metrics.changesByTable.entries()).map(([table, changes]) => (
                    <div key={table} className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4">
                      <div className="font-mono text-sm font-semibold text-purple-800 dark:text-purple-200">
                        {table}
                      </div>
                      <div className="text-2xl font-bold text-purple-600 dark:text-purple-400 mt-2">
                        {changes.length} operaciones
                      </div>
                      <div className="text-xs text-gray-600 dark:text-gray-400 mt-2">
                        {changes.filter(c => c.type === 'INSERT').length} inserts · 
                        {changes.filter(c => c.type === 'UPDATE').length} updates · 
                        {changes.filter(c => c.type === 'DELETE').length} deletes
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Detalle de Cambios */}
              <div>
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-3">
                  Detalle de Operaciones
                </h3>
                <div className="space-y-4">
                  {metrics.allChanges.map((change, idx) => (
                    <div key={idx} className="border border-gray-300 dark:border-gray-600 rounded-lg p-4">
                      <div className="flex justify-between items-center mb-3">
                        <div className="flex items-center gap-3">
                          <span className={`px-3 py-1 rounded font-bold text-white ${
                            change.type === 'INSERT' ? 'bg-green-500' :
                            change.type === 'UPDATE' ? 'bg-blue-500' :
                            'bg-red-500'
                          }`}>
                            {change.type}
                          </span>
                          <span className="font-mono text-sm text-gray-700 dark:text-gray-300 font-semibold">
                            {change.table}
                          </span>
                        </div>
                        <span className="text-xs text-gray-500">
                          {new Date(change.timestamp).toLocaleString()}
                        </span>
                      </div>

                      {change.type === 'UPDATE' && (change.before || change.after) && (
                        <div className="grid grid-cols-2 gap-4 bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                          <div>
                            <div className="text-xs font-bold text-gray-600 dark:text-gray-400 mb-2">
                              ⬅️ ANTES:
                            </div>
                            <pre className="text-xs text-gray-800 dark:text-gray-200 font-mono overflow-x-auto">
                              {JSON.stringify(change.before, null, 2)}
                            </pre>
                          </div>
                          <div>
                            <div className="text-xs font-bold text-gray-600 dark:text-gray-400 mb-2">
                              ➡️ DESPUÉS:
                            </div>
                            <pre className="text-xs text-gray-800 dark:text-gray-200 font-mono overflow-x-auto">
                              {JSON.stringify(change.after, null, 2)}
                            </pre>
                          </div>
                        </div>
                      )}

                      {(change.type === 'INSERT' || change.type === 'DELETE') && change.record && (
                        <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                          <div className="text-xs font-bold text-gray-600 dark:text-gray-400 mb-2">
                            {change.type === 'INSERT' ? '➕ REGISTRO:' : '➖ REGISTRO:'}
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
            </div>
          </div>
        )}

        {/* TAB: PRICES */}
        {activeTab === 'prices' && (
          <div className="space-y-6">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                Análisis de Precios
              </h2>

              {metrics.priceAnalysis.map((analysis, idx) => {
                if (analysis.mentioned.length === 0 && analysis.inDB.length === 0) return null;

                return (
                  <div key={idx} className="border border-gray-300 dark:border-gray-600 rounded-lg p-4 mb-4">
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-3">
                      {analysis.conversation}
                    </h3>

                    <div className="grid grid-cols-2 gap-4 mb-3">
                      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                        <div className="text-xs font-bold text-blue-600 dark:text-blue-400 mb-2">
                          💬 MENCIONADO EN CONVERSACIÓN
                        </div>
                        {analysis.mentioned.length > 0 ? (
                          <div className="space-y-1">
                            {analysis.mentioned.map((price, i) => (
                              <div key={i} className="text-sm font-mono font-bold text-gray-800 dark:text-gray-200">
                                ${price}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-sm text-gray-500">Sin precios</span>
                        )}
                      </div>

                      <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4">
                        <div className="text-xs font-bold text-purple-600 dark:text-purple-400 mb-2">
                          🗄️ EN BASE DE DATOS
                        </div>
                        {analysis.inDB.length > 0 ? (
                          <div className="space-y-1">
                            {analysis.inDB.map((price, i) => (
                              <div key={i} className="text-sm font-mono font-bold text-gray-800 dark:text-gray-200">
                                ${price}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-sm text-gray-500">Sin precios</span>
                        )}
                      </div>
                    </div>

                    {analysis.mentioned.length > 0 && analysis.inDB.length > 0 && (
                      <div className={`p-3 rounded-lg ${
                        analysis.consistent
                          ? 'bg-green-100 dark:bg-green-900/20'
                          : 'bg-red-100 dark:bg-red-900/20'
                      }`}>
                        <div className={`flex items-center gap-2 font-semibold ${
                          analysis.consistent
                            ? 'text-green-700 dark:text-green-300'
                            : 'text-red-700 dark:text-red-300'
                        }`}>
                          <span>{analysis.consistent ? '✅' : '⚠️'}</span>
                          <span>
                            {analysis.consistent 
                              ? 'Precios consistentes'
                              : 'DISCREPANCIA: Precios diferentes en conversación vs BD'}
                          </span>
                        </div>
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
          <div className="space-y-4">
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

