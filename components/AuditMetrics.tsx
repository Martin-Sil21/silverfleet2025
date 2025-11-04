/**
 * 📊 Audit Metrics Component
 * 
 * Calcula y visualiza métricas clave de auditoría de forma profesional:
 * - Success Rate, Goal Achievement, Tool Execution Accuracy
 * - Database Consistency, Response Quality, Critical Issues
 * - Comparativas con benchmarks y color coding
 */

import React from 'react';
import type { AuditResult, AuditConfig } from '../types';
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

interface AuditMetricsProps {
  results: AuditResult[];
  config: AuditConfig;
}

export interface MetricData {
  name: string;
  value: number;
  benchmark: number;
  unit: string;
  status: 'good' | 'warning' | 'critical';
}

export interface AuditMetrics {
  successRate: number;
  goalAchievementRate: number;
  avgScore: number;
  toolExecutionRate: number;
  databaseConsistency: number;
  criticalIssues: number;
  avgDuration: number;
  totalTurns: number;
  scoreDistribution: { name: string; value: number; color: string }[];
  criteriaScores: { criterion: string; score: number }[];
  turnProgression: { turn: number; score: number }[];
}

/**
 * Calcula todas las métricas de auditoría
 */
export function calculateAuditMetrics(results: AuditResult[], config: AuditConfig): AuditMetrics {
  // 1. Success Rate (conversaciones sin errores críticos)
  const successfulConversations = results.filter(r => 
    r.analysis.overallScore >= 7 && 
    r.finalStatus !== 'ERROR'
  ).length;
  const successRate = (successfulConversations / results.length) * 100;
  
  // 2. Goal Achievement Rate (personas que lograron su objetivo)
  const goalsAchieved = results.filter(r => {
    const summary = r.analysis.summary.toLowerCase();
    return summary.includes('objetivo') && (
      summary.includes('logr') || 
      summary.includes('consigui') || 
      summary.includes('cumpl') ||
      summary.includes('éxito') ||
      summary.includes('achieved') ||
      summary.includes('met')
    );
  }).length;
  const goalAchievementRate = (goalsAchieved / results.length) * 100;
  
  // 3. Average Score
  const avgScore = results.reduce((sum, r) => sum + r.analysis.overallScore, 0) / results.length;
  
  // 4. Tool Execution Rate (herramientas prometidas que se ejecutaron)
  let toolPromises = 0;
  let toolExecutions = 0;
  results.forEach(r => {
    if (r.toolVerifications) {
      toolPromises += r.toolVerifications.length;
      toolExecutions += r.toolVerifications.filter(tv => tv.verified).length;
    }
  });
  const toolExecutionRate = toolPromises > 0 ? (toolExecutions / toolPromises) * 100 : 100;
  
  // 5. Database Consistency (verificaciones inteligentes sin discrepancias)
  let totalVerifications = 0;
  let consistentVerifications = 0;
  results.forEach(r => {
    if (r.databaseActivity) {
      totalVerifications++;
      if (!r.databaseActivity.discrepancies || r.databaseActivity.discrepancies.length === 0) {
        consistentVerifications++;
      }
    }
  });
  const databaseConsistency = totalVerifications > 0 
    ? (consistentVerifications / totalVerifications) * 100 
    : 100;
  
  // 6. Critical Issues (errores graves encontrados)
  const criticalIssues = results.reduce((sum, r) => {
    let issues = 0;
    
    // Errores en el trace
    issues += r.executionTrace.filter(t => t.status === 'ERROR').length;
    
    // Discrepancias críticas en BD
    if (r.databaseActivity?.discrepancies) {
      issues += r.databaseActivity.discrepancies.filter(d => d.severity === 'critical').length;
    }
    
    // Verificaciones de herramientas fallidas
    if (r.toolVerifications) {
      issues += r.toolVerifications.filter(tv => !tv.verified).length;
    }
    
    return sum + issues;
  }, 0);
  
  // 7. Avg Duration (promedio de turnos por conversación)
  const totalTurns = results.reduce((sum, r) => sum + r.executionTrace.length, 0);
  const avgDuration = totalTurns / results.length;
  
  // 8. Score Distribution (para pie chart)
  const excellent = results.filter(r => r.analysis.overallScore >= 9).length;
  const good = results.filter(r => r.analysis.overallScore >= 7 && r.analysis.overallScore < 9).length;
  const acceptable = results.filter(r => r.analysis.overallScore >= 5 && r.analysis.overallScore < 7).length;
  const poor = results.filter(r => r.analysis.overallScore < 5).length;
  
  const scoreDistribution = [
    { name: 'Excelente (9-10)', value: excellent, color: '#10b981' },
    { name: 'Bueno (7-8.9)', value: good, color: '#3b82f6' },
    { name: 'Aceptable (5-6.9)', value: acceptable, color: '#f59e0b' },
    { name: 'Deficiente (<5)', value: poor, color: '#ef4444' }
  ].filter(d => d.value > 0); // Solo mostrar categorías con datos
  
  // 9. Criteria Scores (promedio por criterio)
  const criteriaMap = new Map<string, number[]>();
  results.forEach(r => {
    r.analysis.criteriaBreakdown.forEach(cb => {
      if (!criteriaMap.has(cb.criterion)) {
        criteriaMap.set(cb.criterion, []);
      }
      criteriaMap.get(cb.criterion)!.push(cb.score);
    });
  });
  
  const criteriaScores = Array.from(criteriaMap.entries()).map(([criterion, scores]) => ({
    criterion: criterion.length > 30 ? criterion.substring(0, 27) + '...' : criterion,
    score: scores.reduce((sum, s) => sum + s, 0) / scores.length
  }));
  
  // 10. Turn Progression (evolución de scores por turno - solo para primera conversación como ejemplo)
  const turnProgression: { turn: number; score: number }[] = [];
  if (results.length > 0 && results[0].executionTrace.length > 0) {
    // Calcular score aproximado por turno basado en análisis final
    const firstResult = results[0];
    const totalTurnsFirst = firstResult.executionTrace.length;
    const finalScore = firstResult.analysis.overallScore;
    
    // Simular progresión (en realidad necesitarías scores por turno)
    for (let i = 1; i <= Math.min(totalTurnsFirst, 12); i++) {
      turnProgression.push({
        turn: i,
        score: finalScore // En una implementación real, necesitarías scores por turno
      });
    }
  }
  
  return {
    successRate,
    goalAchievementRate,
    avgScore,
    toolExecutionRate,
    databaseConsistency,
    criticalIssues,
    avgDuration,
    totalTurns,
    scoreDistribution,
    criteriaScores,
    turnProgression
  };
}

