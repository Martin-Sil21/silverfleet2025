/**
 * 📊 Panel de Estadísticas de Tráfico HTTP
 * Muestra en tiempo real el rendimiento del endpoint durante alto tráfico
 */

import React, { useState, useEffect } from 'react';
import Card from './Card';

interface TrafficStats {
  totalRequests: number;
  successfulRequests: number;
  timeoutErrors: number;
  networkErrors: number;
  retries: number;
  avgResponseTime: number;
  slowestResponseTime: number;
  fastestResponseTime: number;
  last10ResponseTimes: number[];
}

export const TrafficMonitorPanel: React.FC = () => {
  const [stats, setStats] = useState<TrafficStats | null>(null);
  const [isExpanded, setIsExpanded] = useState(true); // Expandido por defecto durante auditorías

  const refreshStats = async () => {
    try {
      const { trafficMonitor } = await import('../services/trafficMonitor');
      const currentStats = trafficMonitor.getStats();
      setStats(currentStats);
    } catch (error) {
      console.error('Error al cargar estadísticas de tráfico:', error);
    }
  };

  useEffect(() => {
    refreshStats();
    const interval = setInterval(refreshStats, 1000); // Actualizar cada segundo durante alto tráfico
    return () => clearInterval(interval);
  }, []);

  if (!stats || stats.totalRequests === 0) {
    return null; // No mostrar hasta que haya actividad
  }

  const successRate = stats.totalRequests > 0 
    ? ((stats.successfulRequests / stats.totalRequests) * 100).toFixed(1)
    : '0';

  const timeoutRate = stats.totalRequests > 0
    ? ((stats.timeoutErrors / stats.totalRequests) * 100).toFixed(1)
    : '0';

  const isEndpointSaturated = 
    parseFloat(successRate) < 80 || 
    parseFloat(timeoutRate) > 30 || 
    (stats.avgResponseTime > 60000 && stats.successfulRequests > 5);

  return (
    <Card className="mb-4 border-2 border-blue-300">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <span className="text-2xl">🌐</span>
          <span>Tráfico HTTP en Tiempo Real</span>
          {isEndpointSaturated && (
            <span className="text-xs bg-red-500 text-white px-2 py-1 rounded-full animate-pulse">
              ⚠️ SATURADO
            </span>
          )}
        </h3>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-sm text-blue-500 hover:text-blue-700 font-medium"
        >
          {isExpanded ? '▼ Minimizar' : '▶ Expandir'}
        </button>
      </div>

      {/* Vista compacta siempre visible */}
      <div className="grid grid-cols-5 gap-3 mb-3">
        <div className="text-center p-3 bg-blue-50 rounded-lg">
          <div className="text-2xl font-bold text-blue-600">{stats.totalRequests}</div>
          <div className="text-xs text-gray-600">Total</div>
        </div>
        <div className={`text-center p-3 rounded-lg ${parseFloat(successRate) >= 80 ? 'bg-green-50' : 'bg-red-50'}`}>
          <div className={`text-2xl font-bold ${parseFloat(successRate) >= 80 ? 'text-green-600' : 'text-red-600'}`}>
            {successRate}%
          </div>
          <div className="text-xs text-gray-600">Success</div>
        </div>
        <div className={`text-center p-3 rounded-lg ${parseFloat(timeoutRate) < 10 ? 'bg-green-50' : 'bg-orange-50'}`}>
          <div className={`text-2xl font-bold ${parseFloat(timeoutRate) < 10 ? 'text-green-600' : 'text-orange-600'}`}>
            {stats.timeoutErrors}
          </div>
          <div className="text-xs text-gray-600">Timeouts</div>
        </div>
        <div className="text-center p-3 bg-purple-50 rounded-lg">
          <div className="text-2xl font-bold text-purple-600">{stats.retries}</div>
          <div className="text-xs text-gray-600">Reintentos</div>
        </div>
        <div className="text-center p-3 bg-indigo-50 rounded-lg">
          <div className="text-2xl font-bold text-indigo-600">
            {(stats.avgResponseTime / 1000).toFixed(1)}s
          </div>
          <div className="text-xs text-gray-600">Avg Time</div>
        </div>
      </div>

      {/* Detalles expandidos */}
      {isExpanded && (
        <div className="mt-4 space-y-4 border-t pt-4">
          {/* Advertencia de saturación */}
          {isEndpointSaturated && (
            <div className="bg-red-100 border-2 border-red-400 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <span className="text-3xl">⚠️</span>
                <div>
                  <h4 className="font-bold text-red-800 mb-2">Endpoint Saturado Detectado</h4>
                  <ul className="text-sm text-red-700 space-y-1">
                    {parseFloat(successRate) < 80 && (
                      <li>• Success rate bajo: {successRate}% (esperado &gt;80%)</li>
                    )}
                    {parseFloat(timeoutRate) > 30 && (
                      <li>• Demasiados timeouts: {timeoutRate}% (límite 30%)</li>
                    )}
                    {stats.avgResponseTime > 60000 && (
                      <li>• Tiempo de respuesta muy alto: {(stats.avgResponseTime/1000).toFixed(1)}s</li>
                    )}
                  </ul>
                  <p className="text-sm text-red-800 mt-2 font-medium">
                    💡 Recomendación: Reduce el número de conversaciones simultáneas
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Tiempos de respuesta */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-gray-700 mb-3">⏱️ Tiempos de Respuesta</h4>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div>
                <span className="text-gray-600">Más rápido:</span>
                <span className="font-bold text-green-600 ml-2">
                  {stats.fastestResponseTime === Infinity 
                    ? 'N/A' 
                    : `${(stats.fastestResponseTime / 1000).toFixed(2)}s`}
                </span>
              </div>
              <div>
                <span className="text-gray-600">Promedio:</span>
                <span className="font-bold text-blue-600 ml-2">
                  {(stats.avgResponseTime / 1000).toFixed(2)}s
                </span>
              </div>
              <div>
                <span className="text-gray-600">Más lento:</span>
                <span className="font-bold text-orange-600 ml-2">
                  {stats.slowestResponseTime > 0 
                    ? `${(stats.slowestResponseTime / 1000).toFixed(2)}s`
                    : 'N/A'}
                </span>
              </div>
            </div>

            {/* Gráfico de últimos 10 tiempos */}
            {stats.last10ResponseTimes.length > 0 && (
              <div className="mt-4">
                <div className="text-xs text-gray-600 mb-2">Últimas 10 respuestas:</div>
                <div className="flex items-end gap-1 h-20">
                  {stats.last10ResponseTimes.map((time, idx) => {
                    const height = Math.min((time / stats.slowestResponseTime) * 100, 100);
                    const color = time > 30000 ? 'bg-red-400' : time > 10000 ? 'bg-yellow-400' : 'bg-green-400';
                    return (
                      <div
                        key={idx}
                        className="flex-1 relative group"
                        title={`${(time/1000).toFixed(1)}s`}
                      >
                        <div 
                          className={`${color} rounded-t transition-all`}
                          style={{ height: `${height}%` }}
                        />
                        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-1 hidden group-hover:block bg-black text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                          {(time/1000).toFixed(1)}s
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>Más antiguo</span>
                  <span>Más reciente</span>
                </div>
              </div>
            )}
          </div>

          {/* Resumen de errores */}
          {(stats.timeoutErrors > 0 || stats.networkErrors > 0) && (
            <div className="bg-orange-50 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-orange-800 mb-2">❌ Errores Detectados</h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-orange-700">Timeouts:</span>
                  <span className="font-bold text-orange-900 ml-2">{stats.timeoutErrors}</span>
                  <span className="text-orange-600 ml-1">({timeoutRate}%)</span>
                </div>
                <div>
                  <span className="text-orange-700">Errores de red:</span>
                  <span className="font-bold text-orange-900 ml-2">{stats.networkErrors}</span>
                </div>
              </div>
            </div>
          )}

          {/* Botón de actualizar */}
          <button
            onClick={refreshStats}
            className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm font-medium"
          >
            🔄 Actualizar Estadísticas
          </button>
        </div>
      )}
    </Card>
  );
};

export default TrafficMonitorPanel;
