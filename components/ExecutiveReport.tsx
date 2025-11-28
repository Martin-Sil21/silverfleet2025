import React, { useState, useMemo } from 'react';
import type { AuditResult, AuditConfig } from '../types';

interface ExecutiveReportProps {
  results: AuditResult[];
  config: AuditConfig;
  onReset: () => void;
  onReaudit: (config: AuditConfig) => void;
  onRepeatAudit?: (config: AuditConfig) => void;
}

// Función para generar prompt estructurado para LLM
const generateLLMPrompt = (results: AuditResult[], config: AuditConfig): string => {
  console.log('🛠️ [FixGuide] Iniciando generación de prompt...');
  console.log('🛠️ [FixGuide] Results:', results.length);
  console.log('🛠️ [FixGuide] Config:', config.name);
  
  if (!results || results.length === 0) {
    console.error('🛠️ [FixGuide] ERROR: No hay resultados');
    return 'ERROR: No hay resultados de auditoría disponibles.';
  }
  
  const failedResults = results.filter(r => r.analysis.overallScore < 7);
  console.log('🛠️ [FixGuide] Failed results:', failedResults.length);
  
  if (failedResults.length === 0) {
    return '✅ TODOS LOS TEST CASES PASARON\n\nNo se requieren correcciones. El agente está funcionando correctamente según los criterios establecidos.';
  }

  // === AGRUPAR PROBLEMAS COMUNES ===
  
  // 1. Agrupar criterios fallidos por tipo (sin personas)
  const criteriaMap = new Map<string, {
    scores: number[];
    justifications: Set<string>;
    evidences: string[];
    recommendations: Set<string>;
    affectedCases: string[];
  }>();
  
  // 2. Recolectar hallazgos críticos únicos
  const criticalFindingsMap = new Map<string, {
    description: string;
    evidences: Set<string>;
    count: number;
  }>();
  
  // 3. Recolectar recomendaciones únicas
  const allRecommendations = new Set<string>();
  
  // Procesar todos los casos fallidos
  failedResults.forEach((result) => {
    const failedCriteria = result.analysis.criteriaBreakdown?.filter(c => c.score < 7) || [];
    
    // Procesar criterios
    failedCriteria.forEach((criteria) => {
      if (!criteriaMap.has(criteria.criterion)) {
        criteriaMap.set(criteria.criterion, {
          scores: [],
          justifications: new Set(),
          evidences: [],
          recommendations: new Set(),
          affectedCases: []
        });
      }
      
      const entry = criteriaMap.get(criteria.criterion)!;
      entry.scores.push(criteria.score);
      entry.justifications.add(criteria.justification);
      entry.affectedCases.push(result.testCase.title);
      
      if (criteria.evidence) {
        entry.evidences.push(...criteria.evidence);
      }
      
      if (criteria.recommendation) {
        entry.recommendations.add(criteria.recommendation);
      }
    });
    
    // Procesar hallazgos críticos
    const criticalFindings = result.analysis.keyFindings?.filter(f => f.type === 'critical') || [];
    criticalFindings.forEach((finding) => {
      if (!criticalFindingsMap.has(finding.title)) {
        criticalFindingsMap.set(finding.title, {
          description: finding.description,
          evidences: new Set(),
          count: 0
        });
      }
      
      const entry = criticalFindingsMap.get(finding.title)!;
      entry.count++;
      if (finding.evidence) {
        finding.evidence.forEach(ev => entry.evidences.add(ev));
      }
    });
    
    // Recolectar recomendaciones generales
    if (result.analysis.recommendations) {
      result.analysis.recommendations.forEach(rec => allRecommendations.add(rec));
    }
  });
  
  // === CALCULAR SCORE PROMEDIO (debe coincidir con stats.avgScore) ===
  const globalAvgScore = results.length > 0 
    ? (results.reduce((sum, r) => sum + (r.analysis?.overallScore || 0), 0) / results.length)
    : 0;
  
  console.log('🛠️ [FixGuide] Global avg score:', globalAvgScore.toFixed(1));
  console.log('🛠️ [FixGuide] Failed results:', failedResults.length);
  console.log('🛠️ [FixGuide] Total results:', results.length);
  console.log('🛠️ [FixGuide] Individual scores:', results.map(r => r.analysis?.overallScore));
  
  // === GENERAR PROMPT ===
  
  let prompt = `# 🔧 INSTRUCCIONES DE CORRECCIÓN PARA AGENTE IA

## 📋 CONTEXTO DEL PROYECTO
Tipo: ${config.codeProject ? 'Proyecto Node/TypeScript' : 'Workflow n8n'}
Endpoint: ${config.endpointUrl || 'No especificado'}
Total de test cases: ${results.length} (${failedResults.length} fallidos)
Score promedio global: ${globalAvgScore.toFixed(1)}/10
Criterios evaluados: ${config.criteria.join(', ')}

## 🎯 OBJETIVO
Corregir los problemas **sistemáticos** detectados en la auditoría del agente conversacional.

**IMPORTANTE:** Esta guía agrupa problemas comunes encontrados en múltiples test cases. NO es necesario corregir cada caso individual, sino identificar y corregir las causas raíz que afectan a múltiples escenarios.

## ❌ PROBLEMAS SISTEMÁTICOS DETECTADOS

`;

  // Generar secciones por criterio fallido
  let problemIndex = 1;
  criteriaMap.forEach((data, criterionName) => {
    const avgScore = (data.scores.reduce((a, b) => a + b, 0) / data.scores.length).toFixed(1);
    
    prompt += `### ${problemIndex}. PROBLEMA: ${criterionName}\n`;
    prompt += `**Score promedio:** ${avgScore}/10 ❌\n`;
    prompt += `**Casos afectados:** ${data.affectedCases.length}/${failedResults.length}\n`;
    prompt += `**Ejemplos:** ${data.affectedCases.slice(0, 3).join(', ')}${data.affectedCases.length > 3 ? '...' : ''}\n\n`;
    
    // Problemas únicos detectados
    if (data.justifications.size > 0) {
      prompt += `**Descripción del problema:**\n`;
      Array.from(data.justifications).forEach(justification => {
        prompt += `${justification}\n\n`;
      });
    }
    
    // Evidencia (limitar a primeros 3 ejemplos más relevantes)
    if (data.evidences.length > 0) {
      prompt += `**Evidencia (ejemplos):**\n`;
      data.evidences.slice(0, 3).forEach(ev => prompt += `- ${ev}\n`);
      if (data.evidences.length > 3) {
        prompt += `- ... y ${data.evidences.length - 3} ejemplos más\n`;
      }
      prompt += `\n`;
    }
    
    // Acciones requeridas consolidadas
    if (data.recommendations.size > 0) {
      prompt += `**✅ SOLUCIÓN:**\n`;
      Array.from(data.recommendations).forEach(rec => {
        prompt += `${rec}\n\n`;
      });
    }
    
    prompt += `---\n\n`;
    problemIndex++;
  });

  // Hallazgos críticos consolidados
  if (criticalFindingsMap.size > 0) {
    prompt += `## 🚨 HALLAZGOS CRÍTICOS (ALTA PRIORIDAD)

Estos problemas aparecen en múltiples test cases y requieren atención inmediata:

`;
    criticalFindingsMap.forEach((data, title) => {
      prompt += `### ${title}\n`;
      prompt += `**Ocurrencias:** ${data.count} casos afectados\n`;
      prompt += `**Descripción:** ${data.description}\n\n`;
      
      if (data.evidences.size > 0) {
        prompt += `**Evidencia consolidada:**\n`;
        Array.from(data.evidences).slice(0, 3).forEach(ev => prompt += `- ${ev}\n`);
        if (data.evidences.size > 3) {
          prompt += `- ... y ${data.evidences.size - 3} ejemplos más\n`;
        }
        prompt += `\n`;
      }
    });
    
    prompt += `---\n\n`;
  }

  // Recomendaciones generales consolidadas
  if (allRecommendations.size > 0) {
    prompt += `## 💡 RECOMENDACIONES GENERALES

`;
    Array.from(allRecommendations).forEach(rec => {
      prompt += `- ${rec}\n`;
    });
    prompt += `\n---\n\n`;
  }

  // Instrucciones finales
  prompt += `## 📝 FORMATO DE IMPLEMENTACIÓN

Para cada corrección:

1. **Identifica el archivo exacto** que necesita cambios
2. **Localiza la línea o función específica** (busca en el código por nombres de funciones, prompts del sistema, etc.)
3. **Aplica los cambios sugeridos** en las "ACCIONES REQUERIDAS" arriba
4. **Verifica** que la corrección no rompa otras funcionalidades

## ✅ CRITERIOS DE ÉXITO

Después de aplicar las correcciones:
- Todos los test cases deben alcanzar un score ≥ 7.0/10
- Los problemas críticos (🚨) deben estar completamente resueltos
- Las recomendaciones (💡) deben implementarse en la medida de lo posible

## 🔄 NEXT STEPS

1. Copia este prompt completo
2. Pégalo en tu LLM favorito (Cursor, Lovable, Windsurf, etc.)
3. Adjunta los archivos relevantes de tu proyecto
4. Ejecuta las correcciones sugeridas
5. Vuelve a ejecutar la auditoría para validar

---
*Generado automáticamente por Silver Fleet AI Auditor*
`;

  return prompt;
};

