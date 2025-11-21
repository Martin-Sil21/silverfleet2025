/**
 * 🤖 AI Report Generator
 * Genera reportes optimizados para LLMs (Cursor, Lovable, Claude, etc)
 */

import type { AuditResult, AuditConfig } from '../types';

export interface ReportStats {
  avgScore: number;
  passed: number;
  warning: number;
  failed: number;
  totalDbOperations: number;
  totalDbChanges: number;
  totalDbErrors: number;
}

/**
 * Genera reporte completo y detallado para análisis profundo
 */
export function generateFullAIReport(
  results: AuditResult[],
  config: AuditConfig,
  stats: ReportStats
): string {
  const criticalIssues = results.filter(r => (r.analysis?.overallScore || 0) < 5);
  const warnings = results.filter(r => {
    const score = r.analysis?.overallScore || 0;
    return score >= 5 && score < 7;
  });
  
  const dbIssues = results.filter(r => 
    r.databaseActivity?.discrepancies && r.databaseActivity.discrepancies.length > 0
  );

  const failedObjectives = results.flatMap(r => 
    r.analysis?.criteriaBreakdown
      ?.filter(c => c.score < 7)
      .map(c => ({ conversation: r.testCase.title, criterion: c.criterion, score: c.score, reason: c.justification }))
      || []
  );

  return `# 🤖 ANÁLISIS COMPLETO DE AUDITORÍA - IA REPORT

## 📊 MÉTRICAS GENERALES
- **Conversaciones Totales**: ${results.length}
- **Score Promedio**: ${stats.avgScore.toFixed(1)}/10
- **Aprobadas**: ${stats.passed} (${((stats.passed/results.length)*100).toFixed(0)}%)
- **Advertencias**: ${stats.warning} (${((stats.warning/results.length)*100).toFixed(0)}%)
- **Fallidas**: ${stats.failed} (${((stats.failed/results.length)*100).toFixed(0)}%)

## 🗄️ ACTIVIDAD DE BASE DE DATOS
- **Operaciones Totales**: ${stats.totalDbOperations}
- **Cambios Registrados**: ${stats.totalDbChanges}
- **Errores Críticos**: ${stats.totalDbErrors}
- **Discrepancias Detectadas**: ${dbIssues.length}

---

## 🔴 PROBLEMAS CRÍTICOS (Score < 5)

${criticalIssues.length === 0 ? '✅ No se detectaron problemas críticos.\n' : criticalIssues.map((r, i) => `
### ${i + 1}. ${r.testCase.title}
**Score**: ${r.analysis?.overallScore.toFixed(1)}/10
**Riesgo**: ${r.analysis?.riskAssessment === 'high' ? '🔴 ALTO' : r.analysis?.riskAssessment === 'medium' ? '🟡 MEDIO' : '🟢 BAJO'}

**Resumen del Problema**:
${r.analysis?.summary}

**Escenario**:
${r.testCase.title}

**Qué Falló**:
${r.analysis?.keyFindings?.map(f => `- ${typeof f === 'string' ? f : JSON.stringify(f)}`).join('\n') || 'N/A'}

**Conversación**:
${r.executionTrace.slice(0, 3).map((turn, idx) => `
Turn ${idx + 1}:
  Usuario: "${typeof turn.input === 'string' ? turn.input : turn.input?.message || turn.input?.text || 'N/A'}"
  Agente: "${typeof turn.output === 'string' ? turn.output : turn.output?.message || turn.output?.text || 'N/A'}"
`).join('\n')}

**Cambios en BD**:
${r.databaseActivity?.changes?.length ? r.databaseActivity.changes.map(c => `- ${c.type} en ${c.table}`).join('\n') : 'Sin cambios'}

**Discrepancias**:
${r.databaseActivity?.discrepancies?.map(d => `- [${d.severity.toUpperCase()}] ${d.description}`).join('\n') || 'Ninguna'}

---
`).join('\n')}

## 🟡 ADVERTENCIAS (Score 5-7)

${warnings.length === 0 ? '✅ No hay advertencias.\n' : warnings.map((r, i) => `
### ${i + 1}. ${r.testCase.title} (${r.analysis?.overallScore.toFixed(1)}/10)
${r.analysis?.summary}

**Mejoras Necesarias**:
${r.analysis?.keyFindings?.map(f => `- ${typeof f === 'string' ? f : JSON.stringify(f)}`).join('\n') || 'N/A'}
`).join('\n')}

---

## 🎯 OBJETIVOS NO CUMPLIDOS

${failedObjectives.length === 0 ? '✅ Todos los objetivos fueron cumplidos.\n' : `
Total de objetivos fallidos: ${failedObjectives.length}

${failedObjectives.slice(0, 10).map((obj, i) => `
${i + 1}. **${obj.conversation}**
   - Criterio: ${obj.criterion}
   - Score: ${obj.score}/10
   - Razón: ${obj.reason}
`).join('\n')}

${failedObjectives.length > 10 ? `\n... y ${failedObjectives.length - 10} objetivos más fallidos.` : ''}
`}

---

## 💡 RECOMENDACIONES PRIORITARIAS

${generateRecommendations(results, stats)}

---

## 📋 RESUMEN PARA DESARROLLO

### Áreas que Requieren Atención Inmediata:
${criticalIssues.length > 0 ? criticalIssues.map(r => `- ${r.testCase.title}: ${r.analysis?.summary}`).join('\n') : '✅ Ninguna'}

### Mejoras Sugeridas:
${warnings.length > 0 ? warnings.map(r => `- ${r.testCase.title}: Optimizar respuestas y flujo de conversación`).join('\n') : '✅ Sistema funcionando correctamente'}

### Estado de Base de Datos:
${stats.totalDbErrors > 0 ? `⚠️ ${stats.totalDbErrors} error(es) detectados en operaciones de BD` : '✅ BD operando correctamente'}

---

**Generado**: ${new Date().toLocaleString()}
**Tipo**: ${config.auditType === 'real' ? 'Auditoría Real con BD' : 'Auditoría Visual'}
`;
}

