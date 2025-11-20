# 🔧 Solución: Auditoría de BD y Detección de Precios

## 📋 Problemas Reportados

1. **Timeout inconsistente** - Conversaciones se cortaban prematuramente
2. **Bot respondía vacío** cuando bloqueaba usuarios
3. **No se detectaban precios** mencionados en conversaciones
4. **Snapshots de BD devolvían 0 registros**
5. **Reporte no mostraba información de BD y precios**

---

## ✅ Correcciones Aplicadas

### 1. **Timeout Conflictivo Eliminado**

**Problema:** Había DOS timeouts compitiendo:
- ❌ Conversación: 300000ms (5 min) - MATABA CONVERSACIONES
- ✅ Webhook: 500000ms (8.3 min)

**Solución:** Eliminé el timeout de conversación. Ahora solo existe el timeout del webhook.

**Archivo:** `services/geminiService.ts`
```typescript
// ========== TRACKING ==========
// 🔥 NOTA: No hay timeout de conversación aquí - cada llamada al webhook tiene su propio timeout
console.log(`   ⏱️ Timeout por webhook: configurado en independentConversationRunner.ts`);
```

---

### 2. **Detección de Respuestas Vacías del Bot**

**Problema:** El bot respondía `{"message":"","text":""}` cuando bloqueaba al usuario.

**Solución:** Verificación ANTES de procesar la respuesta:

**Archivo:** `services/independentConversationRunner.ts`
```typescript
// Verificar si la respuesta está vacía o es inválida
const botMessage = findAgentMessageText(agentResponse);
const isEmpty = !botMessage || botMessage.trim() === '' || ...;

if (isEmpty) {
    // Verificar en BD si el usuario fue bloqueado
    const auditor = getRealDatabaseAuditor(conv.testCase.id);
    if (auditor) {
        const isNotBlocked = await auditor.verifyNotBlocked(userId, ...);
        
        if (!isNotBlocked) {
            // ✅ Usuario bloqueado - ÉXITO
            conv.finalStatus = 'SUCCESS';
            break;
        }
    }
}
```

---

### 3. **Extracción de Precios Integrada**

**Problema:** El sistema de detección de precios existía pero **NO SE USABA**.

**Solución:** Integré `priceExtractor.ts` en el análisis:

**Archivo:** `services/geminiService.ts`
```typescript
import { generatePriceComparison, type PriceComparison } from './priceExtractor';

// En el análisis de cada conversación:
let priceComparison: PriceComparison | undefined;
try {
    onProgress({ message: `   💰 Analizando precios mencionados...` });
    const agents = config.workflow?.nodes.filter((n: any) => n.type === 'ai-agent')
        .map((n: any) => ({ name: n.name, prompt: n.parameters?.systemPrompt || '' })) || [];
    
    priceComparison = generatePriceComparison(
        { id: conv.testCase.id, executionTrace: conv.history, databaseActivity },
        agents
    );
    
    if (priceComparison.mentioned.length > 0 || priceComparison.inDB.length > 0) {
        onProgress({ 
            message: `   💰 Precios: ${priceComparison.mentioned.length} mencionados, ${priceComparison.inDB.length} en BD, ${priceComparison.discrepancies.length} discrepancias` 
        });
    }
} catch (priceError) {
    console.warn('Error extrayendo precios:', priceError);
}
```

**Tipo actualizado:** `types.ts`
```typescript
export interface AuditResult {
  // ...
  priceComparison?: any; // PriceComparison from priceExtractor
}
```

---

### 4. **Verificación de BD Mejorada**

**Sistema actual:**
- ✅ Toma snapshots ANTES/DESPUÉS de cada turno
- ✅ Compara snapshots para detectar cambios
- ✅ Filtra por identificadores de conversación
- ✅ Verifica si usuario está bloqueado en 3 momentos:
  1. Después de timeout
  2. Después de respuesta vacía ← NUEVO
  3. Antes de cada turno

**Archivo:** `services/realDatabaseAuditor.ts`
```typescript
// Detecta automáticamente columnas de cada tabla
private async getTableColumns(tableName: string): Promise<string[]> {
    const { data, error } = await this.client
        .from(tableName)
        .select('*')
        .limit(1);
    
    if (data && data.length > 0) {
        const columns = Object.keys(data[0]);
        this.tableColumnsCache.set(tableName, columns);
        return columns;
    }
    return [];
}

// Filtra solo los campos que EXISTEN
const possibleSessionFields = ['session_id', 'sessionId', 'from', ...];
const existingSessionFields = possibleSessionFields.filter(field => 
    availableColumns.includes(field)
);
```

---

## 📊 Qué Hace el Sistema Ahora

### **Extracción de Precios:**

