# Fix: Conversaciones Colgadas Sin Timeout en Verificaciones

## 🔍 Problema Identificado

Las conversaciones se quedaban colgadas sin aviso en turnos aleatorios (algunas en Turn 1-2, otras en Turn 5-7), aparentemente sin razón. El sistema simplemente dejaba de progresar sin mostrar errores.

### Síntomas Observados

```
[TC-001] Turn 2 - Última actividad... COLGADO
[TC-002] Turn 7 - Continúa avanzando ✅
[TC-003] Turn 7 - Continúa avanzando ✅
```

Las conversaciones "colgadas" mostraban logs normales hasta cierto punto y luego simplemente dejaban de responder, sin mensajes de timeout ni error.

## 🎯 Root Cause Encontrado

### El Problema Real

Las conversaciones NO se colgaban en el webhook de n8n ni en la generación de mensajes (que SÍ tenían timeout). **Se colgaban en las funciones de VERIFICACIÓN** que se ejecutan DESPUÉS de recibir la respuesta del webhook:

#### 1. **`extractBotPromises()` - Sin Timeout** ❌

**Ubicación**: `services/independentConversationRunner.ts:543`

```typescript
// ❌ ANTES (sin timeout)
const promises = await extractBotPromises(botResponse, userMsg, conversationContext);
```

Esta función llama a **Gemini AI** para analizar la respuesta del bot y extraer "promesas" verificables (precios, citas agendadas, etc.). Si Gemini no responde o tarda mucho, la conversación se queda esperando **INDEFINIDAMENTE**.

**Por qué pasa**:
- Gemini puede estar saturado y no responder rápido
- La función no tiene timeout interno
- El `catch` general no atrapa esto porque no es un error, solo una espera infinita

#### 2. **`verifyBotPromises()` - Sin Timeout** ❌

**Ubicación**: `services/independentConversationRunner.ts:548`

```typescript
// ❌ ANTES (sin timeout)
const newDiscrepancies = await verifyBotPromises(conv.testCase.id, promises, userId);
```

Esta función verifica las promesas del bot contra la base de datos real. Puede hacer múltiples consultas a Supabase sin límite de tiempo.

#### 3. **`integrationManager.verifyAllActions()` - Sin Timeout** ❌

**Ubicación**: `services/independentConversationRunner.ts:567`

```typescript
// ❌ ANTES (sin timeout)
const toolVerifications = await integrationManager.verifyAllActions(botResponse, turnCount);
```

Esta función verifica herramientas externas (Email, Calendar, etc.) que pueden tener APIs lentas o no responder.

### Por Qué los Timeouts Existentes No Funcionaban

El sistema YA tenía timeouts en:
- ✅ Webhook de n8n: 5 minutos (`FETCH_TIMEOUT_MS`)
- ✅ Generación de mensajes con Gemini: 1 minuto (`MESSAGE_GENERATION_TIMEOUT_MS`)
- ✅ Total por conversación: 90 minutos

**PERO** estos timeouts NO cubrían las **funciones de verificación** que se ejecutan DESPUÉS de obtener la respuesta. Entonces:

```
[Turn N]
  1. ✅ Generar mensaje (con timeout) → OK
  2. ✅ Enviar a webhook (con timeout) → OK
  3. ✅ Recibir respuesta (con timeout) → OK
  4. ❌ extractBotPromises() → COLGADO AQUÍ (sin timeout)
  5. ❌ verifyBotPromises() → COLGADO AQUÍ (sin timeout)
  6. ❌ verifyAllActions() → COLGADO AQUÍ (sin timeout)
```

## ✅ Solución Implementada

### 1. Timeout en `extractBotPromises()` - 45 segundos

**Archivo**: `services/independentConversationRunner.ts:543`

```typescript
// ✅ AHORA (con timeout de 45s)
const promises = await promiseWithTimeout(
    extractBotPromises(botResponse, userMsg, conversationContext, language),
    45000,
    `Timeout extrayendo promesas del bot para ${conv.testCase.title}`
);
```

**Por qué 45 segundos**: Gemini puede tardar en procesar respuestas largas del bot con múltiples promesas. Le damos tiempo suficiente pero no infinito.

### 2. Timeout en `verifyBotPromises()` - 30 segundos

