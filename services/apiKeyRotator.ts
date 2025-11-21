/**
 * 🔄 API Key Rotator
 * Rota automáticamente entre múltiples API keys cuando una falla o expira
 */

const API_KEYS = [
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY_2,
    process.env.GEMINI_API_KEY_3,
    process.env.GEMINI_API_KEY_4,
    process.env.GEMINI_API_KEY_5,
].filter(Boolean) as string[];

let currentKeyIndex = 0;
const failedKeys = new Set<string>();
const keyUsageCount = new Map<string, number>();
const keyLastUsed = new Map<string, number>();

// Rate limiting por key (300 RPM según .env)
const MAX_RPM_PER_KEY = 300;
const MINUTE_MS = 60000;

/**
 * Obtiene la próxima API key disponible
 */
export function getNextApiKey(): string {
    if (API_KEYS.length === 0) {
        throw new Error('No hay API keys de Gemini configuradas en .env');
    }

    // Si todas las keys fallaron, resetear y empezar de nuevo
    if (failedKeys.size >= API_KEYS.length) {
        console.warn('⚠️ Todas las API keys fallaron, reseteando...');
        failedKeys.clear();
    }

    // Buscar la próxima key disponible que no haya fallado
    let attempts = 0;
    while (attempts < API_KEYS.length) {
        const key = API_KEYS[currentKeyIndex];
        currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
        attempts++;

        if (!failedKeys.has(key)) {
            // Verificar rate limit
            const now = Date.now();
            const lastUsed = keyLastUsed.get(key) || 0;
            const usageCount = keyUsageCount.get(key) || 0;

            // Reset contador si pasó 1 minuto
            if (now - lastUsed > MINUTE_MS) {
                keyUsageCount.set(key, 0);
            }

            // Si la key está bajo el rate limit, usarla
            if (usageCount < MAX_RPM_PER_KEY) {
                keyUsageCount.set(key, usageCount + 1);
                keyLastUsed.set(key, now);
                return key;
            }

            console.warn(`⚠️ Key ${key.substring(0, 20)}... alcanzó rate limit (${usageCount}/${MAX_RPM_PER_KEY} RPM)`);
        }
    }

    // Si llegamos aquí, todas las keys están en rate limit o fallaron
    // Retornar la primera disponible y esperar que se recupere
    console.warn('⚠️ Todas las keys en rate limit, usando la primera disponible');
    return API_KEYS[0];
}

/**
 * Marca una API key como fallida (expirada o con error)
 */
export function markKeyAsFailed(apiKey: string, reason: string = 'unknown'): void {
    console.error(`❌ API Key marcada como fallida: ${apiKey.substring(0, 20)}... (Razón: ${reason})`);
    failedKeys.add(apiKey);
}

/**
 * Resetea el estado de una API key (cuando se recupera)
 */
export function resetKey(apiKey: string): void {
    failedKeys.delete(apiKey);
    keyUsageCount.set(apiKey, 0);
}

/**
 * Obtiene estadísticas de uso de las keys
 */
export function getKeyStats() {
    return {
        totalKeys: API_KEYS.length,
        failedKeys: failedKeys.size,
        availableKeys: API_KEYS.length - failedKeys.size,
        usage: Array.from(keyUsageCount.entries()).map(([key, count]) => ({
            key: key.substring(0, 20) + '...',
            requestsThisMinute: count,
            lastUsed: keyLastUsed.get(key) || 0
        }))
    };
}

/**
 * Wrapper para ejecutar una función con retry automático usando diferentes keys
 */
export async function withApiKeyRetry<T>(
    fn: (apiKey: string) => Promise<T>,
    maxRetries: number = API_KEYS.length
): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        const apiKey = getNextApiKey();

        try {
            const result = await fn(apiKey);
            // Si tuvo éxito, resetear la key por si estaba marcada como fallida
            resetKey(apiKey);
            return result;
        } catch (error: any) {
            lastError = error;

            // Si es error de API key expirada o inválida, marcarla y probar con otra
            if (
                error.message?.includes('API key expired') ||
                error.message?.includes('API_KEY_INVALID') ||
                error.message?.includes('INVALID_ARGUMENT')
            ) {
                markKeyAsFailed(apiKey, 'expired or invalid');
                console.log(`🔄 Intentando con otra API key... (intento ${attempt + 1}/${maxRetries})`);
                continue;
            }

            // Si es rate limit, marcarla temporalmente
            if (
                error.message?.includes('429') ||
                error.message?.includes('Too Many Requests') ||
                error.message?.includes('RESOURCE_EXHAUSTED')
            ) {
                console.warn(`⏱️ Rate limit alcanzado con key, intentando con otra...`);
                continue;
            }

            // Para otros errores, fallar inmediatamente
            throw error;
        }
    }

    throw lastError || new Error('Falló con todas las API keys disponibles');
}
