import { GoogleGenAI } from "@google/genai";
import { getRealDatabaseAuditor } from './realDatabaseAuditor';
import type { DatabaseDiscrepancy } from '../types';

/**
 * Extrae "promesas" y afirmaciones del bot que deben ser verificadas en la BD
 */
export const extractBotPromises = async (
  botResponse: string,
  userMessage: string,
  conversationHistory: string,
  language: string = 'es'
): Promise<BotPromise[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `
  Eres un auditor técnico. Analiza la respuesta del bot y extrae TODAS las afirmaciones verificables.

  **Contexto de conversación previa:**
  ${conversationHistory}

  **Usuario dijo:** "${userMessage}"
  
  **Bot respondió:** "${botResponse}"

  **TU TAREA:** Identifica QUÉ afirmó el bot que pueda verificarse en una base de datos.

  **CATEGORÍAS DE AFIRMACIONES:**

  1. **PRICE_CLAIM** - El bot mencionó un precio específico:
     
     ⚠️ IMPORTANTE - Detectar PRECIO UNITARIO vs PRECIO TOTAL:
     
     A. **Precio UNITARIO** (precio por unidad):
        - "Cuesta $500 por m²" → Precio unitario
        - "El precio es $1200 el litro" → Precio unitario
        - "$45 cada uno" → Precio unitario
        Formato: { 
          type: "PRICE_CLAIM", 
          value: 500, 
          product: "cielorraso", 
          priceType: "UNIT",
          unit: "m²"
        }
     
     B. **Precio TOTAL** (para una cantidad específica):
        - "18 m² te salen $26000 en total" → Precio total de 18 unidades
        - "5 litros por $6000" → Precio total de 5 litros
        - "Total: $45000 por 100 m²" → Precio total
        Formato: { 
          type: "PRICE_CLAIM", 
          value: 26000, 
          product: "cielorraso", 
          priceType: "TOTAL",
          quantity: 18,
          unit: "m²"
        }
     
     📌 CLAVE: Si menciona CANTIDAD + PRECIO, es PRECIO TOTAL
     📌 CLAVE: Si dice "por m²", "cada uno", "por unidad", es PRECIO UNITARIO
  
  2. **APPOINTMENT_CREATED** - El bot confirmó que agendó/reservó:
     - Ejemplos: "Te agendé para mañana 15:00", "Reservé tu cita", "Ya está agendado"
     - Formato: { type: "APPOINTMENT_CREATED", date: "2025-10-29", time: "15:00", description: "..." }
  
  3. **ORDER_PLACED** - El bot dice que creó un pedido/compra:
     - Ejemplos: "Tu pedido fue registrado", "Compra confirmada", "Pedido #123 creado"
     - Formato: { type: "ORDER_PLACED", total: 1500, items: ["item1", "item2"] }
  
  4. **INFO_PROVIDED** - El bot proporcionó datos específicos de productos/servicios:
     - Ejemplos: "Tenemos 50 en stock", "Disponible en 3 colores", "Rendimiento: 10m²/litro"
     - Formato: { type: "INFO_PROVIDED", field: "stock", value: 50, product: "X" }
  
  5. **USER_BLOCKED** - El bot indica que bloqueó/no puede continuar:
     - Ejemplos: "No puedo ayudarte más", "Conversación finalizada", "Debes hablar con un humano"
     - Formato: { type: "USER_BLOCKED", reason: "..." }
  
  6. **DATA_SAVED** - El bot confirmó que guardó datos del usuario:
     - Ejemplos: "Guardé tu email", "Anoté tu dirección", "Registré tu nombre"
     - Formato: { type: "DATA_SAVED", field: "email", value: "..." }

  **REGLAS IMPORTANTES:**
  - Si el bot solo está PREGUNTANDO o EXPLICANDO sin afirmar algo concreto, NO extraigas nada
  - Para precios, LEE CUIDADOSAMENTE si es unitario o total
  - Si hay cantidad + precio, ES PRECIO TOTAL
  - Si dice "por", "cada", "el", ES PRECIO UNITARIO
  - Si dice "te agendé", "reservé", "guardé" → es una promesa verificable
  - Solo incluye afirmaciones que puedan verificarse en base de datos

  **EJEMPLOS REALES:**
  
  Bot: "18 m² de cielorraso te salen $26000 en total"
  → { type: "PRICE_CLAIM", value: 26000, product: "cielorraso", priceType: "TOTAL", quantity: 18, unit: "m²" }
  
  Bot: "El cielorraso cuesta $500 por m²"
  → { type: "PRICE_CLAIM", value: 500, product: "cielorraso", priceType: "UNIT", unit: "m²" }
  
  Bot: "Son 10 litros por $12000"
  → { type: "PRICE_CLAIM", value: 12000, product: "X", priceType: "TOTAL", quantity: 10, unit: "litros" }

  **RESPUESTA:**
  Devuelve un array JSON. Si NO hay afirmaciones verificables, devuelve [].
  
  Formato: [{ type: "...", ...detalles }]
  `;

  try {
    // 🚀 Agregar timeout de 30 segundos para extractBotPromises
    const geminiPromise = ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      },
    });
    
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Timeout: extractBotPromises excedió 30s')), 30000)
    );
    
    const response = await Promise.race([geminiPromise, timeoutPromise]) as any;
    
    const promises = JSON.parse(response.text.trim());
    console.log(`[Verifier] Extraídas ${promises.length} promesas del bot:`, promises);
    return promises;
  } catch (error) {
    console.error('[Verifier] Error extracting promises:', error);
    return [];
  }
};

