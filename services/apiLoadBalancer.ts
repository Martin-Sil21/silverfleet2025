/**
 * 🔄 API Load Balancer - Distribución inteligente de carga entre múltiples APIs
 * 
 * CARACTERÍSTICAS:
 * - Round-robin entre múltiples Gemini API keys
 * - Tracking de rate limits y errores por API
 * - Auto-retry con siguiente API disponible
 * - Fallback automático a OpenAI si todas las Gemini fallan
 * - Health checks y circuit breaker pattern
 * - Estadísticas de uso en tiempo real
 */

import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";

// 📊 Estado de cada API
interface APIStatus {
  id: string;
  type: 'gemini' | 'openai';
  key: string;
  isHealthy: boolean;
  consecutiveErrors: number;
  lastError?: string;
  lastErrorTime?: number;
  requestCount: number;
  successCount: number;
  errorCount: number;
  lastUsedAt?: number;
  avgResponseTime: number;
}

// 📈 Estadísticas globales
interface LoadBalancerStats {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  geminiRequests: number;
  openaiRequests: number;
  fallbacksToOpenAI: number;
  avgResponseTime: number;
  apiStats: APIStatus[];
}

class APILoadBalancer {
  private geminiAPIs: APIStatus[] = [];
  private openaiAPI: APIStatus | null = null;
  private currentGeminiIndex = 0;
  private stats: LoadBalancerStats;
  
  // Circuit breaker: si una API falla N veces consecutivas, la marcamos como unhealthy
  private readonly MAX_CONSECUTIVE_ERRORS = 3;
  private readonly UNHEALTHY_COOLDOWN_MS = 60000; // 1 minuto
  
  constructor() {
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      geminiRequests: 0,
      openaiRequests: 0,
      fallbacksToOpenAI: 0,
      avgResponseTime: 0,
      apiStats: []
    };
    
