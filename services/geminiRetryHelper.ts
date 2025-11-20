/**
 * 🔄 Helper centralizado para llamadas a Gemini con reintentos automáticos
 * 
 * Este módulo proporciona una función única para manejar errores 503/overloaded
 * de manera consistente en toda la aplicación.
 */

import { retryAsync } from './apiUtils';

/**
 * Función que determina si un error de Gemini es recuperable
 * Maneja la estructura anidada de errores de la API de Gemini
 */
export function shouldRetryGeminiError(error: any): boolean {
  // Manejar errores de Gemini que vienen con estructura anidada
  const errorMsg = error?.message || '';
  const errorStr = JSON.stringify(error);
  const nestedMsg = error?.error?.message || '';
  const statusCode = error?.error?.code || error?.code || error?.status;
  
  // Buscar indicadores de sobrecarga en todos los niveles
  const isOverloaded = 
    errorMsg.includes('503') || 
    errorMsg.includes('overloaded') || 
    errorMsg.includes('UNAVAILABLE') ||
    nestedMsg.includes('overloaded') ||
    nestedMsg.includes('UNAVAILABLE') ||
    errorStr.includes('503') ||
    errorStr.includes('overloaded') ||
    errorStr.includes('UNAVAILABLE') ||
    statusCode === 503;
  
  const isRateLimit = 
    errorMsg.includes('429') || 
    errorMsg.includes('quota') || 
    errorMsg.includes('rate limit') ||
    nestedMsg.includes('429') ||
    nestedMsg.includes('quota') ||
    nestedMsg.includes('rate limit') ||
    errorStr.includes('429') ||
    statusCode === 429;
  
  if (isOverloaded || isRateLimit) {
    console.log(`   🔄 Error recuperable detectado - reintentando...`);
    console.log(`   📊 Código: ${statusCode}, Mensaje: ${nestedMsg || errorMsg}`);
    return true;
  }
  
  return false;
}

/**
 * Ejecuta una llamada a Gemini con reintentos automáticos
 * Usa backoff exponencial y maneja errores 503/429
 * 
 * @param fn - Función que ejecuta la llamada a Gemini
 * @param operationName - Nombre de la operación para logging
 * @param maxRetries - Número máximo de reintentos (default: 5)
 * @param retryDelay - Delay inicial en ms (default: 2000)
 */
export async function callGeminiWithRetry<T>(
  fn: () => Promise<T>,
  operationName: string = 'gemini_call',
  maxRetries: number = 5,
  retryDelay: number = 2000
): Promise<T> {
  return retryAsync(
    fn,
    {
      maxRetries,
      retryDelay,
      onRetry: (attempt, error) => {
        console.log(`⚠️ [${operationName}] Intento ${attempt}/${maxRetries} falló`);
        console.log(`   Error:`, error?.error?.message || error?.message || 'Unknown error');
        console.log(`   ⏳ Esperando antes de reintentar...`);
      },
      shouldRetry: shouldRetryGeminiError
    }
  );
}
