# 🎯 Guía: Preparar Proyectos para Auditoría en Silver Fleet

## ¿Cómo está tu proyecto?

Analizando tu proyecto **base-ts-baileys-postgres**, veo que es un **bot de WhatsApp con BuilderBot** que:
- Usa **Baileys** para conectar con WhatsApp
- Tiene **PostgreSQL** como base de datos
- Implementa **flows/flujos** para conversaciones
- Probablemente usa **addAction/addAnswer** pattern de BuilderBot

## 🚨 Problema Principal: ¿Dónde está el endpoint HTTP?

### Situación Actual (BuilderBot/Baileys)

Los bots de WhatsApp con Baileys **NO tienen endpoint HTTP por defecto** porque:
- Baileys se conecta directamente a WhatsApp usando WebSocket
- BuilderBot maneja los mensajes internamente con `addAction()`
- **No hay un servidor HTTP expuesto** para que Silver Fleet envíe requests

```typescript
// Tu código actual probablemente se ve así:
import { createBot } from '@builderbot/bot';
import { BaileysProvider } from '@builderbot/provider-baileys';

const adapterProvider = createProvider(BaileysProvider);

const flow = addKeyword('hola')
  .addAnswer('¿En qué puedo ayudarte?')
  .addAction(async (ctx, { flowDynamic }) => {
    // Tu lógica de agente
    const response = await processMessage(ctx.body);
    await flowDynamic(response);
  });

// ❌ NO HAY ENDPOINT HTTP AQUÍ
createBot({ flow, provider: adapterProvider });
```

---

## ✅ Solución: 3 Opciones para Auditar tu Bot

### Opción 1: **Crear un Webhook HTTP (RECOMENDADO para Auditoría Real)**

Agrega un servidor Express que **simule** las conversaciones:

```typescript
// src/webhook.ts (NUEVO ARCHIVO)
import express from 'express';
import { processMessageLogic } from './agent'; // Tu lógica existente

const app = express();
app.use(express.json());

/**
 * 🎯 Endpoint para auditoría
 * Recibe el mismo formato que tu bot procesa internamente
 */
app.post('/webhook/audit', async (req, res) => {
  try {
    const { conversationId, phone, message, context } = req.body;
    
    // 🧠 Procesar con tu lógica existente
    const response = await processMessageLogic({
      from: phone,
      body: message,
      ...context
    });
    
    res.json({
      conversationId,
      phone,
      response,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 🚀 Iniciar en puerto diferente a WhatsApp
const PORT = process.env.AUDIT_PORT || 3001;
app.listen(PORT, () => {
  console.log(`✅ Audit webhook running on http://localhost:${PORT}/webhook/audit`);
});
```

**Ventajas**:
- ✅ Permite auditoría **real** con base de datos
- ✅ Verifica que tu lógica funciona correctamente
- ✅ Puede correr en paralelo con tu bot de WhatsApp
- ✅ Reutiliza toda tu lógica existente

**Cómo usarlo en Silver Fleet**:
1. Iniciar webhook: `npm run audit` (agrega script en package.json)
2. En Silver Fleet, configurar endpoint: `http://localhost:3001/webhook/audit`
3. Silver Fleet enviará requests simulando usuarios
4. Verificará respuestas y operaciones de BD

---

### Opción 2: **Auditoría Visual (Sin Endpoint)**

Si **NO quieres crear un endpoint**, usa auditoría visual:

**Carga tu proyecto ZIP en Silver Fleet**:
```
base-ts-baileys-postgres.zip
├── package.json          ← Detecta framework
├── src/
│   ├── flows/           ← Detecta flows como agentes
│   ├── services/        ← Detecta tools
│   └── database/        ← Detecta PostgreSQL
```

**Silver Fleet detectará automáticamente**:
- 🤖 **Agentes**: Cada flow con `addKeyword()` se convierte en un agente
- 🛠️ **Tools**: Funciones auxiliares (validaciones, APIs externas, etc.)
- 🗄️ **Bases de datos**: Conexiones a PostgreSQL/Supabase

