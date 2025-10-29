# Auditoría de Base de Datos REAL (Producción)

## 🎯 ¿Qué es esto?

Sistema que se conecta a tu base de datos de **producción** (Supabase, Airtable, etc.) para **VERIFICAR** que el agente realmente hace lo que dice que hace.

## ❓ ¿Por qué?

### Ejemplos de problemas que detecta:

#### ❌ Caso 1: Promesa Incumplida
```
Usuario: "Quiero agendar para mañana a las 3pm"
Bot: "Listo! Te agendé para mañana a las 15:00 ✅"

→ Auditoría verifica Supabase
→ NO existe ninguna cita creada
→ 🚨 ERROR CRÍTICO: El bot mintió
```

#### ❌ Caso 2: Bloqueo Indebido
```
Usuario: "Cuánto cuesta el producto X?"
Bot: "El precio es $500"
Usuario: "Ok, quiero comprarlo"

→ Auditoría verifica Supabase
→ El usuario fue marcado como "bloqueado"
→ 🚨 ERROR CRÍTICO: Bloqueó al usuario en plena conversación
```

#### ❌ Caso 3: Información Incorrecta
```
Bot: "El precio del producto X es $500"

→ Auditoría verifica Supabase
→ El precio real en la BD es $700
→ 🚨 ERROR CRÍTICO: Dio información falsa
```

## 🔧 Configuración

### 1. Configurar Base de Datos en la UI

En `AgentConfig.tsx`, el usuario debe proporcionar:

```typescript
{
  type: 'supabase',  // o 'airtable', 'google-sheets'
  credentials: {
    url: 'https://tu-proyecto.supabase.co',
    key: 'tu-anon-key'
  },
  tables: ['citas', 'usuarios', 'productos', 'pedidos']
}
```

### 2. Uso en el Flujo de Auditoría

```typescript
import { initializeRealDatabaseAuditor, getRealDatabaseAuditor } from './services/realDatabaseAuditor';

// Al iniciar auditoría
const auditor = initializeRealDatabaseAuditor(conversationId, {
  type: 'supabase',
  credentials: { url: '...', key: '...' },
  tables: ['citas', 'usuarios']
});

// Tomar snapshot ANTES de cada turno
const snapshotBefore = await auditor.takeSnapshot();

// Usuario envía mensaje, bot responde...

// Tomar snapshot DESPUÉS del turno
const snapshotAfter = await auditor.takeSnapshot();

// Comparar cambios
auditor.compareSnapshots(snapshotBefore, snapshotAfter);
```

## 📋 Verificaciones Específicas

### Verificar que se creó un registro

```typescript
const auditor = getRealDatabaseAuditor(conversationId);

// Si el bot dijo "Te agendé una cita"
const existe = await auditor.verifyRecordExists(
  'citas',
  {
    usuario_id: userId,
    fecha: '2025-10-29',
    hora: '15:00'
  },
  'El bot prometió agendar una cita'
);

if (!existe) {
  // 🚨 Se registra automáticamente como discrepancia crítica
}
```

### Verificar valor de un campo

```typescript
// Si el bot dijo "El precio es $500"
const coincide = await auditor.verifyFieldValue(
  'productos',
  productoId,
  'precio',
  500,
  'El bot informó un precio'
);

if (!coincide) {
  // 🚨 Discrepancia: el bot dio info incorrecta
}
```

### Verificar que NO bloqueó al usuario

```typescript
// Durante toda la conversación
const noEstaBloquado = await auditor.verifyNotBlocked(
  userId,
  'Verificación en mitad de conversación'
);

if (!noEstaBloquado) {
  // 🚨 ERROR: Bot bloqueó al usuario mientras conversaban
}
```

## 🔍 Análisis de Respuestas del Bot

Para automatizar las verificaciones, puedes parsear las respuestas del bot:

