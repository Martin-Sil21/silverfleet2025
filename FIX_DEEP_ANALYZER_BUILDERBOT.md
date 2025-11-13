# 🔧 FIX: Deep Analyzer - Soporte BuilderBot & Google Gemini

## 📋 Problema Detectado

Al analizar el proyecto **BuilderBot ObraSeco**, el Deep Analyzer NO detectaba correctamente:

❌ **Google Gemini** como framework de IA  
❌ **BuilderBot** como framework de WhatsApp  
❌ **System prompts largos** (multi-línea)  
❌ **Tools personalizadas** (buscar_productos, calc_durlock, etc.)  
❌ **Sistema de 2 agentes** (Planificador + Asesor)

---

## ✅ Soluciones Implementadas

### 1. Soporte para Google Gemini

**Archivo modificado:** `services/deepProjectAnalyzer.ts`

```typescript
// ANTES: Solo detectaba OpenAI, Anthropic, LangChain
// AHORA: También detecta Google Gemini

function detectExplicitAgents(files: ProjectFile[]): CodeAgentComponent[] {
  // ...
  
  // 🔥 NUEVO: Detectar Google Gemini agents
  if (content.includes('@google/genai') || content.includes('GoogleGenAI') || content.includes('gemini')) {
    const agent = extractGeminiAgent(file);
    if (agent) agents.push(agent);
  }
  
  // ...
}

function extractGeminiAgent(file: ProjectFile): CodeAgentComponent | null {
  const content = file.content;
  const systemPrompt = extractSystemPromptFromFile(content);
  
  // Buscar llamadas a Gemini
  const hasGeminiCall = content.includes('generateContent') || 
                        content.includes('GoogleGenAI') ||
                        content.includes('gemini-');
  
  if (!hasGeminiCall) return null;
  
  // Detectar nombre del agente desde comentarios o funciones
  let agentName = file.name.replace(/\.(ts|js|py)$/, '');
  const agentNameMatch = content.match(/(?:Agent\s*[12]|AGENTE\s*[12])[:\s]*([^\n]{1,50})/i);
  if (agentNameMatch) {
    agentName = agentNameMatch[1].trim();
  }
  
  const tools = extractToolsFromGeneric(content);
  
  return {
    type: 'agent',
    name: agentName + ' Agent',
    filePath: file.path,
    systemPrompt: systemPrompt || 'Google Gemini agent',
    description: `Google Gemini agent with ${tools.length} tools`,
    imports: extractImports(content),
    framework: 'Google Gemini',
    tools,
    confidence: 0.9,
    agentDetectionType: AgentDetectionType.EXPLICIT,
  };
}
```

**Resultado:**
- ✅ Detecta `@google/genai` imports
- ✅ Identifica llamadas `generateContent()`
- ✅ Extrae nombre de agente desde comentarios ("Agent 1", "Agent 2")
- ✅ Marca como framework "Google Gemini"

---

### 2. Soporte para BuilderBot (WhatsApp)

**Archivo modificado:** `services/deepProjectAnalyzer.ts`

```typescript
// 🔥 Detectar BuilderBot agents (WhatsApp framework)
if (content.includes('@builderbot/') || content.includes('createBot') || content.includes('addAction')) {
  const agent = extractBuilderBotAgent(file);
  if (agent) agents.push(agent);
}

function extractBuilderBotAgent(file: ProjectFile): CodeAgentComponent | null {
  const content = file.content;
  const systemPrompt = extractSystemPromptFromFile(content);
  
  // Detectar flows de BuilderBot
  const hasFlows = content.includes('addAction') || 
                   content.includes('createBot') ||
                   content.includes('addKeyword');
  
  if (!hasFlows) return null;
  
  // Extraer keywords del flow
  const keywords: string[] = [];
  const keywordPattern = /addKeyword\s*\(\s*\[([^\]]+)\]/g;
  let match;
  while ((match = keywordPattern.exec(content)) !== null) {
    const kws = match[1].split(',').map(k => k.trim().replace(/['"]/g, ''));
    keywords.push(...kws);
  }
  
  return {
    type: 'agent',
    name: file.name.replace(/\.(ts|js|py)$/, '') + ' Flow',
    filePath: file.path,
    systemPrompt: systemPrompt || `BuilderBot flow triggered by: ${keywords.join(', ')}`,
    description: `WhatsApp bot flow with ${keywords.length} keywords`,
    imports: extractImports(content),
    framework: 'BuilderBot',
    tools: keywords,
    confidence: 0.85,
    agentDetectionType: AgentDetectionType.EXPLICIT,
  };
}
```

