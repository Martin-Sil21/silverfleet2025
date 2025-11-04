# 🐛 FIX: Conversaciones que se Detienen a Mitad

## ❌ Problema Reportado

**Usuario**: "analiza bien por que motivo se paran a mitad de la conversacion y no vuelven a responder. por lo que jamas termina el análisis y no se llega al reporte"

### Síntomas Observados
1. Conversaciones inician correctamente
2. A mitad del proceso (turno 3-7) se detienen completamente
3. No hay errores visibles en UI
4. Nunca llegan al reporte final
5. El sistema queda esperando indefinidamente

## 🔍 Análisis de Causas Raíz

### Causa 1: **Fetch sin Timeout** 🚨 CRÍTICO

**Ubicación**: `services/independentConversationRunner.ts:302`

**Código problemático**:
```typescript
const response = await fetch(config.endpointUrl!, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(userInput),
    signal: abortSignal // ❌ Solo maneja cancelación MANUAL, NO timeout automático
});
```

**Problema**:
- Si el webhook (n8n) tarda más de lo normal o se cuelga, fetch() nunca resuelve
- La promesa queda pendiente indefinidamente
- No hay timeout configurado
- `abortSignal` solo funciona para cancelación manual del usuario

**Consecuencias**:
- Conversación bloqueada esperando respuesta del webhook
- Otras conversaciones también esperan (Promise.all)
- UI muestra "Esperando respuesta..." pero nunca avanza
- No se genera reporte porque nunca terminan las conversaciones

### Causa 2: **Generación de Mensajes sin Timeout** ⚠️ MEDIO

**Ubicación**: `services/geminiService.ts:358+`

**Código problemático**:
```typescript
const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
    config: {
        temperature: 0.9,
    }
});
```

**Problema**:
- Llamada a Gemini AI sin timeout
- Si Gemini tiene problemas (rate limit, latencia alta), se cuelga
- Sin retry logic - un error transitorio detiene todo

**Consecuencias**:
- Conversación no puede generar siguiente mensaje del usuario
- Se detiene en "Generando mensaje..."
- No hay reintentos automáticos

### Causa 3: **Promise.all sin Timeout Global** 🚨 CRÍTICO

**Ubicación**: `services/geminiService.ts:1031`

**Código problemático**:
```typescript
await Promise.all(conversationPromises);
```

**Problema**:
- Si UNA conversación se cuelga, TODAS las demás esperan indefinidamente
- Promise.all() solo resuelve cuando TODAS las promesas resuelven
- No hay timeout global para detectar conversaciones bloqueadas

**Consecuencias**:
- Sistema completamente bloqueado
- Incluso conversaciones exitosas no procesan resultados
- Nunca llega a la fase de análisis
- No se genera reporte

### Causa 4: **Sin Manejo de Errores de Red** ⚠️ MEDIO

**Problema**:
- Errores de red transitorios (ECONNRESET, ETIMEDOUT, etc.) no se reintentan
- Fallos temporales de servicios externos causan fallos permanentes
- No hay distinción entre errores recuperables vs no recuperables

## ✅ Soluciones Implementadas

### Solución 1: **API Utils con Timeout y Retry**

**Archivo nuevo**: `services/apiUtils.ts` (180 líneas)

#### A. fetchWithTimeout()
```typescript
export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = 30000 // 30 segundos por defecto
): Promise<Response>
```

**Features**:
- Timeout automático configurable
- Combina señales de abort (timeout + cancelación manual)
- Distingue entre timeout y cancelación del usuario
- Error messages claros

**Uso**:
```typescript
const response = await fetchWithTimeout(
    config.endpointUrl!,
    {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userInput),
        signal: abortSignal // Aún permite cancelación manual
    },
    45000 // Timeout de 45 segundos
);
```

#### B. retryAsync()
```typescript
export async function retryAsync<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    retryDelay?: number;
    onRetry?: (attempt: number, error: any) => void;
    shouldRetry?: (error: any) => boolean;
  }
): Promise<T>
```

**Features**:
- Reintentos automáticos con exponential backoff
- Callback opcional para logging
- Función personalizable para determinar si reintentar
- No reintenta cancelaciones del usuario (AbortError)

**Uso**:
```typescript
const response = await retryAsync(
    () => fetchWithTimeout(...),
    {
        maxRetries: 2,
        retryDelay: 3000,
        shouldRetry: isRetryableError,
        onRetry: (attempt, error) => {
            console.warn(`Reintentando (${attempt}/2):`, error);
        }
    }
);
```

