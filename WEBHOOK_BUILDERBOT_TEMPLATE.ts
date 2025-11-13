/**
 * 🎯 Webhook HTTP para Auditoría - BuilderBot/Baileys
 * 
 * Este archivo permite auditar tu bot de WhatsApp SIN afectar
 * su funcionamiento normal. Corre en paralelo.
 * 
 * INSTRUCCIONES:
 * 1. Copia este archivo a: src/webhook-audit.ts
 * 2. Importa tu lógica de agente existente
 * 3. Ejecuta: npm run audit (agrega script en package.json)
 * 4. Configura en Silver Fleet: http://localhost:3001/webhook/audit
 */

import express, { Request, Response } from 'express';
import type { BotContext } from '@builderbot/bot';

// ============================================
// 🔧 CONFIGURACIÓN - AJUSTA ESTOS IMPORTS
// ============================================

// Importa tu lógica existente aquí
// Ejemplo: Si tienes src/flows/main.flow.ts
// import { processUserMessage } from './flows/main.flow';

// O si tienes utils/agent-logic.ts
// import { handleMessage } from './utils/agent-logic';

// ============================================
// 📋 TIPOS
// ============================================

interface AuditPayload {
  conversationId: string;
  phone: string;
  message: string;
  userName?: string;
  timestamp?: string;
  context?: any;
}

interface AuditResponse {
  conversationId: string;
  phone: string;
  response: string;
  timestamp: string;
  metadata?: any;
}

// ============================================
// 🧠 LÓGICA DEL AGENTE (Wrapper)
// ============================================

/**
 * Procesa mensaje simulando el comportamiento del bot
 * 
 * OPCIÓN 1: Si extraíste tu lógica a funciones reutilizables
 * async function processMessage(payload: AuditPayload): Promise<string> {
 *   return await processUserMessage({
 *     from: payload.phone,
 *     body: payload.message,
 *     conversationId: payload.conversationId
 *   });
 * }
 * 
 * OPCIÓN 2: Si tu lógica está en flows con addKeyword()
 */
async function processMessage(payload: AuditPayload): Promise<string> {
  const { message, phone, conversationId } = payload;
  
  console.log(`[Audit] Procesando mensaje de ${phone}: ${message}`);
  
  // TODO: Reemplaza esto con tu lógica real
  // Ejemplos de cómo podrías estructurarlo:
  
  // Detectar intención
  const lowerMessage = message.toLowerCase();
  
  if (lowerMessage.includes('hola') || lowerMessage.includes('buen')) {
    return '¡Hola! Soy el asistente de Obra Seco. ¿En qué puedo ayudarte hoy?';
  }
  
  if (lowerMessage.includes('precio') || lowerMessage.includes('cuanto')) {
    // Aquí iría tu lógica de consulta a BD
    // const producto = await buscarProducto(message);
    // return `El precio de ${producto.nombre} es $${producto.precio}`;
    return 'Para darte un presupuesto exacto necesito más detalles. ¿Qué tipo de obra necesitas?';
  }
  
  if (lowerMessage.includes('pedido') || lowerMessage.includes('orden')) {
    // Aquí iría tu lógica de guardar pedido
    // await guardarPedido({ phone, conversationId, message });
    return 'Perfecto, registré tu pedido. Te contactaremos pronto para coordinar los detalles.';
  }
  
  // Respuesta por defecto
  return 'Entiendo. ¿Podrías darme más detalles sobre lo que necesitas?';
}

// ============================================
// 🌐 SERVIDOR EXPRESS
// ============================================

const app = express();
app.use(express.json());

// CORS (opcional, para testing desde otros dominios)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

/**
 * 🎯 Endpoint principal de auditoría
 * POST /webhook/audit
 * 
 * Formato esperado por Silver Fleet
 */
app.post('/webhook/audit', async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  try {
    const payload: AuditPayload = req.body;
    
    // Validación básica
    if (!payload.conversationId || !payload.phone || !payload.message) {
      return res.status(400).json({
        error: 'Missing required fields: conversationId, phone, message'
      });
    }
    
    console.log(`\n📩 [Audit] Nueva petición`);
    console.log(`   Conversación: ${payload.conversationId}`);
    console.log(`   Usuario: ${payload.userName || 'Anónimo'} (${payload.phone})`);
    console.log(`   Mensaje: "${payload.message}"`);
    
    // Procesar mensaje con tu lógica
    const responseText = await processMessage(payload);
    
    const processingTime = Date.now() - startTime;
    console.log(`   ✅ Respuesta generada en ${processingTime}ms`);
    console.log(`   Respuesta: "${responseText}"\n`);
    
    // Responder en formato esperado
    const response: AuditResponse = {
      conversationId: payload.conversationId,
      phone: payload.phone,
      response: responseText,
      timestamp: new Date().toISOString(),
      metadata: {
        processingTimeMs: processingTime,
        source: 'audit-webhook'
      }
    };
    
    res.json(response);
    
  } catch (error: any) {
    console.error('❌ [Audit] Error procesando request:', error);
    
    res.status(500).json({
      error: 'Internal server error',
      message: error.message,
      conversationId: req.body?.conversationId
    });
  }
});

/**
 * 🏥 Health check
 * GET /health
 */
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'builderbot-audit-webhook',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

/**
 * 📊 Info del webhook
 * GET /
 */
app.get('/', (req: Request, res: Response) => {
  res.json({
    name: 'BuilderBot Audit Webhook',
    version: '1.0.0',
    endpoints: {
      audit: 'POST /webhook/audit',
      health: 'GET /health'
    },
    usage: {
      silverfleet: 'Configure endpoint: http://localhost:3001/webhook/audit',
      payload: {
        conversationId: 'string (required)',
        phone: 'string (required)',
        message: 'string (required)',
        userName: 'string (optional)',
        timestamp: 'string (optional)',
        context: 'object (optional)'
      }
    }
  });
});

// ============================================
// 🚀 INICIAR SERVIDOR
// ============================================

const PORT = process.env.AUDIT_PORT || 3001;
const HOST = process.env.AUDIT_HOST || 'localhost';

app.listen(PORT, () => {
  console.log('\n' + '='.repeat(50));
  console.log('🎯 BuilderBot Audit Webhook');
  console.log('='.repeat(50));
  console.log(`✅ Servidor corriendo en http://${HOST}:${PORT}`);
  console.log(`📍 Endpoint de auditoría: POST http://${HOST}:${PORT}/webhook/audit`);
  console.log(`🏥 Health check: GET http://${HOST}:${PORT}/health`);
  console.log('='.repeat(50));
  console.log('\n💡 Configuración para Silver Fleet:');
  console.log(`   URL: http://${HOST}:${PORT}/webhook/audit`);
  console.log('\n🔥 Presiona Ctrl+C para detener\n');
});

// Manejo de errores no capturados
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

export default app;