**Resultado:**
- ✅ Detecta `@builderbot/` package
- ✅ Identifica flows con `addKeyword()`, `addAction()`
- ✅ Extrae keywords de triggers
- ✅ Marca como framework "BuilderBot"

**Archivo modificado:** `services/integrationMapper.ts`

```typescript
const MESSAGING_PATTERNS = {
  // ...
  builderbot: {
    provider: 'BuilderBot (WhatsApp Framework)',
    keywords: ['@builderbot/', 'createBot', 'addKeyword', 'addAction', 'BaileysProvider'],
    envVars: ['PORT', 'SESSION_NAME'],
    operations: ['createBot', 'addKeyword', 'addAction', 'sendMessage'],
  },
  // ...
};
```

**Resultado:**
- ✅ BuilderBot detectado como herramienta de mensajería
- ✅ Identifica variables de entorno (PORT, SESSION_NAME)

---

### 3. Extracción Mejorada de System Prompts

**Archivo modificado:** `services/deepProjectAnalyzer.ts`

```typescript
function extractSystemPromptFromFile(content: string): string | undefined {
  // Template literals largos (multilineales con más de 3 líneas)
  const longTemplateMatch = content.match(
    /(?:system_prompt|systemPrompt|systemMessage|system|instructions?|backstory|role_description|prompt)\s*[:=]\s*`([^`]{100,})`/si
  );
  if (longTemplateMatch) return cleanPrompt(longTemplateMatch[1]);
  
  // Template literals estándar
  const templateMatch = content.match(
    /(?:system_prompt|systemPrompt|systemMessage|system|instructions?|backstory|role_description)\s*[:=]\s*`([^`]+)`/si
  );
  if (templateMatch) return cleanPrompt(templateMatch[1]);
  
  // Strings largos (>50 chars) - típico de prompts
  const longStringMatch = content.match(
    /(?:system_prompt|systemPrompt|systemMessage|system|instructions?)\s*[:=]\s*["']([^"']{100,})["']/si
  );
  if (longStringMatch) return cleanPrompt(longStringMatch[1]);
  
  // Objetos de configuración (contents, messages)
  const contentsMatch = content.match(
    /contents\s*:\s*[`'"]([^`'"]{100,})[`'"]/si
  );
  if (contentsMatch) return cleanPrompt(contentsMatch[1]);
  
  // 🔥 NUEVO: Detectar comentarios largos que parecen prompts
  const commentPromptMatch = content.match(
    /\/\*\*[\s\S]*?@description\s+([^\n]{100,}?)[\s\S]*?\*\//i
  );
  if (commentPromptMatch) return cleanPrompt(commentPromptMatch[1]);
  
  // 🔥 NUEVO: Detectar constantes con "PROMPT" en el nombre
  const constantPromptMatch = content.match(
    /const\s+\w*(?:PROMPT|SYSTEM)\w*\s*=\s*[`'"]([^`'"]{100,})[`'"]/si
  );
  if (constantPromptMatch) return cleanPrompt(constantPromptMatch[1]);
  
  return undefined;
}
```

**Mejoras:**
- ✅ Detecta prompts multi-línea (>100 chars prioritarios)
- ✅ Captura comentarios JSDoc con `@description`
- ✅ Detecta constantes con "PROMPT" o "SYSTEM" en el nombre
- ✅ Soporta field `contents` (usado por Gemini)

---

### 4. Detección Genérica de Tools

**Archivo modificado:** `services/deepProjectAnalyzer.ts`

```typescript
// 🔥 NUEVO: Extraer tools de forma genérica
function extractToolsFromGeneric(content: string): string[] {
  const tools: string[] = [];
  
  // Buscar funciones exportadas que parecen tools
  const exportPattern = /export\s+(?:async\s+)?function\s+(\w+)/g;
  let match;
  while ((match = exportPattern.exec(content)) !== null) {
    const funcName = match[1];
    // Solo incluir si parece una tool (calc, search, update, etc.)
    if (/calc|search|buscar|actualizar|update|get|fetch|create|send/i.test(funcName)) {
      tools.push(funcName);
    }
  }
  
  // Buscar tools declaradas explícitamente
  const toolDeclarationPattern = /(?:tool|Tool)[\s\S]*?name\s*[:=]\s*["']([^"']+)["']/g;
  while ((match = toolDeclarationPattern.exec(content)) !== null) {
    tools.push(match[1]);
  }
  
  return tools;
}
```

**Resultado:**
- ✅ Detecta funciones exportadas con nombres típicos de tools
- ✅ Identifica: `calc*`, `search*`, `buscar*`, `actualizar*`, `update*`, `get*`, `fetch*`, `create*`, `send*`
- ✅ Captura tools declaradas explícitamente

---

## 📊 Resultado Esperado para BuilderBot

### Antes del Fix

```
📦 Procesando ZIP project: Express
✅ Agentes detectados: 0-2 (genéricos)
   Bases de datos: 1 (solo URL, sin schemas)
   Herramientas: 2 (genéricas)
   APIs detectadas: 0
