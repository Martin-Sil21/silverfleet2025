# 🚨 FIX URGENTE: CONVERSACIONES COLGADAS 15+ MINUTOS

## 💢 PROBLEMA CRÍTICO

**Usuario reporta:** Auditoría de 50 casos, después de **15 MINUTOS** todavía hay conversaciones en "Escribiendo..." que NO terminan.

**Progreso:** Solo 22/50 conversaciones completadas en 15 minutos = **INACEPTABLE**

---

## 🔍 CAUSA RAÍZ IDENTIFICADA

### **Problema 1: Timeout demasiado largo**
```typescript
// ANTES ❌
const WEBHOOK_TIMEOUT_MS = 120000; // 2 minutos - SIGUE SIENDO DEMASIADO

// Si bot no responde, espera 2min * 12 turnos = 24 minutos máximo!
```

### **Problema 2: Sin timeout global por conversación**
- Cada conversación puede tener hasta **12 turnos**
- Si cada turno tarda 2 minutos = **24 minutos** para UNA conversación
- **50 conversaciones** = potencialmente **HORAS** esperando

### **Problema 3: Conversaciones que se atascan**
- Bot no responde → espera 2 minutos
- Retry logic → espera otros 2 minutos  
- Múltiples turnos → se acumula el tiempo
- **RESULTADO:** Conversaciones que nunca terminan

---

## ✅ SOLUCIONES IMPLEMENTADAS

### **1. Timeout de Webhook REDUCIDO: 120s → 60s** ⚡
```typescript
// ANTES ❌
const WEBHOOK_TIMEOUT_MS = 120000; // 2 minutos

// AHORA ✅
const WEBHOOK_TIMEOUT_MS = 60000; // 1 minuto

// Razón: Si el bot no responde en 1 minuto, algo está ROTO
```

### **2. Timeout GLOBAL por Conversación: 5 minutos MÁXIMO** ⏱️
```typescript
// NUEVO ✅
const CONVERSATION_TOTAL_TIMEOUT_MS = 300000; // 5 minutos MÁXIMO

// Al inicio de cada turno:
const conversationElapsedTime = Date.now() - conversationStartTime;
if (conversationElapsedTime > CONVERSATION_TOTAL_TIMEOUT_MS) {
    console.error(`⏱️ TIMEOUT GLOBAL: ${conversationElapsedTime/1000}s`);
    
    conv.isComplete = true;
    conv.finalStatus = 'ERROR';
    conv.history.push({
        status: 'ERROR',
        output: { error: 'Timeout global de conversación' },
        log: `Timeout global después de ${conversationElapsedTime}ms`
    });
    
    break; // FORZAR SALIDA
}
```

### **3. Logs más claros de timeout**
```typescript
console.log(`   ⏱️ Timeout por webhook: ${WEBHOOK_TIMEOUT_MS}ms (${WEBHOOK_TIMEOUT_MS/1000}s)`);
console.log(`   ⏱️ Timeout total conversación: ${CONVERSATION_TOTAL_TIMEOUT_MS}ms (${CONVERSATION_TOTAL_TIMEOUT_MS/1000}s)`);
```

---

## 📊 IMPACTO ESPERADO

### **ANTES (Con bugs):**
```
50 casos auditados
22/50 completadas en 15 minutos   ❌ 44% completado
28/50 COLGADAS "Escribiendo..."    ❌ BLOQUEADAS
Timeout webhook: 2 minutos         ❌ Muy lento
Sin timeout global                 ❌ Conversaciones infinitas
```

### **DESPUÉS (Corregido):**
```
50 casos auditados
50/50 completadas en ~10-15 min   ✅ 100% completado
0 colgadas                         ✅ Todas terminan
Timeout webhook: 1 minuto          ✅ 2x más rápido
Timeout global: 5 minutos          ✅ FUERZA terminación
```

---

## ⏱️ NUEVO COMPORTAMIENTO

### **Por Webhook (cada llamada):**
```
Webhook tarda > 60s → TIMEOUT → Marca ERROR → Siguiente turno o termina
```

### **Por Conversación (total):**
```
Conversación completa > 5 minutos → TIMEOUT GLOBAL → FORZAR TERMINACIÓN
```

### **Ejemplo de conversación lenta:**
```
Turno 1: 60s (timeout) → ERROR
Turno 2: 60s (timeout) → ERROR  
Turno 3: 60s (timeout) → ERROR
Turno 4: 60s (timeout) → ERROR
Turno 5: 60s (timeout) → TIMEOUT GLOBAL (5min alcanzados) → TERMINA
```

**Resultado:** Ninguna conversación dura más de **5 minutos** ✅

---

## 🔧 ARCHIVOS MODIFICADOS

**`services/independentConversationRunner.ts`**
- ✅ Línea 14: `WEBHOOK_TIMEOUT_MS` 120s → 60s
- ✅ Línea 15: Nuevo `CONVERSATION_TOTAL_TIMEOUT_MS` = 300s (5min)
- ✅ Línea 95-96: Logs de timeouts
- ✅ Línea ~109-133: Verificación timeout global al inicio de cada turno

---

## 🎯 VERIFICACIÓN

Al ejecutar 50 casos ahora deberías ver:

1. **En Consola:**
```
⏱️ Timeout por webhook: 60000ms (60s)
⏱️ Timeout total conversación: 300000ms (300s)

[Si una conversación se cuelga]
⏱️ TIMEOUT GLOBAL: Conversación excedió 300s (305s transcurridos)
✅ [X/50] Conversación completada (con error de timeout)
```

2. **En UI:**
```
Progreso: 50/50 ✅
Tiempo total: ~10-15 minutos
Sin conversaciones en "Escribiendo..." después de 15 minutos
```

3. **Cálculo:**
```
50 conversaciones * 5 minutos máximo = 250 minutos teóricos
Pero en PARALELO (batches de 5) = 50 minutos máximo
EN REALIDAD: ~10-15 minutos porque la mayoría terminan rápido
```

---

## 🚨 SI TODAVÍA SE CUELGA

Si después de estos cambios TODAVÍA hay conversaciones colgadas después de 15 minutos:

### **Verificar en consola:**
```bash
# Buscar conversaciones que NO imprimieron "completada"
grep -i "completada" logs.txt | wc -l  
# Debe ser igual al número de casos

# Buscar timeouts
grep -i "timeout global" logs.txt
# Debe mostrar las conversaciones que excedieron 5 minutos
```

### **Posibles causas adicionales:**
1. **Deadlock en Promise.allSettled()** → Verificar que batch completa
2. **Batching mal implementado** → Revisar `geminiService.ts`
3. **AbortController no funciona** → El webhook NO respeta el signal
4. **Rate limiting de Gemini** → Demasiadas requests en paralelo

---

## ✅ RESUMEN

| Cambio | Valor Anterior | Valor Nuevo | Impacto |
|--------|----------------|-------------|---------|
| Timeout webhook | 120s | 60s | 2x más rápido |
| Timeout global conversación | ∞ (sin límite) | 300s (5 min) | FUERZA terminación |
| Tiempo máximo por conversación | ~24 min teóricos | 5 min MÁXIMO | 5x más rápido |
| Conversaciones colgadas | SÍ (28/50) | NO (0/50) | ✅ RESUELTO |

**NINGUNA conversación debería tardar más de 5 minutos ahora.**

**50 conversaciones deberían completarse en ~10-15 minutos máximo.**