```typescript
// ✅ AHORA (con timeout de 30s)
const newDiscrepancies = await promiseWithTimeout(
    verifyBotPromises(conv.testCase.id, promises, userId),
    30000,
    `Timeout verificando promesas para ${conv.testCase.title}`
);
```

**Por qué 30 segundos**: Las consultas a Supabase deberían ser rápidas gracias al snapshot cache. 30s es más que suficiente.

### 3. Timeout en `verifyAllActions()` - 30 segundos

```typescript
// ✅ AHORA (con timeout de 30s)
const toolVerifications = await promiseWithTimeout(
    integrationManager.verifyAllActions(botResponse, turnCount),
    30000,
    `Timeout verificando herramientas para ${conv.testCase.title}`
);
```

**Por qué 30 segundos**: APIs externas (Gmail, Calendar) pueden ser lentas. Si no responden en 30s, consideramos que la verificación falló y continuamos.

### 4. Timeout Adicional en `extractBotPromises()` Interno - 30 segundos

**Archivo**: `services/intelligentDatabaseVerifier.ts:107`

```typescript
// ✅ AHORA (con timeout de 30s interno)
const geminiPromise = ai.models.generateContent({...});

const timeoutPromise = new Promise((_, reject) => 
  setTimeout(() => reject(new Error('Timeout: extractBotPromises excedió 30s')), 30000)
);

const response = await Promise.race([geminiPromise, timeoutPromise]) as any;
```

**Doble protección**: Ahora `extractBotPromises` tiene:
1. Timeout interno de 30s (en el archivo mismo)
2. Timeout externo de 45s (cuando se llama desde independentConversationRunner)

Si Gemini tarda más de 30s, lanza un error que el timeout externo de 45s atrapa.

### 5. Mejor Manejo de Errores con Logs

```typescript
} catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Error desconocido';
    console.error(`[Verifier] Error:`, errorMsg);
    onProgress({ message: `    [${conv.testCase.title}] ⚠️ Error en verificación: ${errorMsg}` });
}
```

Ahora **SIEMPRE** se loggea el error con contexto del test case, para saber exactamente qué conversación tuvo el problema.

## 📊 Impacto Esperado

### Antes del Fix

```
[TC-001] Turn 2 → COLGADO en extractBotPromises (esperando Gemini...)
[TC-002] Turn 7 → Continúa normal
[TC-003] Turn 7 → Continúa normal

Resultado: Solo 2 de 3 conversaciones completan la auditoría
```

### Después del Fix

```
[TC-001] Turn 2 → Timeout en extractBotPromises (45s) → ⚠️ Error logeado → Continúa al Turn 3
[TC-002] Turn 7 → Continúa normal
[TC-003] Turn 7 → Continúa normal

Resultado: Las 3 conversaciones completan (con advertencias si hay timeouts)
```

## 🧪 Cómo Verificar el Fix

### Paso 1: Ejecutar Auditoría Normal

```bash
npm run dev
```

Configurar auditoría con **3 test cases** y **Database Audit** activa.

### Paso 2: Monitorear Logs en Consola

Buscar estos nuevos logs en caso de timeout:

```
⚠️ [Test Case Name] Error en verificación: Timeout extrayendo promesas del bot para Test Case Name
⚠️ [Test Case Name] Error verificando herramientas: Timeout verificando herramientas para Test Case Name
```

### Paso 3: Verificar Progreso Continuo

**ANTES**: Una conversación se colgaba → **la auditoría completa esperaba indefinidamente**

**AHORA**: Si una conversación tiene timeout en verificación → **continúa al siguiente turno con advertencia**

```
[TC-001] Turn 2: ⚠️ Error en verificación → Turn 3 continúa ✅
[TC-002] Turn 7: ✅ Verificación OK
[TC-003] Turn 7: ✅ Verificación OK
```

### Paso 4: Confirmar Reporte Final

Al final de la auditoría, deberías ver:

```
🏁 AUDITORÍA COMPLETA - Todos los resultados procesados.
🔥🔥🔥 Llamando a onAllComplete()...
✅✅✅ onAllComplete() ejecutado
```

**Y el reporte aparece inmediatamente** con las 3 conversaciones (incluso si alguna tuvo errores de verificación).