/**
 * Genera reporte corto y accionable para LLMs (Cursor, Lovable)
 */
export function generateLLMReport(
  results: AuditResult[],
  config: AuditConfig,
  stats: ReportStats
): string {
  const issues = results
    .filter(r => (r.analysis?.overallScore || 0) < 7)
    .slice(0, 5); // Solo top 5

  const dbErrors = results
    .flatMap(r => r.databaseActivity?.discrepancies || [])
    .filter(d => d.severity === 'critical')
    .slice(0, 3);

  return `# ⚡ FIX GUIDE - Para Cursor/Lovable/Claude

## 🎯 QUÉ ARREGLAR (Prioridad Alta)

${issues.length === 0 ? '✅ No hay problemas críticos que resolver.\n' : issues.map((r, i) => `
### ${i + 1}. ${r.testCase.title} (${r.analysis?.overallScore.toFixed(1)}/10)

**PROBLEMA**: ${r.analysis?.summary}

**CÓMO ARREGLARLO**:
${r.analysis?.keyFindings
  ?.map(f => `• ${typeof f === 'string' ? f : JSON.stringify(f)}`)
  .join('\n') || '• Revisar flujo de conversación y validaciones'}

**POR QUÉ FALLA**:
${r.analysis?.criteriaBreakdown
  ?.filter(c => c.score < 7)
  .map(c => `• ${c.criterion}: ${c.justification}`)
  .slice(0, 2)
  .join('\n') || 'Verificar logs para más detalles'}

**CÓDIGO A REVISAR**:
${getAffectedNodes(r)}

---
`).join('\n')}

${dbErrors.length > 0 ? `## 🗄️ ERRORES DE BASE DE DATOS

${dbErrors.map((d, i) => `
${i + 1}. **${d.description}**
   - Severidad: ${d.severity}
   - Tabla afectada: ${d.table || 'N/A'}
`).join('\n')}

---
` : ''}

## 📝 CHECKLIST DE ACCIONES

${generateActionChecklist(issues, stats)}

---

## 📊 RESUMEN EJECUTIVO

- Total conversaciones auditadas: **${results.length}**
- Score promedio: **${stats.avgScore.toFixed(1)}/10**
- Requieren corrección: **${issues.length}** (${((issues.length/results.length)*100).toFixed(0)}%)
- Estado general: ${stats.avgScore >= 8 ? '✅ EXCELENTE' : stats.avgScore >= 6 ? '⚠️ ACEPTABLE' : '🔴 REQUIERE ATENCIÓN'}

---

**Generado**: ${new Date().toLocaleString()}
`;
}

