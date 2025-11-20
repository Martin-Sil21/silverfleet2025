/**
 * 📊 Monitor de Tasa de Éxito en Alto Tráfico
 * 
 * Trackea requests HTTP, timeouts y errores para detectar saturación del endpoint
 */

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

class TrafficMonitor {
  private stats: TrafficStats = {
    totalRequests: 0,
    successfulRequests: 0,
    timeoutErrors: 0,
    networkErrors: 0,
    retries: 0,
    avgResponseTime: 0,
    slowestResponseTime: 0,
    fastestResponseTime: Infinity,
    last10ResponseTimes: []
  };

  recordRequest(responseTime: number, success: boolean, isRetry: boolean = false) {
    this.stats.totalRequests++;
    
    if (isRetry) {
      this.stats.retries++;
    }
    
    if (success) {
      this.stats.successfulRequests++;
      
      // Actualizar tiempos de respuesta
      if (responseTime > this.stats.slowestResponseTime) {
        this.stats.slowestResponseTime = responseTime;
      }
      if (responseTime < this.stats.fastestResponseTime) {
        this.stats.fastestResponseTime = responseTime;
      }
      
      // Calcular promedio móvil
      const currentAvg = this.stats.avgResponseTime;
      const count = this.stats.successfulRequests;
      this.stats.avgResponseTime = ((currentAvg * (count - 1)) + responseTime) / count;
      
      // Mantener últimos 10 tiempos
      this.stats.last10ResponseTimes.push(responseTime);
      if (this.stats.last10ResponseTimes.length > 10) {
        this.stats.last10ResponseTimes.shift();
      }
    }
  }

  recordTimeout() {
    this.stats.timeoutErrors++;
  }

  recordNetworkError() {
    this.stats.networkErrors++;
  }

  getStats(): TrafficStats {
    return { ...this.stats };
  }

  getSuccessRate(): number {
    if (this.stats.totalRequests === 0) return 100;
    return (this.stats.successfulRequests / this.stats.totalRequests) * 100;
  }

  isEndpointSaturated(): boolean {
    // Considerar saturado si:
    // 1. Success rate < 80%
    // 2. O más de 30% de requests son timeouts
    // 3. O promedio de respuesta > 60 segundos
    
    const successRate = this.getSuccessRate();
    const timeoutRate = this.stats.totalRequests > 0 
      ? (this.stats.timeoutErrors / this.stats.totalRequests) * 100 
      : 0;
    
    return (
      successRate < 80 || 
      timeoutRate > 30 || 
      (this.stats.avgResponseTime > 60000 && this.stats.successfulRequests > 5)
    );
  }

  printReport() {
    console.log('\n' + '='.repeat(80));
    console.log('📊 REPORTE DE TRÁFICO');
    console.log('='.repeat(80));
    console.log(`Total Requests: ${this.stats.totalRequests}`);
    console.log(`Exitosos: ${this.stats.successfulRequests} (${this.getSuccessRate().toFixed(1)}%)`);
    console.log(`Timeouts: ${this.stats.timeoutErrors} (${(this.stats.timeoutErrors / this.stats.totalRequests * 100).toFixed(1)}%)`);
    console.log(`Errores de Red: ${this.stats.networkErrors}`);
    console.log(`Reintentos: ${this.stats.retries}`);
    console.log(`\nTiempos de Respuesta:`);
    console.log(`  Promedio: ${(this.stats.avgResponseTime / 1000).toFixed(1)}s`);
    console.log(`  Más lento: ${(this.stats.slowestResponseTime / 1000).toFixed(1)}s`);
    console.log(`  Más rápido: ${this.stats.fastestResponseTime === Infinity ? 'N/A' : (this.stats.fastestResponseTime / 1000).toFixed(1) + 's'}`);
    
    if (this.stats.last10ResponseTimes.length > 0) {
      const recent = this.stats.last10ResponseTimes.map(t => (t/1000).toFixed(1) + 's').join(', ');
      console.log(`  Últimos 10: ${recent}`);
    }
    
    if (this.isEndpointSaturated()) {
      console.log(`\n⚠️  ADVERTENCIA: Endpoint parece estar SATURADO`);
      console.log(`   Considera reducir el número de conversaciones simultáneas`);
    }
    
    console.log('='.repeat(80) + '\n');
  }

  reset() {
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      timeoutErrors: 0,
      networkErrors: 0,
      retries: 0,
      avgResponseTime: 0,
      slowestResponseTime: 0,
      fastestResponseTime: Infinity,
      last10ResponseTimes: []
    };
  }
}

// Singleton global
const globalTrafficMonitor = new TrafficMonitor();

export { globalTrafficMonitor as trafficMonitor, TrafficMonitor };
export type { TrafficStats };
