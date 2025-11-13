# ✅ SOLUCIÓN: Detector Adaptativo de Agentes (Explícitos e Implícitos)

## 📌 Resumen Ejecutivo

Vamos a crear un **detector que entienda ambos tipos de agentes**:

1. **Explícitos** (LangChain, CrewAI): Ya casi funciona
2. **Implícitos** (Event-driven): NUEVA funcionalidad

El resultado será que `base-ts-baileys-postgres` se analice correctamente.

---

## 🏗️ Arquitectura Nueva

```
codeProjectAnalyzer.ts
  ├─ detectAgentType()          ← Identifica si es explícito o implícito
  ├─ analyzeExplicitAgents()    ← Usa lógica actual
  └─ analyzeImplicitAgents()    ← NUEVA
       ├─ findMainHandlers()
       ├─ extractAgentBehaviors()
       └─ inferSystemPrompt()    ← Usa Gemini
```

---

## 💻 Implementación

### 1. Enum y Tipos Nuevos

Agregar a `types.ts`:

```typescript
export enum AgentDetectionType {
  EXPLICIT = "explicit",      // LangChain, CrewAI, OpenAI SDK
  IMPLICIT = "implicit",      // Event-driven, state machine
  HYBRID = "hybrid",          // Mix
  UNKNOWN = "unknown"
}

export interface AgentBehavior {
  name: string;
  type: 'greeting' | 'validation' | 'retrieval' | 'processing' | 'unknown';
  description?: string;
  inputTypes: string[];
  outputTypes: string[];
  toolsUsed: string[];
  databasesUsed: string[];
  conditionChecks: string[];  // if conditions que evalúa
  confidenceScore: number;    // 0-1
}

export interface ImplicitAgentAnalysis {
  detectionType: AgentDetectionType;
  inferredSystemPrompt: string;
  behaviors: AgentBehavior[];
  mainHandlers: { name: string; filePath: string }[];
  estimatedIntention: string;
}

// Extender ParsedCodeProject
export interface ParsedCodeProject {
  // ... existing fields
  agentDetectionType?: AgentDetectionType;
  implicitAgentAnalysis?: ImplicitAgentAnalysis;
}
```

### 2. Detector de Tipo de Agente

Agregar a `codeProjectAnalyzer.ts`:

```typescript
/**
 * Detecta si el proyecto tiene agentes EXPLÍCITOS o IMPLÍCITOS
 */
function detectAgentType(files: ProjectFile[], dependencies: Record<string, string>): AgentDetectionType {
  // Buscar imports de frameworks conocidos
  const hasLangChain = files.some(f => 
    f.content.includes('from "langchain') || 
    f.content.includes("from 'langchain")
  );
  
  const hasCrewAI = files.some(f => 
    f.content.includes('from "crewai') || 
    f.content.includes("from 'crewai")
  );
  
  const hasOpenAI = files.some(f => 
    f.content.includes('from "openai') || 
    f.content.includes("from 'openai")
  );
  
  // Si tiene frameworks, es explícito
  if (hasLangChain || hasCrewAI || hasOpenAI) {
    return AgentDetectionType.EXPLICIT;
  }
  
  // Buscar patterns de event-driven o state machine
  const hasEventDriven = files.some(f => 
    f.content.includes('.on(') ||
    f.content.includes('EventEmitter') ||
    f.content.includes('subscribe(') ||
    (f.name.includes('handler') || f.name.includes('controller')) &&
    f.content.includes('if (') && 
    f.content.includes('await')
  );
  
  const hasStateMachine = files.some(f =>
    f.content.includes('state ===') ||
    f.content.includes('currentState') ||
    f.content.includes('switch (state)') ||
    f.content.includes('FSM') ||
    f.content.includes('StateMachine')
  );
  
  if (hasEventDriven || hasStateMachine) {
    return AgentDetectionType.IMPLICIT;
  }
  
  // Comprobar si hay ambos
  if ((hasLangChain || hasCrewAI) && (hasEventDriven || hasStateMachine)) {
    return AgentDetectionType.HYBRID;
  }
  
  return AgentDetectionType.UNKNOWN;
}
```

### 3. Análisis de Agentes Implícitos

Agregar a `codeProjectAnalyzer.ts`:

