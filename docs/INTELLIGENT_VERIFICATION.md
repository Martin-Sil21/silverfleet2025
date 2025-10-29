# 🧠 Verificación Inteligente de Base de Datos

## ¿Qué hace?

El sistema ahora **entiende lo que el bot promete** y **verifica automáticamente** que se cumpla en la base de datos real.

---

## 🎯 Casos de Uso

### 1. **Verificación de Precios**
**Problema:** El bot dice "Cuesta $500 por m²" pero en la BD el precio es $450.

**Solución:**
```typescript
// El bot dice: "El precio es $500 por m²"
// Sistema extrae: { type: "PRICE_CLAIM", value: 500, product: "pintura_interior" }
// Verifica en BD: productos.precio WHERE nombre = "pintura_interior"
// ❌ Detecta discrepancia si no coincide
```

### 2. **Citas Agendadas**
**Problema:** El bot dice "Te agendé para mañana" pero no hay ninguna cita en la BD.

**Solución:**
```typescript
// El bot dice: "Perfecto, te agendé para mañana 15:00"
// Sistema extrae: { type: "APPOINTMENT_CREATED", date: "2025-10-29", time: "15:00" }
// Verifica en BD: SELECT * FROM citas WHERE usuario_id = X AND fecha = "2025-10-29"
// ❌ Detecta si la cita NO existe
```

### 3. **Usuario Bloqueado**
**Problema:** El bot bloquea al usuario pero sigue en conversación (timeout).

**Solución:**
```typescript
// Sistema detecta TIMEOUT (30 segundos sin respuesta)
// Marca como: { type: "USER_BLOCKED", reason: "No responde" }
// Verifica en BD: SELECT bloqueado FROM usuarios WHERE id = X
// ❌ Crítico si usuario está bloqueado pero conversación activa
```

### 4. **Datos Guardados**
**Problema:** El bot dice "Guardé tu email" pero no lo guardó.

**Solución:**
```typescript
// El bot dice: "Perfecto, guardé tu email juan@example.com"
// Sistema extrae: { type: "DATA_SAVED", field: "email", value: "juan@example.com" }
// Verifica en BD: SELECT email FROM usuarios WHERE id = X
// ❌ Detecta si el campo está vacío o con otro valor
```

---

## 🔧 Cómo Funciona (Internamente)

### 1. **Extracción de Promesas** (`extractBotPromises`)
Usa Gemini AI para analizar la respuesta del bot y extraer afirmaciones verificables:

```typescript
const promises = await extractBotPromises(
  "El precio es $500 por m²",  // Respuesta del bot
  "¿Cuánto cuesta?",             // Pregunta del usuario
  "..."                          // Historial previo
);

// Resultado:
// [{ type: "PRICE_CLAIM", value: 500, product: "...", unit: "m²" }]
```

### 2. **Verificación en BD** (`verifyBotPromises`)
Para cada promesa, ejecuta verificaciones específicas:

```typescript
for (const promise of promises) {
  switch (promise.type) {
    case 'PRICE_CLAIM':
      await auditor.verifyFieldValue('productos', productId, 'precio', 500, "...");
      break;
    case 'APPOINTMENT_CREATED':
      await auditor.verifyRecordExists('citas', { usuario_id: X, fecha: "..." }, "...");
      break;
    case 'USER_BLOCKED':
      await auditor.verifyNotBlocked(userId, "...");
      break;
  }
}
```

### 3. **Reporte de Discrepancias**
Todas las discrepancias se agregan al `DatabaseDiscrepancy[]`:

```typescript
{
  type: 'incorrect_data',
  severity: 'critical',
  description: 'Bot afirmó precio de $500 pero en BD es $450',
  expected: 500,
  actual: 450,
  table: 'productos',
  timestamp: 1698765432
}
```

---

## 📊 Integración con Auditoría

### En el Flujo de Auditoría

```typescript
// Después de cada turno exitoso:
if (step.status === 'SUCCESS' && config.realDatabaseConfig) {
  // 1. Extraer promesas del bot
  const promises = await extractBotPromises(...);
  
  // 2. Verificar cada promesa
  const discrepancies = await verifyBotPromises(...);
  
  // 3. Reportar en UI
  if (discrepancies.length > 0) {
    onProgress({ 
      message: `⚠️ "${testCase.title}": ${discrepancies.length} discrepancias` 
    });
  }
}
```

### En el Reporte Final

