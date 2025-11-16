/**
 * 💰 Extractor Automático de Precios
 * 
 * Extrae precios de:
 * - Conversaciones (mensajes del bot y usuario)
 * - Base de datos (campos con precios)
 * - System prompts de agentes
 */

export interface ExtractedPrice {
  value: number;
  originalText: string;
  source: 'conversation' | 'database' | 'prompt';
  context?: string; // Qué producto/servicio
  location?: string; // De dónde se extrajo
}

export interface PriceComparison {
  conversationId: string;
  conversationTitle: string;
  mentioned: ExtractedPrice[]; // Precios mencionados en conversación
  inDB: ExtractedPrice[]; // Precios en BD
  inPrompt: ExtractedPrice[]; // Precios en system prompt
  consistent: boolean; // Si todos coinciden
  discrepancies: string[]; // Lista de discrepancias
}

/**
 * Patrones para detectar precios en texto
 */
const PRICE_PATTERNS = [
  // $1000, $1.000, $1,000
  /\$\s*(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)/g,
  // 1000 pesos, 1.000 pesos, 1,000 pesos
  /(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)\s*pesos?/gi,
  // 1000 ARS, 1000 USD
  /(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)\s*(?:ARS|USD|EUR)/gi,
  // precio: 1000, cuesta 1000
  /(?:precio|cuesta|vale|total|monto|importe)[:=\s]+\$?\s*(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)/gi,
];

/**
 * Normaliza un número extraído (elimina separadores de miles)
 */
function normalizePrice(priceText: string): number {
  // Eliminar espacios
  let cleaned = priceText.trim();
  
  // Eliminar símbolo de moneda
  cleaned = cleaned.replace(/[$ARS|USD|EUR]/gi, '').trim();
  
  // Si tiene punto y coma, asumir: punto = miles, coma = decimales
  if (cleaned.includes('.') && cleaned.includes(',')) {
    // Ej: 1.000,50 → 1000.50
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  }
  // Si solo tiene puntos (ej: 1.000)
  else if (cleaned.includes('.') && !cleaned.includes(',')) {
    // Verificar si es decimal o miles
    const parts = cleaned.split('.');
    if (parts.length === 2 && parts[1].length === 2) {
      // Es decimal: 100.50
      // No hacer nada
    } else {
      // Es miles: 1.000 → 1000
      cleaned = cleaned.replace(/\./g, '');
    }
  }
  // Si solo tiene comas (ej: 1,000)
  else if (cleaned.includes(',') && !cleaned.includes('.')) {
    // Verificar si es decimal o miles
    const parts = cleaned.split(',');
    if (parts.length === 2 && parts[1].length === 2) {
      // Es decimal: 100,50 → 100.50
      cleaned = cleaned.replace(',', '.');
    } else {
      // Es miles: 1,000 → 1000
      cleaned = cleaned.replace(/,/g, '');
    }
  }
  
  const price = parseFloat(cleaned);
  return isNaN(price) ? 0 : price;
}

/**
 * Extrae precios de un texto
 */
export function extractPricesFromText(
  text: string, 
  source: 'conversation' | 'database' | 'prompt',
  context?: string
): ExtractedPrice[] {
  if (!text || typeof text !== 'string') return [];
  
  const prices: ExtractedPrice[] = [];
  const seenValues = new Set<number>(); // Evitar duplicados
  
  for (const pattern of PRICE_PATTERNS) {
    const matches = text.matchAll(pattern);
    
    for (const match of matches) {
      const originalText = match[0];
      const priceText = match[1] || match[0];
      const value = normalizePrice(priceText);
      
      // Filtrar valores muy bajos (probablemente no son precios)
      if (value < 1) continue;
      
      // Evitar duplicados exactos
      if (seenValues.has(value)) continue;
      seenValues.add(value);
      
      prices.push({
        value,
        originalText,
        source,
        context,
        location: text.substring(Math.max(0, match.index! - 50), Math.min(text.length, match.index! + 50))
      });
    }
  }
  
  return prices;
}

/**
 * Extrae precios de conversación completa
 */
export function extractPricesFromConversation(
  executionTrace: any[],
  conversationId: string
): ExtractedPrice[] {
  const prices: ExtractedPrice[] = [];
  
  for (const step of executionTrace) {
    // Mensaje del usuario
    const userMessage = step.input?.message || step.input?.body;
    if (userMessage) {
      const userPrices = extractPricesFromText(
        userMessage, 
        'conversation',
        'Mensaje del usuario'
      );
      prices.push(...userPrices);
    }
    
    // Respuesta del bot
    const botMessage = step.output?.response || step.output?.message || step.output?.text;
    if (botMessage) {
      const botPrices = extractPricesFromText(
        botMessage,
        'conversation',
        'Respuesta del bot'
      );
      prices.push(...botPrices);
    }
  }
  
  return prices;
}