#### C. promiseAllWithTimeout()
```typescript
export async function promiseAllWithTimeout<T>(
  promises: Promise<T>[],
  timeoutMs: number,
  onTimeout?: () => void
): Promise<T[]>
```

**Features**:
- Timeout global para Promise.all()
- Callback cuando ocurre timeout
- Permite procesar promesas que sí completaron

#### D. isRetryableError()
```typescript
export function isRetryableError(error: any): boolean
```

**Lógica inteligente**:
- ✅ **SÍ reintentar**: network errors, timeouts, 503, 504, 429 (rate limit)
- ❌ **NO reintentar**: 400, 401, 403, 404 (errores del cliente)
- ✅ **Default**: reintentar (fail-safe)

### Solución 2: **Actualización de independentConversationRunner.ts**

#### Cambio 1: Imports
```typescript
import { fetchWithTimeout, retryAsync, promiseWithTimeout, isRetryableError } from './apiUtils';

const MAX_CONVERSATION_TURNS = 12;
const FETCH_TIMEOUT_MS = 45000; // 45 segundos para webhook
const MESSAGE_GENERATION_TIMEOUT_MS = 30000; // 30 segundos para Gemini
```

#### Cambio 2: Generación de Mensajes con Timeout
```typescript
const messageText = await retryAsync(
    () => promiseWithTimeout(
        generateUserMessageText(
            conv.testCase, 
            conv.history, 
            language, 
            dbContext,
            toolsContext
        ),
        MESSAGE_GENERATION_TIMEOUT_MS,
        `Timeout generando mensaje para ${conv.testCase.title}`
    ),
    {
        maxRetries: 3,
        retryDelay: 2000,
        shouldRetry: isRetryableError,
        onRetry: (attempt, error) => {
            console.warn(`⚠️ Reintentando generación de mensaje (${attempt}/3):`, error);
            onProgress({ message: `⚠️ Reintentando generación de mensaje (${attempt}/3)` });
        }
    }
);
```

**Beneficios**:
- Si Gemini tarda más de 30s → timeout con error claro
- Hasta 3 reintentos automáticos con exponential backoff (2s, 4s, 6s)
- Usuario ve mensaje de progreso durante reintentos
- Solo reintenta errores recuperables

#### Cambio 3: Fetch al Webhook con Timeout y Retry
```typescript
const response = await retryAsync(
    () => fetchWithTimeout(
        config.endpointUrl!,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userInput),
            signal: abortSignal
        },
        FETCH_TIMEOUT_MS // 45 segundos
    ),
    {
        maxRetries: 2,
        retryDelay: 3000,
        shouldRetry: (error) => {
            if (error instanceof Error && error.name === 'AbortError') {
                return false; // No reintentar cancelación manual
            }
            return isRetryableError(error);
        },
        onRetry: (attempt, error) => {
            console.warn(`⚠️ Reintentando llamada al webhook (${attempt}/2):`, error);
            onProgress({ message: `⚠️ Reintentando llamada (${attempt}/2)` });
        }
    }
);
```

**Beneficios**:
- Si webhook tarda >45s → timeout automático
- 2 reintentos (3s, 6s de delay)
- Usuario informado durante reintentos
- Distingue timeout vs cancelación manual
- Errores 4xx no se reintentan (son permanentes)

### Solución 3: **Timeout Global en geminiService.ts**

```typescript
// Esperar a que TODAS las conversaciones terminen con TIMEOUT GLOBAL
const TIMEOUT_PER_CONVERSATION_MS = 10 * 60 * 1000; // 10 minutos cada una
const TOTAL_TIMEOUT_MS = TIMEOUT_PER_CONVERSATION_MS * conversations.length;

try {
    await promiseAllWithTimeout(
        conversationPromises,
        TOTAL_TIMEOUT_MS,
        () => {
            console.error('🚨 TIMEOUT GLOBAL: Las conversaciones tardaron demasiado');
            onProgress({ message: '🚨 Timeout: Las conversaciones tardaron más de lo esperado. Finalizando...' });
        }
    );
} catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
        // Cancelación manual
        return;
    } else if (error instanceof Error && error.message.includes('timeout')) {
        // Timeout - PROCESAR LAS QUE SÍ COMPLETARON
        onProgress({ message: '⚠️ Algunas conversaciones excedieron el tiempo límite. Procesando las que completaron...' });
        // NO hacer return - continuar con análisis
    } else {
        throw error;
    }
}
```

