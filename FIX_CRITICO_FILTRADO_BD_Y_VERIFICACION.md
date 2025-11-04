# Fix Crítico: Filtrado de BD y Verificación de Discrepancias

## 🔍 Problemas Detectados en el Reporte

### 1. **Datos Hardcodeados Aparecen en BD** ❌

El reporte muestra:
```
[Gerente de logística] 4 nuevos registros creados con números de teléfono
que nunca fueron proporcionados por el usuario
```

**Root cause**: El auditor se inicializa con `tc.initialPayload` que contiene datos **inventados por la AI** durante la generación de test cases.

**Ubicación del bug**:
- `services/geminiService.ts:952-960`

```typescript
// ❌ ANTES (usa payload con datos inventados)
initializeRealDatabaseAuditor(
    tc.id,  // "TC-001", "TC-002", "TC-003"
    dbConfig as any, 
    referencePayload,  // ← tc.initialPayload con teléfonos inventados
    config.workflow,
    dependencies.tools,
    dependencies.subflows
);
```

El `tc.initialPayload` tiene campos como:
```json
{
  "telefono": "+5493514444567",  // ← INVENTADO por AI
  "nombre": "Carlos Benítez"     // ← INVENTADO por AI
}
```

Estos valores **NO EXISTEN en la BD real**, pero el auditor los busca y los reporta como "insertados".

### 2. **Filtrado Incorrecto por Conversación** ❌

El auditor busca registros usando identificadores del payload inicial, pero durante la ejecución:

1. El webhook genera un **nuevo `conversationId`** real (ej: `conv_1730584523987`)
2. La BD guarda registros con ese `conversationId` real
3. El auditor busca por el `conversationId` del test case (`TC-001`) ← **NO EXISTE EN BD**
4. Resultado: El auditor NO ENCUENTRA los registros reales y reporta "discrepancias"

**Evidencia del problema**:
```typescript
// services/realDatabaseAuditor.ts:157-161
if (isLikelyExternalId(conversationId)) {
  this.searchIdentifiers.push(conversationId);  // ← Agrega "TC-001" como identificador
}
```

### 3. **Reportes Contradictorios** ❌

```
Score: 3.5 ❌
"Se detectaron 3 discrepancias graves"
"El bot guardó datos incorrectos"
"Omisión de precio"

PERO TAMBIÉN:
✅ "El bot guardó la información correctamente"
✅ "Sin errores críticos detectados"
```

**Root cause**: El sistema tiene DOS verificadores que dan resultados contradictorios:

1. **`intelligentDatabaseVerifier.ts`**: Analiza promesas del bot vs BD (genera discrepancias)
2. **`realDatabaseAuditor.ts`**: Cuenta cambios en BD (genera resumen "sin errores")

Ambos analizan la MISMA información pero con LÓGICAS DIFERENTES.

## ✅ Soluciones

### Solución 1: Actualizar Payload Dinámicamente

En lugar de inicializar el auditor con `tc.initialPayload` estático, actualizarlo con el payload REAL de cada request:

**Ubicación**: `services/independentConversationRunner.ts`

Después de enviar el request al webhook (línea ~310), capturar el `conversationId` real de la respuesta y actualizar los identificadores del auditor:

```typescript
// ✅ DESPUÉS de recibir respuesta del webhook
const response = await fetchWithTimeout(config.webhookUrl!, ...);
const botResponse = await response.json();

// 🔥 NUEVO: Actualizar identificadores del auditor con datos reales
if (config.realDatabaseConfig) {
    const auditor = getRealDatabaseAuditor(conv.testCase.id);
    if (auditor && botResponse.sessionId) {
        // Actualizar con el sessionId/conversationId REAL del webhook
        auditor.updateSearchIdentifiers([
            botResponse.sessionId,
            botResponse.conversationId,
            botResponse.chatId,
            // ... cualquier otro ID que venga en la respuesta
        ].filter(Boolean));
    }
}
```

### Solución 2: Ignorar Test Case IDs en Búsquedas

Modificar `isLikelyExternalId()` para NO agregar IDs de test cases:

**Ubicación**: `services/realDatabaseAuditor.ts:151-155`