```typescript
/**
 * Analiza agentes IMPLÍCITOS (event-driven, state machines)
 */
async function analyzeImplicitAgents(
  files: ProjectFile[],
  framework: string,
  language: string
): Promise<ImplicitAgentAnalysis> {
  // 1. Encontrar handlers principales
  const mainHandlers = findMainHandlers(files, framework);
  console.log(`📍 Handlers encontrados: ${mainHandlers.map(h => h.name).join(', ')}`);
  
  // 2. Extraer comportamiento de cada handler
  const behaviors: AgentBehavior[] = [];
  for (const handler of mainHandlers) {
    const behavior = extractBehavior(handler, files);
    if (behavior) behaviors.push(behavior);
  }
  
  console.log(`🔍 Comportamientos identificados: ${behaviors.length}`);
  
  // 3. Usar Gemini para inferir sistema prompt
  const inferredPrompt = await inferSystemPrompt(behaviors, mainHandlers, language);
  
  // 4. Identificar intención general del agente
  const intention = identifyIntention(behaviors, mainHandlers);
  
  return {
    detectionType: AgentDetectionType.IMPLICIT,
    inferredSystemPrompt: inferredPrompt,
    behaviors,
    mainHandlers,
    estimatedIntention: intention
  };
}

/**
 * Encuentra los handlers principales que actúan como "agente"
 */
function findMainHandlers(files: ProjectFile[], framework: string): { name: string; filePath: string; content: string }[] {
  const handlers = [];
  
  // Para Baileys (WhatsApp)
  if (framework === 'baileys') {
    const baileyFiles = files.filter(f => 
      f.name.includes('handler') || 
      f.name.includes('message') ||
      f.name.includes('client')
    );
    
    for (const file of baileyFiles) {
      const matches = file.content.match(/export\s+(async\s+)?function\s+(\w+)\s*\(/g);
      if (matches) {
        const handlers_in_file = matches.map(m => {
          const name = m.match(/function\s+(\w+)/)?.[1];
          return { name, filePath: file.path, content: file.content };
        }).filter(h => h.name);
        
        handlers.push(...handlers_in_file);
      }
    }
  }
  
  // Para Express
  if (framework === 'express') {
    const handlers_expr = files.filter(f => f.name.includes('route'));
    for (const file of handlers_expr) {
      const matches = file.content.match(/router\.(post|get|put|delete)\(['"]([^'"]+)['"]/g);
      if (matches) {
        handlers.push(
          ...matches.map(m => ({
            name: m.match(/\(['"]([^'"]+)/)?.[1],
            filePath: file.path,
            content: file.content
          }))
        );
      }
    }
  }
  
  // Para NestJS
  if (framework === 'nestjs') {
    const handlers_nest = files.filter(f => f.name.includes('controller'));
    for (const file of handlers_nest) {
      const matches = file.content.match(/@(Post|Get|Put|Delete|Patch)\(\)/g);
      if (matches) {
        handlers.push(
          ...matches.map(m => ({
            name: 'NestJS Controller',
            filePath: file.path,
            content: file.content
          }))
        );
      }
    }
  }
  
  return handlers;
}

/**
 * Extrae el comportamiento de un handler
 */
function extractBehavior(handler: { name: string; filePath: string; content: string }, allFiles: ProjectFile[]): AgentBehavior {
  const { name, content, filePath } = handler;
  
  // Extraer descripción de comentarios
  const commentMatch = content.match(
    new RegExp(`/\\*\\*[^*]*\\*(?:\\*(?!/)[^*]*\\*)*\\*/\\s*(?:export\\s+)?(?:async\\s+)?function\\s+${name}`, 's')
  );
  const description = commentMatch ? commentMatch[0].split('*').map(l => l.trim()).join(' ') : undefined;
  
  // Buscar type hints
  const functionSignature = content.match(new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(([^)]*)\\)\\s*(?::\\s*([^{]+))?`, 's'));
  const inputTypes = functionSignature?.[1]?.split(',').map(p => p.trim()) || [];
  const outputTypes = functionSignature?.[2]?.split(',').map(p => p.trim()) || [];
  
  // Buscar conditions if/switch
  const conditionMatches = content.match(/if\s*\([^)]+\)|switch\s*\([^)]+\)/g) || [];
  const conditionChecks = conditionMatches.map(c => c.trim()).slice(0, 3); // Top 3
  
  // Buscar tools (database, HTTP, etc.)
  const toolsUsed = findToolsInContent(content, allFiles);
  
  // Buscar databases
  const databasesUsed = findDatabasesInContent(content, allFiles);
  
  // Clasificar tipo de handler
  let type: AgentBehavior['type'] = 'unknown';
  if (name.includes('greet') || name.includes('hello') || name.includes('welcome')) type = 'greeting';
  else if (name.includes('valid') || name.includes('check') || name.includes('verify')) type = 'validation';
  else if (name.includes('get') || name.includes('fetch') || name.includes('query')) type = 'retrieval';
  else if (name.includes('create') || name.includes('process') || name.includes('order')) type = 'processing';
  
  // Calcular confidence score
  const confidence = Math.min(
    1,
    (toolsUsed.length > 0 ? 0.3 : 0) +
    (databasesUsed.length > 0 ? 0.3 : 0) +
    (conditionChecks.length > 0 ? 0.2 : 0) +
    (description ? 0.2 : 0)
  );
  
  return {
    name,
    type,
    description,
    inputTypes,
    outputTypes,
    toolsUsed,
    databasesUsed,
    conditionChecks,
    confidenceScore: confidence
  };
}