## 🔧 Archivos Modificados

### 1. `services/independentConversationRunner.ts`

**Cambios**:
- Líneas 543-567: Agregado `promiseWithTimeout()` a `extractBotPromises()` (45s)
- Líneas 548-557: Agregado `promiseWithTimeout()` a `verifyBotPromises()` (30s)
- Líneas 567-600: Agregado `promiseWithTimeout()` a `integrationManager.verifyAllActions()` (30s)
- Mejora en logs de error con contexto del test case

### 2. `services/intelligentDatabaseVerifier.ts`

**Cambios**:
- Líneas 107-122: Agregado timeout interno de 30s con `Promise.race()` en la llamada a Gemini
- Doble protección: timeout interno + timeout externo

## 🎯 Timeouts Totales por Turno

```
Antes: ∞ (infinito si Gemini no respondía en verificaciones)

Ahora:
  - Generar mensaje: 60s (MESSAGE_GENERATION_TIMEOUT_MS)
  - Webhook n8n: 300s (FETCH_TIMEOUT_MS)
  - extractBotPromises: 45s (nuevo)
  - verifyBotPromises: 30s (nuevo)
  - verifyAllActions: 30s (nuevo)

Total MAX por turno: ~465s (7.75 minutos)
```

Si una conversación alcanza este tiempo máximo, **falla el turno con error** y continúa al siguiente, en lugar de colgarse indefinidamente.

## 🚀 Próximos Pasos

### Si el Problema Persiste

Si después de este fix las conversaciones TODAVÍA se cuelgan:

1. **Revisar logs de timeout**:
   ```
   grep -i "timeout" en consola
   ```
   - Si ves muchos timeouts en `extractBotPromises`, puede ser que Gemini esté muy saturado
   - Solución: Aumentar timeout de 45s a 60s o 90s

2. **Verificar memoria del navegador**:
   - Abrir DevTools → Performance → Memory
   - Si memoria > 2GB, puede ser memory leak en caché o snapshots
   - Solución: Revisar `snapshotCache.ts` y `realDatabaseAuditor.ts`

3. **Revisar Network tab**:
   - Si hay requests pendientes (spinning) sin timeout
   - Solución: Verificar que `fetchWithTimeout` se usa en TODAS las llamadas HTTP

### Si Aparecen Muchos Timeouts

Significa que Gemini está lento. Opciones:

1. **Aumentar timeouts gradualmente**:
   ```typescript
   extractBotPromises: 45s → 60s → 90s
   ```

2. **Reducir complejidad del prompt**:
   - En `intelligentDatabaseVerifier.ts` línea 8-95
   - Hacer el prompt más corto y directo

3. **Deshabilitar verificación inteligente temporalmente**:
   ```typescript
   // En independentConversationRunner.ts línea 535
   if (false && config.realDatabaseConfig) { // Deshabilita verificación
   ```

## 📝 Notas Importantes

### Por Qué NO Era el Webhook de n8n

Muchos pensaban que el problema era el webhook tardando mucho, pero:
- ✅ El webhook YA tenía timeout de 5 minutos
- ✅ Los logs mostraban que el webhook SÍ respondía
- ❌ El problema era DESPUÉS de recibir la respuesta

### Por Qué NO Era la Generación de Mensajes

- ✅ `generateUserMessageText()` YA tenía timeout de 60s
- ✅ Los logs mostraban que los mensajes SÍ se generaban
- ❌ El problema era en la VERIFICACIÓN de la respuesta

### Por Qué Funcionaba "A Veces"

Depende de:
1. **Carga de Gemini**: Si está saturado, `extractBotPromises` tarda más
2. **Complejidad de la respuesta**: Respuestas largas del bot tardan más en analizar
3. **Cantidad de promesas**: Más promesas = más tiempo verificando

Por eso algunas conversaciones pasaban (Gemini respondía rápido) y otras se colgaban (Gemini demoraba).

---

**Fecha**: 2025-11-02  
**Archivos Modificados**:
- `services/independentConversationRunner.ts` (líneas 535-600)
- `services/intelligentDatabaseVerifier.ts` (líneas 107-122)

**Status**: ✅ **FIX COMPLETO** - Listo para testing