const ExecutiveReport: React.FC<ExecutiveReportProps> = ({ results, config, onReset, onReaudit, onRepeatAudit }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'objectives' | 'conversations' | 'prices' | 'database' | 'fixes'>('overview');
  const [expandedConv, setExpandedConv] = useState<Set<string>>(new Set());

  // Stats
  const stats = useMemo(() => {
    const avgScore = results.reduce((sum, r) => sum + r.analysis.overallScore, 0) / results.length;
    const passed = results.filter(r => r.analysis.overallScore >= 7).length;
    const warning = results.filter(r => r.analysis.overallScore >= 5 && r.analysis.overallScore < 7).length;
    const failed = results.filter(r => r.analysis.overallScore < 5).length;
    const totalChanges = results.reduce((sum, r) => sum + (r.databaseActivity?.changes?.length || 0), 0);
    const totalOps = results.reduce((sum, r) => sum + (r.databaseActivity?.totalOperations || 0), 0);
    
    return { avgScore, passed, warning, failed, totalChanges, totalOps };
  }, [results]);

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 p-4">
      <div className="max-w-[1600px] mx-auto">
        
        {/* Header */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 mb-4">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold">📊 Reporte de Auditoría</h1>
            <div className="flex gap-2">
              {onRepeatAudit && (
                <button onClick={() => onRepeatAudit(config)} className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700">
                  🔁 Repetir
                </button>
              )}
              <button onClick={() => onReaudit(config)} className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700">
                🔄 Re-auditar
              </button>
              <button onClick={onReset} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                ← Nueva
              </button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow mb-4">
          <div className="flex border-b">
            <button onClick={() => setActiveTab('overview')} className={`px-6 py-3 font-medium ${activeTab === 'overview' ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400' : 'text-gray-800 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100'}`}>
              📈 Resumen
            </button>
            <button onClick={() => setActiveTab('objectives')} className={`px-6 py-3 font-medium ${activeTab === 'objectives' ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400' : 'text-gray-800 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100'}`}>
              🎯 Objetivos ({stats.failed > 0 ? stats.failed : '✓'})
            </button>
            <button onClick={() => setActiveTab('conversations')} className={`px-6 py-3 font-medium ${activeTab === 'conversations' ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400' : 'text-gray-800 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100'}`}>
              💬 Conversaciones
            </button>
            <button onClick={() => setActiveTab('prices')} className={`px-6 py-3 font-medium ${activeTab === 'prices' ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400' : 'text-gray-800 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100'}`}>
              💰 Precios
            </button>
            <button onClick={() => setActiveTab('database')} className={`px-6 py-3 font-medium ${activeTab === 'database' ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400' : 'text-gray-800 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100'}`}>
              🗄️ Base Datos
            </button>
            <button onClick={() => setActiveTab('fixes')} className={`px-6 py-3 font-medium ${activeTab === 'fixes' ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400' : 'text-gray-800 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100'}`}>
              🛠️ Fix Guide
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          
          {/* OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold mb-4">Resumen General</h2>
              <div className="grid grid-cols-4 gap-4">
                <div className="text-center p-4 bg-gray-50 dark:bg-gray-700 rounded">
                  <div className="text-4xl font-bold text-blue-600">{stats.avgScore.toFixed(1)}</div>
                  <div className="text-sm text-gray-800 dark:text-gray-300 font-medium">Score Promedio</div>
                </div>
                <div className="text-center p-4 bg-gray-50 dark:bg-gray-700 rounded">
                  <div className="text-4xl font-bold text-green-600">{stats.passed}</div>
                  <div className="text-sm text-gray-800 dark:text-gray-300 font-medium">✅ Pasaron</div>
                </div>
                <div className="text-center p-4 bg-gray-50 dark:bg-gray-700 rounded">
                  <div className="text-4xl font-bold text-yellow-600">{stats.warning}</div>
                  <div className="text-sm text-gray-800 dark:text-gray-300 font-medium">⚠️ Advertencia</div>
                </div>
                <div className="text-center p-4 bg-gray-50 dark:bg-gray-700 rounded">
                  <div className="text-4xl font-bold text-red-600">{stats.failed}</div>
                  <div className="text-sm text-gray-800 dark:text-gray-300 font-medium">❌ Fallaron</div>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4 mt-4">
                <div className="text-center p-4 bg-purple-50 dark:bg-purple-900/20 rounded">
                  <div className="text-3xl font-bold text-purple-600">{stats.totalOps}</div>
                  <div className="text-sm text-gray-800 dark:text-gray-300 font-medium">Operaciones BD</div>
                </div>
                <div className="text-center p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded">
                  <div className="text-3xl font-bold text-indigo-600">{stats.totalChanges}</div>
                  <div className="text-sm text-gray-800 dark:text-gray-300 font-medium">Cambios Registrados</div>
                </div>
              </div>
            </div>
          )}

          {/* OBJECTIVES */}
          {activeTab === 'objectives' && (
            <div className="space-y-3">
              <h2 className="text-xl font-bold mb-4">Objetivos y Resultados</h2>
              {results.map(result => {
                const score = result.analysis.overallScore;
                const passed = score >= 7;
                
                return (
                  <div key={result.id} className={`p-4 rounded border-l-4 ${passed ? 'bg-green-100 dark:bg-green-900/30 border-green-600 dark:border-green-500' : 'bg-red-100 dark:bg-red-900/30 border-red-600 dark:border-red-500'}`}>
                    <div className="flex items-start gap-3">
                      <div className="text-3xl">{passed ? '✅' : '❌'}</div>
                      <div className="flex-1">
                        <div className="flex justify-between items-start mb-2">
                          <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100">{result.testCase.title}</h3>
                          <span className={`text-2xl font-bold ${passed ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>{score.toFixed(1)}/10</span>
                        </div>
                        <div className="text-sm text-gray-900 dark:text-gray-200 mb-2">
                          <strong>🎯 Objetivo:</strong> {result.testCase.conversationGoal}
                        </div>
                        <div className="text-sm text-gray-900 dark:text-gray-200 mb-2">
                          <strong>👤 Persona:</strong> {result.testCase.persona}
                        </div>
                        <div className="flex gap-4 text-xs text-gray-800 dark:text-gray-300 mt-2">
                          <span>💬 {result.executionTrace?.length || 0} turnos</span>
                          <span>🗄️ {result.databaseActivity?.changes?.length || 0} cambios BD</span>
                        </div>
                        
                        {/* Análisis */}
                        <div className="mt-3 p-3 bg-white dark:bg-gray-800 rounded text-sm border border-gray-300 dark:border-gray-600">
                          <strong className="text-gray-900 dark:text-gray-100">📊 Análisis:</strong>
                          <p className="mt-1 whitespace-pre-wrap text-gray-800 dark:text-gray-300">{result.analysis.summary}</p>
                        </div>
                        
                        {/* Evidencias de criterios fallidos - VERSIÓN MEJORADA */}
                        {result.analysis.criteriaBreakdown && result.analysis.criteriaBreakdown.filter(c => c.score < 7).length > 0 && (
                          <div className="mt-4 space-y-3">
                            <div className="flex items-center gap-2">
                              <strong className="text-gray-900 dark:text-gray-100 text-base">🔍 Análisis Detallado de Fallos</strong>
                              <span className="text-xs text-gray-600 dark:text-gray-400 bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded">
                                {result.analysis.criteriaBreakdown.filter(c => c.score < 7).length} criterios fallidos
                              </span>
                            </div>
                            
                            {result.analysis.criteriaBreakdown.filter(c => c.score < 7).map((criterion, idx) => {
                              // Determinar severidad basada en el score
                              const severity = criterion.score < 4 ? 'critical' : criterion.score < 6 ? 'high' : 'medium';
                              const severityColors = {
                                critical: 'bg-red-100 dark:bg-red-950 border-red-300 dark:border-red-700',
                                high: 'bg-orange-50 dark:bg-orange-950 border-orange-200 dark:border-orange-800',
                                medium: 'bg-yellow-50 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-800'
                              };
                              const severityLabels = {
                                critical: '🚨 CRÍTICO',
                                high: '⚠️ ALTO',
                                medium: '⚡ MEDIO'
                              };
                              
                              return (
                                <div key={idx} className={`p-4 rounded-lg border-2 ${severityColors[severity]}`}>
                                  {/* Header con nombre y score */}
                                  <div className="flex justify-between items-start mb-2">
                                    <div className="flex-1">
                                      <div className="flex items-center gap-2 mb-1">
                                        <span className="text-xs font-bold text-red-700 dark:text-red-400">{severityLabels[severity]}</span>
                                        <span className="text-xs text-gray-600 dark:text-gray-400">#{idx + 1}</span>
                                      </div>
                                      <strong className="text-sm text-gray-900 dark:text-gray-100">{criterion.criterion}</strong>
                                    </div>
                                    <div className="text-right">
                                      <div className="text-2xl font-bold text-red-700 dark:text-red-400">{criterion.score}</div>
                                      <div className="text-xs text-gray-600 dark:text-gray-400">de 10</div>
                                    </div>
                                  </div>
                                  
                                  {/* Diagnóstico */}
                                  <div className="mt-3 p-3 bg-white dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-700">
                                    <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">📋 Diagnóstico:</div>
                                    <p className="text-xs text-gray-800 dark:text-gray-200 leading-relaxed">{criterion.justification}</p>
                                  </div>
                                  
                                  {/* Evidencias con datos concretos */}
                                  {criterion.evidence && criterion.evidence.length > 0 && (
                                    <div className="mt-3 p-3 bg-white dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-700">
                                      <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1">
                                        <span>🔎 Evidencia Documentada</span>
                                        <span className="text-xs text-gray-500 dark:text-gray-400">({criterion.evidence.length} ejemplos)</span>
                                      </div>
                                      <div className="space-y-2">
                                        {criterion.evidence.map((ev, i) => (
                                          <div key={i} className="flex gap-2 items-start">
                                            <span className="text-red-600 dark:text-red-400 font-bold text-xs mt-0.5">•</span>
                                            <div className="flex-1">
                                              <p className="text-xs text-gray-800 dark:text-gray-200 leading-relaxed">{ev}</p>
                                              {/* Intentar extraer datos concretos de la evidencia */}
                                              {ev.match(/turno\s*\d+/i) && (
                                                <span className="inline-block mt-1 text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-0.5 rounded">
                                                  📍 {ev.match(/turno\s*\d+/i)?.[0]}
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                      
                                      {/* Métricas cuantificables si están disponibles */}
                                      {result.executionTrace && result.executionTrace.length > 0 && (
                                        <div className="mt-3 pt-2 border-t border-gray-200 dark:border-gray-700">
                                          <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                                            <div className="flex justify-between">
                                              <span>📊 Total de turnos:</span>
                                              <span className="font-semibold">{result.executionTrace.length}</span>
                                            </div>
                                            {result.databaseActivity?.changes && (
                                              <div className="flex justify-between">
                                                <span>🗄️ Cambios en BD:</span>
                                                <span className="font-semibold">{result.databaseActivity.changes.length}</span>
                                              </div>
                                            )}
                                            {result.toolVerification?.discrepancies && (
                                              <div className="flex justify-between">
                                                <span>⚠️ Discrepancias:</span>
                                                <span className="font-semibold text-red-600 dark:text-red-400">
                                                  {result.toolVerification.discrepancies.length}
                                                </span>
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  
                                  {/* Impacto si está disponible */}
                                  {criterion.impact && (
                                    <div className="mt-3 p-2 bg-purple-50 dark:bg-purple-950 rounded border border-purple-200 dark:border-purple-800">
                                      <div className="text-xs font-semibold text-purple-900 dark:text-purple-200 flex items-center gap-1">
                                        <span>💥 Impacto:</span>
                                        <span className={`uppercase font-bold ${
                                          criterion.impact === 'high' ? 'text-red-600 dark:text-red-400' :
                                          criterion.impact === 'medium' ? 'text-orange-600 dark:text-orange-400' :
                                          'text-yellow-600 dark:text-yellow-400'
                                        }`}>
                                          {criterion.impact}
                                        </span>
                                      </div>
                                    </div>
                                  )}
                                  
                                  {/* Recomendación/Solución */}
                                  {criterion.recommendation && (
                                    <div className="mt-3 p-3 bg-green-50 dark:bg-green-950 rounded border-2 border-green-300 dark:border-green-700">
                                      <div className="text-xs font-semibold text-green-900 dark:text-green-200 mb-1 flex items-center gap-1">
                                        <span>✅</span>
                                        <span>Solución Recomendada:</span>
                                      </div>
                                      <p className="text-xs text-green-800 dark:text-green-300 leading-relaxed">{criterion.recommendation}</p>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* CONVERSATIONS */}
          {activeTab === 'conversations' && (
            <div className="space-y-3">
              <h2 className="text-xl font-bold mb-4">Conversaciones</h2>
              {results.map(result => {
                const isExpanded = expandedConv.has(result.id);
                
                return (
                  <div key={result.id} className="border dark:border-gray-700 rounded">
                    <button
                      onClick={() => {
                        const newSet = new Set(expandedConv);
                        isExpanded ? newSet.delete(result.id) : newSet.add(result.id);
                        setExpandedConv(newSet);
                      }}
                      className="w-full p-4 flex justify-between items-center hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{result.analysis.overallScore >= 7 ? '✅' : '❌'}</span>
                        <span className="font-bold text-gray-900 dark:text-gray-100">{result.testCase.title}</span>
                        <span className="text-sm text-gray-600">({result.executionTrace?.length || 0} turnos)</span>
                      </div>
                      <span>{isExpanded ? '▼' : '▶'}</span>
                    </button>
                    
                    {isExpanded && (
                      <div className="p-4 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-800 space-y-3">
                        {result.executionTrace?.map((turn, idx) => {
                          const userMsg = turn.input?.message || turn.input?.body || '';
                          const botMsg = turn.output?.response || turn.output?.message || turn.output?.text || '';
                          
                          return (
                            <div key={idx} className="space-y-2">
                              <div className="flex justify-start">
                                <div className="max-w-[70%] bg-gray-200 dark:bg-gray-700 rounded-lg px-3 py-2">
                                  <div className="text-xs text-blue-600 dark:text-blue-400 font-semibold mb-1">👤 Usuario</div>
                                  <div className="text-sm text-gray-900 dark:text-gray-100">{userMsg}</div>
                                  <div className="text-xs opacity-75 mt-1 text-gray-700 dark:text-gray-400">Turno {idx + 1}</div>
                                </div>
                              </div>
                              <div className="flex justify-end">
                                <div className="max-w-[70%] bg-blue-500 dark:bg-blue-600 text-white rounded-lg px-3 py-2">
                                  <div className="text-xs font-semibold mb-1">🤖 Agente</div>
                                  <div className="text-sm">{botMsg}</div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* PRICES */}
          {activeTab === 'prices' && (() => {
            console.log('💰 [Prices] Renderizando tab de precios...');
            console.log('💰 [Prices] Results con priceAnalysis:', results.filter(r => r.analysis?.priceAnalysis).length);
            
            const resultsWithPrices = results.filter(r => r.analysis?.priceAnalysis);
            
            if (resultsWithPrices.length === 0) {
              return (
                <div className="space-y-3">
                  <h2 className="text-xl font-bold mb-4">💰 Análisis de Precios</h2>
                  <div className="p-6 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border-2 border-yellow-300 dark:border-yellow-700">
                    <div className="text-center">
                      <div className="text-4xl mb-3">💰</div>
                      <h3 className="text-lg font-bold text-yellow-900 dark:text-yellow-200 mb-2">
                        No se detectaron precios en ninguna conversación
                      </h3>
                      <p className="text-sm text-yellow-800 dark:text-yellow-300 mb-3">
                        El análisis de precios está disponible cuando:
                      </p>
                      <ul className="text-left text-sm text-yellow-800 dark:text-yellow-300 space-y-1 max-w-md mx-auto">
                        <li>• El agente menciona precios en la conversación</li>
                        <li>• Existen precios registrados en la base de datos</li>
                        <li>• Hay precios hardcodeados en los prompts del sistema</li>
                      </ul>
                      <p className="text-xs text-yellow-700 dark:text-yellow-400 mt-3">
                        Si esperabas ver precios aquí, verifica que el agente efectivamente mencione valores monetarios durante las conversaciones.
                      </p>
                    </div>
                  </div>
                </div>
              );
            }
            
            return (
            <div className="space-y-3">
              <h2 className="text-xl font-bold mb-4">💰 Análisis de Precios ({resultsWithPrices.length}/{results.length} conversaciones)</h2>
              {results.map(result => {
                const prices = result.analysis?.priceAnalysis;
                if (!prices) return (
                  <div key={result.id} className="p-3 bg-gray-100 dark:bg-gray-800 rounded text-sm text-gray-600 dark:text-gray-400">
                    ℹ️ {result.testCase.title}: No se mencionaron precios
                  </div>
                );
                
                const hasIssues = !prices.consistent;
                
                return (
                  <div key={result.id} className={`p-4 rounded border ${hasIssues ? 'bg-red-100 dark:bg-red-900/30 border-red-400 dark:border-red-600' : 'bg-green-100 dark:bg-green-900/30 border-green-400 dark:border-green-600'}`}>
                    <h3 className="font-bold mb-3 text-gray-900 dark:text-gray-100">{hasIssues ? '⚠️' : '✅'} {result.testCase.title}</h3>
                    
                    <div className="grid grid-cols-3 gap-3 mb-3">
                      <div className="bg-white dark:bg-gray-800 p-3 rounded border border-gray-200 dark:border-gray-700">
                        <div className="text-xs text-gray-800 dark:text-gray-300 font-medium mb-1">💬 En Conversación</div>
                        {prices.mentioned?.map((p, i) => (
                          <div key={i} className="font-bold text-gray-900 dark:text-gray-100">${p.value.toLocaleString()}</div>
                        )) || <div className="text-sm text-gray-600 dark:text-gray-400">-</div>}
                      </div>
                      <div className="bg-white dark:bg-gray-800 p-3 rounded border border-gray-200 dark:border-gray-700">
                        <div className="text-xs text-gray-800 dark:text-gray-300 font-medium mb-1">🗄️ En Base Datos</div>
                        {prices.inDB?.map((p, i) => (
                          <div key={i} className="font-bold text-gray-900 dark:text-gray-100">${p.value.toLocaleString()}</div>
                        )) || <div className="text-sm text-gray-600 dark:text-gray-400">-</div>}
                      </div>
                      <div className="bg-white dark:bg-gray-800 p-3 rounded border border-gray-200 dark:border-gray-700">
                        <div className="text-xs text-gray-800 dark:text-gray-300 font-medium mb-1">📋 En Prompt</div>
                        {prices.inPrompt?.map((p, i) => (
                          <div key={i} className="font-bold text-gray-900 dark:text-gray-100">${p.value.toLocaleString()}</div>
                        )) || <div className="text-sm text-gray-600 dark:text-gray-400">-</div>}
                      </div>
                    </div>
                    
                    {prices.discrepancies && prices.discrepancies.length > 0 && (
                      <div className="bg-red-100 dark:bg-red-900/30 p-2 rounded text-sm border border-red-300 dark:border-red-700">
                        <strong className="text-red-900 dark:text-red-200">⚠️ Problemas:</strong>
                        <ul className="list-disc list-inside mt-1 text-red-800 dark:text-red-300">
                          {prices.discrepancies.map((d, i) => <li key={i}>{d}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            );
          })()}

          {/* DATABASE */}
          {activeTab === 'database' && (
            <div className="space-y-3">
              <h2 className="text-xl font-bold mb-4">Actividad de Base de Datos</h2>
              
              <div className="grid grid-cols-4 gap-3 mb-4">
                <div className="text-center p-3 bg-blue-50 rounded">
                  <div className="text-2xl font-bold">{stats.totalOps}</div>
                  <div className="text-xs text-gray-600">Operaciones</div>
                </div>
                <div className="text-center p-3 bg-green-50 rounded">
                  <div className="text-2xl font-bold">
                    {results.reduce((sum, r) => sum + (r.databaseActivity?.changes?.filter(c => c.type === 'INSERT').length || 0), 0)}
                  </div>
                  <div className="text-xs text-gray-600">➕ Inserts</div>
                </div>
                <div className="text-center p-3 bg-orange-50 rounded">
                  <div className="text-2xl font-bold">
                    {results.reduce((sum, r) => sum + (r.databaseActivity?.changes?.filter(c => c.type === 'UPDATE').length || 0), 0)}
                  </div>
                  <div className="text-xs text-gray-600">🔄 Updates</div>
                </div>
                <div className="text-center p-3 bg-red-50 rounded">
                  <div className="text-2xl font-bold">
                    {results.reduce((sum, r) => sum + (r.databaseActivity?.changes?.filter(c => c.type === 'DELETE').length || 0), 0)}
                  </div>
                  <div className="text-xs text-gray-600">🗑️ Deletes</div>
                </div>
              </div>
              
              {results.map(result => {
                const changes = result.databaseActivity?.changes || [];
                if (changes.length === 0) return null;
                
                return (
                  <div key={result.id} className="border dark:border-gray-700 rounded p-4 bg-white dark:bg-gray-800">
                    <h3 className="font-bold mb-3 text-gray-900 dark:text-gray-100">{result.testCase.title}</h3>
                    <div className="space-y-2">
                      {changes.slice(0, 10).map((change, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-sm p-2 bg-gray-50 dark:bg-gray-700 rounded border border-gray-200 dark:border-gray-600">
                          <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                            change.type === 'INSERT' ? 'bg-green-500 text-white' :
                            change.type === 'UPDATE' ? 'bg-orange-500 text-white' :
                            'bg-red-500 text-white'
                          }`}>
                            {change.type}
                          </span>
                          <span className="font-mono text-xs text-gray-900 dark:text-gray-100">{change.table}</span>
                          {change.details && (
                            <span className="text-xs text-gray-600 dark:text-gray-400 truncate">
                              {JSON.stringify(change.details).substring(0, 100)}...
                            </span>
                          )}
                        </div>
                      ))}
                      {changes.length > 10 && (
                        <div className="text-xs text-gray-600 dark:text-gray-400 text-center font-medium">+ {changes.length - 10} más</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* FIX GUIDE */}
          {activeTab === 'fixes' && (() => {
            console.log('🛠️ [FixGuide] Renderizando tab Fix Guide...');
            console.log('🛠️ [FixGuide] Results disponibles:', results.length);
            
            try {
              const promptContent = generateLLMPrompt(results, config);
              console.log('🛠️ [FixGuide] Prompt generado exitosamente, longitud:', promptContent.length);
              
              return (
                <div className="space-y-4">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold">🛠️ Fix Guide - Prompt para LLM</h2>
                    <button
                      onClick={() => {
                        try {
                          console.log('📋 [FixGuide] Copiando prompt...');
                          const prompt = generateLLMPrompt(results, config);
                          navigator.clipboard.writeText(prompt);
                          console.log('✅ [FixGuide] Prompt copiado exitosamente');
                          alert('✅ Prompt copiado al portapapeles');
                        } catch (error) {
                          console.error('❌ [FixGuide] Error copiando prompt:', error);
                          alert('❌ Error: ' + (error instanceof Error ? error.message : 'Unknown'));
                        }
                      }}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold"
                    >
                      📋 Copiar Prompt Completo
                    </button>
                  </div>
                  
                  <div className="p-4 bg-gray-100 dark:bg-gray-800 rounded-lg border border-gray-300 dark:border-gray-600">
                    <pre className="text-xs text-gray-900 dark:text-gray-100 whitespace-pre-wrap font-mono overflow-x-auto">
                      {promptContent}
                    </pre>
                  </div>
                </div>
              );
            } catch (error) {
              console.error('💥 [FixGuide] ERROR CRÍTICO:', error);
              return (
                <div className="p-4 bg-red-100 dark:bg-red-900 rounded-lg border border-red-500">
                  <h3 className="text-lg font-bold text-red-900 dark:text-red-100 mb-2">❌ Error generando Fix Guide</h3>
                  <p className="text-sm text-red-800 dark:text-red-200">
                    {error instanceof Error ? error.message : 'Error desconocido'}
                  </p>
                  <p className="text-xs text-red-700 dark:text-red-300 mt-2">Revisa la consola del navegador para más detalles.</p>
                </div>
              );
            }
          })()}

        </div>
      </div>
    </div>
  );
};

export default ExecutiveReport;
