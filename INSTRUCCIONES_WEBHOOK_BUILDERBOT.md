# 🎯 Cómo Agregar Endpoint HTTP a tu Proyecto BuilderBot

## Situación Actual

Tu proyecto **base-ts-baileys-postgres**:
- ✅ Funciona como bot de WhatsApp con Baileys
- ❌ NO tiene endpoint HTTP
- ❌ Silver Fleet NO puede auditarlo directamente

## Solución: Agregar Webhook Paralelo

### Paso 1: Copiar el Archivo Template

1. Toma el archivo `WEBHOOK_BUILDERBOT_TEMPLATE.ts` de Silver Fleet
2. Cópialo a tu proyecto: `src/webhook-audit.ts`

```bash
# Desde tu proyecto builderbot
cp /ruta/a/WEBHOOK_BUILDERBOT_TEMPLATE.ts src/webhook-audit.ts
```

### Paso 2: Instalar Dependencias

```bash
cd base-ts-baileys-postgres
npm install express
npm install -D @types/express @types/node
```

### Paso 3: Adaptar la Lógica

Abre `src/webhook-audit.ts` y ajusta la función `processMessage()`:

```typescript
// ANTES (template genérico):
async function processMessage(payload: AuditPayload): Promise<string> {
  // Lógica de ejemplo
  if (message.includes('hola')) return 'Hola!';
  return 'Respuesta por defecto';
}

// DESPUÉS (tu lógica real):
import { handleIncomingMessage } from './flows/main'; // Tu archivo real

async function processMessage(payload: AuditPayload): Promise<string> {
  // Simular contexto de BuilderBot
  const mockContext = {
    from: payload.phone,
    body: payload.message,
    pushName: payload.userName || 'Usuario',
  };
  
  // Usar tu lógica existente
  const response = await handleIncomingMessage(mockContext);
  return response;
}
```

### Paso 4: Agregar Script al package.json

```json
{
  "scripts": {
    "start": "ts-node src/app.ts",
    "dev": "nodemon src/app.ts",
    "audit": "ts-node src/webhook-audit.ts",
    "dev:both": "concurrently \"npm run dev\" \"npm run audit\""
  },
  "devDependencies": {
    "concurrently": "^8.0.0"
  }
}
```

### Paso 5: Iniciar el Webhook

```bash
# Terminal 1: Tu bot de WhatsApp (normal)
npm run dev

# Terminal 2: Webhook de auditoría (nuevo)
npm run audit

# O ambos juntos:
npm run dev:both
```

Verás algo como:
```
==================================================
🎯 BuilderBot Audit Webhook
==================================================
✅ Servidor corriendo en http://localhost:3001
📍 Endpoint de auditoría: POST http://localhost:3001/webhook/audit
🏥 Health check: GET http://localhost:3001/health
==================================================
```

### Paso 6: Configurar en Silver Fleet

1. Abre Silver Fleet: `http://localhost:3000`
2. Sube tu proyecto ZIP (opcional, para auditoría visual)
3. En "Endpoints de Agentes", ingresa:
   ```
   http://localhost:3001/webhook/audit
   ```
4. Haz clic en "🧪 Testear Salud del Endpoint"
5. Si responde ✅, procede con la auditoría

---

## 📋 Estructura Final de tu Proyecto

```
base-ts-baileys-postgres/
├── src/
│   ├── app.ts              ← Tu bot de WhatsApp (sin cambios)
│   ├── flows/
│   │   └── main.ts         ← Tus flows existentes
│   ├── database/
│   │   └── queries.ts      ← Tu lógica de BD
│   └── webhook-audit.ts    ← NUEVO: Webhook para auditoría
├── package.json            ← Agregar script "audit"
├── tsconfig.json
└── .env
```

---

## 🎯 Ventajas de Este Enfoque

1. **No Modifica tu Bot**: El bot sigue funcionando igual en WhatsApp
2. **Paralelo**: Webhook corre en puerto diferente (3001)
3. **Reutiliza Lógica**: Importa tus funciones existentes
4. **Opcional**: Solo inicias webhook cuando quieres auditar
5. **Misma BD**: Usa la misma conexión PostgreSQL

---

## 🧪 Probar el Webhook Manualmente

```bash
# Desde otra terminal
curl -X POST http://localhost:3001/webhook/audit \
  -H "Content-Type: application/json" \
  -d '{
    "conversationId": "test_123",
    "phone": "5491166758415",
    "message": "Hola, necesito información",
    "userName": "Test User"
  }'
```

Deberías recibir:
```json
{
  "conversationId": "test_123",
  "phone": "5491166758415",
  "response": "¡Hola! Soy el asistente de Obra Seco...",
  "timestamp": "2025-11-13T18:30:00.000Z",
  "metadata": {
    "processingTimeMs": 45,
    "source": "audit-webhook"
  }
}
```

---

## ❓ Preguntas Frecuentes

### ¿Afecta a mi bot de producción?
❌ **No**. El webhook es completamente separado. Tu bot sigue funcionando en WhatsApp sin cambios.

### ¿Necesito mantener el webhook siempre prendido?
❌ **No**. Solo lo inicias cuando quieres hacer auditorías. Luego lo apagas.

### ¿Puedo usar la misma base de datos?
✅ **Sí**. El webhook usa las mismas credenciales de PostgreSQL que tu bot.

### ¿Qué pasa si mi lógica está toda en flows con addKeyword()?
💡 Necesitas extraer la lógica a funciones reutilizables. Te ayudo con eso si me compartes tu código.

---

## 🚀 Siguiente Paso

**Compárteme tu `src/app.ts` o el archivo principal** de tu bot para:
1. Ver cómo estructuras los flows
2. Ayudarte a extraer la lógica
3. Adaptar el template específicamente para tu proyecto

Con eso te doy el webhook **listo para copiar y pegar**, sin modificar nada de tu bot actual.