interface BotPromise {
  type: 'PRICE_CLAIM' | 'APPOINTMENT_CREATED' | 'ORDER_PLACED' | 'INFO_PROVIDED' | 'USER_BLOCKED' | 'DATA_SAVED';
  [key: string]: any;
}

/**
 * Verifica las promesas del bot contra la base de datos real
 */
export const verifyBotPromises = async (
  conversationId: string,
  promises: BotPromise[],
  userId: string
): Promise<DatabaseDiscrepancy[]> => {
  const auditor = getRealDatabaseAuditor(conversationId);
  if (!auditor) {
    console.log('[Verifier] No hay auditor de BD real configurado');
    return [];
  }

  const discrepancies: DatabaseDiscrepancy[] = [];

  for (const promise of promises) {
    console.log(`[Verifier] Verificando promesa: ${promise.type}`, promise);

    try {
      switch (promise.type) {
        case 'PRICE_CLAIM':
          await verifyPriceClaim(auditor, promise, discrepancies);
          break;
        
        case 'APPOINTMENT_CREATED':
          await verifyAppointmentCreated(auditor, promise, userId, discrepancies);
          break;
        
        case 'ORDER_PLACED':
          await verifyOrderPlaced(auditor, promise, userId, discrepancies);
          break;
        
        case 'INFO_PROVIDED':
          await verifyInfoProvided(auditor, promise, discrepancies);
          break;
        
        case 'USER_BLOCKED':
          await verifyUserNotBlocked(auditor, userId, discrepancies);
          break;
        
        case 'DATA_SAVED':
          await verifyDataSaved(auditor, promise, userId, discrepancies);
          break;
      }
    } catch (error) {
      console.error(`[Verifier] Error verificando ${promise.type}:`, error);
    }
  }

  return discrepancies;
};

// Verificadores específicos