```typescript
// ✅ MEJORADO
const isLikelyExternalId = (id: string) => {
  if (!id || typeof id !== 'string') return false;
  
  // ❌ Excluir test IDs completamente
  if (/^TC[-_]/i.test(id)) return false;
  
  // ❌ Excluir IDs muy cortos (probablemente internos)
  if (id.length < 8) return false;
  
  // ✅ Incluir teléfonos, UUIDs, session IDs largos
  if (id.includes('+') || /\d{8,}/.test(id)) return true;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return true;
  if (id.startsWith('conv_') || id.startsWith('session_') || id.startsWith('chat_')) return true;
  
  return false;
};
```

### Solución 3: Método `updateSearchIdentifiers()` en RealDatabaseAuditor

Agregar método para actualizar identificadores dinámicamente:

**Ubicación**: `services/realDatabaseAuditor.ts` (después del constructor)

```typescript
/**
 * 🔥 NUEVO: Actualiza los identificadores de búsqueda con valores reales
 * Útil para agregar IDs generados durante la ejecución del workflow
 */
public updateSearchIdentifiers(newIdentifiers: string[]): void {
  console.log(`\n🔄 [DB Audit] Actualizando identificadores de búsqueda...`);
  console.log(`   Identificadores actuales:`, this.searchIdentifiers);
  console.log(`   Nuevos identificadores:`, newIdentifiers);
  
  let added = 0;
  for (const id of newIdentifiers) {
    if (id && !this.searchIdentifiers.includes(id)) {
      // Validar que sea un ID real (no test ID)
      if (!/^TC[-_]/i.test(id) && id.length >= 8) {
        this.searchIdentifiers.push(id);
        added++;
        console.log(`      ✅ Agregado: ${id}`);
      } else {
        console.log(`      ⏭️ Ignorado (no es ID real): ${id}`);
      }
    }
  }
  
  console.log(`   Total agregados: ${added}`);
  console.log(`   Total identificadores ahora: ${this.searchIdentifiers.length}\n`);
}
```

### Solución 4: Unificar Lógica de Verificación

El problema de reportes contradictorios se debe a que hay DOS verificadores con lógicas diferentes.

**Opción A (Simplificar)**: Eliminar `intelligentDatabaseVerifier` y usar solo `realDatabaseAuditor.discrepancies`

**Opción B (Unificar)**: Hacer que `intelligentDatabaseVerifier` use los datos de `realDatabaseAuditor` en lugar de hacer su propio análisis

**Recomendado: Opción B**

**Ubicación**: `services/intelligentDatabaseVerifier.ts`

Modificar `verifyBotPromises()` para recibir el auditor y usar sus datos:

```typescript
// ✅ NUEVO: Recibir auditor como parámetro
export async function verifyBotPromises(
  testCaseId: string,
  promises: BotPromise[],
  userId: string,
  auditor?: RealDatabaseAuditor  // ← NUEVO
): Promise<DatabaseDiscrepancy[]> {
  
  // Si hay auditor, usar sus datos directamente
  if (auditor) {
    console.log(`\n✅ [Verify Promises] Usando datos del auditor existente`);
    
    // El auditor YA tiene los snapshots y cambios detectados
    const changes = auditor.changes;
    const lastSnapshot = Array.from(auditor.snapshots.values()).pop();
    
    // Verificar cada promesa contra los cambios REALES
    const discrepancies: DatabaseDiscrepancy[] = [];
    
    for (const promise of promises) {
      if (promise.type === 'price_quote') {
        // Buscar si el precio se guardó
        const priceFound = changes.some(c => 
          c.type === 'INSERT' || c.type === 'UPDATE' &&
          c.newData?.cost_usd === promise.value ||
          c.newData?.price === promise.value
        );
        
        if (!priceFound) {
          discrepancies.push({
            type: 'missing_record',
            severity: 'critical',
            description: `Precio prometido ($${promise.value} USD) no se guardó en BD`,
            expected: { price: promise.value },
            actual: null,
            timestamp: Date.now()
          });
        }
      }
      
      // ... verificar otros tipos de promesas
    }
    
    return discrepancies;
  }
  
  // Fallback: lógica antigua (si no hay auditor)
  // ...
}
```

### Solución 5: Agregar Método de Extracción de IDs Reales

**Ubicación**: `services/realDatabaseAuditor.ts`

