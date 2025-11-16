# ⚠️ MODO AUDITORÍA - Escrituras en Base de Datos

## 🚨 PROBLEMA CRÍTICO

Durante las auditorías, el sistema envía peticiones **REALES** a tu bot en producción. Si el bot escribe en la base de datos durante cada conversación de auditoría, vas a tener **DATOS FALSOS** en tu BD de producción.

### Ejemplo del problema:

```
Auditoría con 10 test cases
  ↓
Bot procesa 10 conversaciones
  ↓
Bot escribe en BD: 10 registros nuevos
  ↓
🚨 Tu BD de producción ahora tiene 10 conversaciones FALSAS
```

---

## ✅ SOLUCIÓN: Modo Auditoría

Tu bot debe detectar cuando está siendo auditado y **NO escribir** en la base de datos.

### Cómo Detectar Modo Auditoría

El sistema de auditoría envía un header HTTP especial:

```http
POST /webhook/tu-endpoint
Headers:
  X-Audit-Mode: true
  X-Audit-Session: <uuid>
```

### Implementación en tu Bot

#### Opción 1: Skip de Persistencia (Recomendado)

```typescript
// En tu messageProcessingService o handler principal
const isAuditMode = req.headers['x-audit-mode'] === 'true';

if (isAuditMode) {
  console.log('🧪 [AUDIT MODE] Skipping database persistence');
  // Procesar mensaje normalmente pero NO escribir en BD
  const response = await processMessage(message);
  return response; // Sin llamar a db.insert(), db.update(), etc.
}

// Flujo normal con persistencia
const response = await processMessage(message);
await db.insert('chats', { user, message, response });
return response;
```

#### Opción 2: Base de Datos Temporal

```typescript
const dbInstance = req.headers['x-audit-mode'] === 'true'
  ? getInMemoryDatabase() // BD temporal en memoria
  : getProductionDatabase(); // BD real

await dbInstance.insert('chats', { ... });
```

---

## 🎯 Implementación en BuilderBot ObraSeco

Basado en tu código actual (`src/services/messageProcessingService.ts`):

```typescript
export async function processMessage(
  ctx: BotContext,
  message: MessageEvent,
  obrasecoDb: ObrasecoDatabase
) {
  // 🔥 NUEVO: Detectar modo auditoría
  const isAuditMode = ctx.headers?.['x-audit-mode'] === 'true';
  
  if (isAuditMode) {
    console.log('🧪 [AUDIT MODE] Database writes will be skipped');
  }

  // ... tu código existente ...

  // ANTES de cada escritura a BD, verificar:
  if (!isAuditMode) {
    await obrasecoDb.insertChatMessage(...);
    await obrasecoDb.updateMemoriaTemporal(...);
    await obrasecoDb.updateResumenConversacion(...);
  } else {
    console.log('⏭️  [AUDIT] Skipped DB write');
  }

  return response;
}
```

---

## 🔍 Cómo Verificar que Funciona

### Antes de Auditoría

```sql
SELECT COUNT(*) FROM n8n_chat_histories_obra_seco;
-- Resultado: 150 registros
```

### Después de Auditoría (10 test cases)

```sql
SELECT COUNT(*) FROM n8n_chat_histories_obra_seco;
-- ✅ CORRECTO: 150 registros (sin cambios)
-- ❌ INCORRECTO: 160 registros (se agregaron 10 conversaciones falsas)
```

---

## 🛠️ Implementación en SilverFleet Auditor

El sistema ya envía el header, pero necesita asegurarse de que se propague correctamente:

### En `services/geminiService.ts`:

```typescript
// Al hacer fetch al endpoint del usuario
const response = await fetch(endpointUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Audit-Mode': 'true',  // 🔥 CRÍTICO
    'X-Audit-Session': auditSessionId,
  },
  body: JSON.stringify(payload),
});
```

---

## ⚠️ Qué Hacer si Ya Tienes Datos Falsos

Si ya ejecutaste auditorías y tu BD tiene conversaciones falsas:

### Opción 1: Eliminar por Audit Session

```sql
-- Si guardaste el header X-Audit-Session en tus registros
DELETE FROM n8n_chat_histories_obra_seco 
WHERE audit_session IS NOT NULL;
```

### Opción 2: Eliminar por Fecha/Hora

```sql
-- Si sabes cuándo corriste las auditorías
DELETE FROM n8n_chat_histories_obra_seco 
WHERE created_at BETWEEN '2025-11-16 10:00:00' AND '2025-11-16 11:00:00';
```

### Opción 3: Backup y Restore

```bash
# Restaurar desde backup anterior a las auditorías
pg_restore -d tu_database backup_antes_auditorias.dump
```

---

## 📋 Checklist de Implementación

- [ ] Tu bot detecta el header `X-Audit-Mode: true`
- [ ] Cuando está en modo auditoría, NO escribe en BD
- [ ] SilverFleet envía el header en todas las peticiones de auditoría
- [ ] Verificaste con una auditoría de prueba que no se crean registros
- [ ] Documentaste el comportamiento para tu equipo

---

## 🎓 Por Qué es Importante

1. **Integridad de Datos**: Tu BD de producción no debe tener datos de prueba
2. **Análisis Correcto**: Las métricas reales no se contaminan
3. **Auditorías Limpias**: El auditor solo **lee** lo que existía antes
4. **Debugging**: Sabes que cualquier dato nuevo es de usuarios reales

---

## ❓ Preguntas Frecuentes

### ¿El bot debe responder diferente en modo auditoría?

**NO**. El bot debe comportarse **exactamente igual**, solo debe saltearse las escrituras a BD.

### ¿Y si necesito que el bot "simule" tener datos?

Usa una BD en memoria temporal para el audit session:

```typescript
const inMemoryDB = new Map<string, any[]>();

if (isAuditMode) {
  // Leer de BD real
  const existingData = await realDB.select('productos');
  
  // Escribir en memoria
  inMemoryDB.set('productos', [...existingData]);
  
  // Durante la conversación, leer/escribir de inMemoryDB
  // Al terminar, descartar inMemoryDB
}
```

### ¿Cómo afecta esto al análisis del auditor?

El auditor **toma snapshots** de la BD antes y después de cada turno. Si el bot no escribe nada, el auditor simplemente reportará "No hubo cambios en BD", que es el comportamiento esperado si el bot solo está consultando información.

---

## 📞 Soporte

Si tienes dudas sobre cómo implementar el modo auditoría en tu arquitectura específica, consulta la documentación o contacta al equipo.