**Limitaciones**:
- ❌ No verifica BD real (solo simula)
- ❌ No hace requests HTTP reales
- ✅ Útil para validar estructura y lógica

---

### Opción 3: **Hook con IA (Tu Enfoque Actual)**

Si creaste un **hook personalizado con IA**, debe exponer un endpoint:

```typescript
// src/ai-hook.ts
import { createAIHook } from './somewhere';

// ⚠️ NECESITAS ESTO para que Silver Fleet pueda auditar
export const aiHook = createAIHook({
  endpoint: '/webhook/ai',  // ← Silver Fleet necesita esto
  handler: async (message, context) => {
    // Tu lógica de IA
    return response;
  }
});

// 🔥 CRÍTICO: Debes exponer el endpoint
import express from 'express';
const app = express();
app.post('/webhook/ai', aiHook.handler);
app.listen(3001);
```

---

## 🎯 Recomendación para tu Proyecto

Basándome en **base-ts-baileys-postgres**, te sugiero:

### **Paso 1: Extraer lógica a funciones reutilizables**

```typescript
// src/agent-logic.ts (NUEVO)
export async function processUserMessage(input: {
  phone: string;
  message: string;
  conversationId: string;
  context?: any;
}) {
  // 1️⃣ Tu lógica de detección de intención
  const intent = detectIntent(input.message);
  
  // 2️⃣ Ejecutar tools según intención
  let response = '';
  switch (intent) {
    case 'consulta_precio':
      const producto = await buscarProducto(input.message);
      response = `El precio es $${producto.precio}`;
      break;
    case 'confirmar_pedido':
      await guardarPedido(input);
      response = 'Pedido confirmado ✅';
      break;
    // ... más casos
  }
  
  // 3️⃣ Guardar en BD
  await guardarConversacion({
    phone: input.phone,
    message: input.message,
    response,
    conversationId: input.conversationId
  });
  
  return response;
}
```

### **Paso 2: Usar la lógica en AMBOS lados**

**En tu bot de WhatsApp** (existente):
```typescript
// src/bot.ts
import { processUserMessage } from './agent-logic';

const flow = addKeyword('hola')
  .addAction(async (ctx, { flowDynamic }) => {
    const response = await processUserMessage({
      phone: ctx.from,
      message: ctx.body,
      conversationId: ctx.conversationId || `conv_${Date.now()}`
    });
    
    await flowDynamic(response);
  });
```

**En tu webhook de auditoría** (nuevo):
```typescript
// src/webhook-audit.ts
import express from 'express';
import { processUserMessage } from './agent-logic'; // ← MISMA LÓGICA

const app = express();
app.use(express.json());

app.post('/webhook/audit', async (req, res) => {
  const response = await processUserMessage(req.body);
  res.json({ response });
});

app.listen(3001);
```

---

## 📋 Checklist para Preparar tu Proyecto

### ✅ Para Auditoría Visual (Más Fácil)
- [ ] Comprimir proyecto en ZIP (excluir `node_modules`, `bot_sessions`)
- [ ] Asegurar que `package.json` lista dependencias (baileys, postgres, etc.)
- [ ] Comentarios JSDoc en funciones clave
- [ ] Estructura de carpetas clara (`src/flows/`, `src/services/`, etc.)

### ✅ Para Auditoría Real (Más Completo)
- [ ] Todo lo anterior +
- [ ] Crear `src/webhook-audit.ts` con endpoint HTTP
- [ ] Extraer lógica a funciones reutilizables
- [ ] Agregar script en `package.json`: `"audit": "ts-node src/webhook-audit.ts"`
- [ ] Probar endpoint manualmente con Postman/curl
- [ ] Configurar credenciales de BD en Silver Fleet

---

## 🧪 Ejemplo Completo: Webhook para tu Bot

