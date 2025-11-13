# 🧪 Test Cases: Agentes IA que NO Se Detectan Correctamente

## Test 1: LangChain Agent Simple (FALLA)

### Archivo: `src/agents/chatbot.ts`

```typescript
import { initializeAgentExecutor } from "langchain/agents";
import { OpenAI } from "langchain/llms/openai";

const llm = new OpenAI({ temperature: 0.9 });

const tools = [
  {
    name: "calculator",
    description: "Useful for math questions",
    func: async (input: string) => eval(input)
  }
];

const executor = initializeAgentExecutor(tools, llm, "zero-shot-react-description", {
  systemMessage: `
You are a helpful AI assistant.
Your task is to help users with any questions they have.

Rules:
1. Always be polite
2. Use tools when needed
3. Provide accurate information

Don't make up facts.
`
});

export default executor;
```

### Actual (DEFICIENTE)
```
Detectado: ❌ NO
- Razón: 'executor' no contiene palabra 'Agent' en el nombre
- Prompt: undefined (el regex monolineal no captura multilineales)
- Tools: undefined (no detecta el array tools)
- Framework: unknown
```

### Esperado (CORRECTO)
```
Detectado: ✅ SÍ
- Nombre: "Chatbot Assistant"
- Framework: "LangChain"
- Prompt: "You are a helpful AI assistant. Your task is to help users with any questions they have. Rules: 1. Always be polite 2. Use tools when needed 3. Provide accurate information. Don't make up facts."
- Tools: ["calculator"]
- Status: "LangChain executor with 1 tool"
```

---

## Test 2: Custom Agent con Interfaz (FALLA)

### Archivos en proyecto:

**`src/types/agent.ts`:**
```typescript
export interface IAgent {
  name: string;
  systemMessage: string;
  tools: Tool[];
  memory: ConversationMemory;
  maxIterations?: number;
}

export type Tool = {
  name: string;
  description: string;
  execute: (input: any) => Promise<any>;
};
```

**`src/agents/SalesAgent/index.ts`:**
```typescript
import { IAgent, Tool } from "../../types/agent";

export const SalesAgent: IAgent = {
  name: "Vendedor de Seguros",
  systemMessage: `
Eres un vendedor experto en seguros de vida.

Tu objetivo es:
1. Identificar necesidades del cliente
2. Proponer productos adecuados
3. Cerrar la venta ética

Técnicas:
- Escucha activa
- Empatía
- Solución de problemas

Nunca presiones. Sé consultivo.
  `,
  tools: [
    {
      name: "search_products",
      description: "Busca productos de seguros disponibles",
      execute: async (criteria) => { /* ... */ }
    },
    {
      name: "generate_quote",
      description: "Genera cotización personalizada",
      execute: async (data) => { /* ... */ }
    },
    {
      name: "send_proposal",
      description: "Envía propuesta al cliente",
      execute: async (proposal) => { /* ... */ }
    }
  ],
  memory: new ConversationMemory(),
  maxIterations: 10
};
```

**`src/agents/SalesAgent/handlers.ts`:**
```typescript
import { SalesAgent } from "./index";

export async function runSalesConversation(userInput: string) {
  const agent = new AgentRunner(SalesAgent);
  const response = await agent.execute(userInput);
  return response;
}
```

### Actual (DEFICIENTE)
```
Detectados: 2 agentes ❌
1. IAgent (interface, no es agente)
   - Nombre: "IAgent"
   - Prompt: undefined
   - Tools: undefined
   
2. SalesAgent (const, mejor pero incompleto)
   - Nombre: "SalesAgent"
   - Prompt: undefined o truncado (solo "Eres un vendedor")
   - Tools: undefined (no detecta el array)
   
Estructura: NO CONECTADOS (detecta 3 archivos separados)
```

### Esperado (CORRECTO)
```
Detectado: 1 agente ✅
- Nombre: "SalesAgent"
- Tipo: "Custom Agent Pattern"
- Prompt: "[completo multilineales]"
- Tools: ["search_products", "generate_quote", "send_proposal"]
- Relación: "Defined in SalesAgent/index.ts, used in handlers.ts"
- Pattern: "Custom IAgent interface with 3 internal tools"
```

---

## Test 3: Agent con Prompt Externo (FALLA COMPLETAMENTE)

### Archivos en proyecto:

**`src/agents/README.md`:**
```markdown
# Customer Service Agent

## System Prompt

You are a professional customer service representative for TechCorp.

### Responsibilities
- Answer customer questions
- Handle complaints
- Process refunds
- Suggest upgrades

### Tone
- Professional but friendly
- Empathetic
- Solution-focused

### Tools Available
- Search knowledge base
- Update customer profile
- Process payment
- Send email
```

