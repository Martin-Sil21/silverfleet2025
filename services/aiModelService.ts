/**
 * 🤖 AI Model Service - Sistema unificado de fallback automático
 * 
 * Prioridad de modelos:
 * 1. Gemini 2.5 Flash (rápido, económico)
 * 2. Gemini 1.5 Flash (fallback si 2.5 no disponible)
 * 3. OpenAI GPT-4o-mini (fallback final si Gemini falla)
 * 
 * Características:
 * - Reintentos automáticos con backoff exponencial
 * - Detección inteligente de errores (503, 429, rate limits)
 * - Tracking de costos por modelo
 * - Logging detallado para debugging
 */

import { GoogleGenAI, Type } from "@google/genai";
import OpenAI from "openai";
import { costTracker } from './costTracker';

// ==================== TIPOS ====================

export type AIModel = 'gemini-2.5-flash' | 'gemini-1.5-flash' | 'gpt-4o-mini';

export interface AIGenerationConfig {
  model?: AIModel; // Opcional: fuerza un modelo específico
  temperature?: number;
  maxOutputTokens?: number;
  responseMimeType?: string;
  responseSchema?: any;
}

export interface AIGenerationResult {
  text: string;
  modelUsed: AIModel;
  usageMetadata?: {
    promptTokens: number;
    responseTokens: number;
    totalTokens: number;
  };
}

// ==================== CONFIGURACIÓN ====================

const GEMINI_API_KEY = (import.meta as any).env?.VITE_GEMINI_API_KEY || 
                       process.env.GEMINI_API_KEY || 
                       process.env.API_KEY || '';

const OPENAI_API_KEY = (import.meta as any).env?.VITE_OPENAI_API_KEY || 
                       process.env.OPENAI_API_KEY || '';

// Prioridad de modelos (de mayor a menor)
const MODEL_PRIORITY: AIModel[] = [
  'gemini-2.5-flash',
  'gemini-1.5-flash',
  'gpt-4o-mini'
];

// Mapeo de modelos Gemini a sus nombres reales en la API
const GEMINI_MODEL_NAMES: Record<string, string> = {
  'gemini-2.5-flash': 'gemini-2.0-flash-exp', // 2.5 experimental
  'gemini-1.5-flash': 'gemini-1.5-flash'
};

// ==================== INSTANCIAS ====================

let geminiInstance: GoogleGenAI | null = null;
let openaiInstance: OpenAI | null = null;

function getGeminiInstance(): GoogleGenAI {
  if (!geminiInstance) {
    if (!GEMINI_API_KEY) {
      throw new Error('❌ Gemini API key not configured. Set VITE_GEMINI_API_KEY or API_KEY in .env');
    }
    geminiInstance = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  }
  return geminiInstance;
}

function getOpenAIInstance(): OpenAI {
  if (!openaiInstance) {
    if (!OPENAI_API_KEY) {
      throw new Error('❌ OpenAI API key not configured. Set VITE_OPENAI_API_KEY in .env');
    }
    openaiInstance = new OpenAI({ 
      apiKey: OPENAI_API_KEY,
      dangerouslyAllowBrowser: true // ✅ Permitir uso en navegador (solo para desarrollo/demo)
    });
  }
  return openaiInstance;
}

// ==================== UTILIDADES ====================

/**
 * Determina si un error es recuperable (503, 429, rate limits)
 */
function isRetryableError(error: any): boolean {
  const errorMsg = error?.message || '';
  const errorStr = JSON.stringify(error);
  const nestedMsg = error?.error?.message || '';
  const statusCode = error?.error?.code || error?.code || error?.status;
  
  const isOverloaded = 
    errorMsg.includes('503') || 
    errorMsg.includes('overloaded') || 
    errorMsg.includes('UNAVAILABLE') ||
    nestedMsg.includes('overloaded') ||
    nestedMsg.includes('UNAVAILABLE') ||
    errorStr.includes('503') ||
    errorStr.includes('overloaded') ||
    errorStr.includes('UNAVAILABLE') ||
    statusCode === 503;
  
  const isRateLimit = 
    errorMsg.includes('429') || 
    errorMsg.includes('quota') || 
    errorMsg.includes('rate limit') ||
    nestedMsg.includes('429') ||
    nestedMsg.includes('quota') ||
    nestedMsg.includes('rate limit') ||
    errorStr.includes('429') ||
    statusCode === 429;
  
  return isOverloaded || isRateLimit;
}