/**
 * Encuentra tools usadas en el contenido
 */
function findToolsInContent(content: string, allFiles: ProjectFile[]): string[] {
  const tools = new Set<string>();
  
  // Buscar imports
  const imports = content.match(/import\s+.*from\s+['"]([^'"]+)['"]/g) || [];
  imports.forEach(imp => {
    if (imp.includes('axios')) tools.add('axios (HTTP)');
    if (imp.includes('nodemailer')) tools.add('nodemailer (Email)');
    if (imp.includes('googleapis')) tools.add('googleapis (Google Services)');
    if (imp.includes('@slack')) tools.add('Slack API');
    if (imp.includes('twilio')) tools.add('Twilio (SMS)');
  });
  
  // Buscar llamadas a funciones de tools
  if (content.includes('.sendEmail') || content.includes('send_email')) tools.add('Email Service');
  if (content.includes('.sendMessage') || content.includes('send_message')) tools.add('Messaging Service');
  if (content.includes('.createEvent') || content.includes('schedule')) tools.add('Calendar Service');
  if (content.includes('.uploadFile') || content.includes('storage.upload')) tools.add('Storage Service');
  if (content.includes('stripe') || content.includes('payment')) tools.add('Payment Service');
  
  return Array.from(tools);
}

/**
 * Encuentra databases usadas
 */
function findDatabasesInContent(content: string, allFiles: ProjectFile[]): string[] {
  const databases = new Set<string>();
  
  // Buscar imports y conexiones
  if (content.includes('prisma') || content.includes('PrismaClient')) databases.add('Prisma/PostgreSQL');
  if (content.includes('supabase') || content.includes('createClient')) databases.add('Supabase');
  if (content.includes('mongoose') || content.includes('connect')) databases.add('MongoDB');
  if (content.includes('typeorm')) databases.add('TypeORM/SQL');
  if (content.includes('Pool') && content.includes('pg')) databases.add('PostgreSQL (Direct)');
  
  // Buscar queries
  if (content.match(/db\.(query|select|insert|update|delete)/)) {
    databases.add('Database (Generic)');
  }
  
  if (content.includes('from(') && content.includes('select()')) {
    databases.add('SQL Query Builder');
  }
  
  return Array.from(databases);
}

/**
 * Usa Gemini para inferir el sistema prompt
 */
async function inferSystemPrompt(
  behaviors: AgentBehavior[],
  handlers: { name: string; filePath: string }[],
  language: string
): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const behaviorSummary = behaviors
    .map((b, i) => `${i + 1}. ${b.name}: ${b.description || 'sin descripción'}\n   Tipo: ${b.type}\n   Tools: ${b.toolsUsed.join(', ') || 'ninguno'}\n   Bases de datos: ${b.databasesUsed.join(', ') || 'ninguna'}`)
    .join('\n\n');
  
  const prompt = `Eres un experto en analizar código de bots y agentes implícitos.

Te muestro los COMPORTAMIENTOS PRINCIPALES de un bot/agente que está CODIFICADO (no tiene system prompt explícito):

${behaviorSummary}

Basándote en esto, escribe el "sistema prompt" implícito que describe:
1. El rol del agente (¿qué es?)
2. Sus responsabilidades principales
3. Cómo debe comportarse
4. Cómo gestiona conversaciones

Responde SOLO con el sistema prompt, en formato natural y claro.

${language === 'es' ? 'RESPONDE EN ESPAÑOL' : 'RESPOND IN ENGLISH'}
`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt
    });
    
    costTracker.recordUsage({
      promptTokens: response.usageMetadata?.promptTokenCount || 0,
      responseTokens: response.usageMetadata?.candidatesTokenCount || 0,
      operation: 'infer_system_prompt'
    });
    
    return response.text;
  } catch (error) {
    console.error('Error inferring system prompt:', error);
    return `Agente implícito con comportamientos: ${behaviors.map(b => b.name).join(', ')}`;
  }
}

/**
 * Identifica la intención general del agente
 */