/**
 * Extrae precios de cambios en la base de datos
 */
export function extractPricesFromDatabase(
  databaseChanges: any[]
): ExtractedPrice[] {
  const prices: ExtractedPrice[] = [];
  
  // Campos comunes que contienen precios
  const priceFields = [
    'precio', 'price', 'cost', 'costo',
    'total', 'amount', 'monto',
    'valor', 'value',
    'importe', 'subtotal',
    'precio_unitario', 'unit_price'
  ];
  
  for (const change of databaseChanges) {
    const record = change.after || change.record || change.before;
    if (!record || typeof record !== 'object') continue;
    
    // Buscar en campos conocidos
    for (const field of priceFields) {
      const value = record[field];
      
      if (typeof value === 'number' && value > 0) {
        prices.push({
          value,
          originalText: value.toString(),
          source: 'database',
          context: `${change.table}.${field}`,
          location: change.table
        });
      } else if (typeof value === 'string') {
        const extracted = extractPricesFromText(value, 'database', `${change.table}.${field}`);
        prices.push(...extracted);
      }
    }
    
    // Buscar en cualquier campo que contenga "precio" o "price"
    for (const [key, value] of Object.entries(record)) {
      if (!/precio|price|cost|costo|total|monto/i.test(key)) continue;
      if (priceFields.includes(key.toLowerCase())) continue; // Ya procesado
      
      if (typeof value === 'number' && value > 0) {
        prices.push({
          value,
          originalText: value.toString(),
          source: 'database',
          context: `${change.table}.${key}`,
          location: change.table
        });
      }
    }
  }
  
  return prices;
}

/**
 * Extrae precios de system prompts
 */
export function extractPricesFromPrompts(
  agents: Array<{ name: string; prompt: string }>
): ExtractedPrice[] {
  const prices: ExtractedPrice[] = [];
  
  for (const agent of agents) {
    if (!agent.prompt) continue;
    
    const extracted = extractPricesFromText(
      agent.prompt,
      'prompt',
      agent.name
    );
    
    prices.push(...extracted);
  }
  
  return prices;
}

/**
 * Compara precios entre fuentes
 */
export function comparePrices(
  mentioned: ExtractedPrice[],
  inDB: ExtractedPrice[],
  inPrompt: ExtractedPrice[]
): { consistent: boolean; discrepancies: string[] } {
  const discrepancies: string[] = [];
  
  // Crear sets de valores únicos
  const mentionedValues = new Set(mentioned.map(p => Math.round(p.value)));
  const dbValues = new Set(inDB.map(p => Math.round(p.value)));
  const promptValues = new Set(inPrompt.map(p => Math.round(p.value)));
  
  // Verificar si hay precios mencionados que NO están en BD
  for (const price of mentioned) {
    const rounded = Math.round(price.value);
    if (!dbValues.has(rounded)) {
      discrepancies.push(
        `Precio $${price.value} mencionado en conversación NO se encontró en BD`
      );
    }
  }
  
  // Verificar si hay precios en BD que NO fueron mencionados
  for (const price of inDB) {
    const rounded = Math.round(price.value);
    if (mentioned.length > 0 && !mentionedValues.has(rounded)) {
      discrepancies.push(
        `Precio $${price.value} guardado en BD NO fue mencionado en conversación`
      );
    }
  }
  
  // Verificar si hay precios en prompt que NO coinciden con lo mencionado/guardado
  for (const price of inPrompt) {
    const rounded = Math.round(price.value);
    if (mentioned.length > 0 && !mentionedValues.has(rounded) && !dbValues.has(rounded)) {
      discrepancies.push(
        `Precio $${price.value} en system prompt NO coincide con conversación ni BD`
      );
    }
  }
  
  return {
    consistent: discrepancies.length === 0,
    discrepancies
  };
}

/**
 * Genera comparación completa de precios para un resultado de auditoría
 */
export function generatePriceComparison(
  result: any,
  agents: Array<{ name: string; prompt: string }>
): PriceComparison {
  // Extraer precios de todas las fuentes
  const mentioned = extractPricesFromConversation(
    result.executionTrace || [],
    result.id
  );
  
  const inDB = extractPricesFromDatabase(
    result.databaseActivity?.changes || []
  );
  
  const inPrompt = extractPricesFromPrompts(agents);
  
  // Comparar
  const { consistent, discrepancies } = comparePrices(mentioned, inDB, inPrompt);
  
  return {
    conversationId: result.id,
    conversationTitle: result.testCase?.title || 'Sin título',
    mentioned,
    inDB,
    inPrompt,
    consistent,
    discrepancies
  };
}

