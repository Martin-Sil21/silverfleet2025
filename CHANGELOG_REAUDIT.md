# 🔄 Nueva Funcionalidad: Re-auditar

**Fecha:** 28 de Octubre, 2025  
**Versión:** 2.4.0

---

## ✨ **Nueva Funcionalidad**

### **Botón "Re-auditar" en el Reporte**

Ahora podés re-ejecutar una auditoría con la misma configuración sin tener que volver a cargar todo manualmente.

---

## 🎯 **Cómo Funciona**

### **1. En el Reporte Final**

```
┌────────────────────────────────────────────────────────┐
│ 📊 Reporte de Auditoría      [🔄 Re-auditar] [← Nueva]│
├────────────────────────────────────────────────────────┤
│ ... resultados ...                                     │
└────────────────────────────────────────────────────────┘
```

**Click en "🔄 Re-auditar":**
- Vuelve a la pantalla de configuración
- Todos los campos pre-llenados:
  - ✅ Tipo de auditoría (visual/real)
  - ✅ Endpoint URL
  - ✅ Criterios de evaluación
  - ✅ Cantidad de test cases
  - ✅ Workflow y conexiones
  - ✅ Configuración de Supabase (URL, Key, Tablas)
- Podés editar cualquier campo o ejecutar directo

---

### **2. Campos Pre-llenados**

```typescript
// Al hacer click en "Re-auditar", se pre-llenan:
- auditType: "real" | "visual"
- endpointUrl: "https://tu-webhook.com/..."
- criteria: ["Coherencia", "Eficiencia", ...]
- testCaseCount: 5
- workflow: [...]
- connections: [...]
- realDatabaseConfig:
    - url: "https://xxxxx.supabase.co"
    - key: "eyJhbGc..."
    - tables: ["n8n_chat_histories", "resumen_conversaciones", ...]
```

---

### **3. Flujo Completo**

```
1. Usuario ejecuta auditoría
   ↓
2. Ve reporte con resultados
   ↓
3. Click en "🔄 Re-auditar"
   ↓
4. Vuelve a AgentConfig con todos los campos llenos
   ↓
5. (Opcional) Edita lo que quiera
   ↓
6. Click en "Iniciar Auditoría"
   ↓
7. Nueva auditoría con misma config
```

---

## 📋 **Casos de Uso**

### **1. Re-ejecutar Después de Arreglar el Bot**
```
1. Primera auditoría: Score 1.0 (7 errores críticos)
2. Arreglás el flujo de n8n
3. Click "Re-auditar"
4. Nueva auditoría: Score 9.0 (sin errores)
```

### **2. Probar con Diferentes Criterios**
```
1. Primera auditoría con criterios por defecto
2. Click "Re-auditar"
3. Agregás/eliminás criterios
4. Ejecutás para ver cómo cambia el score
```

### **3. Cambiar Endpoint**
```
1. Primera auditoría en staging
2. Click "Re-auditar"
3. Cambiás endpoint a producción
4. Ejecutás para comparar comportamiento
```

### **4. Agregar Más Test Cases**
```
1. Primera auditoría con 5 casos
2. Click "Re-auditar"
3. Cambiás a 10 casos
4. Ejecutás para cobertura más amplia
```

---

## 🔧 **Implementación Técnica**

### **Archivos Modificados:**

#### **1. `components/ExecutiveReport.tsx`**
```typescript
interface ExecutiveReportProps {
  results: AuditResult[];
  config: AuditConfig;          // ✨ NUEVO
  onReset: () => void;
  onReaudit: (config: AuditConfig) => void;  // ✨ NUEVO
}

// Botón agregado en el header:
<button onClick={() => onReaudit(config)}>
  🔄 Re-auditar
</button>
```

#### **2. `App.tsx`**
```typescript
const handleReaudit = useCallback((config: AuditConfig) => {
  // Guardar la configuración actual
  setAuditConfig(config);
  // Limpiar resultados previos
  setAuditResults([]);
  setLiveAuditData([]);
  setLiveLogs([]);
  // Volver a estado de configuración
  setAuditStatus(AuditStatus.CONFIG);
}, []);

// En el render:
<ExecutiveReport 
  results={auditResults} 
  config={auditConfig} 
  onReset={handleReset} 
  onReaudit={handleReaudit}  // ✨ NUEVO
/>
```

#### **3. `components/AgentConfig.tsx`**
```typescript
interface AgentConfigProps {
  onStartAudit: (data: ...) => void;
  onViewHistory: (item: ...) => void;
  initialConfig?: AuditConfig | null;  // ✨ NUEVO
}

// useEffect para pre-llenar campos:
useEffect(() => {
  if (initialConfig) {
    setAuditType(initialConfig.auditType);
    setCriteria(initialConfig.criteria);
    setTestCaseCount(initialConfig.testCaseCount);
    setWorkflow(initialConfig.workflow || []);
    setConnections(initialConfig.connections || []);
    setEndpointUrl(initialConfig.endpointUrl || '');
    
    if (initialConfig.realDatabaseConfig) {
      setUseRealDatabase(true);
      setSupabaseUrl(initialConfig.realDatabaseConfig.url);
      setSupabaseKey(initialConfig.realDatabaseConfig.key);
      setSelectedTables(initialConfig.realDatabaseConfig.tables);
    }
  }
}, [initialConfig]);
```

---

## ⚠️ **Limitaciones Conocidas**

### **1. Archivo JSON no se Carga Automáticamente**

**Razón:**
- `WorkflowNode` (guardado en config) != `ParsedN8nNode` (necesario para parsedN8nData)
- No es posible reconstruir el objeto completo desde el config

**Solución:**
- Los datos del workflow SÍ se guardan (workflow, connections, endpoint)
- Solo falta el archivo JSON visual en la interfaz
- El usuario puede volver a subir el JSON si necesita ver la visualización
- Pero NO es necesario para re-ejecutar la auditoría

---

## 🎉 **Beneficios**

| Aspecto | Antes | Ahora |
|---------|-------|-------|
| **Tiempo para Re-auditar** | 5-10 min (cargar todo) | **10 seg** ✅ |
| **Errores al Re-configurar** | ⚠️ Común (olvidar algo) | ✅ Ninguno |
| **Comparación de Resultados** | ❌ Difícil | ✅ Fácil |
| **Iteración Rápida** | ❌ Lenta | ✅ Rápida |

---

## 🧪 **Cómo Probar**

```bash
npm run dev
```

**Pasos:**
1. Ejecutar una auditoría completa
2. Ver el reporte final
3. Click en "🔄 Re-auditar" (botón verde)
4. Verificar que todos los campos estén pre-llenados:
   - Endpoint URL
   - Criterios
   - Cantidad de casos
   - Config de Supabase (si estaba habilitada)
5. (Opcional) Editar algo
6. Click en "Iniciar Auditoría"
7. Verificar que se ejecute correctamente

---

## 📝 **Notas**

- El botón está en **verde** para diferenciarlo de "Nueva Auditoría" (azul)
- Si editás campos antes de re-ejecutar, esos cambios se aplicarán
- La configuración se mantiene hasta que hagas "Nueva Auditoría" o cierres la app
- Funciona tanto para auditorías visuales como reales
- Compatible con configuración de Base de Datos

---

**Estado:** ✅ **COMPLETADO Y TESTEADO**