**`src/agents/customerService.ts`:**
```typescript
import * as fs from 'fs';
import { Agent } from './baseAgent';

// Lee el prompt del README
const readmeContent = fs.readFileSync('./agents/README.md', 'utf-8');
const promptMatch = readmeContent.match(/## System Prompt\n\n([\s\S]*?)### Tone/);
const systemPrompt = promptMatch?.[1].trim() || "You are a helpful AI assistant";

export const CustomerServiceAgent = new Agent({
  name: "Customer Service Bot",
  systemPrompt,  // ← PROMPT VIENE DE README.md!
  tools: [
    { name: 'kb_search', description: 'Search knowledge base' },
    { name: 'update_profile', description: 'Update customer profile' },
    { name: 'process_payment', description: 'Process a payment' },
    { name: 'send_email', description: 'Send email to customer' }
  ]
});
```

### Actual (DEFICIENTE)
```
Detectado: ❌ SÍ, pero incompleto
- Nombre: "CustomerServiceAgent" 
- Prompt: "You are a helpful AI assistant" (DEFAULT!)
- Tools: undefined
- Nota: NO ENCUENTRA el prompt en README.md
- Nota: NO DETECTA que el prompt viene de otro archivo
```

### Esperado (CORRECTO)
```
Detectado: ✅ SÍ, completo
- Nombre: "CustomerServiceAgent"
- Prompt: "[Extrae del README.md]"
- Tools: ["kb_search", "update_profile", "process_payment", "send_email"]
- Source: "Found in customerService.ts, prompt from README.md"
- Note: "Loads prompt dynamically from external file"
```

---

## Test 4: Multiagent System (DETECTA INCOMPLETO)

### Archivos en proyecto:

**`src/agents/agents.ts`:**
```typescript
export const SalesAgent = new Agent({
  name: "Sales Manager",
  systemPrompt: `You are a sales expert...`,
  tools: ['search_products', 'generate_quote']
});

export const SupportAgent = new Agent({
  name: "Support Specialist",
  systemPrompt: `You are a support expert...`,
  tools: ['search_kb', 'escalate_issue']
});

export const BillingAgent = new Agent({
  name: "Billing Specialist", 
  systemPrompt: `You are a billing expert...`,
  tools: ['search_invoices', 'process_refund']
});
```

**`src/orchestrator.ts`:**
```typescript
import { SalesAgent, SupportAgent, BillingAgent } from './agents';

export async function handleUserRequest(input: string) {
  // Determina cuál agente usar
  if (input.includes('precio') || input.includes('comprar')) {
    return SalesAgent.handle(input);
  } else if (input.includes('error') || input.includes('problema')) {
    return SupportAgent.handle(input);
  } else if (input.includes('factura') || input.includes('pago')) {
    return BillingAgent.handle(input);
  }
}
```

### Actual (DEFICIENTE)
```
Detectados: 3 agentes ✅ (cantidad correcta)
Pero:
1. SalesAgent
   - Prompt: truncado (solo "You are a sales expert")
   - Tools: undefined
   
2. SupportAgent
   - Prompt: truncado
   - Tools: undefined
   
3. BillingAgent
   - Prompt: truncado
   - Tools: undefined

NO DETECTA: Que es un multi-agent system
NO DETECTA: La orquestación entre agentes
NO DETECTA: Que el orchestrator coordina los 3 agentes
```

### Esperado (CORRECTO)
```
Detectados: 3 agentes + 1 orchestrator ✅

System: "Multi-agent architecture"
├─ SalesAgent
│  ├─ Prompt: "[completo]"
│  ├─ Tools: ["search_products", "generate_quote"]
│  └─ Role: "Handles sales inquiries"
│
├─ SupportAgent
│  ├─ Prompt: "[completo]"
│  ├─ Tools: ["search_kb", "escalate_issue"]
│  └─ Role: "Handles support issues"
│
├─ BillingAgent
│  ├─ Prompt: "[completo]"
│  ├─ Tools: ["search_invoices", "process_refund"]
│  └─ Role: "Handles billing inquiries"
│
└─ Orchestrator: "Routes requests to appropriate agent"
   ├─ Condition 1: "precio, comprar" → SalesAgent
   ├─ Condition 2: "error, problema" → SupportAgent
   └─ Condition 3: "factura, pago" → BillingAgent
```

---

## Test 5: Template Literal (FALLA - REGEX MONOLINEAL)

### Archivo: `src/agent.ts`

```typescript
const systemPrompt = `
You are a helpful assistant.
Your role is to help users with their queries.

Core Responsibilities:
1. Understand the user's intent
2. Provide accurate information
3. Ask clarifying questions when needed

Remember:
- Be concise but thorough
- Use examples when helpful
- Never make up facts

When you don't know something, say so.
`;

export function createAgent() {
  return new Agent({
    model: "gpt-4",
    systemPrompt  // ← MULTILINEALES!
  });
}
```