```typescript
/**
 * 🔥 NUEVO: Extrae IDs reales de la respuesta del webhook
 * Busca campos como sessionId, conversationId, chatId, etc.
 */
public static extractRealIdentifiers(webhookResponse: any): string[] {
  const identifiers: string[] = [];
  
  const fieldNames = [
    'sessionId', 'session_id', 'session',
    'conversationId', 'conversation_id', 'conversation',
    'chatId', 'chat_id', 'chat',
    'userId', 'user_id', 'user',
    'telefono', 'phone', 'telephone'
  ];
  
  function extractFromObject(obj: any, path: string = '') {
    if (!obj || typeof obj !== 'object') return;
    
    for (const [key, value] of Object.entries(obj)) {
      const fullPath = path ? `${path}.${key}` : key;
      
      // Si el campo está en la lista de nombres comunes
      if (fieldNames.some(f => key.toLowerCase() === f.toLowerCase())) {
        const strValue = String(value);
        if (strValue && strValue.length >= 8 && !/^TC[-_]/i.test(strValue)) {
          identifiers.push(strValue);
          console.log(`   📌 ID encontrado: ${key}="${strValue}"`);
        }
      }
      
      // Recursivo para objetos anidados
      if (typeof value === 'object' && value !== null) {
        extractFromObject(value, fullPath);
      }
    }
  }
  
  extractFromObject(webhookResponse);
  
  // Eliminar duplicados
  return Array.from(new Set(identifiers));
}
```

## 📋 Plan de Implementación

### Prioridad 1 (Crítico - Inmediato):

1. ✅ Agregar `updateSearchIdentifiers()` a `RealDatabaseAuditor`
2. ✅ Agregar `extractRealIdentifiers()` estático
3. ✅ Modificar `isLikelyExternalId()` para ignorar test IDs
4. ✅ Actualizar `independentConversationRunner.ts` para capturar IDs reales después de cada request

### Prioridad 2 (Alta - Siguiente fase):

5. ⏳ Unificar lógica de verificación en `intelligentDatabaseVerifier.ts`
6. ⏳ Modificar `AuditReport.tsx` para mostrar discrepancias consistentes

### Prioridad 3 (Media - Mejora futura):

7. ⏳ Agregar validación de payload en `geminiService.ts` para detectar datos inventados
8. ⏳ Logging mejorado para debug de filtrado de BD

## 🧪 Testing

Después de implementar las soluciones 1-4:

1. **Ejecutar auditoría con 3 conversaciones**
2. **Verificar logs**:
   ```
   🔄 [DB Audit] Actualizando identificadores de búsqueda...
      ✅ Agregado: conv_1730584523987
      ✅ Agregado: +5493514444567
      ⏭️ Ignorado (no es ID real): TC-001
   ```

3. **Verificar reporte NO muestre**:
   - ❌ "Datos hardcodeados insertados"
   - ❌ "Teléfonos que nunca fueron proporcionados"

4. **Verificar reporte SÍ muestre**:
   - ✅ Cambios reales (INSERT, UPDATE) relacionados con la conversación
   - ✅ Discrepancias reales (si el bot prometió algo que no guardó)
   - ✅ Scores consistentes (no contradicciones)

## 🔍 Indicadores de Éxito

### Antes del Fix:
```
[TC-001] 15 cambios detectados
- 4 inserciones en memoria_temporal_silverfleet
- Teléfonos: +5491155551234, +5493514444567 ← HARDCODEADOS
- Discrepancias: 3 críticas ❌
```

### Después del Fix:
```
[TC-001] 12 cambios detectados  
- 3 inserciones en resumen_conversaciones_silverfleet
- sessionId: conv_1730584523987 ← REAL (del webhook)
- Teléfono: +5493514444567 ← REAL (del payload enviado)
- Discrepancias: 0 ✅
```

---

**Status**: 🔴 **CRÍTICO** - Afecta la confiabilidad de todos los reportes de auditoría

**Archivos a Modificar**:
1. `services/realDatabaseAuditor.ts` (agregar métodos)
2. `services/independentConversationRunner.ts` (capturar IDs reales)
3. `services/intelligentDatabaseVerifier.ts` (unificar lógica)

**Tiempo Estimado**: 2-3 horas de implementación + testing