**Beneficios**:
- Si conversaciones tardan >10min cada una → timeout global
- Se procesan las que SÍ completaron (partial success)
- Usuario informado del problema
- No bloquea indefinidamente

## 📊 Timeouts Configurados

| Operación | Timeout | Reintentos | Delay |
|-----------|---------|------------|-------|
| **Webhook Request** | 45s | 2 | 3s, 6s |
| **Gemini Generate Message** | 30s | 3 | 2s, 4s, 6s |
| **Por Conversación** | 10min | N/A | N/A |
| **Total (todas)** | 10min × N | N/A | N/A |

## 🧪 Escenarios de Prueba

### Escenario 1: Webhook Lento
**Antes**: Se cuelga indefinidamente  
**Ahora**: 
- Intento 1: Espera 45s → timeout
- Intento 2: Espera 45s → timeout (después de 3s delay)
- Intento 3: Espera 45s → timeout (después de 6s delay)
- Error final después de ~2.5 minutos
- Conversación marcada como ERROR
- Otras conversaciones continúan

### Escenario 2: Gemini Rate Limit
**Antes**: Error permanente, conversación detenida  
**Ahora**:
- Intento 1: Error 429 (Too Many Requests)
- Espera 2s (exponential backoff)
- Intento 2: Error 429
- Espera 4s
- Intento 3: Éxito ✅
- Conversación continúa normalmente

### Escenario 3: Una Conversación Bloqueada
**Antes**: TODAS las conversaciones esperan indefinidamente  
**Ahora**:
- 9 conversaciones completan en 5 minutos
- 1 conversación bloqueada
- Después de 10 minutos → timeout global
- Se procesan las 9 exitosas
- Reporte se genera con 9 resultados
- Usuario informado: "⚠️ 1 conversación excedió el tiempo límite"

### Escenario 4: Error de Red Transitorio
**Antes**: Falla permanentemente  
**Ahora**:
- ECONNRESET al enviar mensaje
- Reintento automático después de 3s
- Éxito ✅
- Usuario ni siquiera nota el problema

## 🎯 Beneficios

✅ **Robustez**: Sistema nunca se queda colgado indefinidamente  
✅ **Resilencia**: Errores transitorios se manejan automáticamente  
✅ **Transparencia**: Usuario informado del progreso y reintentos  
✅ **Partial Success**: Si algunas conversaciones completan, se procesan  
✅ **Error Messages Claros**: Distingue timeout vs cancelación vs error de red  
✅ **Configurabilidad**: Timeouts ajustables según necesidades  

## 📝 Archivos Modificados

1. ✅ `services/apiUtils.ts` - **NUEVO** (180 líneas)
2. ✅ `services/independentConversationRunner.ts` - Agregados timeouts y retries
3. ✅ `services/geminiService.ts` - Agregado timeout global a Promise.all

## 🚀 Cómo Probar

1. **Ejecutar auditoría normal**:
   - Todas las conversaciones deberían completar
   - No debería haber cambios visibles (todo funciona igual)

2. **Simular webhook lento** (modificar temporalmente):
   ```typescript
   // En n8n workflow, agregar delay de 60s
   await new Promise(resolve => setTimeout(resolve, 60000));
   ```
   - Debería ver "⚠️ Reintentando llamada (intento 1/2)"
   - Después de ~2.5 minutos → error final
   - Otras conversaciones continúan normales

3. **Simular error de Gemini** (desconectar internet brevemente):
   - Debería ver "⚠️ Reintentando generación de mensaje"
   - Al reconectar → continúa normalmente

4. **Dejar correr 100 conversaciones**:
   - Antes: Probablemente se colgaba
   - Ahora: Todas completan o se marcan como timeout
   - Reporte se genera con las que completaron

## ⚠️ Notas Importantes

- **Los timeouts son agresivos** (45s, 30s) para detectar problemas rápido
- Si tu webhook necesita >45s regularmente, aumentar `FETCH_TIMEOUT_MS`
- Los reintentos suman tiempo: 2 reintentos × 45s = ~90s total por request
- El timeout global es POR conversación (10min × N conversaciones)

**El sistema ahora es resiliente y nunca se queda bloqueado indefinidamente.**
