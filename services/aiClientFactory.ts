/**
 * 🏭 AI Client Factory - Wrapper simplificado para obtener clientes AI con load balancing
 * 
 * USO:
 * ```typescript
 * // Antes:
 * const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
 * 
 * // Ahora:
 * const ai = await getAIClient(); // Automático load balancing + fallback
 * ```
 * 
 * NOTA: Por ahora solo retorna GoogleGenAI (Gemini con load balancing).
 * OpenAI fallback se implementará en versiones futuras cuando sea necesario.
 */

import { GoogleGenAI } from "@google/genai";
import { apiLoadBalancer } from "./apiLoadBalancer";

export interface AIClient {
  client: GoogleGenAI;
  apiId: string;
  provider: 'gemini';
}

/**
 * 🎯 OBTENER CLIENTE AI CON LOAD BALANCING AUTOMÁTICO
 * 
 * Intenta usar Gemini con round-robin entre múltiples keys.
 * 
 * @returns Cliente Gemini listo para usar con load balancing
 * @throws Error si no hay APIs disponibles
 */
export async function getAIClient(): Promise<GoogleGenAI> {
  const startTime = Date.now();
  
  try {
    // Obtener cliente Gemini con load balancing
    const { client, apiId } = await apiLoadBalancer.getGeminiClient();
    const responseTime = Date.now() - startTime;
    apiLoadBalancer.recordSuccess(apiId, responseTime);
    
    return client;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`❌ [AIClientFactory] Error obteniendo cliente AI: ${errorMsg}`);
    throw error;
  }
}

/**
 * 🎯 EJECUTAR OPERACIÓN CON RETRY AUTOMÁTICO
 * 
 * Ejecuta una función que usa AI, con retry automático si falla.
 * 
 * @param operation Función a ejecutar (recibe el cliente Gemini)
 * @param maxRetries Número máximo de reintentos
 * @returns Resultado de la operación
 */
export async function executeWithRetry<T>(
  operation: (aiClient: GoogleGenAI) => Promise<T>,
  maxRetries: number = 3
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const aiClient = await getAIClient();
      const result = await operation(aiClient);
      
      if (attempt > 1) {
        console.log(`✅ [AIClientFactory] Operación exitosa en intento ${attempt}/${maxRetries}`);
      }
      
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt < maxRetries) {
        const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 10000); // Exponential backoff
        console.warn(`⚠️ [AIClientFactory] Intento ${attempt}/${maxRetries} falló, reintentando en ${delayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }
  
  throw lastError || new Error('Operación falló después de todos los reintentos');
}

/**
 * 📊 Obtener estadísticas del load balancer
 */
export function getLoadBalancerStats() {
  return apiLoadBalancer.getStats();
}

/**
 * 📋 Imprimir reporte del load balancer
 */
export function printLoadBalancerReport() {
  apiLoadBalancer.printReport();
}

/**
 * 🔄 Resetear estadísticas
 */
export function resetLoadBalancerStats() {
  apiLoadBalancer.resetStats();
}
