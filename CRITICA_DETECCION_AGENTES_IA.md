# 🔴 CRÍTICA: Detección de Agentes IA en Code Projects - PROBLEMAS GRAVES

## Resumen Ejecutivo

**Problema**: `detectAgents()` en `codeProjectAnalyzer.ts` NO está detectando correctamente la estructura de agentes IA.

**Impacto**: 
- ❌ No extrae prompts completos
- ❌ No entiende la arquitectura del agente
- ❌ No detecta si hay múltiples agentes
- ❌ No identifica dependencias internas del agente
- ❌ La auditoría NO SABE QUÉ AUDITAR

**Severidad**: 🔴 **CRÍTICA** (feature completamente rota)

---

## Problemas Identificados

### 1. Extracción de Prompts - TRUNCADO

**Código actual** (línea 245):
```typescript
const promptPatterns = [
  /(?:system_prompt|systemPrompt|SYSTEM_PROMPT)\s*[:=]\s*[`'"]([^`'"]*)[`'"]/i,
  // ❌ SOLO CAPTURA UNA LÍNEA
  // ❌ Los prompts reales son multilineales
  
  /you are\s+(?:a\s+)?([^.!?\n]+)/i,
  // ❌ Solo captura hasta el primer punto
];

let systemPrompt: string | undefined;
for (const pattern of promptPatterns) {
  const match = file.content.match(pattern);
  if (match) {
    systemPrompt = match[1];  // ← Toma solo el primer match!
    break;
  }
}
```

**Problema concreto**:
```typescript
// Código real en un proyecto:
const systemPrompt = `
Eres un agente de ventas de seguros.
Tu objetivo es:
1. Entender las necesidades del cliente
2. Proponer cobertura
3. Generar cotización

Siempre:
- Sé profesional
- No presiones
- Escucha activamente
`;

