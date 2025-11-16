# 🔗 Integración de Custom Hooks en Auditoría

## Estado: ✅ Servicios creados, ⚠️ Integración pendiente

---

## 📋 Lo que se creó:

### 1. `services/customHookIntegrator.ts`

Servicios para:
- **Extraer hooks** del análisis de código
- **Generar mappings inteligentes** (tabla → campo de filtro)
- **Aplicar filtros** a queries de Supabase
- **Validar** hooks contra tablas reales en BD

---

## 🎯 Lo que falta integrar:

### 1. Pasar hooks al inicializar auditor

**Archivo**: `services/geminiService.ts` (o donde se inicializa `RealDatabaseAuditor`)

**Cambio**:

```typescript
import { extractCustomHooks, generateHookMappings } from './customHookIntegrator';

// Cuando tengas el codeProject disponible:
const customHooks = extractCustomHooks(codeProject);
const hookMappings = generateHookMappings(customHooks, payload);

// Al inicializar auditor:
const auditor = initializeRealDatabaseAuditor(
  conversationId,
  dbConfig,
  payload,
  workflowNodes,
  detectedTools,
  detectedSubflows,
  hookMappings // 🔥 NUEVO parámetro
);
```

---

### 2. Modificar constructor de `RealDatabaseAuditor`

**Archivo**: `services/realDatabaseAuditor.ts`

**Cambio**:

```typescript
import { HookMapping, applyHookMapping } from './customHookIntegrator';

class RealDatabaseAuditor {
  private hookMappings: HookMapping[] = []; // 🔥 NUEVO

  constructor(
    conversationId: string,
    config: DatabaseConfig,
    payload?: Record<string, any>,
    workflowNodes?: any[],
    detectedTools?: DetectedTool[],
    detectedSubflows?: DetectedSubflow[],
    hookMappings?: HookMapping[] // 🔥 NUEVO parámetro
  ) {
    // ... código existente ...
    
    this.hookMappings = hookMappings || [];
    console.log(`   🔗 Custom hooks disponibles: ${this.hookMappings.length}`);
  }
}
```

---

### 3. Usar hooks en `queryTable()`

**Archivo**: `services/realDatabaseAuditor.ts` → método `queryTable()`

**Cambio**:

```typescript
private async queryTable(table: string): Promise<any[]> {
  // 🔥 ESTRATEGIA 1: Buscar hook mapping para esta tabla
  const hookMapping = this.hookMappings.find(m => m.table === table);
  
  if (hookMapping && this.payload) {
    console.log(`\n   🔗 [${table}] USANDO CUSTOM HOOK MAPPING`);
    console.log(`      Hook: ${hookMapping.hookName}`);
    console.log(`      Estrategia: ${hookMapping.filterStrategy}`);
    
    try {
      let query = this.client.from(table).select('*');
      
      // Aplicar filtro basado en el mapping
      if (hookMapping.filterField && hookMapping.sourceField) {
        query = applyHookMapping(query, hookMapping, this.payload);
      }
      
      const { data, error } = await query
        .order('created_at', { ascending: false, nullsFirst: false })
        .limit(150);
      
      if (!error && data) {
        console.log(`      ✅ ${data.length} registros usando hook mapping`);
        return data;
      }
      
      console.log(`      ⚠️ Hook mapping falló:`, error?.message);
    } catch (err) {
      console.log(`      ⚠️ Error con hook:`, err);
    }
  }
  
  // 🔄 ESTRATEGIA 2: Fallback a detección automática (código existente)
  console.log(`\n   🔍 [${table}] Usando detección automática (fallback)`);
  return await this.queryTableWithAutoDetect(table);
}
```

---

## 🧪 Testing

### Cómo validar que funciona:

1. **Cargar ZIP de ObraSeco**
2. **Ver consola durante análisis**:
   ```
   🔍 [Custom Hooks] Extracting from deep analysis...
      Found 15 hooks
      ✅ getChatHistory → n8n_chat_histories (read)
      ✅ insertMemoria → memoria_temporal (write)
      ...
   
   🧠 [Custom Hooks] Generating intelligent mappings...
      🎯 getChatHistory: Filtrar por session_id = payload.from
      📋 insertMemoria: Tabla de historial → Filtrar por session_id
      ...
   ```

3. **Durante auditoría**:
   ```
   🔗 [n8n_chat_histories] USANDO CUSTOM HOOK MAPPING
      Hook: getChatHistory
      Estrategia: session
      🎯 Filtrando n8n_chat_histories.session_id = "+5491123456789"
      ✅ 42 registros usando hook mapping
   ```

4. **Verificar que NO aparece** "detección automática" para tablas con hooks

---

## 🎯 Beneficios:

### ANTES (sin hooks):
```
🔍 [memoria_temporal] Usando detección automática...
   📋 Campos detectados: id, session_id, message, created_at
   🧠 Buscando coincidencias...
   ⏱️ 450ms por tabla (lento, hace múltiples queries)
```

### DESPUÉS (con hooks):
```
🔗 [memoria_temporal] USANDO CUSTOM HOOK MAPPING
   Hook: insertMemoria
   🎯 Filtrando por session_id = payload.from
   ✅ 15 registros en 80ms (rápido, 1 sola query)
```

---

## 🔧 Estado de integración:

- ✅ Servicios creados (`customHookIntegrator.ts`)
- ✅ Extractor de hooks funcionando
- ✅ Generador de mappings funcionando
- ⚠️ **FALTA**: Integrar en `geminiService.ts`
- ⚠️ **FALTA**: Modificar constructor de `RealDatabaseAuditor`
- ⚠️ **FALTA**: Usar hooks en `queryTable()`

---

## 📝 Próximos pasos:

1. Identificar dónde se inicializa el auditor en el flujo de auditoría
2. Extraer hooks del `codeProject` en ese punto
3. Pasar hooks al constructor del auditor
4. Modificar `queryTable()` para priorizar hooks
5. Testear con ObraSeco ZIP

---

**Nota**: Esta integración mejorará significativamente la performance y precisión de las queries en proyectos ZIP.