1. **De conversaciones:**
   - Busca patrones como `$1000`, `1.000 pesos`, `USD 50`, etc.
   - Extrae de mensajes del usuario Y del bot

2. **De base de datos:**
   - Busca en campos: `precio`, `price`, `cost`, `total`, `monto`, etc.
   - Verifica registros creados/actualizados durante la conversación

3. **De system prompts:**
   - Detecta precios mencionados en los prompts de los agentes
   - Compara con precios realmente mencionados

4. **Comparación:**
   - ✅ Precios mencionados vs guardados en BD
   - ✅ Precios en prompt vs mencionados
   - ⚠️ Discrepancias detectadas

### **Auditoría de BD:**

1. **Snapshots:**
   - Antes y después de cada turno
   - Filtrados por identificadores de sesión
   - Detecta: INSERTS, UPDATES, DELETES

2. **Verificación de Bloqueo:**
   - Busca en TODAS las tablas configuradas
   - Detecta automáticamente las columnas disponibles
   - Identifica si usuario fue bloqueado

3. **Reportes:**
   - Total de operaciones (reads, writes, updates, deletes)
   - Cambios detectados con before/after
   - Discrepancias críticas
   - Verificación inteligente con Gemini AI

---

## 🔍 Cómo Verificar que Funciona

### **1. Consola durante auditoría:**

```
💰 Analizando precios mencionados...
💰 Precios: 3 mencionados, 2 en BD, 1 discrepancias

📸 Tomando snapshot ANTES del turno...
✅ Snapshot ANTES completado
   📋 Columnas disponibles (15): id, session_id, from, message, ...
   🎯 Campos de sesión detectados: session_id, from
   
📊 Comparando snapshots...
   ➕ INSERTS de ESTA conversación: 2
   ✏️ UPDATES de ESTA conversación: 1
```

### **2. Reporte Final:**

- **Tab "Conversaciones":**
  - Muestra cada conversación expandible
  - Actividad de BD con números
  - Cambios detectados

- **Tab "Precios":** (si está implementado en UI)
  - Precios mencionados
  - Precios guardados
  - Discrepancias

- **Tab "Base de Datos":**
  - Resumen de operaciones
  - Tablas usadas
  - Cambios críticos

---

## ⚠️ Problemas Pendientes

### **1. Snapshots Devuelven 0 Registros**

**Posibles causas:**
- Los identificadores no coinciden con los campos de BD
- La tabla no tiene datos para esa sesión
- Los campos de sesión tienen nombres diferentes

**Diagnóstico:**
```typescript
// Ver en consola:
console.log(`📝 Mis identificadores: ${this.searchIdentifiers.join(', ')}`);
console.log(`📋 Columnas disponibles: ...`);
console.log(`🎯 Campos de sesión detectados: ...`);
```

**Solución si falla:**
- Verificar que el payload contenga `session_id`, `from`, o `telefono`
- Asegurarse que la tabla tenga registros con esos valores
- Revisar si los nombres de columnas son diferentes (ej: `phone` vs `telefono`)

### **2. Reporte no Muestra Precios**

**Causa:** El componente `ExecutiveReport` aún no visualiza `priceComparison`.

**Solución:** Agregar visualización en el reporte:
```typescript
{result.priceComparison && (
    <div className="mb-4">
        <h3>💰 Precios Detectados</h3>
        <p>Mencionados: {result.priceComparison.mentioned.length}</p>
        <p>En BD: {result.priceComparison.inDB.length}</p>
        {result.priceComparison.discrepancies.length > 0 && (
            <div className="text-red-600">
                ⚠️ {result.priceComparison.discrepancies.length} discrepancia(s)
            </div>
        )}
    </div>
)}
```

---

## 🎯 Próximos Pasos

1. ✅ **Recargar la página (F5)**
2. ✅ **Ejecutar nueva auditoría**
3. ✅ **Verificar consola:**
   - Mensajes de extracción de precios
   - Snapshots con registros
   - Comparaciones exitosas
4. ⚠️ **Revisar reporte:**
   - Si no muestra precios, agregar visualización en UI
   - Verificar que actividad de BD sea visible

---

## 📝 Archivos Modificados

1. `services/geminiService.ts` - Eliminado timeout conflictivo, agregada extracción de precios
2. `services/independentConversationRunner.ts` - Detección de respuestas vacías
3. `services/realDatabaseAuditor.ts` - Detección automática de schema
4. `types.ts` - Agregado `priceComparison` a `AuditResult`

---

## 💡 Notas Importantes

- **La auditoría ES por conversación** (no global)
- **Cada conversación tiene su propio auditor** de BD
- **Los snapshots se filtran** por identificadores de sesión
- **La detección de precios** ahora está ACTIVA
- **El sistema SE CONECTA** a la BD (Supabase)