function generateRecommendations(results: AuditResult[], stats: ReportStats): string {
  const recommendations: string[] = [];

  if (stats.avgScore < 6) {
    recommendations.push('🔴 **CRÍTICO**: El sistema tiene problemas graves. Revisar flujo completo de conversación y validaciones.');
  }

  if (stats.totalDbErrors > 0) {
    recommendations.push(`🗄️ **Base de Datos**: ${stats.totalDbErrors} error(es) en operaciones de BD. Verificar integridad de datos y transacciones.`);
  }

  const goalFailures = results.filter(r => !r.analysis?.goalAchieved);
  if (goalFailures.length > results.length * 0.3) {
    recommendations.push(`🎯 **Objetivos**: ${goalFailures.length} conversaciones no lograron su objetivo. Mejorar prompts y lógica del agente.`);
  }

  const highRisk = results.filter(r => r.analysis?.riskAssessment === 'high');
  if (highRisk.length > 0) {
    recommendations.push(`⚠️ **Alto Riesgo**: ${highRisk.length} conversaciones tienen riesgo alto. Requieren revisión inmediata.`);
  }

  if (recommendations.length === 0) {
    recommendations.push('✅ **Sistema Saludable**: No se detectaron problemas críticos. Continuar monitoreando.');
  }

  return recommendations.map((r, i) => `${i + 1}. ${r}`).join('\n');
}

function generateActionChecklist(issues: AuditResult[], stats: ReportStats): string {
  const tasks: string[] = [];

  if (issues.length > 0) {
    tasks.push(`- [ ] Revisar y corregir ${issues.length} conversaciones fallidas`);
    tasks.push(`- [ ] Actualizar prompts del sistema`);
    tasks.push(`- [ ] Validar flujo de decisiones del agente`);
  }

  if (stats.totalDbErrors > 0) {
    tasks.push(`- [ ] Corregir ${stats.totalDbErrors} error(es) de base de datos`);
    tasks.push(`- [ ] Verificar integridad referencial`);
  }

  const needsImprovement = issues.filter(r => 
    r.analysis?.keyFindings && r.analysis.keyFindings.length > 0
  );

  if (needsImprovement.length > 0) {
    tasks.push(`- [ ] Implementar ${needsImprovement.length} mejora(s) sugeridas`);
  }

  tasks.push(`- [ ] Ejecutar re-auditoría después de correcciones`);

  if (tasks.length === 0) {
    tasks.push('- [x] ✅ No hay acciones pendientes');
  }

  return tasks.join('\n');
}

function getAffectedNodes(result: AuditResult): string {
  const errorSteps = result.executionTrace.filter(t => t.status === 'ERROR');
  if (errorSteps.length > 0) {
    return errorSteps.map(s => `• Nodo: ${s.nodeId}`).join('\n');
  }

  // Si no hay errores explícitos, identificar nodos involucrados
  const uniqueNodes = [...new Set(result.executionTrace.map(t => t.nodeId))];
  return `• Nodos involucrados: ${uniqueNodes.slice(0, 3).join(', ')}${uniqueNodes.length > 3 ? ' ...' : ''}`;
}
