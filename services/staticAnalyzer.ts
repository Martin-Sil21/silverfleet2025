/**
 * Análisis Estático de Auditorías
 * 
 * Funciones TypeScript puras para analizar resultados de auditoría
 * SIN depender de IA - Solo procesamiento de datos estructurados
 */

import type { AuditResult, DatabaseChange, DatabaseDiscrepancy, ExecutionStep } from '../types';

// ============================================================================
// TIPOS PARA ANÁLISIS ESTÁTICO
// ============================================================================

export interface StaticAnalysis {
  totalTests: number;
  passedTests: number;
  failedTests: number;
  avgScore: number;
  
  // Análisis de precios
  priceErrors: PriceError[];
  totalPriceErrors: number;
  criticalPriceErrors: number;
  
  // Análisis de BD
  databaseStats: DatabaseStats;
  
  // Análisis de conversaciones
  conversationStats: ConversationStats;
  
  // Timeline de eventos
  timeline: TimelineEvent[];
}

export interface PriceError {
  testCaseId: string;
  testCaseTitle: string;
  turn: number;
  expected: any;
  actual: any;
  severity: 'critical' | 'warning' | 'info';
  timestamp: number;
  description: string;
}

export interface DatabaseStats {
  totalOperations: number;
  totalChanges: number;
  byType: {
    inserts: number;
    updates: number;
    deletes: number;
  };
  byTable: Record<string, {
    inserts: number;
    updates: number;
    deletes: number;
    total: number;
  }>;
  tablesUsed: string[];
  changesByTime: Array<{
    timestamp: number;
    type: 'INSERT' | 'UPDATE' | 'DELETE';
    table: string;
  }>;
}

export interface ConversationStats {
  totalTurns: number;
  avgTurnsPerTest: number;
  avgDurationPerTurn: number;
  avgDurationPerTest: number;
  errorRate: number;
  successRate: number;
}

export interface TimelineEvent {
  timestamp: number;
  type: 'user_message' | 'agent_response' | 'db_change' | 'error' | 'price_error';
  testCaseId: string;
  testCaseTitle: string;
  turn?: number;
  details: string;
  severity?: 'critical' | 'warning' | 'info';
}

// ============================================================================
// FUNCIONES DE ANÁLISIS ESTÁTICO
// ============================================================================

/**
 * Análisis completo estático de resultados de auditoría
 */
export function analyzeStatically(results: AuditResult[]): StaticAnalysis {
  const totalTests = results.length;
  const passedTests = results.filter(r => (r.analysis?.overallScore || 0) >= 7).length;
  const failedTests = totalTests - passedTests;
  const avgScore = results.reduce((sum, r) => sum + (r.analysis?.overallScore || 0), 0) / totalTests;
  
  const priceErrors = extractPriceErrors(results);
  const databaseStats = analyzeDatabaseActivity(results);
  const conversationStats = analyzeConversations(results);
  const timeline = buildTimeline(results);
  
  return {
    totalTests,
    passedTests,
    failedTests,
    avgScore,
    priceErrors,
    totalPriceErrors: priceErrors.length,
    criticalPriceErrors: priceErrors.filter(e => e.severity === 'critical').length,
    databaseStats,
    conversationStats,
    timeline
  };
}

/**
 * Extrae errores de precio de las discrepancias de BD
 */
export function extractPriceErrors(results: AuditResult[]): PriceError[] {
  const priceErrors: PriceError[] = [];
  
  for (const result of results) {
    if (!result.databaseActivity?.discrepancies) continue;
    
    const priceDiscrepancies = result.databaseActivity.discrepancies.filter(
      d => d.type === 'incorrect_data' && 
           (d.description.toLowerCase().includes('precio') ||
            d.description.toLowerCase().includes('price') ||
            d.description.toLowerCase().includes('cost'))
    );
    
    for (const disc of priceDiscrepancies) {
      const turn = findTurnByTimestamp(result.executionTrace, disc.timestamp);
      
      priceErrors.push({
        testCaseId: result.id,
        testCaseTitle: result.testCase.title,
        turn: turn?.turn || 0,
        expected: disc.expected,
        actual: disc.actual,
        severity: disc.severity,
        timestamp: disc.timestamp,
        description: disc.description
      });
    }
  }
  
  return priceErrors.sort((a, b) => b.severity.localeCompare(a.severity));
}

/**
 * Analiza toda la actividad de base de datos
 */