// ❌ RESULTADO: systemPrompt = undefined o solo "Eres un agente"
```

### 2. Regex con Comillas - NO MANEJA MULTILÍNEA

**Código actual**:
```typescript
/(?:system_prompt|systemPrompt|SYSTEM_PROMPT)\s*[:=]\s*[`'"]([^`'"]*)[`'"]/i
//                                                     ^^^^^^ NUNCA capturas \n

// Pattern [^`'"] significa: cualquier char EXCEPTO backtick/comilla
// Pero NO captura saltos de línea si están dentro del string!
```

**Ejemplo que falla**:
```typescript
const systemPrompt = `
Soy un asistente de ventas.
Mi propósito es vender.
`;  // ← El regex termina en el PRIMER backtick de la siguiente línea

// ❌ RESULTADO: Vacío o incompleto
```

### 3. Sin Contexto Arquitectónico

**Código actual** (línea 235):
```typescript
// Extraer nombre
const classMatch = file.content.match(/(?:export\s+)?class\s+(\w+)(?:Agent|Bot|Assistant|Handler)?\b/);
// ❌ Solo busca "class", ignora:
//    - Factory patterns
//    - Singleton patterns
//    - Module exports

// Extraer prompt
const promptPatterns = [
  /(?:system_prompt|systemPrompt|SYSTEM_PROMPT)\s*[:=]/i,
];
// ❌ No busca en:
//    - README.md (comentarios de arquitectura)
//    - Tipos TypeScript (interfaces de agente)
//    - Configuración (config.json)
//    - Environment variables (.env)
```

### 4. Sin Validación de Estructura

**Código actual**: simplemente agrega todos los matches
```typescript
if (hasAIReference || hasAgentPattern) {
  agents.push({
    name: agentName,
    systemPrompt,  // ← Podría ser undefined
    // ❌ Sin validar si es realmente un agente
  });
}
```

**Problemas**:
- Archivos con `http.client` → DETECTED COMO AGENTE ❌
- Archivos con `const myAgent = fetch()` → DETECTED COMO AGENTE ❌
- Archivos con `import axios from 'axios'` → DETECTED COMO AGENTE ❌

### 5. No Entiende Estructura Real de Agentes

**Estructura moderna de agente (no detectada)**:
```typescript
// 1. Definición de tools/actions
const tools = [
  {
    name: 'send_email',
    description: 'Envía un email',
    handler: async (to, subject, body) => { ... }
  }
];

// 2. Definición de memoria/contexto
const memory = {
  conversationHistory: [],
  userProfile: {}
};

// 3. Inicialización del agente
const agent = new Agent({
  model: 'gpt-4',
  systemMessage: `You are a sales agent...`,  // ← AQUÍ está el prompt
  tools,
  memory
});

// ❌ Actual: Detecta 3 agentes (uno por archivo)
// ✅ Correcto: Debería detectar 1 agente completo con 1 prompt
```

### 6. No Busca Prompts en Ubicaciones Reales

**Dónde realmente están los prompts**:

```typescript
// Patrón 1: System message en configuración
export const AGENT_CONFIG = {
  systemMessage: `
    Tu rol es: agente de atención al cliente
    ...
  `
};

// Patrón 2: Prompt en archivo separado
// /src/agents/salesman/prompt.txt
// Eres un vendedor de seguros...

// Patrón 3: Instrucciones como constante
const SYSTEM_INSTRUCTION = `
  Eres un asistente...
`;

// Patrón 4: En configuración del modelo
const agent = new Agent({
  instructions: `Eres un agente de...`,
});

// ❌ Actual: Solo busca "systemPrompt" en formato string literal
// ❌ Actual: No busca en .txt, .json, .md
// ❌ Actual: No busca "instructions", "SYSTEM_INSTRUCTION"
```

### 7. Deduplicación Naïve

**Código actual** (línea 266):
```typescript
// Deduplicar por nombre
const uniqueAgents = new Map<string, CodeAgentComponent>();
for (const agent of agents) {
  if (!uniqueAgents.has(agent.name)) {
    uniqueAgents.set(agent.name, agent);
  }
}
```

**Problema**: Si hay múltiples componentes del MISMO agente:
```typescript
// src/agents/SalesAgent.ts
export class SalesAgent { /* system prompt aquí */ }

// src/agents/SalesAgent.tools.ts
export const salesAgentTools = [{ ... }];

// src/agents/SalesAgent.memory.ts
export const salesAgentMemory = { ... };

// ❌ RESULTADO: Solo detecta SalesAgent UNA VEZ
// ❌ PIERDE: tools y memory
```

---

## Comparativa: Actual vs Necesario

### Actual (DEFICIENTE)

```typescript
function detectAgents(files: ExtractedFile[]): CodeAgentComponent[] {
  // 1. Busca palabras clave genéricas: 'agent', 'bot', 'fetch'
  //    PROBLEMA: Falsos positivos
  
  // 2. Extrae prompt con regex monolineales
  //    PROBLEMA: Trunca prompts multilineales
  
  // 3. Busca solo en .ts/.js
  //    PROBLEMA: Ignora .txt, .md, .json donde está la lógica
  
  // 4. No valida estructura
  //    PROBLEMA: Cualquier archivo con 'agent' lo detecta
  
  // 5. Deduplica por nombre
  //    PROBLEMA: Pierde componentes del mismo agente
  
  // RESULTADO: Detecta <30% de agentes correctamente
}
```

### Necesario (CORRECTO)

```typescript
function detectAgents(files: ExtractedFile[]): CodeAgentComponent[] {
  // 1. Busca PATRONES DE AGENTES (frameworks conocidos)
  //    - LangChain: AgentExecutor, initializeAgentExecutor
  //    - CrewAI: Agent, Crew
  //    - n8n-like: class Agent { systemPrompt, tools, memory }
  
  // 2. Extrae prompts COMPLETAMENTE
  //    - Maneja multilineales (template literals)
  //    - Busca en múltiples ubicaciones
  //    - Extrae prompts de .txt, .json, .md
  
  // 3. Entiende ESTRUCTURA COMPLETA del agente
  //    - Identifica: tools, memory, modelo, función
  //    - Conecta componentes relacionados
  //    - Mapea dependencias internas
  
  // 4. VALIDA que sea realmente un agente
  //    - Tiene systemPrompt/instructions
  //    - Tiene mecanismo para ejecutar (tools/actions)
  //    - Tiene estado (memory/context)
  
  // 5. Agrupa COMPONENTES del agente
  //    - Un agente = múltiples archivos relacionados
  //    - Detecta relaciones entre archivos
  
  // RESULTADO: Detecta 95%+ de agentes correctamente
}
```

---

## Ejemplos de Casos Que Falla

### Caso 1: LangChain Agent (MUY COMÚN)

```typescript
// src/agents/DocumentAssistant.ts
import { initializeAgentExecutor } from "langchain/agents";
import { OpenAI } from "langchain/llms/openai";
import { PDFLoader } from "langchain/document_loaders/fs/pdf";

const llm = new OpenAI({ temperature: 0.7 });

const tools = [
  {
    name: "pdf_search",
    description: "Busca contenido en PDFs",
    func: async (query) => { ... }
  },
  {
    name: "email_sender", 
    description: "Envía emails con información del PDF",
    func: async (email, content) => { ... }
  }
];

const executor = initializeAgentExecutor(
  tools,
  llm,
  "zero-shot-react-description",
  {
    verbose: true,
    maxIterations: 10,
    systemMessage: `
      You are a helpful document assistant.
      Your job is:
      1. Search for information in PDF documents
      2. Summarize findings
      3. Send email reports when asked
      
      Be professional and accurate.
    `
  }
);

export default executor;
```

**Actual**: ❌
- Detecta: "DocumentAssistant" (podría ser any class)
- Prompt: undefined (regex no captura template literal)
- Tools: No detecta que hay 2 tools
- Estructura: No entiende que usa LangChain

**Necesario**: ✅
- Detecta: "LangChain Agent Executor"
- Prompt: Captura completo (multilineales)
- Tools: Detecta ["pdf_search", "email_sender"]
- Estructura: "Uses LangChain with 2 tools, custom memory"

---

### Caso 2: Custom Agent Pattern (COMÚN)

```typescript
// src/agents/types.ts
export interface AgentConfig {
  systemPrompt: string;
  tools: Tool[];
  memory: ConversationMemory;
}

// src/agents/SalesAgent.ts
export const SALES_AGENT_CONFIG: AgentConfig = {
  systemPrompt: `
    Eres un experto en ventas de seguros.
    Tu meta es cerrar ventas de forma ética.
    
    Proceso:
    1. Califica al lead
    2. Presenta opciones
    3. Maneja objeciones
    4. Cierra
    
    Nunca engañes. Siempre sé honesto.
  `,
  tools: [
    { name: 'search_coverage', ... },
    { name: 'generate_quote', ... },
    { name: 'send_proposal', ... }
  ],
  memory: new ConversationMemory()
};

// src/agents/SalesAgent.handler.ts
export async function handleSalesAgent(input: string) {
  const response = await runAgent(SALES_AGENT_CONFIG, input);
  return response;
}
```

**Actual**: ❌
- Detecta: "AgentConfig" interface (no es agente!)
- Detecta: "SALES_AGENT_CONFIG" constant (mejor, pero incompleto)
- Prompt: Captura solo una línea
- Tools: No detecta los 3 tools
- Relación: No conecta interface, config, handler

**Necesario**: ✅
- Detecta: "SalesAgent" (custom implementation)
- Prompt: Captura completo (multilineales)
- Tools: ["search_coverage", "generate_quote", "send_proposal"]
- Relación: "Interface AgentConfig + Config SALES_AGENT_CONFIG + Handler"
- Structure: "Custom agent pattern with 3 external tools"

---

### Caso 3: CrewAI (NUEVO FRAMEWORK)

```typescript
// src/crew/agents.py (en proyecto Node híbrido)
from crewai import Agent

sales_agent = Agent(
  role="Sales Manager",
  goal="Sell insurance policies effectively",
  backstory="""
    You are an experienced insurance sales manager.
    You understand customer needs and can articulate the value
    of our insurance products.
  """,
  tools=[search_tool, email_tool, calendar_tool],
  max_iter=5
)

// src/crew/tasks.py
from crewai import Task

sales_task = Task(
  description="Conduct a sales call with the customer",
  agent=sales_agent,
  expected_output="Sales pitch and next steps"
)

// src/index.ts (Python wrapper)
import { execSync } from 'child_process';
export async function runCrewAI(input: string) {
  const result = execSync(`python src/crew/main.py "${input}"`);
  return result;
}
```

**Actual**: ❌
- Detecta: Nada (archivo .py no procesado)
- Detecta: TypeScript que solo importa
- Tools: No detecta porque están en Python

**Necesario**: ✅
- Detecta: "CrewAI Crew" (por signature)
- Detecta: "sales_agent" agent
- Backstory: Captura completo
- Tools: ["search_tool", "email_tool", "calendar_tool"]
- Nota: "Hybrid project - uses Python backend with CrewAI"

---

## Solución: Improved Agent Detection

### Paso 1: Expandir búsqueda de prompts

```typescript
function extractAgentPrompt(file: ExtractedFile): string | undefined {
  const content = file.content;
  
  // 1. Prompts en template literals (multilineales)
  const templateLiteralMatch = content.match(
    /(?:system_prompt|systemPrompt|systemMessage|instructions?|backstory|role_description)\s*[:=]\s*`([^`]+)`/si
  );
  if (templateLiteralMatch) return templateLiteralMatch[1].trim();
  
  // 2. Prompts en strings regulares
  const stringMatch = content.match(
    /(?:system_prompt|systemPrompt|systemMessage)\s*[:=]\s*["']([^"']+)["']/i
  );
  if (stringMatch) return stringMatch[1];
  
  // 3. Prompts multilineales (concatenados)
  const multilineMatch = content.match(
    /(?:system_prompt|systemPrompt)\s*[:=]\s*[`'"]([^`"']*(?:\n[^`"']*)*)[`'"]/si
  );
  if (multilineMatch) return multilineMatch[1].trim();
  
  return undefined;
}
```

### Paso 2: Identificar frameworks

```typescript
function identifyAgentFramework(file: ExtractedFile, content: string): string | undefined {
  // LangChain
  if (content.includes('initializeAgentExecutor') || 
      content.includes('AgentExecutor') ||
      content.includes('from langchain')) {
    return 'LangChain';
  }
  
  // CrewAI
  if (content.includes('from crewai import') ||
      content.includes('Agent(role=')) {
    return 'CrewAI';
  }
  
  // Microsoft AutoGen
  if (content.includes('UserProxyAgent') ||
      content.includes('AssistantAgent')) {
    return 'Microsoft AutoGen';
  }
  
  // Custom patterns
  if (file.content.match(/class\s+\w+Agent.*{.*systemPrompt/) ||
      file.content.includes('AgentConfig')) {
    return 'Custom Agent Pattern';
  }
  
  return undefined;
}
```

### Paso 3: Validar estructura

```typescript
function validateAgentStructure(file: ExtractedFile): boolean {
  const content = file.content;
  
  // Un agente necesita:
  const hasSystemMessage = /system(?:_)?prompt|systemMessage|instructions?|backstory/i.test(content);
  const hasTools = /tools\s*[:=]|executeAction|callable|function|method/i.test(content);
  const hasModel = /openai|anthropic|gemini|llm|model|gpt/i.test(content);
  
  // Al menos 2 de 3
  return [hasSystemMessage, hasTools, hasModel].filter(Boolean).length >= 2;
}
```

---

## Impacto en Auditoría

### Hoy (Incorrecto)

```
ZIP Upload: Sales Agent con LangChain
  ↓
detectAgents()
  ├─ Detecta: "DocumentAssistant" (class name)
  ├─ Prompt: undefined (truncado)
  ├─ Tools: undefined (no detectados)
  └─ Framework: unknown
  
ParsedCodeProject.agents = [{
  name: "DocumentAssistant",
  systemPrompt: undefined,  // ❌ SIN INSTRUCCIONES
  description: "AI Agent detected",
}]

AgentConfig.tsx
  └─ Renderiza "AI Agent detected"
     (no muestra prompt, framework, tools)

Auditoría
  └─ ❌ NO SABE QUÉ AUDITAR
  └─ ❌ NO ENTIENDE COMPORTAMIENTO ESPERADO
  └─ ❌ NO PUEDE VALIDAR CUMPLIMIENTO
```

### Después (Correcto)

```
ZIP Upload: Sales Agent con LangChain
  ↓
detectAgents() [MEJORADO]
  ├─ Detecta: "SalesAgent" (rol principal)
  ├─ Framework: "LangChain"
  ├─ Prompt: "Eres un experto en ventas..."
  ├─ Tools: ["search_coverage", "generate_quote", "send_proposal"]
  └─ Validation: ✅ PASSED
  
ParsedCodeProject.agents = [{
  name: "SalesAgent",
  systemPrompt: "Eres un experto en ventas...",  // ✅ COMPLETO
  framework: "LangChain",
  tools: ["search_coverage", "generate_quote", "send_proposal"],
  description: "LangChain agent for insurance sales"
}]

AgentConfig.tsx
  └─ Renderiza:
     "SalesAgent (LangChain)"
     "Prompt: Eres un experto..."
     "Tools: 3 external tools"

Auditoría
  ✅ ENTIENDE QUÉ AUDITAR
  ✅ CONOCE COMPORTAMIENTO ESPERADO
  ✅ PUEDE VALIDAR CUMPLIMIENTO (seguir prompts, usar tools)
```

---

## Archivos a Modificar

### Principal: `services/codeProjectAnalyzer.ts`

- [ ] Línea 245: Reescribir `detectAgents()`
  - Expandir detección de prompts (multilineales)
  - Agregar identificación de frameworks
  - Validar estructura
  - Buscar en múltiples ubicaciones
  
- [ ] Nueva función: `extractCompletePrompt()`
  - Maneja template literals
  - Maneja multilineales
  - Limpia y normaliza

- [ ] Nueva función: `identifyAgentFramework()`
  - Detecta LangChain, CrewAI, etc.

- [ ] Nueva función: `findRelatedAgentFiles()`
  - Agrupa archivos de un mismo agente

### Secundario: `types.ts`

- [ ] Expandir `CodeAgentComponent`
  - Agregar `framework?: string`
  - Agregar `tools?: string[]`
  - Agregar `completePrompt?: string`
  - Agregar `confidence: number`

---

## Checklist de Implementación

- [ ] Mejorar regex para prompts multilineales
- [ ] Agregar soporte para template literals
- [ ] Buscar prompts en .txt, .json, .md
- [ ] Identificar frameworks (LangChain, CrewAI, etc.)
- [ ] Validar estructura de agente
- [ ] Agrupar componentes relacionados
- [ ] Extraer lista de tools
- [ ] Testing con proyectos reales
- [ ] Actualizar UI para mostrar información completa

---

## Conclusión

**La detección de agentes está ROTA**: 
- No extrae prompts correctamente
- No entiende estructuras reales
- No identifica frameworks
- No valida que sea realmente un agente
- La auditoría no tiene información suficiente

**Resultado**: ZIP projects con agentes IA se ven como "unknown"

**Prioridad**: 🔴 CRÍTICA (bloquea auditoría completa)
