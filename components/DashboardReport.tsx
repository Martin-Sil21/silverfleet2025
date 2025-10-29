import React, { useMemo } from 'react';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';
import type { AuditResult, AuditConfig } from '../types';
import Card from './Card';

interface DashboardReportProps {
  results: AuditResult[];
  config: AuditConfig;
}

const COLORS = {
  positive: '#10b981', // green-500
  neutral: '#f59e0b',  // amber-500
  negative: '#ef4444', // red-500
  primary: '#3b82f6', // blue-500
  secondary: '#8b5cf6', // violet-500
  accent: '#ec4899'    // pink-500
};

const DashboardReport: React.FC<DashboardReportProps> = ({ results, config }) => {
  
  // 📊 Calcular métricas globales
  const metrics = useMemo(() => {
    const totalConversations = results.length;
    const avgScore = results.reduce((sum, r) => sum + r.analysis.overallScore, 0) / totalConversations;
    
    const positive = results.filter(r => r.analysis.overallScore >= 8).length;
    const neutral = results.filter(r => r.analysis.overallScore >= 5 && r.analysis.overallScore < 8).length;
    const negative = results.filter(r => r.analysis.overallScore < 5).length;
    
    const successRate = (positive / totalConversations) * 100;
    
    const avgDuration = results
      .filter(r => r.durationMs)
      .reduce((sum, r) => sum + r.durationMs!, 0) / results.filter(r => r.durationMs).length || 0;
    
    const totalDbOps = results.reduce((sum, r) => sum + (r.databaseActivity?.totalOperations || 0), 0);
    const totalDbChanges = results.reduce((sum, r) => sum + (r.databaseActivity?.changes?.length || 0), 0);
    const totalDbErrors = results.reduce((sum, r) => sum + (r.databaseActivity?.discrepancies?.filter(d => d.severity === 'critical').length || 0), 0);
    
    const totalTurns = results.reduce((sum, r) => sum + r.executionTrace.length, 0);
    const avgTurns = totalTurns / totalConversations;
    
    return {
      totalConversations,
      avgScore,
      positive,
      neutral,
      negative,
      successRate,
      avgDuration,
      totalDbOps,
      totalDbChanges,
      totalDbErrors,
      totalTurns,
      avgTurns
    };
  }, [results]);

  // 📊 Datos para gráfico de distribución de scores
  const scoreDistribution = useMemo(() => {
    const ranges = [
      { range: '0-2', min: 0, max: 2, count: 0, color: COLORS.negative },
      { range: '2-4', min: 2, max: 4, count: 0, color: '#f87171' },
      { range: '4-6', min: 4, max: 6, count: 0, color: COLORS.neutral },
      { range: '6-8', min: 6, max: 8, count: 0, color: '#fbbf24' },
      { range: '8-10', min: 8, max: 10, count: 0, color: COLORS.positive }
    ];
    
    results.forEach(r => {
      const score = r.analysis.overallScore;
      const range = ranges.find(rng => score >= rng.min && score < rng.max + 0.1);
      if (range) range.count++;
    });
    
    return ranges;
  }, [results]);

  // 📊 Datos para gráfico de sentimientos (pie)
  const sentimentData = useMemo(() => [
    { name: 'Positivas (8-10)', value: metrics.positive, color: COLORS.positive },
    { name: 'Neutras (5-7.9)', value: metrics.neutral, color: COLORS.neutral },
    { name: 'Negativas (0-4.9)', value: metrics.negative, color: COLORS.negative }
  ], [metrics]);

  // 📊 Datos para gráfico de criterios promedio
  const criteriaAverages = useMemo(() => {
    // Obtener todos los criterios únicos
    const allCriteria = new Set<string>();
    results.forEach(r => {
      r.analysis.criteriaBreakdown.forEach(c => allCriteria.add(c.criterion));
    });
    
    // Calcular promedio por criterio
    return Array.from(allCriteria).map(criterion => {
      const scores = results
        .flatMap(r => r.analysis.criteriaBreakdown)
        .filter(c => c.criterion === criterion)
        .map(c => c.score);
      
      const avg = scores.reduce((sum, s) => sum + s, 0) / scores.length;
      
      return {
        criterion: criterion.length > 20 ? criterion.substring(0, 20) + '...' : criterion,
        score: Number(avg.toFixed(1))
      };
    });
  }, [results]);

  // 📊 Datos para timeline de duraciones
  const durationTimeline = useMemo(() => {
    return results
      .filter(r => r.durationMs)
      .map((r, idx) => ({
        name: `Conv ${idx + 1}`,
        duration: Number((r.durationMs! / 1000).toFixed(1)),
        title: r.testCase.title.substring(0, 15)
      }));
  }, [results]);

  // 📊 Datos para actividad de BD por conversación
  const dbActivityData = useMemo(() => {
    return results
      .filter(r => r.databaseActivity && r.databaseActivity.totalOperations > 0)
      .map((r, idx) => ({
        name: `Conv ${idx + 1}`,
        lecturas: r.databaseActivity!.reads,
        escrituras: r.databaseActivity!.writes,
        actualizaciones: r.databaseActivity!.updates,
        errores: r.databaseActivity!.discrepancies?.filter(d => d.severity === 'critical').length || 0
      }));
  }, [results]);

  return (
    <div className="space-y-6">
      {/* 📊 KPIs Principales */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Puntuación Promedio */}
        <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border-2 border-blue-300 dark:border-blue-700">
          <div className="text-center">
            <div className="text-sm font-semibold text-blue-600 dark:text-blue-400 mb-2">Puntuación Promedio</div>
            <div className={`text-5xl font-bold mb-2 ${
              metrics.avgScore >= 8 ? 'text-green-600' : 
              metrics.avgScore >= 5 ? 'text-yellow-600' : 
              'text-red-600'
            }`}>
              {metrics.avgScore.toFixed(1)}
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400">de 10.0 puntos</div>
            <div className="mt-3 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div 
                className={`h-full transition-all ${
                  metrics.avgScore >= 8 ? 'bg-green-500' : 
                  metrics.avgScore >= 5 ? 'bg-yellow-500' : 
                  'bg-red-500'
                }`}
                style={{ width: `${(metrics.avgScore / 10) * 100}%` }}
              />
            </div>
          </div>
        </Card>

        {/* Tasa de Éxito */}
        <Card className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border-2 border-green-300 dark:border-green-700">
          <div className="text-center">
            <div className="text-sm font-semibold text-green-600 dark:text-green-400 mb-2">Tasa de Éxito</div>
            <div className="text-5xl font-bold text-green-600 dark:text-green-400 mb-2">
              {metrics.successRate.toFixed(0)}%
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400">
              {metrics.positive} de {metrics.totalConversations} exitosas
            </div>
            <div className="mt-3 flex justify-center gap-1">
              {Array.from({ length: 10 }).map((_, i) => (
                <div 
                  key={i}
                  className={`w-2 h-8 rounded-sm ${
                    i < (metrics.successRate / 10) ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'
                  }`}
                />
              ))}
            </div>
          </div>
        </Card>

        {/* Duración Promedio */}
        <Card className="bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 border-2 border-purple-300 dark:border-purple-700">
          <div className="text-center">
            <div className="text-sm font-semibold text-purple-600 dark:text-purple-400 mb-2">Duración Promedio</div>
            <div className="text-5xl font-bold text-purple-600 dark:text-purple-400 mb-2">
              {(metrics.avgDuration / 1000).toFixed(1)}s
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400">
              {metrics.avgTurns.toFixed(1)} turnos promedio
            </div>
            <div className="mt-3 text-2xl">⏱️</div>
          </div>
        </Card>

        {/* Actividad de BD */}
        <Card className="bg-gradient-to-br from-orange-50 to-red-50 dark:from-orange-900/20 dark:to-red-900/20 border-2 border-orange-300 dark:border-orange-700">
          <div className="text-center">
            <div className="text-sm font-semibold text-orange-600 dark:text-orange-400 mb-2">Base de Datos</div>
            <div className="text-5xl font-bold text-orange-600 dark:text-orange-400 mb-2">
              {metrics.totalDbOps}
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400">
              {metrics.totalDbChanges} cambios, {metrics.totalDbErrors} errores
            </div>
            <div className="mt-3 text-2xl">🗄️</div>
          </div>
        </Card>
      </div>

      {/* 📊 Gráficos - Fila 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Distribución de Puntuaciones */}
        <Card>
          <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
            <span>📊</span>
            Distribución de Puntuaciones
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={scoreDistribution}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis dataKey="range" />
              <YAxis />
              <Tooltip 
                contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: 'none', borderRadius: '8px' }}
                labelStyle={{ color: 'white' }}
              />
              <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                {scoreDistribution.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* Distribución por Sentimiento */}
        <Card>
          <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
            <span>🎭</span>
            Distribución por Sentimiento
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={sentimentData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name.split(' ')[0]} ${(percent * 100).toFixed(0)}%`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
              >
                {sentimentData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* 📊 Gráficos - Fila 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Rendimiento por Criterio */}
        <Card>
          <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
            <span>📈</span>
            Rendimiento por Criterio
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <RadarChart data={criteriaAverages}>
              <PolarGrid />
              <PolarAngleAxis dataKey="criterion" tick={{ fontSize: 10 }} />
              <PolarRadiusAxis angle={90} domain={[0, 10]} />
              <Radar name="Score" dataKey="score" stroke={COLORS.primary} fill={COLORS.primary} fillOpacity={0.6} />
              <Tooltip />
            </RadarChart>
          </ResponsiveContainer>
        </Card>

        {/* Duración por Conversación */}
        <Card>
          <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
            <span>⏱️</span>
            Duración por Conversación
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={durationTimeline}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis dataKey="name" />
              <YAxis label={{ value: 'Segundos', angle: -90, position: 'insideLeft' }} />
              <Tooltip 
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="bg-gray-900 text-white p-3 rounded-lg shadow-lg border border-gray-700">
                        <p className="font-semibold">{payload[0].payload.title}</p>
                        <p className="text-sm text-blue-400">{payload[0].value}s</p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Line type="monotone" dataKey="duration" stroke={COLORS.secondary} strokeWidth={2} dot={{ fill: COLORS.secondary, r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* 📊 Actividad de Base de Datos */}
      {dbActivityData.length > 0 && (
        <Card>
          <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
            <span>🗄️</span>
            Actividad de Base de Datos por Conversación
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={dbActivityData}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip 
                contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: 'none', borderRadius: '8px' }}
                labelStyle={{ color: 'white' }}
              />
              <Legend />
              <Bar dataKey="lecturas" stackId="a" fill="#3b82f6" name="Lecturas" />
              <Bar dataKey="escrituras" stackId="a" fill="#10b981" name="Escrituras" />
              <Bar dataKey="actualizaciones" stackId="a" fill="#f59e0b" name="Actualizaciones" />
              <Bar dataKey="errores" stackId="a" fill="#ef4444" name="Errores" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* 📊 Resumen de Métricas Detalladas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-700">
          <div className="text-xs text-blue-600 dark:text-blue-400 font-semibold mb-1">Total Conversaciones</div>
          <div className="text-3xl font-bold text-blue-700 dark:text-blue-300">{metrics.totalConversations}</div>
        </div>
        
        <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-lg p-4 border border-green-200 dark:border-green-700">
          <div className="text-xs text-green-600 dark:text-green-400 font-semibold mb-1">Total Turnos</div>
          <div className="text-3xl font-bold text-green-700 dark:text-green-300">{metrics.totalTurns}</div>
        </div>
        
        <div className="bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-lg p-4 border border-purple-200 dark:border-purple-700">
          <div className="text-xs text-purple-600 dark:text-purple-400 font-semibold mb-1">Ops en BD</div>
          <div className="text-3xl font-bold text-purple-700 dark:text-purple-300">{metrics.totalDbOps}</div>
        </div>
        
        <div className="bg-gradient-to-br from-orange-50 to-red-50 dark:from-orange-900/20 dark:to-red-900/20 rounded-lg p-4 border border-orange-200 dark:border-orange-700">
          <div className="text-xs text-orange-600 dark:text-orange-400 font-semibold mb-1">Cambios en BD</div>
          <div className="text-3xl font-bold text-orange-700 dark:text-orange-300">{metrics.totalDbChanges}</div>
        </div>
      </div>
    </div>
  );
};

export default DashboardReport;