export function analyzeDatabaseActivity(results: AuditResult[]): DatabaseStats {
  let totalOperations = 0;
  let totalChanges = 0;
  const byType = { inserts: 0, updates: 0, deletes: 0 };
  const byTable: Record<string, { inserts: number; updates: number; deletes: number; total: number }> = {};
  const tablesSet = new Set<string>();
  const changesByTime: Array<{ timestamp: number; type: 'INSERT' | 'UPDATE' | 'DELETE'; table: string }> = [];
  
  for (const result of results) {
    if (!result.databaseActivity) continue;
    
    totalOperations += result.databaseActivity.totalOperations || 0;
    totalChanges += result.databaseActivity.changes?.length || 0;
    
    // Procesar cambios
    const changes = result.databaseActivity.changes || [];
    for (const change of changes) {
      // Contar por tipo
      if (change.type === 'INSERT') byType.inserts++;
      else if (change.type === 'UPDATE') byType.updates++;
      else if (change.type === 'DELETE') byType.deletes++;
      
      // Contar por tabla
      if (!byTable[change.table]) {
        byTable[change.table] = { inserts: 0, updates: 0, deletes: 0, total: 0 };
      }
      
      if (change.type === 'INSERT') byTable[change.table].inserts++;
      else if (change.type === 'UPDATE') byTable[change.table].updates++;
      else if (change.type === 'DELETE') byTable[change.table].deletes++;
      
      byTable[change.table].total++;
      tablesSet.add(change.table);
      
      // Agregar a timeline
      changesByTime.push({
        timestamp: change.timestamp,
        type: change.type,
        table: change.table
      });
    }
    
    // Agregar tablas usadas
    if (result.databaseActivity.tablesUsed) {
      result.databaseActivity.tablesUsed.forEach(t => tablesSet.add(t));
    }
  }
  
  return {
    totalOperations,
    totalChanges,
    byType,
    byTable,
    tablesUsed: Array.from(tablesSet).sort(),
    changesByTime: changesByTime.sort((a, b) => a.timestamp - b.timestamp)
  };
}

/**
 * Analiza estadísticas de conversaciones
 */
export function analyzeConversations(results: AuditResult[]): ConversationStats {
  let totalTurns = 0;
  let totalDuration = 0;
  let errorTurns = 0;
  let successTurns = 0;
  
  for (const result of results) {
    const turns = result.executionTrace.length;
    totalTurns += turns;
    
    for (const step of result.executionTrace) {
      totalDuration += step.durationMs || 0;
      
      if (step.status === 'ERROR') errorTurns++;
      else if (step.status === 'SUCCESS') successTurns++;
    }
  }
  
  const avgTurnsPerTest = totalTurns / results.length;
  const avgDurationPerTurn = totalDuration / totalTurns;
  const avgDurationPerTest = totalDuration / results.length;
  const errorRate = errorTurns / totalTurns;
  const successRate = successTurns / totalTurns;
  
  return {
    totalTurns,
    avgTurnsPerTest,
    avgDurationPerTurn,
    avgDurationPerTest,
    errorRate,
    successRate
  };
}

/**
 * Construye timeline completo de eventos
 */
export function buildTimeline(results: AuditResult[]): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  
  for (const result of results) {
    // Eventos de conversación
    result.executionTrace.forEach((step, idx) => {
      // Mensaje del usuario
      if (step.input) {
        events.push({
          timestamp: step.timestamp || Date.now(),
          type: 'user_message',
          testCaseId: result.id,
          testCaseTitle: result.testCase.title,
          turn: idx + 1,
          details: typeof step.input === 'string' 
            ? step.input 
            : (step.input.message || JSON.stringify(step.input).substring(0, 100))
        });
      }
      
      // Respuesta del agente
      if (step.output && step.status === 'SUCCESS') {
        events.push({
          timestamp: (step.timestamp || Date.now()) + 100, // Ligeramente después
          type: 'agent_response',
          testCaseId: result.id,
          testCaseTitle: result.testCase.title,
          turn: idx + 1,
          details: typeof step.output === 'string'
            ? step.output
            : (step.output.response || JSON.stringify(step.output).substring(0, 100))
        });
      }
      
      // Error
      if (step.status === 'ERROR') {
        events.push({
          timestamp: step.timestamp || Date.now(),
          type: 'error',
          testCaseId: result.id,
          testCaseTitle: result.testCase.title,
          turn: idx + 1,
          details: step.log || 'Unknown error',
          severity: 'critical'
        });
      }
    });
    
    // Eventos de base de datos
    if (result.databaseActivity?.changes) {
      result.databaseActivity.changes.forEach(change => {
        events.push({
          timestamp: change.timestamp,
          type: 'db_change',
          testCaseId: result.id,
          testCaseTitle: result.testCase.title,
          details: `${change.type} in ${change.table}`,
          severity: 'info'
        });
      });
    }
    
    // Errores de precio
    if (result.databaseActivity?.discrepancies) {
      result.databaseActivity.discrepancies
        .filter(d => d.type === 'incorrect_data')
        .forEach(disc => {
          events.push({
            timestamp: disc.timestamp,
            type: 'price_error',
            testCaseId: result.id,
            testCaseTitle: result.testCase.title,
            details: disc.description,
            severity: disc.severity
          });
        });
    }
  }
  
  return events.sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Encuentra el turno que corresponde a un timestamp
 */
