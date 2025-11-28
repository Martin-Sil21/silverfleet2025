# 🔍 Panel de Verificaciones en Tiempo Real

## Descripción General

El **LiveVerificationPanel** es un componente de React que muestra en tiempo real las verificaciones que realiza el sistema de auditoría durante la ejecución de conversaciones con agentes de IA. Proporciona visibilidad completa sobre:

- ✉️ **Herramientas externas**: Verificación de emails enviados, eventos de calendario creados, subflows ejecutados
- 💰 **Precios**: Comparación entre precios mencionados por el agente vs precios reales en base de datos
- 🗄️ **Base de Datos**: Operaciones de INSERT/UPDATE/DELETE detectadas durante la conversación

---

## 📁 Ubicación de Archivos

### Componentes Nuevos
- **`components/LiveVerificationPanel.tsx`** - Componente principal (400+ líneas)

### Modificaciones en Componentes Existentes
- **`components/LiveAuditView.tsx`**:
  - Agregado import de `LiveVerificationPanel`
  - Nueva pestaña "Verificaciones" con icono 🔍
  - Tipo `TabType` extendido: `'verifications'`
  
- **`components/AuditReport.tsx`**:
  - Agregado import de `LiveVerificationPanel`
  - Nueva pestaña "Verificaciones Live" con icono 🔍
  - Tipo `ReportTabType` extendido: `'verifications'`

### Tipos TypeScript
- **`types.ts`**:
  - `ToolVerificationLive` - Estructura para verificaciones de herramientas
  - `PriceVerificationLive` - Estructura para verificaciones de precios
  - `DatabaseOperationLive` - Estructura para operaciones de BD
  - `ExecutionStep` extendido con:
    - `toolVerifications?: ToolVerificationLive[]`
    - `priceVerifications?: PriceVerificationLive[]`
    - `databaseOperations?: DatabaseOperationLive[]`

---

## 🎨 Características del Componente

### Sistema de Pestañas (Tabs)
El panel tiene 3 pestañas principales:

1. **🔧 Herramientas (Tools)** - Verde
   - Muestra verificaciones de tools externos (Gmail, Calendar, Subflows)
   - Estados: ✅ verified | ❌ failed | ⚠️ not_found
   - Detalles expandibles con evidencia

2. **💰 Precios (Prices)** - Amarillo
   - Compara precios mencionados vs DB
   - Resalta discrepancias con colores (verde=match, rojo=discrepancia)
   - Muestra porcentaje de diferencia

3. **🗄️ Base de Datos (Database)** - Azul
   - Operaciones INSERT/UPDATE/DELETE
   - Nombre de tabla, cantidad de registros
   - Campos modificados y datos completos expandibles

### Auto-scroll Inteligente
- Cuando `isActive={true}` (auditoría en curso), hace scroll automático a nuevas verificaciones
- Cuando `isActive={false}` (reporte final), permite navegación manual

### Indicadores Visuales
- **Badges con contadores** en cada pestaña (ej: "🔧 Herramientas (12)")
- **Estados con emojis**: ✅ ❌ ⚠️ 🔄
- **Color-coding por tipo**:
  - Verde: Verificado/Exitoso
  - Rojo: Error/Discrepancia
  - Amarillo: Advertencia/No encontrado
  - Azul: Información

### Detalles Expandibles
Cada verificación puede expandirse para ver:
- Evidencia completa
- Datos JSON del registro
- Contexto adicional

---

## 🔌 Integración en UI Existente

### En LiveAuditView (Auditoría en Vivo)

```tsx
// Nueva pestaña agregada después de "Conversación"
<TabButton 
  active={activeTab === 'verifications'} 
  icon="🔍" 
  label="Verificaciones"
  onClick={() => setActiveTab('verifications')}
/>

// Renderizado del panel
{activeTab === 'verifications' && (
  <LiveVerificationPanel 
    steps={selectedResult.executionTrace} 
    isActive={true}  // Auto-scroll activo durante auditoría
  />
)}
```

### En AuditReport (Reporte Final)

