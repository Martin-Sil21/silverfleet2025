# 🚨 ERRORES CRÍTICOS EN AUDITORÍA CON 50 CASOS

## 📋 Problemas Identificados

### **1. Bot Responde Vacío (16+ casos)** ❌
```
⚠️ Bot respondió vacío pero usuario NO está bloqueado - Error del bot
```

**Causa:** El bot está respondiendo `{"message":"","text":""}` pero el sistema no lo detecta correctamente como error o bloqueo.

**Solución:**
- Mejorar la detección de respuestas vacías
- Si el bot responde vacío Y el usuario NO está bloqueado → Marcar como ERROR del bot
- Terminar la conversación para no seguir esperando

---

### **2. 429 Rate Limit de Gemini (40+ casos)** ❌
```
Error: 429 - You exceeded your current quota
GenerateRequestsPerMinutePerProjectPerModel: 10
```

**Causa:** Se están ejecutando **50 análisis inteligentes en paralelo**, excediendo el límite de **10 requests/min**.

**Solución:**
- Implementar **batching**: Procesar 5 análisis en paralelo
- Esperar **12 segundos entre lotes**
- **10 lotes de 5** = 50 análisis en ~2 minutos (dentro del límite)

---

### **3. Error Extrayendo Precios (50 casos)** ❌
```
Error: Cannot read properties of undefined (reading 'filter')
at geminiService.ts:1295
```

**Causa:** `config.workflow?.nodes.filter` falla porque `config.workflow` es `undefined`.

**Solución:** ✅ **YA CORREGIDO**
```typescript
// Extraer agentes del workflow o rawN8nJson
let agents: Array<{ name: string; prompt: string }> = [];
if (config.workflow && Array.isArray(config.workflow)) {
    agents = config.workflow.filter(...);
} else if (config.rawN8nJson?.nodes) {
    agents = config.rawN8nJson.nodes.filter(...);
}
```

---

### **4. JSON Truncado de Gemini (4 casos)** ❌
```
SyntaxError: Unterminated string in JSON at position 38512
```

**Causa:** El análisis inteligente devuelve JSON muy largo y Gemini lo trunca.

**Solución:**
- Agregar `retry` si el JSON falla al parsear
- Pedir a Gemini que sea más conciso
- Usar `JSON.parse` con manejo de errores robusto

---

### **5. LocalStorage Lleno** ❌
```
QuotaExceededError: Setting the value of 'silver-fleet-audit-history' exceeded the quota
```

**Causa:** LocalStorage tiene límite de ~5-10MB. Con 50 casos, se llena rápido.

**Solución:**
- Implementar limpieza automática de auditorías antiguas
- Mantener máximo 5 auditorías
- Comprimir datos antes de guardar (JSON.stringify con menos espacios)

---

### **6. Solo 43/50 Conversaciones en BD** ❌

**Causa:** 7 conversaciones no se guardaron o fallaron silenciosamente.

**Posibles razones:**
1. Bot respondió vacío → Conversación terminó prematuramente
2. Timeout → Bot no respondió a tiempo
3. Error del webhook → No se pudo enviar mensaje

**Solución:**
- Mejorar tracking de conversaciones perdidas
- Agregar logs claros: `✅ Guardado en BD` o `❌ Error guardando`
- Ver logs del bot auditado para confirmar si recibió los 50 mensajes

---

## 🔧 Correcciones Necesarias

### **FIX 1: Implementar Batching para Análisis Inteligente** 🔥 **URGENTE**

**Archivo:** `services/geminiService.ts`

```typescript
// ANTES (línea 1238):
const analysisPromises = conversations.map(async conv => {
    // ... análisis inteligente
});
await Promise.all(analysisPromises);

// DESPUÉS:
const BATCH_SIZE = 5; // 5 análisis en paralelo
const DELAY_BETWEEN_BATCHES = 12000; // 12 segundos entre lotes

const batches: typeof conversations[] = [];
for (let i = 0; i < conversations.length; i += BATCH_SIZE) {
    batches.push(conversations.slice(i, i + BATCH_SIZE));
}

onProgress({ message: `🔄 Procesando análisis en ${batches.length} lotes de ${BATCH_SIZE}` });

for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    onProgress({ message: `📦 Lote ${batchIndex + 1}/${batches.length}` });
    
    const analysisPromises = batch.map(async conv => {
        // ... análisis inteligente
    });
    
    await Promise.all(analysisPromises);
    
    // Esperar entre lotes (excepto el último)
    if (batchIndex < batches.length - 1) {
        onProgress({ message: `⏳ Esperando 12s antes del siguiente lote...` });
        await delay(DELAY_BETWEEN_BATCHES);
    }
}
```

---

### **FIX 2: Manejar Respuestas Vacías como ERROR** ⚠️

**Archivo:** `services/independentConversationRunner.ts`

