# 🚨 CRÍTICA: Por Qué Falla el Análisis del Proyecto Real (base-ts-baileys-postgres)

## 📋 Contexto del Proyecto Adjunto

El proyecto `base-ts-baileys-postgres` es un **bot de WhatsApp real** usando:
- **Framework**: Baileys (WhatsApp client)
- **BD**: PostgreSQL + Supabase  
- **Arquitectura**: Event-driven (mensajes → procesamiento → respuesta)
- **Patrón de agente**: **IMPLÍCITO** (no explícito como LangChain/CrewAI)

---

## ❌ POR QUÉ FALLA LA DETECCIÓN

### Problema 1: No Hay System Prompt Explícito

**Lo que el código detecta:**
```typescript
// codeProjectAnalyzer.ts busca:
const AGENT_PATTERNS = [
  /const\s+systemPrompt\s*=\s*`([^`]+)`/,
  /systemMessage:\s*["']([^"']+)["']/,
  /new Agent\(/,
  /LangChain/,
  /CrewAI/
];

// ❌ NO ENCUENTRA NADA en base-ts-baileys porque:
// - NO hay variable "systemPrompt"
// - NO hay import de LangChain
// - NO hay system_message en config
```

**La realidad del proyecto:**
```typescript
// src/handlers/messageHandler.ts
export async function handleMessage(message: WAMessage) {
  const text = message.conversation || message.extendedTextMessage?.text;
  
  // ⚠️ EL AGENTE ESTÁ AQUÍ, IMPLÍCITO EN LA LÓGICA:
  if (isGreeting(text)) {
    return greetingResponse(message.from);
  }
  
  if (isPriceQuery(text)) {
    const product = extractProduct(text);
    const price = await db.getPrice(product);
    return formatPriceResponse(product, price);
  }
  
  if (isOrderRequest(text)) {
    return await processOrder(message);
  }
  
  // ← Este es el "sistema prompt" del agente:
  // "Eres un asistente de ventas de ObraSeco que..."
  // Pero está CODIFICADO en funciones, no en un string
}
```

### Problema 2: El Sistema Prompt Es el **Comportamiento**

El "sistema prompt" está distribuido en:
1. **Funciones de validación** → intent detection
2. **Respuestas hardcoded** → system behavior
3. **Lógica condicional** → conversation flow
4. **Consultas BD** → state management

```typescript
// El verdadero "systemPrompt" es:
/*
"Eres un asistente de ventas inteligente para ObraSeco.

Tus responsabilidades:
1. Saludar a nuevos clientes
2. Responder preguntas sobre productos y precios
3. Procesar órdenes y confirmar compras
4. Consultar BD para obtener información actualizada
5. Gestionar el estado de la conversación en Supabase

Tu comportamiento:
- Sé amable pero profesional
- Si no entiendes algo, pide aclaraciones
- Si falta información, consulta BD
- Si el cliente ordena, crea un registro y pide confirmación
"

Pero está CODIFICADO, no in CONFIGURACIÓN
*/
```

### Problema 3: Las Herramientas No Están Declaradas

**Lo que el código busca:**
```typescript
// En codeProjectAnalyzer.ts:
const TOOL_PATTERNS = [
  /\.sendEmail\(/,
  /nodemailer/,
  /googleapis/,
  /@slack/web-api/
];

// ✅ SÍ encuentra algunas...
// ❌ PERO NO identifica cuáles son REALMENTE tools
```

**Las herramientas reales en el proyecto:**

| Tool | Uso | Ubicación | ¿Se detecta? |
|------|-----|-----------|-------------|
| **axios (storage)** | Llamadas HTTP a APIs externas | `src/services/http.ts` | ✅ Sí |
| **Supabase** | Lectura/escritura BD | `src/db/supabase.ts` | ✅ Sí (Prisma) |
| **Google AI** | Análisis de sentimiento/generación | `src/services/gemini.ts` | ✅ Sí (import) |
| **Messaging** | Envío de mensajes WhatsApp | `src/handlers/sender.ts` | ❌ NO |
| **Payment** | Procesamiento de pagos | `src/services/payment.ts` | ❌ NO |
| **Storage** | Almacenamiento de archivos | `src/services/storage.ts` | ❌ NO |

### Problema 4: Base de Datos No Se Identifica Correctamente

**Log actual:**
```
Databases: ?:supabase
```

**El problema:**
```typescript
// codeProjectAnalyzer.ts busca imports como:
// import { PrismaClient } from "@prisma/client"
// import { Supabase } from "@supabase/supabase-js"

// Pero en este proyecto es:
import { createClient } from "@supabase/supabase-js"; // ← Sí lo encuentra
import prisma from "@prisma/client"; // ← A veces sí
import pg from "pg"; // ← PERO TAMBIÉN usa PostgreSQL directo

// Entonces no sabe cuál es el "principal"
```

### Problema 5: El Payload Está MAL Identificado

**Gemini está devolviendo:**
```json
{
  "projectSummary": "...",
  "agents": [...],
  "dataFlows": [],  ← VACÍO
  "integrationPoints": [...]
}
```

**Por qué está vacío:**
1. Gemini NO puede analizar código que no entiende
2. El proyecto tiene patterns custom no documentados
3. Las conexiones entre componentes son implícitas
4. El flujo de datos está en la lógica, no en la estructura

---

## 🔧 SOLUCIÓN: Rediseñar el Detector para Proyectos "Implícitos"

### Paso 1: Detectar el Tipo de Agente

```typescript
// Agregar a codeProjectAnalyzer.ts
enum AgentType {
  EXPLICIT = "explicit",      // LangChain, CrewAI, OpenAI SDK
  IMPLICIT = "implicit",      // Event-driven, lógica condicional
  HYBRID = "hybrid",          // Mix of both
  UNKNOWN = "unknown"
}

function detectAgentType(files: ProjectFile[]): AgentType {
  // 1. Buscar imports explícitos
  if (hasLangChainImport(files)) return "explicit";
  if (hasCrewAIImport(files)) return "explicit";
  
  // 2. Buscar patterns implícitos
  if (hasEventDrivenPattern(files)) return "implicit";
  if (hasStateMachinePattern(files)) return "implicit";
  
  // 3. Mix
  if (hasLangChainImport(files) && hasEventDrivenPattern(files)) 
    return "hybrid";
  
  return "unknown";
}
```

### Paso 2: Para Agentes IMPLÍCITOS, Hacer Análisis Profundo

```typescript
// Nuevo función en codeProjectAnalyzer.ts
async function analyzeImplicitAgent(
  mainFile: string,  // e.g., "src/handlers/messageHandler.ts"
  allFiles: ProjectFile[],
  language: string
): Promise<AgentDefinition> {
  // 1. Extraer todas las funciones principales
  const handlers = extractMainHandlers(mainFile);
  
  // 2. Para cada handler, encontrar su descripción
  const agentBehaviors = handlers.map(handler => ({
    name: handler.name,
    description: extractComments(handler),
    inputs: extractParameterTypes(handler),
    outputs: extractReturnTypes(handler),
    tools: findToolCalls(handler, allFiles),
    databases: findDatabaseCalls(handler, allFiles),
  }));
  
  // 3. Usar Gemini para inferir el "sistema prompt" del comportamiento
  const inferredSystemPrompt = await inferSystemPrompt(
    agentBehaviors,
    allFiles
  );
  
  return {
    name: "Implicit Agent",
    type: "implicit",
    systemPrompt: inferredSystemPrompt,
    handlers: agentBehaviors,
    framework: detectFramework(mainFile)
  };
}
```

### Paso 3: Inferir System Prompt con Gemini

```typescript
async function inferSystemPrompt(
  behaviors: AgentBehavior[],
  files: ProjectFile[],
  language: string
): Promise<string> {
  const prompt = `
Eres un experto en analizar código de bots/agentes implícitos.

Te muestro las FUNCIONES PRINCIPALES de un bot/agente:

${behaviors.map((b, i) => `
${i + 1}. Función: ${b.name}
   Descripción: ${b.description || "(sin descripción)"}
   Inputs: ${b.inputs.join(", ")}
   Outputs: ${b.outputs.join(", ")}
   Tools usadas: ${b.tools.join(", ") || "ninguna"}
   BDs consultadas: ${b.databases.join(", ") || "ninguna"}
`).join("\n")}

Basándote en este análisis, escribe el "sistema prompt" implícito de este agente.
Es decir: ¿Cuál es su rol? ¿Cuáles son sus responsabilidades? 
¿Cómo se comporta?

Responde SOLO con el sistema prompt, sin explicaciones adicionales.
${getLanguageInstruction(language)}
  `;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt
  });
  
  return response.text;
}
```

---

## 📊 EJEMPLO: Análisis Correcto del Proyecto

### Input
```typescript
// src/handlers/messageHandler.ts
export async function handleMessage(message: WAMessage) {
  const text = getMessage(message);
  
  // Handler 1
  if (isGreeting(text)) {
    return await greet(message.from);
  }
  
  // Handler 2
  if (isPriceQuery(text)) {
    const product = extractProduct(text);
    const prices = await db.query('prices', { product });
    return formatPrice(prices[0]);
  }
  
  // Handler 3
  if (isOrderRequest(text)) {
    const order = await processOrder(message, db);
    await supabase.from('orders').insert(order);
    return confirmOrder(order);
  }
}
```

### Output Esperado

```json
{
  "agentType": "implicit",
  "name": "ObraSeco Sales Agent",
  "systemPrompt": "Eres un asistente de ventas inteligente para ObraSeco.\n\nTus responsabilidades:\n1. Saludar a clientes nuevos y existentes\n2. Responder preguntas sobre productos y precios consultando la BD\n3. Procesar órdenes de compra\n4. Almacenar órdenes en Supabase\n5. Proporcionar confirmaciones claras de las transacciones\n\nComportamiento:\n- Sé amable pero profesional\n- Consulta siempre BD para información actualizada\n- Confirma cada orden antes de procesarla",
  
  "handlers": [
    {
      "name": "greet",
      "type": "greeting",
      "inputs": ["phone"],
      "outputs": ["greeting_message"],
      "tools": [],
      "databases": []
    },
    {
      "name": "priceQuery",
      "type": "data_retrieval",
      "inputs": ["product_name"],
      "outputs": ["price_formatted"],
      "tools": [],
      "databases": ["prices"]
    },
    {
      "name": "processOrder",
      "type": "order_processing",
      "inputs": ["order_data"],
      "outputs": ["order_confirmation"],
      "tools": [],
      "databases": ["orders", "supabase"]
    }
  ],
  
  "tools": [
    {
      "name": "database_query",
      "type": "database",
      "description": "Consulta información de BD",
      "integrations": ["PostgreSQL", "Supabase"]
    }
  ],
  
  "databases": [
    {
      "name": "prices",
      "provider": "PostgreSQL/Supabase",
      "operations": ["SELECT"],
      "usedBy": ["priceQuery"]
    },
    {
      "name": "orders",
      "provider": "PostgreSQL/Supabase",
      "operations": ["INSERT"],
      "usedBy": ["processOrder"]
    }
  ],
  
  "entryPoints": [
    {
      "type": "webhook",
      "protocol": "WhatsApp",
      "expectedPayload": {
        "from": "string (phone)",
        "message": "string (text or media)"
      },
      "handler": "handleMessage"
    }
  ]
}
```

---

## 🎯 Plan de Arreglo

### Fase 1: Mejora Inmediata (2-3 días)
- [ ] Crear `ImplicitAgentDetector.ts` para detectar patterns event-driven
- [ ] Mejorar `inferSystemPrompt()` en Gemini
- [ ] Arreglar detección de databases (identificar "principal")
- [ ] Mejorar extracción de tools reales

### Fase 2: Refactorización (1 semana)
- [ ] Rediseñar `codeProjectAnalyzer.ts` para manejar ambos tipos
- [ ] Actualizar UI para mostrar diferencia entre agentes explícitos e implícitos
- [ ] Crear test cases para ambos tipos

### Fase 3: Integración (1 semana)
- [ ] Adaptar conversación runner para proyectos implícitos
- [ ] Generar payloads correctos para webhooks implícitos
- [ ] Ejecutar auditoría real contra servidor

---

## 📝 Próximos Pasos

1. **Hoy**: Leer este documento y entender el problema
2. **Mañana**: Crear `ImplicitAgentDetector.ts` 
3. **Día 3**: Mejorar `codeProjectAnalyzer.ts`
4. **Día 4-5**: Testing contra `base-ts-baileys-postgres`
5. **Día 6-7**: Integración completa

---

## 💡 Insight Clave

**El problema NO es que Silver Fleet no pueda auditar proyectos TypeScript.**

**El problema es que necesita soportar DOS tipos de agentes:**

1. **Explícitos**: `new Agent()`, `LangChain`, `CrewAI`
   - Fáciles de detectar
   - System prompt en configuración
   - Ya funciona 90%

2. **Implícitos**: Event-driven, lógica condicional
   - Más complejos de detectar
   - System prompt está en el código
   - Necesita análisis profundo con Gemini

**La solución es crear un detector adaptativo que maneje AMBOS.**