function findTurnByTimestamp(trace: ExecutionStep[], timestamp: number): { turn: number; step: ExecutionStep } | null {
  for (let i = 0; i < trace.length; i++) {
    const step = trace[i];
    if (step.timestamp && Math.abs(step.timestamp - timestamp) < 5000) {
      return { turn: i + 1, step };
    }
  }
  return null;
}

/**
 * Filtra cambios de BD por tabla
 */
export function filterChangesByTable(
  changes: DatabaseChange[],
  table: string
): DatabaseChange[] {
  return changes.filter(c => c.table.toLowerCase() === table.toLowerCase());
}

/**
 * Filtra cambios de BD por tipo
 */
export function filterChangesByType(
  changes: DatabaseChange[],
  type: 'INSERT' | 'UPDATE' | 'DELETE'
): DatabaseChange[] {
  return changes.filter(c => c.type === type);
}

/**
 * Obtiene estadísticas de una tabla específica
 */
export function getTableStats(
  results: AuditResult[],
  tableName: string
): {
  totalChanges: number;
  inserts: number;
  updates: number;
  deletes: number;
  changes: DatabaseChange[];
} {
  const allChanges: DatabaseChange[] = [];
  
  for (const result of results) {
    if (result.databaseActivity?.changes) {
      const tableChanges = result.databaseActivity.changes.filter(
        c => c.table.toLowerCase() === tableName.toLowerCase()
      );
      allChanges.push(...tableChanges);
    }
  }
  
  return {
    totalChanges: allChanges.length,
    inserts: allChanges.filter(c => c.type === 'INSERT').length,
    updates: allChanges.filter(c => c.type === 'UPDATE').length,
    deletes: allChanges.filter(c => c.type === 'DELETE').length,
    changes: allChanges
  };
}

/**
 * Detecta patrones en cambios de BD
 */
export function detectPatterns(changes: DatabaseChange[]): {
  mostModifiedTable: string;
  mostCommonOperation: 'INSERT' | 'UPDATE' | 'DELETE';
  averageChangesPerMinute: number;
  peakActivityTime: number;
} {
  if (changes.length === 0) {
    return {
      mostModifiedTable: 'N/A',
      mostCommonOperation: 'INSERT',
      averageChangesPerMinute: 0,
      peakActivityTime: 0
    };
  }
  
  // Tabla más modificada
  const tableCounts: Record<string, number> = {};
  changes.forEach(c => {
    tableCounts[c.table] = (tableCounts[c.table] || 0) + 1;
  });
  const mostModifiedTable = Object.entries(tableCounts).sort((a, b) => b[1] - a[1])[0][0];
  
  // Operación más común
  const opCounts = {
    INSERT: changes.filter(c => c.type === 'INSERT').length,
    UPDATE: changes.filter(c => c.type === 'UPDATE').length,
    DELETE: changes.filter(c => c.type === 'DELETE').length
  };
  const mostCommonOperation = (Object.entries(opCounts).sort((a, b) => b[1] - a[1])[0][0]) as 'INSERT' | 'UPDATE' | 'DELETE';
  
  // Cambios por minuto
  const timestamps = changes.map(c => c.timestamp).sort((a, b) => a - b);
  const duration = (timestamps[timestamps.length - 1] - timestamps[0]) / 60000; // minutos
  const averageChangesPerMinute = duration > 0 ? changes.length / duration : 0;
  
  // Pico de actividad
  const peakActivityTime = timestamps[Math.floor(timestamps.length / 2)]; // Mediana
  
  return {
    mostModifiedTable,
    mostCommonOperation,
    averageChangesPerMinute,
    peakActivityTime
  };
}

/**
 * Genera reporte JSON exportable
 */
export function generateStaticReport(results: AuditResult[]): string {
  const analysis = analyzeStatically(results);
  
  return JSON.stringify({
    metadata: {
      generatedAt: new Date().toISOString(),
      totalTests: analysis.totalTests,
      analyzer: 'Static Analysis (No AI)'
    },
    summary: {
      passedTests: analysis.passedTests,
      failedTests: analysis.failedTests,
      avgScore: analysis.avgScore,
      priceErrorsDetected: analysis.totalPriceErrors,
      criticalPriceErrors: analysis.criticalPriceErrors
    },
    database: analysis.databaseStats,
    conversations: analysis.conversationStats,
    priceErrors: analysis.priceErrors,
    timeline: analysis.timeline
  }, null, 2);
}