Las discrepancias aparecen en:
- **LiveAuditView** → Card "Actividad de Base de Datos"
- **AuditReport** → Sección "Discrepancias Detectadas"
- **Análisis de Gemini** → Consideradas para la nota final

---

## ⚙️ Configuración

### 1. Habilitar Verificación Inteligente

Ya está habilitado automáticamente si:
- ✅ Tienes "Conectar a BD Real (Supabase)" activado
- ✅ Seleccionaste tablas para monitorear

### 2. Estructura de BD Recomendada

Para mejores resultados, usa nombres de campos estándar:

```sql
-- Tabla de productos
CREATE TABLE productos (
  id UUID PRIMARY KEY,
  nombre TEXT,
  precio DECIMAL,
  stock INTEGER
);

-- Tabla de citas
CREATE TABLE citas (
  id UUID PRIMARY KEY,
  usuario_id UUID,
  fecha DATE,
  hora TIME
);

-- Tabla de usuarios
CREATE TABLE usuarios (
  id UUID PRIMARY KEY,
  telefono TEXT,
  email TEXT,
  bloqueado BOOLEAN DEFAULT FALSE
);
```

---

## 🚨 Timeout y Detección de Bloqueo

### Problema Original
Cuando el bot bloquea al usuario, n8n se queda esperando y nunca responde.

### Solución Implementada

```typescript
// Timeout de 30 segundos
const timeoutPromise = new Promise((_, reject) => 
  setTimeout(() => reject(new Error('TIMEOUT: Bot no respondió')), 30000)
);

// Race entre fetch y timeout
const response = await Promise.race([
  fetch(endpointUrl, { ... }),
  timeoutPromise
]);
```

**Resultado:**
- Si el bot NO responde en 30 segundos → ⏱️ ERROR con mensaje "TIMEOUT"
- Se marca como conversación fallida
- Se verifica en BD si usuario fue bloqueado

---

## 📝 Tipos de Promesas Soportadas

| Tipo | Qué Detecta | Qué Verifica |
|------|-------------|--------------|
| `PRICE_CLAIM` | "Cuesta $500" | `productos.precio` = 500 |
| `APPOINTMENT_CREATED` | "Te agendé" | Existe `citas` con fecha/hora |
| `ORDER_PLACED` | "Pedido creado" | Existe `pedidos` con total |
| `INFO_PROVIDED` | "Tenemos 50 en stock" | `productos.stock` = 50 |
| `USER_BLOCKED` | "No puedo continuar" | `usuarios.bloqueado` = true |
| `DATA_SAVED` | "Guardé tu email" | `usuarios.email` = "..." |

---

## 🎨 UI de Discrepancias

### En LiveAuditView (Tiempo Real)
```
🗄️ Actividad de Base de Datos     [2 Críticas]

🚨 Discrepancias Detectadas (3)
  ┌─────────────────────────────────────┐
  │ ❌ Bot afirmó precio $500 pero BD   │
  │    tiene $450                        │
  │    Tabla: productos | CRITICAL       │
  └─────────────────────────────────────┘
```

### En AuditReport (Final)
```
📊 Resultado: 6.5 / 10.0

⚠️ Problemas Detectados:
  • [CRÍTICO] Precios incorrectos (2 casos)
  • [WARNING] Usuario bloqueado prematuramente
```

---

## 🔮 Próximas Mejoras

1. **Búsqueda por Nombre** → Poder buscar productos sin necesitar ID
2. **Múltiples BD** → Soporte para Airtable, Google Sheets
3. **Verificación de Cálculos** → Detectar si el bot hizo mal las cuentas
4. **Historial de Cambios** → Ver CUÁNDO se modificó cada registro

---

## ❓ FAQ

### ¿Funciona sin BD conectada?
No. Necesitas tener "Conectar a BD Real (Supabase)" habilitado.

### ¿Qué pasa si mi BD tiene nombres diferentes?
El sistema intenta adaptar (usuarios/users, citas/appointments) pero para mejores resultados usa nombres estándar.

### ¿El sistema modifica mi BD?
**NO**. Solo hace lecturas (`SELECT`). Nunca escribe, actualiza o elimina.

### ¿Funciona con cualquier flujo de n8n?
Sí, siempre que:
- El flujo use una BD (Supabase, etc.)
- Los datos del bot sean verificables (precios, citas, etc.)

---

**✅ Con esto, tu auditoría ahora NO SOLO simula conversaciones, sino que VERIFICA que el bot realmente haga lo que dice.**