```typescript
// Línea 331:
console.log(`⚠️ Bot respondió vacío pero usuario NO está bloqueado - Error del bot`);

// AGREGAR después de esto:
// Marcar como ERROR y terminar
conv.isComplete = true;
conv.finalStatus = 'ERROR';

conv.history.push({
    nodeId: `Turn ${turnNumber}`,
    status: 'ERROR',
    input: { message: userMessage },
    output: { 
        error: 'Bot respondió vacío', 
        message: 'El bot no respondió correctamente (respuesta vacía)' 
    },
    log: `Bot respondió vacío pero usuario NO está bloqueado - Error del bot`,
    durationMs: Date.now() - webhookStartTime,
    timestamp: webhookStartTime
});

break; // Salir del loop de turnos
```

---

### **FIX 3: Manejo Robusto de JSON Truncado** 📝

**Archivo:** `services/intelligentToolVerificator.ts`

```typescript
// Línea ~200-210:
try {
    intelligentAnalysis = JSON.parse(jsonResponseText);
} catch (jsonError) {
    console.log(`❌ Error parseando JSON:`, jsonError);
    console.log(`📄 Texto recibido (últimos 500 chars):`, jsonResponseText.slice(-500));
    
    // 🔥 NUEVO: Intentar recuperar análisis parcial
    try {
        // Buscar el objeto JSON válido más grande posible
        const lastValidBrace = jsonResponseText.lastIndexOf('}');
        if (lastValidBrace > 0) {
            const truncatedJson = jsonResponseText.substring(0, lastValidBrace + 1);
            intelligentAnalysis = JSON.parse(truncatedJson);
            console.log(`✅ JSON parcial recuperado exitosamente`);
        } else {
            throw new Error(`No se pudo parsear el JSON: ${jsonError}`);
        }
    } catch (recoveryError) {
        throw new Error(`No se pudo parsear el JSON: ${jsonError}`);
    }
}
```

---

### **FIX 4: Limpiar LocalStorage Automáticamente** 🧹

**Archivo:** `services/historyService.ts`

```typescript
// Línea ~40:
export const saveAudit = (config: AuditConfig, results: AuditResult[]) => {
  try {
    // ...código existente...
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch (error) {
    console.warn('Failed to save audit:', error);
    
    // 🔥 NUEVO: Si localStorage está lleno, limpiar auditorías antiguas
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        console.log('🧹 LocalStorage lleno - Limpiando auditorías antiguas...');
        
        // Mantener solo las 3 auditorías más recientes
        const history = getAudits();
        const recentHistory = history.slice(-3);
        
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(recentHistory));
            console.log(`✅ Limpieza completada - ${history.length - recentHistory.length} auditorías eliminadas`);
            
            // Intentar guardar de nuevo
            const newHistory = [...recentHistory, newAudit];
            localStorage.setItem(STORAGE_KEY, JSON.stringify(newHistory));
            console.log('✅ Auditoría guardada después de limpieza');
        } catch (retryError) {
            console.error('❌ No se pudo guardar incluso después de limpiar:', retryError);
        }
    }
  }
};
```

---

### **FIX 5: Agregar Análisis EXPLÍCITO en Reporte de IA** 📊

**El reporte debe decir claramente:** "El bot tiene un problema que debe corregirse"

**Archivo:** `services/intelligentToolVerificator.ts`

```typescript
// Agregar al prompt (línea ~120):
# TU OBJETIVO FINAL:
Después de analizar todas las discrepancias, debes dar una CONCLUSIÓN EXPLÍCITA sobre si:

1. ✅ **TODO FUNCIONA CORRECTAMENTE** - El bot cumple perfectamente con su propósito
2. ⚠️ **NECESITA MEJORAS** - Funciona pero tiene problemas menores que deben corregirse
3. ❌ **SISTEMA DEFECTUOSO** - Hay problemas críticos que DEBEN CORREGIRSE INMEDIATAMENTE

En tu "summary", usa frases claras como:
- "El bot debe corregir X comportamiento"
- "Es necesario cambiar Y funcionalidad"
- "Se requiere modificar Z lógica"

NO uses eufemismos. Sé directo y claro sobre QUÉ se debe cambiar.
```

---

## 🎯 Prioridades

| Prioridad | Fix | Impacto |
|-----------|-----|---------|
| **URGENTE** | Batching de análisis (429 errors) | Alto - Bloquea 40+ análisis |
| **ALTA** | Respuestas vacías como ERROR | Alto - 16 conversaciones afectadas |
| **ALTA** | LocalStorage lleno | Alto - No guarda auditorías |
| **MEDIA** | JSON truncado | Medio - 4 casos afectados |
| **MEDIA** | Precio extraction crash | Medio - Ya corregido pero necesita testing |

---

## 📝 Conclusión

Con **5 APIs de Gemini** y **50 casos**, el sistema está:
- ❌ Excediendo rate limits (10 req/min)
- ❌ Llenando localStorage (5-10MB)
- ⚠️ Bot respondiendo vacío (16 casos)

**Solución inmediata:**
1. Implementar batching (5 análisis cada 12s)
2. Limpiar localStorage automáticamente
3. Terminar conversaciones cuando bot responde vacío

**Resultado esperado:**
- ✅ 50/50 conversaciones analizadas
- ✅ Sin errores 429
- ✅ Auditorías guardadas correctamente
- ✅ Reporte claro sobre qué cambiar