function identifyIntention(behaviors: AgentBehavior[], handlers: { name: string; filePath: string }[]): string {
  // Contar tipos de comportamiento
  const typeCount = behaviors.reduce((acc, b) => {
    acc[b.type] = (acc[b.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  // Identificar patrón dominante
  let intention = 'General Assistant';
  
  if (typeCount.processing > 0) intention = 'Transaction/Order Processing Agent';
  else if (typeCount.validation > 0) intention = 'Validation and Compliance Agent';
  else if (typeCount.retrieval > 0) intention = 'Information Retrieval Agent';
  else if (typeCount.greeting > 0) intention = 'Customer Service Agent';
  
  // Agregar contexto de tools
  const allTools = behaviors.flatMap(b => b.toolsUsed);
  if (allTools.includes('Email Service')) intention += ' (with Email)';
  if (allTools.includes('Payment Service')) intention += ' (with Payments)';
  if (allTools.includes('Messaging Service')) intention += ' (with Messaging)';
  
  return intention;
}
```

### 4. Integración en `codeProjectAnalyzer.ts`

Modificar la función `analyzeCodeProject`:

```typescript
export async function analyzeCodeProject(
  projectFiles: ProjectFile[],
  language: string = 'en'
): Promise<ParsedCodeProject> {
  console.log(`🔍 [ANÁLISIS DE CÓDIGO] Analizando ${projectFiles.length} archivos...`);
  
  // ... código existente ...
  
  // 🆕 NUEVO: Detectar tipo de agente
  const agentDetectionType = detectAgentType(projectFiles, dependencies);
  console.log(`🤖 Tipo de agente detectado: ${agentDetectionType}`);
  
  // Si es EXPLÍCITO, usar lógica actual
  if (agentDetectionType === AgentDetectionType.EXPLICIT || agentDetectionType === AgentDetectionType.HYBRID) {
    agents = await detectAgents(projectFiles);
  }
  
  // Si es IMPLÍCITO o HYBRID, agregar análisis profundo
  if (agentDetectionType === AgentDetectionType.IMPLICIT || agentDetectionType === AgentDetectionType.HYBRID) {
    const implicitAnalysis = await analyzeImplicitAgents(projectFiles, frameworkName, language);
    
    // Crear agent virtual basado en análisis implícito
    agents.push({
      id: `agent_implicit_${Date.now()}`,
      name: `${frameworkName} Agent (Implicit)`,
      type: 'implicit',
      systemPrompt: implicitAnalysis.inferredSystemPrompt,
      framework: frameworkName,
      confidence: Math.max(...implicitAnalysis.behaviors.map(b => b.confidenceScore)),
      handlers: implicitAnalysis.mainHandlers,
      behaviors: implicitAnalysis.behaviors
    });
  }
  
  return {
    // ... existing fields ...
    agentDetectionType,
    implicitAgentAnalysis: agentDetectionType === AgentDetectionType.IMPLICIT ? 
      await analyzeImplicitAgents(projectFiles, frameworkName, language) : 
      undefined
  };
}
```

---

## 🧪 Resultado Esperado

Para `base-ts-baileys-postgres`:

**ANTES:**
```
❌ Failed to parse deep analysis JSON
Agent: 1 agente(s) detectado(s) - Sin soporte para ZIP
Databases: ?:supabase
```

**DESPUÉS:**
```
✅ Análisis completado exitosamente
Agent: 1 agente(s) detectado(s)
  Nombre: Baileys Agent (Implicit)
  Tipo: implicit
  Sistema Prompt: "Eres un asistente de ventas inteligente para ObraSeco..."
  Intención: Transaction/Order Processing Agent (with Messaging, Payments)
  Confianza: 0.85
  Comportamientos: 3 (greeting, validation, processing)
  Handlers: handleMessage, processOrder, validatePayment
  Tools: Messaging (Baileys), Payment Service, Storage
  Bases de Datos: Supabase, PostgreSQL
```

---

## 📅 Implementación

**Tiempo estimado:** 3-4 horas

**Archivos a modificar:**
1. `types.ts` - Agregar tipos nuevos
2. `codeProjectAnalyzer.ts` - Agregar funciones de análisis implícito
3. `costTracker.ts` - Agregar métrica para `infer_system_prompt`
4. `AgentConfig.tsx` - Mejorar UI para mostrar agentes implícitos

**Archivos a crear:** Ninguno (todo en los existentes)

---

## ✨ Beneficios

✅ Soporta **ambos tipos de agentes** (explícitos e implícitos)  
✅ **Análisis más profundo** de proyectos reales  
✅ **Sistemas prompt inferidos** automáticamente  
✅ **Compatible** con bots Baileys, Dialogflow, etc.  
✅ **Sin cambios de arquitectura** - extensión natural