/**
 * Delay con backoff exponencial
 */
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Convierte schema de Gemini a formato OpenAI
 */
function convertSchemaForOpenAI(geminiSchema: any): any {
  if (!geminiSchema) return undefined;
  
  // OpenAI usa JSON Schema estándar, Gemini usa Type.OBJECT
  // Hacer conversión básica
  return geminiSchema;
}

// ==================== LLAMADAS A MODELOS ====================

/**
 * Genera contenido con Gemini
 */
async function generateWithGemini(
  model: 'gemini-2.5-flash' | 'gemini-1.5-flash',
  prompt: string,
  config: AIGenerationConfig
): Promise<AIGenerationResult> {
  const gemini = getGeminiInstance();
  const modelName = GEMINI_MODEL_NAMES[model];
  
  console.log(`   🤖 Intentando con ${model} (${modelName})...`);
  
  const geminiConfig: any = {
    temperature: config.temperature,
    maxOutputTokens: config.maxOutputTokens,
  };
  
  if (config.responseMimeType) {
    geminiConfig.responseMimeType = config.responseMimeType;
  }
  
  if (config.responseSchema) {
    geminiConfig.responseSchema = config.responseSchema;
  }
  
  const response = await gemini.models.generateContent({
    model: modelName,
    contents: prompt,
    config: geminiConfig
  });
  
  const usage = response.usageMetadata;
  
  return {
    text: response.text,
    modelUsed: model,
    usageMetadata: usage ? {
      promptTokens: usage.promptTokenCount || 0,
      responseTokens: usage.candidatesTokenCount || 0,
      totalTokens: usage.totalTokenCount || 0
    } : undefined
  };
}

/**
 * Genera contenido con OpenAI
 */
async function generateWithOpenAI(
  prompt: string,
  config: AIGenerationConfig
): Promise<AIGenerationResult> {
  const openai = getOpenAIInstance();
  
  console.log(`   🤖 Intentando con OpenAI GPT-4o-mini...`);
  
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'user', content: prompt }
  ];
  
  const completionConfig: OpenAI.Chat.ChatCompletionCreateParams = {
    model: 'gpt-4o-mini',
    messages,
    temperature: config.temperature,
    max_tokens: config.maxOutputTokens,
  };
  
  // OpenAI soporta JSON mode
  if (config.responseMimeType === 'application/json') {
    completionConfig.response_format = { type: 'json_object' };
  }
  
  const response = await openai.chat.completions.create(completionConfig);
  
  const usage = response.usage;
  
  return {
    text: response.choices[0]?.message?.content || '',
    modelUsed: 'gpt-4o-mini',
    usageMetadata: usage ? {
      promptTokens: usage.prompt_tokens,
      responseTokens: usage.completion_tokens,
      totalTokens: usage.total_tokens
    } : undefined
  };
}

// ==================== FUNCIÓN PRINCIPAL ====================

/**
 * Genera contenido con fallback automático entre modelos
 * 
 * @param prompt - Texto del prompt
 * @param config - Configuración de generación
 * @param operation - Nombre de la operación (para logging/tracking)
 * @param maxRetries - Número máximo de reintentos por modelo
 */