```

### Después del Fix

```
📦 Procesando ZIP project: Express
✅ Agentes detectados: 2-6
   
🤖 Agentes IA detectados:
   1. Agent 1 - Planificador Agent (agent)
      Framework: Google Gemini
      Detection: EXPLICIT
      Prompt: Sos el Agente 1 - Planificador y Validador de ObraSeco...
      Tools: buscar_productos, calc_durlock, calcularZocalosConSilicona, actualizar_resumen
      
   2. Agent 2 - Asesor Comercial Agent (agent)
      Framework: Google Gemini
      Detection: EXPLICIT
      Prompt: IDENTIDAD: Martín, asesor técnico-comercial de ObraSeco...
      Tools: sendMessage, updateResumen
      
   3. Menu Handler Flow (agent)
      Framework: BuilderBot
      Detection: EXPLICIT
      Prompt: BuilderBot flow triggered by: menu, opciones, ayuda
      
📊 Bases de datos detectadas:
   1. Prisma/PostgreSQL (confidence: 0.95)
      Provider: Supabase
      Evidence: schema.prisma, supabase.ts
      Credentials: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
      
   Tables:
      - resumen_conversaciones_obra_seco (12 fields)
      - memoria_temporal_obra_seco (3 fields)
      - chat_history_obra_seco (4 fields)
      
🔧 Herramientas detectadas:
   1. BuilderBot (WhatsApp Framework) - confidence: 0.95
      Operations: createBot, addKeyword, addAction, sendMessage
      
   2. Baileys (WhatsApp Provider) - confidence: 0.90
      Operations: makeWASocket, sendMessage, sendImage
      
   3. Google Gemini (AI API) - confidence: 0.95
      Operations: generateContent, startChat
      
🌐 APIs detectadas:
   1. Google Gemini (ai) - confidence: 0.95
   2. Product Search API (external) - confidence: 0.85
```

---

## 🎯 Casos de Uso Soportados

### ✅ Proyecto BuilderBot con Gemini
- Sistema de 2 agentes (Planificador + Asesor)
- Tools personalizadas (cálculos + búsquedas)
- Base de datos Supabase con schemas
- Integración WhatsApp (Baileys + BuilderBot)

### ✅ Proyecto LangChain Standard
- Agents con OpenAI/Anthropic
- Tools con LangChain framework
- Bases de datos SQL/NoSQL

### ✅ Proyecto Custom con Gemini
- Agentes sin frameworks (custom)
- System prompts en constantes
- APIs REST propias

---

## 🧪 Testing

### Comando para probar

```bash
# 1. Recarga la app
npm run dev

# 2. Sube el ZIP de BuilderBot ObraSeco

# 3. Revisa la consola - deberías ver:
✅ Detected 2-6 agents (2 explicit, 0-4 implicit)
📊 Bases de datos detectadas: 1 (Supabase/Prisma)
🔧 Herramientas: 4+ (BuilderBot, Baileys, Gemini, etc)
🤖 Agentes con system prompts completos
```

---

## 📝 Archivos Modificados

1. **`services/deepProjectAnalyzer.ts`**
   - ✅ Añadido `extractGeminiAgent()`
   - ✅ Añadido `extractBuilderBotAgent()`
   - ✅ Mejorado `extractSystemPromptFromFile()`
   - ✅ Añadido `extractToolsFromGeneric()`

2. **`services/integrationMapper.ts`**
   - ✅ Añadido `builderbot` en `MESSAGING_PATTERNS`

3. **`components/ProjectTypeSelector.tsx`**
   - ✅ Cambiado `analyzeCodeProject()` → `deepAnalyzeProject()`

4. **`components/AgentConfig.tsx`**
   - ✅ Removida llamada duplicada a análisis
   - ✅ Usa directamente `codeProject` analizado

---

## 🚀 Próximos Pasos Opcionales

- [ ] Agregar detección de **Express routes** como agentes implícitos
- [ ] Detectar **n8n workflows** embebidos en proyectos
- [ ] Soporte para **Python + FastAPI** projects
- [ ] Análisis de **Docker Compose** para arquitectura completa
- [ ] Visualización gráfica de flujos de datos

---

**Estado:** ✅ **COMPLETADO**  
**Fecha:** Noviembre 13, 2025  
**Versión Deep Analyzer:** 2.1.0