const AuditMetrics: React.FC<AuditMetricsProps> = ({ results, config }) => {
  const metrics = calculateAuditMetrics(results, config);
  
  // Determinar estado de cada métrica vs benchmark
  const getMetricStatus = (value: number, benchmark: number, inverted: boolean = false): 'good' | 'warning' | 'critical' => {
    if (inverted) {
      // Para métricas donde menos es mejor (ej: critical issues)
      if (value === 0) return 'good';
      if (value <= benchmark) return 'warning';
      return 'critical';
    } else {
      // Para métricas donde más es mejor
      if (value >= benchmark) return 'good';
      if (value >= benchmark * 0.8) return 'warning';
      return 'critical';
    }
  };
  
  const metricsData: MetricData[] = [
    {
      name: 'Tasa de Éxito',
      value: metrics.successRate,
      benchmark: 85,
      unit: '%',
      status: getMetricStatus(metrics.successRate, 85)
    },
    {
      name: 'Logro de Objetivos',
      value: metrics.goalAchievementRate,
      benchmark: 80,
      unit: '%',
      status: getMetricStatus(metrics.goalAchievementRate, 80)
    },
    {
      name: 'Score Promedio',
      value: metrics.avgScore,
      benchmark: 7.5,
      unit: '/10',
      status: getMetricStatus(metrics.avgScore, 7.5)
    },
    {
      name: 'Ejecución de Herramientas',
      value: metrics.toolExecutionRate,
      benchmark: 95,
      unit: '%',
      status: getMetricStatus(metrics.toolExecutionRate, 95)
    },
    {
      name: 'Consistencia de BD',
      value: metrics.databaseConsistency,
      benchmark: 90,
      unit: '%',
      status: getMetricStatus(metrics.databaseConsistency, 90)
    },
    {
      name: 'Issues Críticos',
      value: metrics.criticalIssues,
      benchmark: 3,
      unit: '',
      status: getMetricStatus(metrics.criticalIssues, 3, true)
    }
  ];
  
  const getStatusColor = (status: 'good' | 'warning' | 'critical') => {
    switch (status) {
      case 'good': return 'text-green-600 dark:text-green-400';
      case 'warning': return 'text-orange-600 dark:text-orange-400';
      case 'critical': return 'text-red-600 dark:text-red-400';
    }
  };
  
  const getStatusBg = (status: 'good' | 'warning' | 'critical') => {
    switch (status) {
      case 'good': return 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800';
      case 'warning': return 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800';
      case 'critical': return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800';
    }
  };
  
  const getStatusIcon = (status: 'good' | 'warning' | 'critical') => {
    switch (status) {
      case 'good': return '✅';
      case 'warning': return '⚠️';
      case 'critical': return '🚨';
    }
  };
  
  return (
    <div className="space-y-6">
      {/* Métricas Principales */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {metricsData.map((metric, idx) => (
          <div 
            key={idx}
            className={`rounded-xl p-5 border-2 transition-all duration-200 hover:shadow-lg ${getStatusBg(metric.status)}`}
          >
            <div className="flex items-start justify-between mb-2">
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                {metric.name}
              </span>
              <span className="text-2xl">{getStatusIcon(metric.status)}</span>
            </div>
            <div className="flex items-end gap-2 mb-2">
              <span className={`text-3xl font-bold ${getStatusColor(metric.status)}`}>
                {metric.value.toFixed(metric.unit === '/10' ? 1 : 0)}
              </span>
              <span className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                {metric.unit}
              </span>
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              Benchmark: {metric.benchmark}{metric.unit}
            </div>
          </div>
        ))}
      </div>
      
      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Score Distribution */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Distribución de Scores
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={metrics.scoreDistribution}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name}: ${((percent as number) * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {metrics.scoreDistribution.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
        
        {/* Criteria Scores */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Scores por Criterio
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={metrics.criteriaScores}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="criterion" 
                angle={-45}
                textAnchor="end"
                height={100}
                tick={{ fontSize: 10 }}
              />
              <YAxis domain={[0, 10]} />
              <Tooltip />
              <Bar dataKey="score" fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      
      {/* Estadísticas Adicionales */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl p-6 border border-blue-200 dark:border-blue-800">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          📈 Estadísticas Generales
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Total Conversaciones</div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">{results.length}</div>
          </div>
          <div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Turnos Totales</div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">{metrics.totalTurns}</div>
          </div>
          <div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Promedio Turnos</div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">{metrics.avgDuration.toFixed(1)}</div>
          </div>
          <div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Issues Críticos</div>
            <div className={`text-2xl font-bold ${metrics.criticalIssues === 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {metrics.criticalIssues}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuditMetrics;