```tsx
// Nueva pestaña "Verificaciones Live"
<ReportTabButton 
  active={activeTab === 'verifications'} 
  icon="🔍" 
  label="Verificaciones Live"
  onClick={() => setActiveTab('verifications')}
/>

// Renderizado dentro de sección estilizada
{activeTab === 'verifications' && (
  <section className="bg-gradient-to-r from-purple-50...">
    <LiveVerificationPanel 
      steps={result.executionTrace} 
      isActive={false}  // Sin auto-scroll en reporte final
    />
  </section>
)}
```

---

## 📊 Estructura de Datos

### ToolVerificationLive
```typescript
{
  toolName: "Gmail API",
  toolType: "email",
  action: "send_email",
  status: "verified",  // verified | failed | not_found
  evidence: "Email encontrado: subject='Propuesta comercial...'",
  details: "Enviado a: cliente@ejemplo.com",
  timestamp: 1234567890
}
```

### PriceVerificationLive
```typescript
{
  product: "Seguro Todo Riesgo",
  priceMentioned: 85000,
  priceInDB: 90000,
  matches: false,
  discrepancy: 5000,
  source: "database",
  context: "El agente mencionó $85.000 pero el precio real es $90.000",
  timestamp: 1234567890
}
```

### DatabaseOperationLive
```typescript
{
  type: "INSERT",
  table: "resumen_conversaciones",
  description: "Guardado resumen final de conversación",
  recordCount: 1,
  success: true,
  summary: "Se insertó 1 registro con estado: completada",
  fields: [
    { name: "estado", value: "completada" },
    { name: "objetivo_cumplido", value: true }
  ],
  recordData: { /* objeto completo */ },
  timestamp: 1234567890
}
```

---

## 🔄 Flujo de Datos (Backend → UI)

### 1. Durante Ejecución de Conversación
En `services/independentConversationRunner.ts`:

```typescript
// Después de verificar herramientas
const toolVerificationsLive: ToolVerificationLive[] = [
  {
    toolName: "Gmail API",
    status: "verified",
    // ...
  }
];

// Notificar progreso con datos live
onProgress({
  testCaseId: conv.testCase.id,
  step: {
    nodeId: `Turn ${turnCount}`,
    toolVerifications: toolVerificationsLive,
    priceVerifications: priceVerificationsLive,
    databaseOperations: databaseOperationsLive,
    // ... otros campos
  }
});
```

### 2. LiveAuditView Recibe Actualización

```typescript
// En App.tsx, handleProgressUpdate agrega el step al resultado
setLiveAuditData(prev => {
  const updated = [...prev];
  const resultIndex = updated.findIndex(r => r.id === testCaseId);
  updated[resultIndex].executionTrace.push(step);
  return updated;
});
```

### 3. LiveVerificationPanel Detecta Cambio

```typescript
// useMemo re-calcula verificaciones cuando steps cambia
const { allTools, allPrices, allDatabaseOps } = useMemo(() => {
  const tools: Array<ToolVerificationLive & { turnNumber: number }> = [];
  
  steps.forEach((step, index) => {
    if (step.toolVerifications) {
      step.toolVerifications.forEach(tv => {
        tools.push({ ...tv, turnNumber: index + 1 });
      });
    }
  });
  
  return { allTools, allPrices, allDatabaseOps };
}, [steps]);
```

### 4. Auto-scroll a Nuevas Verificaciones

```typescript
useEffect(() => {
  if (isActive && containerRef.current) {
    containerRef.current.scrollTop = containerRef.current.scrollHeight;
  }
}, [allTools, allPrices, allDatabaseOps, isActive]);
```

---

## 🎯 Casos de Uso

### 1. Verificar que el agente envió un email
**Usuario ve en pestaña "Herramientas"**:
```
✅ Gmail API - Turno 5
   Acción: send_email
   📧 Email verificado
   Enviado a: cliente@ejemplo.com
   Subject: Propuesta comercial Silver Fleet
```