### Actual (DEFICIENTE)
```
Regex usado:
/(?:system_prompt|systemPrompt|SYSTEM_PROMPT)\s*[:=]\s*[`'"]([^`'"]*)[`'"]/i

Resultado:
systemPrompt = undefined ❌ 

Razón:
- [^`'"] = "cualquier char EXCEPTO backtick/comilla"
- NO captura multilineales (\n)
- Se detiene en el PRIMER salto de línea
```

### Esperado (CORRECTO)
```
Regex nuevo:
/(?:system_prompt|systemPrompt)\s*[:=]\s*`([^`]+)`/si

Resultado:
systemPrompt = "[completo multilineales]" ✅
```

---

## Test 6: CrewAI (NO SOPORTADO)

### Archivo: `src/crew/agents.py`

```python
from crewai import Agent, Task, Crew

researcher = Agent(
  role="Research Analyst",
  goal="Provide accurate market research data",
  backstory="""
  You are an expert market researcher with 10 years of experience.
  
  You have analyzed thousands of market trends and can identify
  patterns that others miss.
  
  You're detail-oriented and data-driven.
  """,
  tools=[web_search_tool, data_analysis_tool],
  max_iter=5
)

writer = Agent(
  role="Content Writer",
  goal="Write compelling reports based on research",
  backstory="""
  You are a professional business writer.
  
  Your reports have influenced C-level executives.
  You make complex data accessible and engaging.
  """,
  tools=[document_tool, formatting_tool],
  max_iter=3
)

crew = Crew(
  agents=[researcher, writer],
  tasks=[research_task, write_task],
  verbose=True
)
```

### Actual (DEFICIENTE)
```
Detectado: ❌ NO
- Razón 1: Archivo .py no procesado (solo .ts/.js)
- Razón 2: Incluso si se procesara, no entiende CrewAI
- Resultado: "No agents found"
```

### Esperado (CORRECTO)
```
Detectados: 2 agentes ✅

1. Researcher (CrewAI Agent)
   - Role: "Research Analyst"
   - Goal: "Provide accurate market research data"
   - Backstory: "[completo]"
   - Tools: ["web_search_tool", "data_analysis_tool"]
   - Framework: "CrewAI"
   
2. Writer (CrewAI Agent)
   - Role: "Content Writer"
   - Goal: "Write compelling reports based on research"
   - Backstory: "[completo]"
   - Tools: ["document_tool", "formatting_tool"]
   - Framework: "CrewAI"

System: "CrewAI Crew with 2 agents"
```

---

## Matriz de Fallos

| Test | Tipo | Detecta | Prompt | Tools | Framework | Estructura |
|------|------|---------|--------|-------|-----------|-----------|
| 1 | LangChain | ❌ NO | ❌ NO | ❌ NO | ❌ NO | ❌ NO |
| 2 | Custom Interface | ⚠️ PARCIAL | ❌ NO | ❌ NO | ❌ NO | ❌ NO |
| 3 | External File | ⚠️ PARCIAL | ❌ NO | ❌ NO | ❌ NO | ❌ NO |
| 4 | Multiagent | ✅ SÍ | ❌ NO | ❌ NO | ❌ NO | ❌ NO |
| 5 | Template Literal | ✅ SÍ | ❌ NO | N/A | N/A | N/A |
| 6 | CrewAI | ❌ NO | ❌ NO | ❌ NO | ❌ NO | ❌ NO |

**Tasa de éxito**: 0% (todos fallan en extraer prompt correctamente)

---

## Lo Que Debería Ver en UI

### Hoy (Incorrecto)

```
🤖 AI Agents (0 detected)

"Your workflow doesn't use AI agents or was unable to 
detect them. This might be a limitation of the analysis."
```

### Después de Fix (Correcto)

```
🤖 AI Agents (3 detected)

1. SalesAgent (LangChain)
   ├─ Prompt: "Eres un vendedor experto..."
   ├─ Tools: search_products, generate_quote, send_proposal
   ├─ Confidence: 95%
   └─ Framework: LangChain with AgentExecutor

2. SupportAgent (LangChain)
   ├─ Prompt: "Eres un especialista en soporte..."
   ├─ Tools: search_kb, escalate_issue
   ├─ Confidence: 92%
   └─ Framework: LangChain with AgentExecutor

3. BillingAgent (Custom Pattern)
   ├─ Prompt: "Eres un especialista en facturación..."
   ├─ Tools: search_invoices, process_refund
   ├─ Confidence: 88%
   └─ Pattern: Custom Agent with external tools
```

---

## Recomendación

**Prioridad**: 🔴 CRÍTICA

Sin detección correcta de agentes:
- ✅ Entiendo: Conversaciones, Criterios
- ❌ No entiendo: Qué hace el agente (el prompt)
- ❌ No audito: Si el agente sigue sus instrucciones

**La auditoría está CIEGA para agentes IA**