async function verifyPriceClaim(auditor: any, promise: any, discrepancies: DatabaseDiscrepancy[]) {
  const { value: claimedPrice, product, productId, priceType, quantity, unit } = promise;
  
  console.log(`[Verifier] 💰 Verificando precio: ${product}`);
  console.log(`   Tipo: ${priceType || 'UNIT'} | Valor: $${claimedPrice} | Cantidad: ${quantity || 1} ${unit || ''}`);
  
  // Search by name using intelligent search (now with auto-detected mappings!)
  console.log(`[Verifier] Buscando producto por nombre...`);
  const foundProduct = await auditor.findProductByName(product);
  
  if (!foundProduct) {
    console.log(`[Verifier] ⚠️ No se pudo verificar precio (producto no encontrado en BD)`);
    return;
  }
  
  // Get price field from auto-detected mappings
  const priceField = auditor.fieldMappings?.productPriceField || 'precio';
  const productTable = auditor.fieldMappings?.productTable || 'productos';
  
  const realUnitPrice = parseFloat(foundProduct[priceField]);
  console.log(`   BD tiene precio unitario: $${realUnitPrice}`);
  
  // 🔍 CLAVE: Determinar qué precio compararamos
  let expectedPrice: number;
  let description: string;
  
  if (priceType === 'TOTAL' && quantity && quantity > 1) {
    // Bot dijo precio TOTAL → calcular precio unitario
    const claimedUnitPrice = claimedPrice / quantity;
    expectedPrice = claimedUnitPrice;
    
    console.log(`   Bot dijo TOTAL $${claimedPrice} para ${quantity} ${unit}`);
    console.log(`   Eso es $${claimedUnitPrice.toFixed(2)} por ${unit}`);
    
    description = `Bot afirmó que ${quantity} ${unit} de "${product}" cuestan $${claimedPrice} en total (equivalente a $${claimedUnitPrice.toFixed(2)} por ${unit})`;
  } else {
    // Bot dijo precio UNITARIO directamente
    expectedPrice = claimedPrice;
    description = `Bot afirmó que "${product}" cuesta $${claimedPrice} por ${unit || 'unidad'}`;
  }
  
  // Compare unit prices
  const priceDifference = Math.abs(realUnitPrice - expectedPrice);
  const priceTolerancePercent = 0.05; // 5% tolerance
  const priceToleranceAbsolute = realUnitPrice * priceTolerancePercent;
  
  console.log(`   Comparando: Bot dice $${expectedPrice.toFixed(2)} vs BD tiene $${realUnitPrice}`);
  console.log(`   Diferencia: $${priceDifference.toFixed(2)} (tolerancia: $${priceToleranceAbsolute.toFixed(2)})`);
  
  if (priceDifference > priceToleranceAbsolute && priceDifference > 1) {
    // Significant price discrepancy
    const percentDiff = ((priceDifference / realUnitPrice) * 100).toFixed(1);
    
    auditor.discrepancies.push({
      type: 'incorrect_data',
      severity: 'critical',
      description: `${description}, pero en BD el precio unitario es $${realUnitPrice} (diferencia del ${percentDiff}%)`,
      expected: expectedPrice,
      actual: realUnitPrice,
      table: product, // Usar el nombre del producto en lugar de la tabla
      timestamp: Date.now()
    });
    console.log(`   ❌ DISCREPANCIA DE PRECIO DETECTADA (${percentDiff}% de diferencia)`);
  } else {
    console.log(`   ✅ Precio correcto (dentro del margen de tolerancia)`);
  }
}

async function verifyAppointmentCreated(auditor: any, promise: any, userId: string, discrepancies: DatabaseDiscrepancy[]) {
  const { date, time, description } = promise;
  
  console.log(`[Verifier] Verificando cita: ${date} ${time} para ${userId}`);
  
  await auditor.verifyRecordExists(
    'citas',
    {
      usuario_id: userId,
      fecha: date,
      hora: time
    },
    `Bot prometió agendar cita para ${date} a las ${time}`
  );
}

async function verifyOrderPlaced(auditor: any, promise: any, userId: string, discrepancies: DatabaseDiscrepancy[]) {
  const { total, items } = promise;
  
  console.log(`[Verifier] Verificando pedido: total ${total} para ${userId}`);
  
  await auditor.verifyRecordExists(
    'pedidos',
    {
      usuario_id: userId,
      total: total
    },
    `Bot prometió crear pedido con total ${total}`
  );
}

async function verifyInfoProvided(auditor: any, promise: any, discrepancies: DatabaseDiscrepancy[]) {
  const { field, value, product, productId } = promise;
  
  console.log(`[Verifier] Verificando info: ${field} = ${value} en ${product}`);
  
  if (productId) {
    await auditor.verifyFieldValue(
      'productos',
      productId,
      field,
      value,
      `Bot informó que ${field} de "${product}" es ${value}`
    );
  }
}

async function verifyUserNotBlocked(auditor: any, userId: string, discrepancies: DatabaseDiscrepancy[]) {
  console.log(`[Verifier] Verificando que usuario ${userId} NO esté bloqueado`);
  
  await auditor.verifyNotBlocked(
    userId,
    'Bot bloqueó al usuario durante la conversación activa'
  );
}

async function verifyDataSaved(auditor: any, promise: any, userId: string, discrepancies: DatabaseDiscrepancy[]) {
  const { field, value } = promise;
  
  console.log(`[Verifier] Verificando dato guardado: ${field} = ${value} para ${userId}`);
  
  await auditor.verifyFieldValue(
    'usuarios',
    userId,
    field,
    value,
    `Bot prometió guardar ${field}: ${value}`
  );
}

