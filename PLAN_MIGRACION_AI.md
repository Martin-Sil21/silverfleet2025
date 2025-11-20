# Plan de Migración a Sistema de Fallback AI

## ✅ Completado

1. **aiModelService.ts creado** - Servicio centralizado con fallback automático:
   - Gemini 2.5 Flash → Gemini 1.5 Flash → GPT-4o-mini
   - Reintentos con backoff exponencial
   - Tracking de costos por modelo
   - Validación de API keys

## 🔄 En Progreso

### geminiService.ts (archivo crítico - 1730 líneas)

**Funciones que necesitan migración:**

1. ✅ `generateSamplePayload` - MIGRADO a `generateJSON()`

2. ⏳ `generateTestCases` (línea 228):
   - Reemplazar `callGeminiWithRetry` por `generateJSON()`
   - Modelo: gemini-2.5-pro → fallback automático

3. ⏳ `generateUserMessageText` (línea 512):
   - Reemplazar `callGeminiWithRetry` por `generateText()`
   - Modelo: gemini-2.5-flash → fallback automático

4. ⏳ `checkIfGoalIsMet` (línea 631):
   - Reemplazar `callGeminiWithRetry` por `generateJSON()`
   - Modelo: gemini-2.5-flash → fallback automático

5. ⏳ `analyzeResult` (línea 695):
   - Reemplazar `callGeminiWithRetry` por `generateJSON()`
   - Modelo: gemini-2.5-pro → fallback automático

6. ⏳ `executeWorkflowVisually` (línea ~400):
   - Dentro del loop de nodos AI agents
   - Reemplazar `callGeminiWithRetry` por `generateJSON()`

7. ⏳ `suggestAuditCriteria` (línea 1639):
   - Reemplazar `callGeminiWithRetry` por `generateJSON()`
   - Modelo: gemini-2.5-flash → fallback automático

## 📋 Pendiente

### intelligentToolVerificator.ts
- `verifyConversationIntelligently()` - Usa gemini-2.0-flash-exp
- Migrar a `generateJSON()` con fallback

### databaseSchemaAnalyzer.ts
- `analyzeSchemaWithAI()` - Usa gemini-2.0-flash-exp
- Migrar a `generateJSON()` con fallback

### codeProjectAnalyzer.ts
- Múltiples llamadas a Gemini AI
- Migrar todas a `generateWithFallback()`

### auditContextAnalyzer.ts
- Llamadas a gemini-2.5-pro
- Migrar a `generateJSON()` o `generateText()`

### deepProjectAnalyzer.ts
- Detección de agentes con AI
- Migrar a `generateWithFallback()`

## 🔧 Configuración de Variables de Entorno

### vite.config.ts
```typescript
define: {
  'process.env.API_KEY': JSON.stringify(env.API_KEY || env.GEMINI_API_KEY),
  'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
  'process.env.OPENAI_API_KEY': JSON.stringify(env.VITE_OPENAI_API_KEY)
}
```

### .env.local
```bash
# Gemini (prioridad 1 y 2)
GEMINI_API_KEY=AIzaSy...
API_KEY=AIzaSy...

# OpenAI (fallback final)
VITE_OPENAI_API_KEY=sk-proj-...
OPENAI_API_KEY=sk-proj-...
```

## 🎯 Próximos Pasos

1. **Migrar funciones críticas en geminiService.ts** (5 funciones principales)
2. **Actualizar intelligentToolVerificator.ts** (1 función)
3. **Actualizar databaseSchemaAnalyzer.ts** (1 función)
4. **Actualizar codeProjectAnalyzer.ts** (múltiples funciones)
5. **Actualizar vite.config.ts** para exponer OPENAI_API_KEY
6. **Testing end-to-end** con fallback activado

## 💡 Beneficios

- ✅ **Resiliencia**: Si Gemini falla, automáticamente usa OpenAI
- ✅ **Cost optimization**: Prioriza modelos más económicos (Flash)
- ✅ **Sin código duplicado**: Un solo punto de llamada AI
- ✅ **Tracking unificado**: Costos rastreados por modelo usado
- ✅ **Debugging mejorado**: Logs detallados de qué modelo se usó

## ⚠️ Consideraciones

- **Gemini 2.5 Flash** es experimental (gemini-2.0-flash-exp)
- **Gemini 1.5 Flash** es estable pero más lento
- **GPT-4o-mini** es fallback final, más caro que Gemini Flash
- Todos los prompts funcionan con ambos providers (mismo formato)