```typescript
const botResponse = "Perfecto! Te agendé para el 29/10/2025 a las 15:00. Tu código de confirmación es ABC123";

// Extraer información clave (con IA o regex)
const datosExtraidos = extractarDatosDeRespuesta(botResponse);
// { accion: 'agendar', fecha: '2025-10-29', hora: '15:00', codigo: 'ABC123' }

// Verificar en BD
if (datosExtraidos.accion === 'agendar') {
  await auditor.verifyRecordExists('citas', {
    codigo_confirmacion: datosExtraidos.codigo,
    fecha: datosExtraidos.fecha,
    hora: datosExtraidos.hora
  }, 'Bot prometió agendar cita');
}
```

## 📊 Resultados de Auditoría

Al finalizar, obtienes:

```typescript
const summary = auditor.getSummary();

{
  totalOperations: 10,        // Snapshots tomados
  discrepancies: [            // 🚨 LO MÁS IMPORTANTE
    {
      type: 'missing_record',
      severity: 'critical',
      description: 'El bot prometió agendar una cita pero no se creó el registro',
      expected: { fecha: '2025-10-29', hora: '15:00' },
      actual: null,
      table: 'citas',
      timestamp: 1698588000000
    },
    {
      type: 'unauthorized_action',
      severity: 'critical',
      description: 'Usuario fue bloqueado durante la conversación',
      expected: { bloqueado: false },
      actual: { bloqueado: true },
      table: 'usuarios',
      timestamp: 1698588100000
    }
  ]
}
```

## 🎨 Visualización en la UI

Las discrepancias se muestran en:

1. **LiveAuditView**: Alertas en tiempo real cuando se detecta un problema
2. **AuditReport**: Lista completa de discrepancias con detalles
3. **Análisis de Gemini**: Considera las discrepancias en el score final

## 🔐 Seguridad

### Recomendaciones:

1. **Usar credenciales de solo lectura** cuando sea posible
2. **No enviar las credenciales al frontend** - manejarlas server-side
3. **Limitar las tablas** a solo las necesarias
4. **Ambiente de staging** - usar una BD de prueba, no producción directa

### Configuración Segura (Supabase):

```sql
-- Crear un rol de solo lectura
CREATE ROLE auditor_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO auditor_readonly;

-- Crear usuario específico para auditorías
CREATE USER auditor_user WITH PASSWORD 'secure_password';
GRANT auditor_readonly TO auditor_user;
```

## 🚀 Integración Completa

### En `geminiService.ts`:

```typescript
// Al iniciar auditoría real
if (config.enableDatabaseTracking && config.realDatabaseConfig) {
  testCases.forEach(tc => {
    initializeRealDatabaseAuditor(tc.id, config.realDatabaseConfig);
  });
}

// En cada turno de conversación
const auditor = getRealDatabaseAuditor(conversationId);
if (auditor) {
  // ANTES: Snapshot inicial
  const snapshotBefore = await auditor.takeSnapshot();
  
  // Usuario envía mensaje → Bot responde
  const response = await fetch(endpoint, ...);
  
  // DESPUÉS: Snapshot final
  const snapshotAfter = await auditor.takeSnapshot();
  auditor.compareSnapshots(snapshotBefore, snapshotAfter);
  
  // Verificaciones específicas basadas en la respuesta
  await verificarRespuestaBot(response, auditor, conversationId);
}
```

## 📝 Checklist de Implementación

- [ ] Configurar credenciales de BD en la UI
- [ ] Seleccionar tablas a monitorear
- [ ] Definir verificaciones específicas por caso de uso
- [ ] Implementar extracción de info de respuestas del bot
- [ ] Mostrar discrepancias en la UI
- [ ] Incluir discrepancias en el análisis de Gemini
- [ ] Exportar discrepancias en CSV
- [ ] Configurar permisos de solo lectura en la BD

## 🔮 Próximos Pasos

1. **Parser de respuestas inteligente**: Usar Gemini para extraer automáticamente acciones prometidas por el bot
2. **Verificaciones automáticas**: Según las acciones detectadas, ejecutar verificaciones correspondientes
3. **Soporte multi-BD**: Airtable, Google Sheets, Firebase
4. **Webhooks de verificación**: Notificar discrepancias en tiempo real
5. **Modo "shadow"**: Comparar con BD de staging sin afectar producción

---

**Estado**: 🟡 En desarrollo - Estructura base implementada  
**Próximo milestone**: Integración con UI y flujo de auditoría