```typescript
// src/webhook-audit.ts
import express from 'express';
import { pool } from './database/connection'; // Tu conexión existente
import { processUserMessage } from './agent-logic';

const app = express();
app.use(express.json());

/**
 * 🎯 Endpoint de auditoría
 * Formato compatible con Silver Fleet
 */
app.post('/webhook/audit', async (req, res) => {
  try {
    const {
      conversationId,
      phone,
      message,
      userName,
      timestamp
    } = req.body;
    
    console.log(`📩 [Audit] Mensaje de ${phone}: ${message}`);
    
    // Procesar con tu lógica existente
    const response = await processUserMessage({
      phone,
      message,
      conversationId,
      context: { userName, timestamp }
    });
    
    // Retornar en formato esperado
    res.json({
      conversationId,
      phone,
      response,
      timestamp: new Date().toISOString(),
      processed: true
    });
    
  } catch (error) {
    console.error('❌ Error en webhook:', error);
    res.status(500).json({
      error: error.message,
      conversationId: req.body.conversationId
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'audit-webhook' });
});

// Iniciar servidor
const PORT = process.env.AUDIT_PORT || 3001;
app.listen(PORT, () => {
  console.log(`✅ Webhook de auditoría corriendo en http://localhost:${PORT}`);
  console.log(`   Endpoint: POST http://localhost:${PORT}/webhook/audit`);
  console.log(`   Health: GET http://localhost:${PORT}/health`);
});

export default app;
```

**Agregar a `package.json`**:
```json
{
  "scripts": {
    "start": "ts-node src/bot.ts",
    "audit": "ts-node src/webhook-audit.ts",
    "dev:both": "concurrently \"npm run start\" \"npm run audit\""
  }
}
```

---

## 🎬 Flujo Completo de Auditoría

1. **Desarrollo normal**: Tu bot corre con `npm start` (WhatsApp)
2. **Para auditar**: Inicias webhook con `npm run audit` (HTTP en puerto 3001)
3. **En Silver Fleet**:
   - Cargas tu proyecto ZIP O configurar endpoint
   - Silver Fleet genera casos de prueba (personas simuladas)
   - Envía requests HTTP a `http://localhost:3001/webhook/audit`
   - Verifica respuestas y operaciones de BD
   - Genera reporte con análisis

---

## 📊 Payload Esperado por tu Webhook

Silver Fleet enviará requests con este formato:

```json
{
  "conversationId": "conv_1731509234567",
  "phone": "5491166758415",
  "userName": "Juan Pérez",
  "message": "Hola, quiero consultar por un presupuesto",
  "timestamp": "2025-11-13T18:30:00.000Z",
  "context": {
    "testCase": true,
    "auditId": "audit_123"
  }
}
```

Tu webhook debe responder:

```json
{
  "conversationId": "conv_1731509234567",
  "phone": "5491166758415",
  "response": "¡Claro! Para darte un presupuesto necesito saber...",
  "timestamp": "2025-11-13T18:30:01.234Z",
  "processed": true
}
```

---

## ❓ Preguntas Frecuentes

### ¿Puedo auditar sin crear un webhook?
✅ Sí, usa **auditoría visual** cargando tu proyecto ZIP. Silver Fleet simulará todo con IA.

### ¿El webhook reemplaza mi bot de WhatsApp?
❌ No, son paralelos. Tu bot sigue funcionando normalmente. El webhook es SOLO para testing.

### ¿Cómo comparto lógica entre bot y webhook?
✅ Extrae tu lógica a funciones en `src/agent-logic.ts` y úsalas en ambos.

### ¿Qué pasa con la base de datos?
✅ El webhook usa la **misma BD** que tu bot, pero con `conversationId` único para cada test.

---

## 🎯 Siguiente Paso

**Cuéntame más sobre tu hook con IA**:
1. ¿Ya tiene un endpoint HTTP expuesto?
2. ¿Qué formato de request/response usa?
3. ¿Qué puerto usa?

Con esa info puedo darte instrucciones **exactas** para configurarlo en Silver Fleet.