### 2. Detectar discrepancia de precio
**Usuario ve en pestaña "Precios"**:
```
❌ Seguro Todo Riesgo - Turno 3
   Mencionado: $85.000
   Real en DB: $90.000
   ⚠️ Discrepancia: -$5.000 (-5.6%)
   El agente citó un precio incorrecto
```

### 3. Monitorear cambios en BD
**Usuario ve en pestaña "Base de Datos"**:
```
✅ INSERT en resumen_conversaciones - Turno 8
   📝 1 registro insertado
   
   Campos modificados:
   • estado: "completada"
   • objetivo_cumplido: true
   • productos_cotizados: ["seguro_auto", "seguro_hogar"]
```

---

## ⚙️ Configuración y Personalización

### Cambiar Colores de Estado

En `LiveVerificationPanel.tsx`:

```typescript
const statusColors = {
  verified: 'bg-gradient-to-br from-green-50 to-green-100 border-green-300',
  failed: 'bg-gradient-to-br from-red-50 to-red-100 border-red-300',
  not_found: 'bg-gradient-to-br from-yellow-50 to-yellow-100 border-yellow-300'
};
```

### Agregar Nuevos Tipos de Herramientas

```typescript
const toolIcons: Record<string, string> = {
  email: '📧',
  calendar: '📅',
  subflow: '🔀',
  crm: '📊',
  // Agregar nuevos aquí:
  sms: '📱',
  whatsapp: '💬'
};
```

### Desactivar Auto-scroll

```tsx
<LiveVerificationPanel 
  steps={steps} 
  isActive={false}  // No auto-scroll
/>
```

---

## 🐛 Debugging y Troubleshooting

### Las verificaciones no aparecen
**Verificar**:
1. ¿El backend está agregando los arrays a `ExecutionStep`?
   ```typescript
   console.log('Step:', step.toolVerifications);
   ```
2. ¿Los tipos coinciden con `ToolVerificationLive`?
3. ¿El componente recibe `steps` actualizado?

### Auto-scroll no funciona
**Verificar**:
1. ¿`isActive={true}`?
2. ¿El `containerRef` está correctamente vinculado al div con scroll?

### Performance lento con muchas verificaciones
**Solución**:
- Limitar el historial mostrado (ej: últimas 100 verificaciones)
- Usar virtualización con `react-window`

---

## 📈 Métricas y Estadísticas

El panel calcula automáticamente:

- **Total de verificaciones por tipo**
- **Tasa de éxito** (verified / total)
- **Cantidad de discrepancias de precio**
- **Operaciones de BD por tabla**

Estas métricas se muestran en los badges de las pestañas.

---

## 🚀 Próximas Mejoras

1. **Filtros**: Por turno, por estado, por tipo
2. **Búsqueda**: Buscar verificaciones específicas
3. **Exportación**: Descargar verificaciones como JSON/CSV
4. **Alertas**: Notificaciones sonoras para errores críticos
5. **Gráficos**: Timeline visual de verificaciones
6. **Comparación**: Ver diferencias entre múltiples conversaciones

---

## 📚 Referencias

- **Código fuente**: `components/LiveVerificationPanel.tsx`
- **Tipos**: `types.ts` (líneas 101-135)
- **Backend**: `services/independentConversationRunner.ts`
- **Integración UI**: `components/LiveAuditView.tsx` y `components/AuditReport.tsx`

---

## ✅ Checklist de Implementación

- [x] Tipos TypeScript definidos (`ToolVerificationLive`, etc.)
- [x] Componente `LiveVerificationPanel` creado
- [x] Integración en `LiveAuditView` (pestaña "Verificaciones")
- [x] Integración en `AuditReport` (pestaña "Verificaciones Live")
- [x] Auto-scroll para auditorías en vivo
- [x] Diseño responsive con Tailwind
- [x] Detalles expandibles
- [x] Estados visuales (✅❌⚠️)
- [x] Sin errores de TypeScript
- [ ] Backend recolecta y envía datos live (próximo paso)
- [ ] Testing con auditoría real de n8n
- [ ] Documentación de usuario final

---

**Última actualización**: 2024  
**Autor**: GitHub Copilot + Martin  
**Estado**: ✅ Componente completado y listo para usar