    this.initializeAPIs();
  }
  
  /**
   * Inicializar todas las APIs desde las variables de entorno
   */
  private initializeAPIs() {
    // Cargar Gemini API Keys
    const geminiKeys = [
      process.env.GEMINI_API_KEY,
      process.env.GEMINI_API_KEY_2,
      process.env.GEMINI_API_KEY_3,
      process.env.GEMINI_API_KEY_4,
      process.env.GEMINI_API_KEY_5,
      process.env.API_KEY // Backup
    ].filter((key): key is string => Boolean(key));
    
    // Remover duplicados
    const uniqueGeminiKeys = [...new Set(geminiKeys)];
    
    this.geminiAPIs = uniqueGeminiKeys.map((key, index) => ({
      id: `gemini-${index + 1}`,
      type: 'gemini',
      key,
      isHealthy: true,
      consecutiveErrors: 0,
      requestCount: 0,
      successCount: 0,
      errorCount: 0,
      avgResponseTime: 0
    }));
    
    console.log(`🔧 [LoadBalancer] Inicializadas ${this.geminiAPIs.length} Gemini APIs`);
    
    // Cargar OpenAI API Key (fallback)
    const openaiKey = process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY;
    if (openaiKey) {
      this.openaiAPI = {
        id: 'openai-fallback',
        type: 'openai',
        key: openaiKey,
        isHealthy: true,
        consecutiveErrors: 0,
        requestCount: 0,
        successCount: 0,
        errorCount: 0,
        avgResponseTime: 0
      };
      console.log(`🔧 [LoadBalancer] OpenAI configurada como fallback`);
    } else {
      console.warn(`⚠️ [LoadBalancer] OpenAI API key no encontrada, no habrá fallback`);
    }
    
    this.stats.apiStats = [...this.geminiAPIs, this.openaiAPI].filter(Boolean) as APIStatus[];
  }
  
  /**
   * Obtener la siguiente Gemini API disponible (round-robin)
   */
  private getNextGeminiAPI(): APIStatus | null {
    const healthyAPIs = this.geminiAPIs.filter(api => this.isAPIAvailable(api));
    
    if (healthyAPIs.length === 0) {
      console.warn(`⚠️ [LoadBalancer] No hay Gemini APIs disponibles`);
      return null;
    }
    
    // Round-robin sobre APIs saludables
    const api = healthyAPIs[this.currentGeminiIndex % healthyAPIs.length];
    this.currentGeminiIndex = (this.currentGeminiIndex + 1) % healthyAPIs.length;
    
    return api;
  }
  
  /**
   * Verificar si una API está disponible
   */
  private isAPIAvailable(api: APIStatus): boolean {
    if (!api.isHealthy) {
      // Verificar si ya pasó el cooldown
      if (api.lastErrorTime && Date.now() - api.lastErrorTime > this.UNHEALTHY_COOLDOWN_MS) {
        console.log(`♻️ [LoadBalancer] ${api.id} recuperándose del circuit breaker`);
        api.isHealthy = true;
        api.consecutiveErrors = 0;
      } else {
        return false;
      }
    }
    return true;
  }
  
  /**
   * Marcar una API como fallida
   */
  private recordAPIFailure(api: APIStatus, error: string) {
    api.consecutiveErrors++;
    api.errorCount++;
    api.lastError = error;
    api.lastErrorTime = Date.now();
    
    if (api.consecutiveErrors >= this.MAX_CONSECUTIVE_ERRORS) {
      api.isHealthy = false;
      console.error(`🚨 [LoadBalancer] ${api.id} marcada como UNHEALTHY (${api.consecutiveErrors} errores consecutivos)`);
    }
  }
  
  /**
   * Marcar una API como exitosa
   */
  private recordAPISuccess(api: APIStatus, responseTime: number) {
    api.consecutiveErrors = 0;
    api.successCount++;
    api.isHealthy = true;
    api.lastUsedAt = Date.now();
    
    // Calcular promedio móvil del tiempo de respuesta
    if (api.avgResponseTime === 0) {
      api.avgResponseTime = responseTime;
    } else {
      api.avgResponseTime = (api.avgResponseTime * 0.9) + (responseTime * 0.1);
    }
  }
  
  /**
   * 🎯 MÉTODO PRINCIPAL: Obtener cliente Gemini con load balancing
   */
  public async getGeminiClient(): Promise<{ client: GoogleGenAI; apiId: string }> {
    this.stats.totalRequests++;
    
    // Intentar con Gemini APIs
    const maxAttempts = this.geminiAPIs.length;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const api = this.getNextGeminiAPI();
      
      if (!api) {
        break; // No hay más Gemini APIs disponibles
      }
      
      try {
        const client = new GoogleGenAI({ apiKey: api.key });
        api.requestCount++;
        this.stats.geminiRequests++;
        
        console.log(`✅ [LoadBalancer] Usando ${api.id} (${api.requestCount} requests, ${api.successCount} exitosos)`);
        
        return { client, apiId: api.id };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`❌ [LoadBalancer] Error con ${api.id}: ${errorMsg}`);
        this.recordAPIFailure(api, errorMsg);
      }
    }
    
    // Si todas las Gemini fallan, usar OpenAI
    if (this.openaiAPI && this.isAPIAvailable(this.openaiAPI)) {
      console.warn(`🔄 [LoadBalancer] Todas las Gemini APIs fallaron, usando OpenAI fallback`);
      this.stats.fallbacksToOpenAI++;
      throw new Error('FALLBACK_TO_OPENAI'); // Signal especial
    }
    
    throw new Error('No hay APIs disponibles (todas las Gemini fallaron y OpenAI no está configurada)');
  }
  
  /**
   * 🎯 Obtener cliente OpenAI (fallback)
   */
  public async getOpenAIClient(): Promise<{ client: OpenAI; apiId: string }> {
    if (!this.openaiAPI) {
      throw new Error('OpenAI no está configurada');
    }
    
    if (!this.isAPIAvailable(this.openaiAPI)) {
      throw new Error('OpenAI no está disponible');
    }
    
    try {
      const client = new OpenAI({ apiKey: this.openaiAPI.key, dangerouslyAllowBrowser: true });
      this.openaiAPI.requestCount++;
      this.stats.openaiRequests++;
      
      console.log(`✅ [LoadBalancer] Usando ${this.openaiAPI.id} (${this.openaiAPI.requestCount} requests)`);
      
      return { client, apiId: this.openaiAPI.id };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.recordAPIFailure(this.openaiAPI, errorMsg);
      throw error;
    }
  }
  
  /**
   * Registrar resultado de una llamada exitosa
   */
  public recordSuccess(apiId: string, responseTime: number) {
    const api = this.stats.apiStats.find(a => a.id === apiId);
    if (api) {
      this.recordAPISuccess(api, responseTime);
    }
    this.stats.successfulRequests++;
    
    // Actualizar promedio global
    if (this.stats.avgResponseTime === 0) {
      this.stats.avgResponseTime = responseTime;
    } else {
      this.stats.avgResponseTime = (this.stats.avgResponseTime * 0.95) + (responseTime * 0.05);
    }
  }
  
  /**
   * Registrar resultado de una llamada fallida
   */
  public recordFailure(apiId: string, error: string) {
    const api = this.stats.apiStats.find(a => a.id === apiId);
    if (api) {
      this.recordAPIFailure(api, error);
    }
    this.stats.failedRequests++;
  }
  
  /**
   * Obtener estadísticas actuales
   */
  public getStats(): LoadBalancerStats {
    return JSON.parse(JSON.stringify(this.stats)); // Deep copy
  }
  
  /**
   * Resetear estadísticas
   */
  public resetStats() {
    this.stats.totalRequests = 0;
    this.stats.successfulRequests = 0;
    this.stats.failedRequests = 0;
    this.stats.geminiRequests = 0;
    this.stats.openaiRequests = 0;
    this.stats.fallbacksToOpenAI = 0;
    this.stats.avgResponseTime = 0;
    
    this.stats.apiStats.forEach(api => {
      api.requestCount = 0;
      api.successCount = 0;
      api.errorCount = 0;
      api.consecutiveErrors = 0;
      api.avgResponseTime = 0;
    });
    
    console.log(`🔄 [LoadBalancer] Estadísticas reseteadas`);
  }
  
  /**
   * Imprimir reporte de estadísticas
   */
  public printReport() {
    console.log('\n' + '='.repeat(80));
    console.log('📊 REPORTE DE LOAD BALANCER');
    console.log('='.repeat(80));
    console.log(`Total Requests: ${this.stats.totalRequests}`);
    console.log(`Exitosos: ${this.stats.successfulRequests} (${((this.stats.successfulRequests/this.stats.totalRequests)*100).toFixed(1)}%)`);
    console.log(`Fallidos: ${this.stats.failedRequests} (${((this.stats.failedRequests/this.stats.totalRequests)*100).toFixed(1)}%)`);
    console.log(`\nDistribución:`);
    console.log(`  Gemini: ${this.stats.geminiRequests} requests (${((this.stats.geminiRequests/this.stats.totalRequests)*100).toFixed(1)}%)`);
    console.log(`  OpenAI: ${this.stats.openaiRequests} requests (${((this.stats.openaiRequests/this.stats.totalRequests)*100).toFixed(1)}%)`);
    console.log(`  Fallbacks a OpenAI: ${this.stats.fallbacksToOpenAI}`);
    console.log(`\nTiempo de respuesta promedio: ${this.stats.avgResponseTime.toFixed(0)}ms`);
    
    console.log(`\n📋 Estado por API:`);
    this.stats.apiStats.forEach(api => {
      const status = api.isHealthy ? '✅ HEALTHY' : '🚨 UNHEALTHY';
      const successRate = api.requestCount > 0 ? ((api.successCount / api.requestCount) * 100).toFixed(1) : '0';
      console.log(`  ${api.id}: ${status} | ${api.requestCount} reqs | ${successRate}% éxito | ${api.avgResponseTime.toFixed(0)}ms avg`);
      if (!api.isHealthy && api.lastError) {
        console.log(`    └─ Error: ${api.lastError}`);
      }
    });
    
    console.log('='.repeat(80) + '\n');
  }
}

// Singleton global
const globalLoadBalancer = new APILoadBalancer();

export { globalLoadBalancer as apiLoadBalancer, APILoadBalancer };
export type { LoadBalancerStats, APIStatus };
