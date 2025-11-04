/**
 * 🔧 Utility Functions for Robust API Calls
 * 
 * Helpers para manejar timeouts, retries y errores en llamadas a APIs externas
 */

/**
 * Ejecuta fetch con timeout automático
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = 30000 // 30 segundos por defecto
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Combinar señales de abort (timeout + manual si existe)
    const combinedSignal = options.signal 
      ? combineAbortSignals([controller.signal, options.signal])
      : controller.signal;

    const response = await fetch(url, {
      ...options,
      signal: combinedSignal
    });

    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error instanceof Error && error.name === 'AbortError') {
      // Determinar si fue timeout o cancelación manual
      if (controller.signal.aborted && !options.signal?.aborted) {
        throw new Error(`Request timeout after ${timeoutMs}ms`);
      }
    }
    
    throw error;
  }
}

/**
 * Combina múltiples AbortSignals en uno solo
 */
function combineAbortSignals(signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();

  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort();
      break;
    }

    signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  return controller.signal;
}

/**
 * Ejecuta una función async con reintentos
 */
export async function retryAsync<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    retryDelay?: number;
    onRetry?: (attempt: number, error: any) => void;
    shouldRetry?: (error: any) => boolean;
    signal?: AbortSignal; // 🔥 NUEVO: Soporte para cancelación
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    retryDelay = 1000,
    onRetry,
    shouldRetry = () => true,
    signal
  } = options;

  let lastError: any;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // No reintentar si es un AbortError (cancelación del usuario)
      if (error instanceof Error && error.name === 'AbortError') {
        throw error;
      }

      // No reintentar si la función shouldRetry dice que no
      if (!shouldRetry(error)) {
        throw error;
      }

      // Si no quedan más intentos, lanzar el error
      if (attempt === maxRetries) {
        break;
      }

      // Callback opcional para logging
      if (onRetry) {
        onRetry(attempt, error);
      }

      // 🔥 Esperar antes del siguiente intento (exponential backoff) respetando abort signal
      try {
        await delay(retryDelay * attempt, signal);
      } catch (delayError) {
        // Si el delay fue abortado, propagar el AbortError
        if (delayError instanceof Error && delayError.name === 'AbortError') {
          throw delayError;
        }
      }
    }
  }

  throw lastError;
}

/**
 * Ejecuta Promise.all con timeout global
 */
export async function promiseAllWithTimeout<T>(
  promises: Promise<T>[],
  timeoutMs: number,
  onTimeout?: () => void
): Promise<T[]> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      if (onTimeout) onTimeout();
      reject(new Error(`Promise.all timeout after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  return Promise.race([
    Promise.all(promises),
    timeoutPromise
  ]) as Promise<T[]>;
}

/**
 * Ejecuta una promesa con timeout individual
 */
export async function promiseWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage?: string
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error(errorMessage || `Operation timeout after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]);
}

/**
 * Verifica si un error es recuperable (debería reintentar)
 */
export function isRetryableError(error: any): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    
    // Errores de red que SÍ deberían reintentar
    if (
      message.includes('network') ||
      message.includes('timeout') ||
      message.includes('econnreset') ||
      message.includes('enotfound') ||
      message.includes('503') || // Service Unavailable
      message.includes('504') || // Gateway Timeout
      message.includes('429')    // Too Many Requests (rate limit)
    ) {
      return true;
    }

    // Errores del cliente que NO deberían reintentar
    if (
      message.includes('400') || // Bad Request
      message.includes('401') || // Unauthorized
      message.includes('403') || // Forbidden
      message.includes('404')    // Not Found
    ) {
      return false;
    }
  }

  // Por defecto, reintentar
  return true;
}

/**
 * Delay que respeta AbortSignal (se puede cancelar)
 */
export async function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    // Si ya fue abortado antes de empezar, rechazar inmediatamente
    if (signal?.aborted) {
      reject(new DOMException('Delay aborted', 'AbortError'));
      return;
    }

    const timeoutId = setTimeout(() => {
      resolve();
    }, ms);

    // Si se aborta durante el delay, limpiar timeout y rechazar
    const abortHandler = () => {
      clearTimeout(timeoutId);
      reject(new DOMException('Delay aborted', 'AbortError'));
    };

    signal?.addEventListener('abort', abortHandler, { once: true });
  });
}
