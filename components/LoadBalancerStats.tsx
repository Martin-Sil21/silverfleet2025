/**
 * 📊 Componente de Estadísticas del Load Balancer
 * 
 * Muestra en tiempo real el estado de las APIs de Gemini y el uso de cada una.
 * Útil para verificar que el load balancing está funcionando correctamente.
 */

import React, { useState, useEffect } from 'react';
import Card from './Card';
import { getLoadBalancerStats, printLoadBalancerReport } from '../services/aiClientFactory';
import type { LoadBalancerStats } from '../services/apiLoadBalancer';

export const LoadBalancerStatsPanel: React.FC = () => {
  const [stats, setStats] = useState<LoadBalancerStats | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  const refreshStats = () => {
    const currentStats = getLoadBalancerStats();
    setStats(currentStats);
  };

  useEffect(() => {
    refreshStats();
    const interval = setInterval(refreshStats, 2000); // Actualizar cada 2 segundos
    return () => clearInterval(interval);
  }, []);

  if (!stats || stats.totalRequests === 0) {
    return null; // No mostrar hasta que haya requests
  }

  const successRate = stats.totalRequests > 0 
    ? ((stats.successfulRequests / stats.totalRequests) * 100).toFixed(1)
    : '0';

  const geminiPercentage = stats.totalRequests > 0
    ? ((stats.geminiRequests / stats.totalRequests) * 100).toFixed(1)
    : '0';

  return (
    <Card className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <span className="text-2xl">🔄</span>
          <span>Load Balancer Status</span>
        </h3>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-sm text-blue-500 hover:text-blue-700 font-medium"
        >
          {isExpanded ? '▼ Ver menos' : '▶ Ver detalles'}
        </button>
      </div>

      {/* Resumen compacto */}
      <div className="grid grid-cols-4 gap-4 mb-3">
        <div className="text-center p-3 bg-gray-50 rounded-lg">
          <div className="text-2xl font-bold text-blue-600">{stats.totalRequests}</div>
          <div className="text-xs text-gray-600">Total Requests</div>
        </div>
        <div className="text-center p-3 bg-green-50 rounded-lg">
          <div className="text-2xl font-bold text-green-600">{successRate}%</div>
          <div className="text-xs text-gray-600">Success Rate</div>
        </div>
        <div className="text-center p-3 bg-purple-50 rounded-lg">
          <div className="text-2xl font-bold text-purple-600">{geminiPercentage}%</div>
          <div className="text-xs text-gray-600">Gemini Usage</div>
        </div>
        <div className="text-center p-3 bg-orange-50 rounded-lg">
          <div className="text-2xl font-bold text-orange-600">{stats.fallbacksToOpenAI}</div>
          <div className="text-xs text-gray-600">OpenAI Fallbacks</div>
        </div>
      </div>

      {/* Detalles expandidos */}
      {isExpanded && (
        <div className="mt-4 space-y-3 border-t pt-3">
          <h4 className="text-sm font-semibold text-gray-700">Estado por API:</h4>
          
          {stats.apiStats.map(api => {
            const apiSuccessRate = api.requestCount > 0
              ? ((api.successCount / api.requestCount) * 100).toFixed(1)
              : '0';
            
            const statusIcon = api.isHealthy ? '✅' : '🚨';
            const statusColor = api.isHealthy ? 'text-green-600' : 'text-red-600';

            return (
              <div 
                key={api.id} 
                className={`p-3 rounded-lg border ${api.isHealthy ? 'bg-white border-green-200' : 'bg-red-50 border-red-300'}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{statusIcon}</span>
                    <span className="font-medium text-gray-800">{api.id}</span>
                    <span className={`text-xs font-semibold ${statusColor}`}>
                      {api.isHealthy ? 'HEALTHY' : 'UNHEALTHY'}
                    </span>
                  </div>
                  <div className="text-sm text-gray-600">
                    {api.requestCount} requests ({apiSuccessRate}% exitosos)
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs text-gray-600">
                  <div>
                    <span className="text-green-600 font-medium">✓ {api.successCount}</span> éxitos
                  </div>
                  <div>
                    <span className="text-red-600 font-medium">✗ {api.errorCount}</span> errores
                  </div>
                  <div>
                    <span className="text-blue-600 font-medium">⏱ {api.avgResponseTime.toFixed(0)}ms</span> promedio
                  </div>
                </div>

                {!api.isHealthy && api.lastError && (
                  <div className="mt-2 text-xs text-red-700 bg-red-100 p-2 rounded">
                    <strong>Último error:</strong> {api.lastError}
                  </div>
                )}
              </div>
            );
          })}

          <div className="flex gap-2 mt-4">
            <button
              onClick={refreshStats}
              className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm font-medium"
            >
              🔄 Actualizar
            </button>
            <button
              onClick={() => {
                printLoadBalancerReport();
                alert('Reporte impreso en la consola del navegador (F12)');
              }}
              className="flex-1 px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 text-sm font-medium"
            >
              📋 Ver Reporte en Consola
            </button>
          </div>
        </div>
      )}
    </Card>
  );
};

export default LoadBalancerStatsPanel;
