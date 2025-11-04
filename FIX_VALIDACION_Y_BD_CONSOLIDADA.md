# 🔧 FIX: Validación de Steps y Consolidación de Bases de Datos

## Problemas Identificados

### 1. ❌ Checkmarks aparecían fuera de orden
**Problema**: Los checkmarks de Step 4 aparecían completos cuando los anteriores no lo estaban.

**Causa**: La validación de cada step era independiente, no verificaba que los steps previos estuvieran completos.

**Solución**: Modificada la lógica en `renderStepIndicator()`:
```typescript
// ANTES - cada step se validaba independientemente:
const isCompleted = 
  (step === 1 && isStep1Complete) ||
  (step === 2 && isStep2Complete) ||
  (step === 3 && isStep3Complete) ||
  (step === 4 && isStep4Complete) ||
  (step === 5 && canStartAudit);

// AHORA - cada step depende de que los anteriores estén completos:
const isCompleted = 
  (step === 1 && isStep1Complete) ||
  (step === 2 && isStep1Complete && isStep2Complete) ||
  (step === 3 && isStep1Complete && isStep2Complete && isStep3Complete) ||
  (step === 4 && isStep1Complete && isStep2Complete && isStep3Complete && isStep4Complete) ||
  (step === 5 && canStartAudit);
```

### 2. ❌ Múltiples credenciales para misma base de datos
**Problema**: Si el workflow tenía 3 nodos de Supabase, pedía 3 credenciales diferentes.

**Causa**: El sistema pedía credenciales por nodo individual en lugar de por tipo de base de datos.

**Solución**: Implementada consolidación por tipo de BD:

#### A. Agrupación en la UI (Step 3)
```typescript
// Agrupar por tipo de BD - todos los nodos del mismo tipo comparten 1 credencial
const databasesByType = new Map<string, DetectedDatabase[]>();
dependencies?.databases.forEach(db => {
  const existing = databasesByType.get(db.databaseType) || [];
  databasesByType.set(db.databaseType, [...existing, db]);
});

// Renderizar una tarjeta por tipo, no por nodo:
Array.from(databasesByType.entries()).map(([dbType, nodes]) => (
  <div>
    <h3>{dbType.toUpperCase()} Database</h3>
    <p>Used by {nodes.length} node(s): {nodes.map(n => n.nodeName).join(', ')}</p>
    <button onClick={() => handleConfigureTool(nodes[0].nodeId, dbType, 'db')}>
      Configure
    </button>
  </div>
))
```

#### B. Asignación automática a todos los nodos del mismo tipo
```typescript
const handleCredentialSelected = (credentialId: string) => {
  if (modalConfig.category === 'db') {
    // Aplicar la misma credencial a TODOS los nodos de este tipo de BD
    const dbType = modalConfig.credType;
    const newMap = new Map(dbCredentials);
    
    dependencies?.databases
      .filter(db => db.databaseType === dbType)
      .forEach(db => {
        newMap.set(db.nodeId, credentialId);
      });
    
    setDbCredentials(newMap);
  }
};
```

#### C. Validación mejorada
```typescript
const isStep3Complete = (() => {
  // Verificar que todas las herramientas tienen credenciales
  const toolsComplete = dependencies?.tools.every(t => toolCredentials.has(t.nodeId)) ?? true;
  
  // Verificar que cada TIPO de BD tiene al menos una credencial configurada
  const databaseTypes = new Set(dependencies?.databases.map(d => d.databaseType));
  const dbComplete = Array.from(databaseTypes).every(dbType => {
    return dependencies?.databases
      .filter(d => d.databaseType === dbType)
      .some(d => dbCredentials.has(d.nodeId)) ?? false;
  });
  
  return toolsComplete && (databaseTypes.size === 0 || dbComplete);
})();
```

### 3. ✅ Detección de herramientas en subflujos (ya implementado en commit anterior)
**Solución**: La función `handleSubflowUpload` ahora analiza dependencias de cada subflujo al cargarlo:
```typescript
const subflowDeps = analyzeWorkflowDependencies(text);
const mergedDeps: WorkflowDependencies = {
  subflows: dependencies.subflows,
  tools: [...dependencies.tools, ...subflowDeps.tools],
  databases: [...dependencies.databases, ...subflowDeps.databases],
  hasExternalDependencies: dependencies.hasExternalDependencies || subflowDeps.hasExternalDependencies
};
// Eliminar duplicados por nodeId
mergedDeps.tools = Array.from(new Map(mergedDeps.tools.map(t => [t.nodeId, t])).values());
mergedDeps.databases = Array.from(new Map(mergedDeps.databases.map(d => [d.nodeId, d])).values());
```

## Archivos Modificados

### `components/AgentConfig.tsx`
- ✅ Importado tipo `DetectedDatabase` desde `workflowDependencyAnalyzer`
- ✅ Modificado `renderStep3()` para agrupar BDs por tipo
- ✅ Modificado `handleCredentialSelected()` para asignar credencial a todos los nodos del mismo tipo
- ✅ Mejorado `isStep3Complete` para validar por tipo de BD en lugar de por nodo
- ✅ Arreglado `renderStepIndicator()` para validación secuencial de steps

## Resultado

### Antes:
```
❌ Step 4 aparece completo cuando Step 1-3 no lo están
❌ Workflow con 3 nodos de Supabase → pide 3 credenciales
❌ Subflujo con Gmail node → no detecta el Gmail
```

### Ahora:
```
✅ Steps se completan en orden (1→2→3→4→5)
✅ Workflow con 3 nodos de Supabase → pide 1 credencial, aplica a los 3
✅ Subflujo con Gmail node → detecta y pide credencial de Gmail
✅ UI muestra: "SUPABASE Database - Used by 3 nodes: Node1, Node2, Node3"
```

## Testing Recomendado

1. **Validación de Steps**:
   - Cargar workflow → verificar que solo Step 1 tiene check
   - Cargar payload → verificar que Step 1 complete
   - Subir subflujos → verificar que Step 2 complete (y 1 siga completo)
   - Configurar credenciales → verificar Step 3 complete (1 y 2 también)
   - Configurar criterios → verificar Step 4 complete (todos anteriores también)

2. **Consolidación de BDs**:
   - Workflow con múltiples nodos del mismo tipo de BD (ej: 3 Supabase)
   - Verificar que Step 3 muestre 1 tarjeta "SUPABASE Database - Used by 3 nodes: ..."
   - Configurar 1 credencial
   - Verificar que todos los nodos quedan configurados

3. **Detección en Subflujos**:
   - Workflow que requiere subflujo
   - Subflujo con Gmail/Calendar/CRM nodes
   - Verificar que Step 3 muestre las herramientas del subflujo
   - Configurar credenciales y ejecutar auditoría

## Notas Técnicas

- La consolidación de BDs usa `Map<string, DetectedDatabase[]>` para agrupar por `databaseType`
- Se asignan credenciales a TODOS los nodos del mismo tipo en un solo paso
- La validación de Step 3 verifica que cada tipo único tenga al menos 1 nodo configurado
- Los subflujos ahora se analizan al subirlos (no solo al detectarlos en el main workflow)