export async function generateWithFallback(
  prompt: string,
  config: AIGenerationConfig = {},
  operation: string = 'ai_generation',
  maxRetries: number = 3
): Promise<AIGenerationResult> {
  
  console.log(`\n🤖 [AI Service] Generando: ${operation}`);
  
  // Determinar orden de modelos a probar
  const modelsToTry: AIModel[] = config.model 
    ? [config.model] // Si se fuerza un modelo, solo usar ese
    : MODEL_PRIORITY; // Sino, usar todos en orden de prioridad
  
  let lastError: Error | null = null;
  
  for (const model of modelsToTry) {
    console.log(`   🎯 Modelo objetivo: ${model}`);
    
    // Reintentar cada modelo con backoff exponencial
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        let result: AIGenerationResult;
        
        // Generar con el modelo correspondiente
        if (model === 'gemini-2.5-flash' || model === 'gemini-1.5-flash') {
          result = await generateWithGemini(model, prompt, config);
        } else if (model === 'gpt-4o-mini') {
          result = await generateWithOpenAI(prompt, config);
        } else {
          throw new Error(`Modelo desconocido: ${model}`);
        }
        
        // ✅ Éxito - registrar uso y retornar
        console.log(`   ✅ Generación exitosa con ${result.modelUsed}`);
        
        if (result.usageMetadata) {
          costTracker.recordUsage({
            ...result.usageMetadata,
            model: result.modelUsed,
            operation
          });
        }
        
        return result;
        
      } catch (error: any) {
        lastError = error;
        
        // Verificar si es error recuperable
        if (isRetryableError(error)) {
          const waitTime = Math.min(2000 * Math.pow(2, attempt - 1), 10000); // Max 10s
          console.log(`   ⚠️ Intento ${attempt}/${maxRetries} falló: ${error.message}`);
          
          if (attempt < maxRetries) {
            console.log(`   ⏳ Esperando ${waitTime}ms antes de reintentar...`);
            await delay(waitTime);
            continue; // Reintentar mismo modelo
          } else {
            console.log(`   ❌ Modelo ${model} agotó reintentos, probando siguiente...`);
            break; // Pasar al siguiente modelo
          }
        } else {
          // Error no recuperable (ej: API key inválida)
          console.error(`   ❌ Error no recuperable en ${model}: ${error.message}`);
          break; // Pasar al siguiente modelo
        }
      }
    }
  }
  
  // Si llegamos aquí, todos los modelos fallaron
  console.error(`\n❌ [AI Service] TODOS LOS MODELOS FALLARON para: ${operation}`);
  console.error(`   Modelos intentados: ${modelsToTry.join(', ')}`);
  console.error(`   Último error:`, lastError);
  
  throw new Error(
    `Todos los modelos AI fallaron para "${operation}". ` +
    `Intentados: ${modelsToTry.join(', ')}. ` +
    `Último error: ${lastError?.message || 'Unknown'}`
  );
}

// ==================== HELPERS ESPECÍFICOS ====================

/**
 * Helper para generar JSON estructurado
 */
export async function generateJSON<T = any>(
  prompt: string,
  schema: any,
  operation: string = 'json_generation'
): Promise<T> {
  const result = await generateWithFallback(
    prompt,
    {
      responseMimeType: 'application/json',
      responseSchema: schema
    },
    operation
  );
  
  try {
    return JSON.parse(result.text.trim()) as T;
  } catch (error) {
    console.error(`❌ Error parseando JSON de ${result.modelUsed}:`, result.text);
    throw new Error(`Failed to parse JSON response from ${result.modelUsed}: ${error}`);
  }
}

/**
 * Helper para generar texto simple
 */
export async function generateText(
  prompt: string,
  temperature: number = 0.7,
  operation: string = 'text_generation'
): Promise<string> {
  const result = await generateWithFallback(
    prompt,
    { temperature },
    operation
  );
  
  return result.text;
}

// ==================== VALIDACIÓN ====================

/**
 * Verifica que las API keys estén configuradas
 */
export function validateAPIKeys(): { gemini: boolean; openai: boolean; hasAny: boolean } {
  const hasGemini = !!GEMINI_API_KEY && GEMINI_API_KEY !== 'YOUR_API_KEY_HERE';
  const hasOpenAI = !!OPENAI_API_KEY && OPENAI_API_KEY !== 'YOUR_API_KEY_HERE';
  
  return {
    gemini: hasGemini,
    openai: hasOpenAI,
    hasAny: hasGemini || hasOpenAI
  };
}

/**
 * Imprime estado de configuración
 */
export function printConfiguration() {
  const keys = validateAPIKeys();
  
  console.log('\n🔑 [AI Service] Configuración:');
  console.log(`   Gemini API: ${keys.gemini ? '✅ Configurada' : '❌ Faltante'}`);
  console.log(`   OpenAI API: ${keys.openai ? '✅ Configurada' : '❌ Faltante'}`);
  console.log(`   Modelos disponibles: ${MODEL_PRIORITY.filter(m => {
    if (m.includes('gemini')) return keys.gemini;
    if (m.includes('gpt')) return keys.openai;
    return false;
  }).join(', ')}`);
  
  if (!keys.hasAny) {
    console.error('   ⚠️ ADVERTENCIA: No hay API keys configuradas. El sistema no funcionará.');
  }
}
