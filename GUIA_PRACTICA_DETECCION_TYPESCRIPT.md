# 🎯 Guía Práctica: Detección de Agentes y Flujos en TypeScript

## Tabla de Contenidos

1. [Patrones de Agentes Detectables](#patrones-de-agentes-detectables)
2. [Puntos de Entrada (Hooks)](#puntos-de-entrada-hooks)
3. [Herramientas por Tipo](#herramientas-por-tipo)
4. [Bases de Datos Soportadas](#bases-de-datos-soportadas)
5. [Flujos de Conversación](#flujos-de-conversación)
6. [Validadores y Schemas](#validadores-y-schemas)
7. [Mapeo de Componentes](#mapeo-de-componentes)

---

## Patrones de Agentes Detectables

### 🔴 PATRÓN 1: LangChain Agents

**Evidencia de búsqueda:**
```
- Imports: "langchain", "@langchain/core", "@langchain/community"
- Clases: "AgentExecutor", "Tool", "initializeAgentExecutor"
- Métodos: "runAgent", "invoke"
```

**Código real:**
```typescript
import { initializeAgentExecutor } from "langchain/agents";
import { ChatOpenAI } from "@langchain/openai";
import { Tool } from "@langchain/core/tools";

export class LangChainAgent {
  private llm: ChatOpenAI;
  private executor: AgentExecutor;
  
  constructor() {
    this.llm = new ChatOpenAI({ modelName: "gpt-4" });
  }
  
  async initialize() {
    const tools = [
      new Tool({
        name: "send_email",
        description: "Send an email to a customer",
        func: async (input) => sendEmail(input)
      })
    ];
    
    this.executor = await initializeAgentExecutor(tools, this.llm, {
      agentType: "openai-functions",
      verbose: true,
      systemPrompt: `You are a helpful customer service agent.
Use the available tools to assist the customer.
Always be professional and courteous.`
    });
  }
  
  async run(input: string) {
    return await this.executor.invoke({ input });
  }
}
```

**Sistema Prompt Detectado:**
- Ubicación: `systemPrompt` en parámetros de `initializeAgentExecutor`
- Patrón de búsqueda: `/systemPrompt\s*[:=]\s*[`'"]([^`'"]+)[`'"]/`

**Tools detectados:**
- Array de `Tool` objects
- O llamadas a constructores de tools

---

### 🟢 PATRÓN 2: CrewAI Agents

**Evidencia de búsqueda:**
```
- Imports: "crewai", "crewai.agent"
- Clases: "Agent", "Task", "Crew"
- Atributos: "role", "goal", "backstory"
```

**Código real:**
```python
from crewai import Agent, Task, Crew

sales_agent = Agent(
    role="Senior Sales Representative",
    goal="Generate qualified leads and close sales",
    backstory="""You are an experienced sales professional with 15+ years 
    in the industry. You excel at understanding customer pain points
    and crafting compelling solutions.""",
    tools=[send_email_tool, schedule_meeting_tool],
    verbose=True,
    allow_delegation=False
)

research_task = Task(
    description="Research potential clients for {company_type}",
    agent=sales_agent,
    expected_output="A list of 10 potential clients with contact info"
)

crew = Crew(agents=[sales_agent], tasks=[research_task])
result = crew.kickoff(inputs={"company_type": "Software Startups"})
```

**System Prompt Detectado:**
- Ubicación: `backstory` en Agent
- Patrón de búsqueda: `/backstory\s*=\s*[`'"]([^`'"]+)[`'"]/`
- También: `role` y `goal` son parte del sistema de instrucciones

**Tools detectados:**
- Parámetro `tools=[]` en Agent
- Array de tool objects

---

### 🟡 PATRÓN 3: Sistema Personalizado con LLM

**Evidencia de búsqueda:**
```
- Imports: "openai", "@anthropic-ai/sdk", "google-generative-ai"
- Métodos: "createChatCompletion", "messages.create", "generateContent"
- Variables: "systemPrompt", "systemMessage", "systemInstruction"
```

**Código real:**
```typescript
import { OpenAI } from "openai";

export class CustomConversationAgent {
  private client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  
  private readonly systemPrompt = `You are an expert AI assistant specialized in:
  1. Understanding customer needs
  2. Providing accurate product information
  3. Generating professional quotes
  4. Scheduling meetings
  
  When the customer asks for a quote, respond with a JSON structure:
  {"action": "send_quote", "amount": number, "details": string}
  
  When they want to schedule, use: 
  {"action": "schedule_meeting", "date": "YYYY-MM-DD", "time": "HH:MM"}`;
  
  async chat(userMessage: string, conversationHistory: any[] = []): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "system", content: this.systemPrompt },
        ...conversationHistory.map(msg => ({
          role: msg.role,
          content: msg.content
        })),
        { role: "user", content: userMessage }
      ],
      temperature: 0.7,
      max_tokens: 500,
      tools: [
        {
          type: "function",
          function: {
            name: "send_email",
            description: "Send email with quote or information",
            parameters: {
              type: "object",
              properties: {
                to: { type: "string", description: "Recipient email" },
                subject: { type: "string" },
                body: { type: "string" }
              }
            }
          }
        }
      ]
    });
    
    return response.choices[0].message.content || "";
  }
}
```

**System Prompt Detectado:**
- Ubicación: Variable `systemPrompt`
- Patrón de búsqueda: `/(systemPrompt|systemMessage|systemInstruction)\s*=\s*`([^`]+)`/s`

**Tools detectados:**
- Array en `tools` parameter
- Funciones con `type: "function"`

---

### 🔵 PATRÓN 4: NestJS Service con AI

**Evidencia de búsqueda:**
```
- Decoradores: "@Injectable", "@Controller"
- Métodos: "handleMessage", "processConversation"
- Imports: OpenAI SDK, LangChain, etc.
```

**Código real:**
```typescript
import { Injectable } from "@nestjs/common";
import { OpenAI } from "openai";

@Injectable()
export class ConversationService {
  private openai = new OpenAI();
  
  private systemPrompt = `You are a customer service representative for TechCorp.
  You handle:
  - Product inquiries
  - Technical support
  - Order tracking
  - Returns and refunds
  
  Always be helpful and professional.`;
  
  async processUserMessage(
    message: string,
    conversationId: string,
    history: Array<{ role: string; content: string }>
  ): Promise<string> {
    const response = await this.openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "system", content: this.systemPrompt },
        ...history,
        { role: "user", content: message }
      ]
    });
    
    return response.choices[0].message.content || "";
  }
}

@Controller("conversation")
export class ConversationController {
  constructor(private conversationService: ConversationService) {}
  
  @Post()
  async handleMessage(@Body() dto: SendMessageDTO) {
    // ← HOOK DE ENTRADA
    const response = await this.conversationService.processUserMessage(
      dto.message,
      dto.conversationId,
      dto.history || []
    );
    return { response };
  }
}
```

**System Prompt Detectado:**
- Ubicación: Propiedad de clase `systemPrompt` en `@Injectable` service
- Patrón: Buscar `@Injectable` classes con `systemPrompt`

---

### 🟣 PATRÓN 5: Express Middleware con Agente

**Evidencia de búsqueda:**
```
- Patrón: "app.post()", "app.use()"
- Middleware: "async (req, res, next) => {}"
- Llamadas OpenAI inline
```

**Código real:**
```typescript
import express from "express";
import { OpenAI } from "openai";

const app = express();
const openai = new OpenAI();

// Prompt del agente inline
const AGENT_SYSTEM_PROMPT = `You are a chatbot for an e-commerce platform.
Your responsibilities:
1. Answer product questions
2. Help with orders
3. Process returns
4. Recommend products

Be concise (max 2-3 sentences per response).`;

app.post("/chat", async (req, res) => {
  // ← HOOK DE ENTRADA
  const { message, conversationId, history } = req.body;
  
  const response = await openai.chat.completions.create({
    model: "gpt-4",
    system: AGENT_SYSTEM_PROMPT,
    messages: [
      ...history,
      { role: "user", content: message }
    ]
  });
  
  // Guardar en BD
  await db.messages.create({
    conversationId,
    userMessage: message,
    agentResponse: response.choices[0].message.content,
    timestamp: new Date()
  });
  
  res.json({ response: response.choices[0].message.content });
});
```

**System Prompt Detectado:**
- Ubicación: Constante global o variable
- Patrón: `/(AGENT_)?SYSTEM_PROMPT\s*=\s*`([^`]+)`/s`

---

## Puntos de Entrada (Hooks)

### Express Routes

```typescript
// ✅ DETECTABLE
app.post("/conversation", handler);
app.get("/messages/:conversationId", handler);
app.put("/conversation/:id", handler);

// Patrón de búsqueda:
const expressPattern = /app\.(get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"].*?\)/g;

// Resultados esperados:
[
  { method: 'post', path: '/conversation' },
  { method: 'get', path: '/messages/:conversationId' },
  { method: 'put', path: '/conversation/:id' }
]
```

### NestJS Controllers

```typescript
// ✅ DETECTABLE
@Controller("api/conversations")
export class ConversationController {
  @Post()
  createConversation(@Body() dto: CreateConversationDTO) { }
  
  @Get(":id")
  getConversation(@Param("id") id: string) { }
  
  @Post(":id/messages")
  sendMessage(@Param("id") id: string, @Body() dto: SendMessageDTO) { }
}

// Patrón de búsqueda:
const nestPattern = /@Controller\s*\(\s*['"]([^'"]+)['"]\)/;
const methodPattern = /@(Post|Get|Put|Delete|Patch)\s*\(\s*['"]?([^'")]*)?['"]?\)/;

// Resultados esperados:
[
  { controller: 'api/conversations', method: 'post', path: '', fullPath: '/api/conversations' },
  { controller: 'api/conversations', method: 'get', path: ':id', fullPath: '/api/conversations/:id' },
  { controller: 'api/conversations', method: 'post', path: ':id/messages', fullPath: '/api/conversations/:id/messages' }
]
```

### WebSocket Handlers

```typescript
// ✅ DETECTABLE
io.on("connection", (socket) => {
  socket.on("message", async (data) => {
    // ← HOOK DE ENTRADA
  });
});

// Patrón de búsqueda:
const wsPattern = /socket\.on\s*\(\s*['"](\w+)['"]\s*,/g;

// Resultados esperados:
[
  { event: 'message', type: 'websocket' },
  { event: 'disconnect', type: 'websocket' }
]
```

### GraphQL Mutations/Queries

```typescript
// ✅ DETECTABLE
@Resolver()
export class ConversationResolver {
  @Mutation()
  async sendMessage(@Args() args: SendMessageArgs) {
    // ← HOOK DE ENTRADA
  }
  
  @Query()
  async getConversation(@Args("id") id: string) {
    // ← HOOK DE LECTURA
  }
}

// Patrón de búsqueda:
const gqlPattern = /@(Mutation|Query)\s*\(\)/;
```

---

## Herramientas por Tipo

### 📧 EMAIL

**Librerías detectables:**
```typescript
// Nodemailer
import nodemailer from "nodemailer";
const transporter = nodemailer.createTransport({ /* ... */ });
await transporter.sendMail({ to, subject, html });

// SendGrid
import sgMail from "@sendgrid/mail";
sgMail.setApiKey(process.env.SENDGRID_API_KEY);
await sgMail.send({ to, from, subject, html });

// AWS SES
import { SES } from "aws-sdk";
const ses = new SES();
await ses.sendEmail({ Destination: { ToAddresses: [to] } }).promise();
```

**Patrones de búsqueda:**
```
- "nodemailer" en imports
- "sendMail" en métodos
- "@sendgrid/mail"
- "aws-sdk" + "SES"
```

**Evidencia en código:**
```typescript
// Función típica de envío:
async function sendEmail(to: string, subject: string, body: string) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.EMAIL, pass: process.env.PASSWORD }
  });
  
  return transporter.sendMail({
    from: process.env.EMAIL,
    to,
    subject,
    html: body
  });
}
```

---

### 📅 CALENDAR

**Librerías detectables:**
```typescript
// Google Calendar
import { google } from "googleapis";
const calendar = google.calendar('v3');
await calendar.events.insert({ calendarId: 'primary', resource: event });

// Office 365
import { Client } from "@microsoft/microsoft-graph-client";
const client = Client.init({ ...config });
await client.api("/me/events").post(event);
```

**Patrones de búsqueda:**
```
- "googleapis" en imports + "calendar"
- "microsoft-graph-client"
- "outlook" API
```

---

### 💬 MESSAGING

**Tipos detectables:**
```typescript
// Slack
import { WebClient } from "@slack/web-api";
const slack = new WebClient(process.env.SLACK_TOKEN);
await slack.chat.postMessage({ channel, text });

// Twilio (SMS)
import twilio from "twilio";
const client = twilio(accountSid, authToken);
await client.messages.create({ to, from, body });

// WhatsApp Business
// Similar a Twilio pero con endpoint diferente
```

---

### 👥 CRM

**Detectables:**
```typescript
// Salesforce
import { Connection } from "jsforce";
const conn = new Connection({ instanceUrl, sessionId });
await conn.sobject("Contact").create({ Email: email, Name: name });

// HubSpot
import { Client } from "@hubspot/api-client";
const client = new Client({ apiKey: process.env.HUBSPOT_API_KEY });
await client.crm.contacts.basicApi.create({ properties: [...] });
```

---

### 💾 DATABASE

**Detectables:**
```typescript
// Prisma
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const result = await prisma.conversation.findUnique({ where: { id } });

// TypeORM
import { Repository, DataSource } from "typeorm";
const repository = dataSource.getRepository(Conversation);
const result = await repository.findOne({ where: { id } });

// Mongoose
import { Schema, model } from "mongoose";
const ConversationSchema = new Schema({ /* ... */ });
const Conversation = model("Conversation", ConversationSchema);
const result = await Conversation.findById(id);

// Supabase
import { createClient } from "@supabase/supabase-js";
const supabase = createClient(url, key);
const { data } = await supabase.from("conversations").select().eq("id", id);
```

---

## Bases de Datos Soportadas

### Postgres (Prisma, TypeORM, pg)

```typescript
// Evidencia: 
// - @prisma/client + schema.prisma
// - typeorm + PostgresConnectionOptions
// - pg + connectionString
// - DATABASE_URL en .env con postgres://

// Queries típicas a detectar:
prisma.conversation.findUnique({ where: { conversationId } });
repository.find({ where: { phone: "..." } });
db.query('SELECT * FROM conversations WHERE phone = $1', [phone]);
```

### MongoDB (Mongoose, MongoDB driver)

```typescript
// Evidencia:
// - mongoose en package.json
// - mongodb driver
// - .connect("mongodb://...")
// - Schema definitions

// Queries típicas:
await Conversation.findOne({ conversationId });
await db.collection("conversations").findOne({ phone });
```

### Supabase (PostgreSQL hosted)

```typescript
// Evidencia:
// - @supabase/supabase-js
// - SUPABASE_URL + SUPABASE_KEY en .env
// - .from("tableName").select()

// Queries típicas:
await supabase.from("conversations").select().eq("id", conversationId);
```

### Airtable

```typescript
// Evidencia:
// - airtable en package.json
// - Airtable.configure({ apiKey })
// - base("tableName")

// Queries típicas:
const records = await base("Conversations").select().all();
```

---

## Flujos de Conversación

### FLUJO SIMPLE (Request-Response)

```typescript
// 1. Client → POST /conversation
app.post("/conversation", async (req, res) => {
  // 2. Parsear entrada
  const { message, conversationId } = req.body;
  
  // 3. Agent procesa
  const response = await agent.chat(message);
  
  // 4. Guardar en BD
  await db.messages.create({ conversationId, message, response });
  
  // 5. Responder al cliente
  res.json({ response });
  // ← Cliente recibe respuesta
});

// Este flujo es de UN turno
// Para múltiples turnos, cliente debe hacer múltiples requests
```

### FLUJO COMPLETO (Conversation Loop)

```typescript
// 1. Crear conversación
const conversation = await db.conversations.create({
  id: conversationId,
  createdAt: new Date()
});

// 2. Loop de turnos
for (let turn = 1; turn <= 12; turn++) {
  // 2a. Generar mensaje del usuario
  const userMessage = await generateUserMessage(conversationGoal, history);
  
  // 2b. Enviar al agente
  const response = await agent.chat(userMessage);
  
  // 2c. Guardar turno
  await db.messages.create({
    conversationId,
    turn,
    userMessage,
    agentResponse: response,
    timestamp: new Date()
  });
  
  // 2d. Actualizar historial
  history.push({ userMessage, response });
  
  // 2e. Verificar si se completó
  if (await checkGoalMet(conversationGoal, history)) {
    break;
  }
}

// 3. Retornar resultados
return {
  conversationId,
  completedAt: new Date(),
  turns: history.length,
  success: true
};
```

### FLUJO CON STATE MANAGEMENT

```typescript
// Opción 1: En memoria (durante request)
const conversationState: ConversationState = {
  conversationId: req.body.conversationId,
  messages: [],
  context: {}
};

async function processMessage(userMessage: string) {
  conversationState.messages.push({ role: 'user', content: userMessage });
  
  const response = await agent.chat(userMessage);
  
  conversationState.messages.push({ role: 'assistant', content: response });
  
  return response;
}

// Opción 2: En BD (persistencia)
const history = await db.messages.findMany({
  where: { conversationId },
  orderBy: { createdAt: 'asc' }
});

async function processMessage(userMessage: string) {
  await db.messages.create({
    conversationId,
    role: 'user',
    content: userMessage
  });
  
  const response = await agent.chat(userMessage, history);
  
  await db.messages.create({
    conversationId,
    role: 'assistant',
    content: response
  });
  
  return response;
}

// Opción 3: En Redis (caché temporal)
const cacheKey = `conversation:${conversationId}`;
const cachedHistory = JSON.parse(await redis.get(cacheKey) || '[]');

async function processMessage(userMessage: string) {
  cachedHistory.push({ role: 'user', content: userMessage });
  
  const response = await agent.chat(userMessage, cachedHistory);
  
  cachedHistory.push({ role: 'assistant', content: response });
  
  await redis.set(cacheKey, JSON.stringify(cachedHistory));
  await redis.expire(cacheKey, 24 * 3600); // 24h TTL
  
  return response;
}
```

---

## Validadores y Schemas

### Zod (TypeScript-native)

```typescript
// ✅ DETECTABLE
import { z } from "zod";

export const SendMessageSchema = z.object({
  conversationId: z.string().uuid(),
  message: z.string().min(1).max(5000),
  userId: z.string().optional(),
  timestamp: z.number().optional()
});

export type SendMessageDTO = z.infer<typeof SendMessageSchema>;

// Uso en endpoint:
app.post("/message", async (req, res) => {
  const validated = SendMessageSchema.parse(req.body);
  // validated tiene tipos correctos
});

// Detector debe extraer:
// - Campos: conversationId (string, uuid), message (string, 1-5000 chars), etc.
// - Requeridos vs opcionales
// - Tipos y restricciones
```

### Yup (Schema validation)

```typescript
// ✅ DETECTABLE
import * as yup from "yup";

const messageSchema = yup.object({
  conversationId: yup.string().required().uuid(),
  message: yup.string().required().min(1).max(5000),
  attachments: yup.array().of(yup.string().url()).optional()
});

// Detector busca:
// - yup.object() { ... }
// - Campos con .required(), .optional()
// - Restricciones: .min(), .max(), .uuid(), etc.
```

### Class-validator (NestJS)

```typescript
// ✅ DETECTABLE
import { IsString, IsUUID, IsOptional, MinLength, MaxLength } from "class-validator";

export class SendMessageDTO {
  @IsUUID()
  conversationId: string;
  
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  message: string;
  
  @IsOptional()
  @IsString()
  userId?: string;
}

// Detector busca:
// - Decoradores @Is*
// - Tipos TypeScript reales
// - Restricciones en decoradores
```

### Interface Inference

```typescript
// Si no hay validator explícito, inferir de tipos:
interface SendMessageRequest {
  conversationId: string;      // ← required string
  message: string;              // ← required string
  userId?: string;              // ← optional string
  metadata?: Record<string, any>; // ← optional object
}

// Detector puede generar ejemplo:
{
  "conversationId": "550e8400-e29b-41d4-a716-446655440000",
  "message": "Hi, I'm interested in your product",
  "userId": "user_12345",
  "metadata": { "source": "website" }
}
```

---

## Mapeo de Componentes

### Conversión: Agente TS → WorkflowNode

```typescript
// INPUT: Agente TypeScript detectado
const detectedAgent: CodeAgentComponent = {
  type: 'agent',
  name: 'SalesAgent',
  filePath: 'src/agents/salesAgent.ts',
  systemPrompt: 'You are a professional sales representative...',
  framework: 'Custom',
  tools: ['sendEmail', 'scheduleCalendar', 'createLead'],
  confidence: 0.95
};

// OUTPUT: WorkflowNode compatible con n8n
const workflowNode: AgentNode = {
  type: 'agent',
  id: 'salesagent_src_agents_salesagent',
  name: 'SalesAgent',
  systemPrompt: 'You are a professional sales representative...',
  parameters: {
    filePath: 'src/agents/salesAgent.ts',
    framework: 'Custom',
    tools: ['sendEmail', 'scheduleCalendar', 'createLead'],
    model: 'gpt-4',
    temperature: 0.7
  }
};

// CONEXIONES: Agent → Tools
const connections: N8nConnection[] = [
  { sourceNodeId: 'endpoint_post_conversation', targetNodeId: 'salesagent_src_agents_salesagent', sourceHandle: 'output' },
  { sourceNodeId: 'salesagent_src_agents_salesagent', targetNodeId: 'tool_sendEmail', sourceHandle: 'output' },
  { sourceNodeId: 'salesagent_src_agents_salesagent', targetNodeId: 'tool_scheduleCalendar', sourceHandle: 'output' },
  { sourceNodeId: 'salesagent_src_agents_salesagent', targetNodeId: 'tool_createLead', sourceHandle: 'output' }
];
```

### Conversión: Tool TS → WorkflowNode

```typescript
// INPUT: Tool detectado
const detectedTool: DetectedTool = {
  name: 'Email Service',
  type: 'email',
  confidence: 0.95,
  evidence: ['nodemailer import', 'sendMail method calls']
};

// OUTPUT: WorkflowNode
const toolNode: ToolNode = {
  type: 'tool',
  id: 'tool_emailservice',
  name: 'Email Service',
  nodeType: 'email',
  parameters: {
    provider: 'nodemailer',
    methods: ['sendMail', 'sendProposal'],
    supportsAttachments: true,
    supportsHTML: true
  }
};
```

### Conversión: Endpoint TS → Webhook Node

```typescript
// INPUT: Endpoint detectado
const detectedEndpoint: Endpoint = {
  path: '/conversation',
  method: 'POST',
  handler: 'handleMessage',
  expectedPayload: {
    conversationId: 'string (uuid)',
    message: 'string (1-5000 chars)',
    userId: 'string (optional)'
  }
};

// OUTPUT: Nodo de entrada (simulando webhook de n8n)
const webhookNode: ToolNode = {
  type: 'tool',
  id: 'endpoint_post_conversation',
  name: 'HTTP POST /conversation',
  nodeType: 'webhook',
  parameters: {
    path: '/conversation',
    method: 'POST',
    expectedFields: ['conversationId', 'message', 'userId']
  }
};
```

### Conversión: BD TS → BD Node

```typescript
// INPUT: BD detectada
const detectedDB: DetectedDatabase = {
  provider: 'Prisma',
  confidence: 0.95,
  evidence: ['@prisma/client dependency']
};

// OUTPUT: Nodo BD
const dbNode: ToolNode = {
  type: 'tool',
  id: 'db_prisma',
  name: 'Prisma ORM',
  nodeType: 'database',
  parameters: {
    provider: 'Prisma',
    models: ['Conversation', 'Message', 'User'],
    connectionString: 'DATABASE_URL env'
  }
};
```

---

## Checklist de Detección Completa

### Para cada proyecto TypeScript, detectar:

- [ ] **Framework identificado** (Express, NestJS, Fastify, etc.)
- [ ] **Endpoints detectados**
  - [ ] Rutas HTTP
  - [ ] Métodos (GET, POST, PUT, DELETE)
  - [ ] Parámetros esperados
  - [ ] Tipos/Validadores
- [ ] **Agentes IA detectados**
  - [ ] System prompts extraídos
  - [ ] Framework del agente (LangChain, CrewAI, custom)
  - [ ] Confidence score
- [ ] **Herramientas detectadas**
  - [ ] Email (nodemailer, SendGrid, etc.)
  - [ ] Calendar (Google, Office 365, etc.)
  - [ ] Messaging (Slack, Twilio, etc.)
  - [ ] CRM (Salesforce, HubSpot, etc.)
  - [ ] APIs externas
- [ ] **Bases de datos detectadas**
  - [ ] Tipo de BD (PostgreSQL, MongoDB, etc.)
  - [ ] ORM/driver usado
  - [ ] Tablas/colecciones
  - [ ] Queries típicas
- [ ] **Flujo de datos mapeado**
  - [ ] Entrada (webhook/endpoint)
  - [ ] Agente → Tools
  - [ ] Tools → BD
  - [ ] Respuesta
- [ ] **Estado de conversación**
  - [ ] Dónde se guarda (memoria, BD, Redis, etc.)
  - [ ] Cómo se persiste
  - [ ] TTL/expiración
- [ ] **Dependencias inyectadas**
  - [ ] Patrón de DI (constructor, container, manual)
  - [ ] Servicios disponibles para agente
- [ ] **Payload de entrada**
  - [ ] Campos esperados
  - [ ] Tipos
  - [ ] Ejemplo JSON generado

---

## Patrones Anti-Detección

Cosas que NO son agentes IA:

```typescript
// ❌ Simple CRUD service (sin LLM)
class UserService {
  async getUser(id: string) {
    return db.users.findById(id);
  }
}

// ❌ Middleware que solo parsea (sin LLM)
app.use(express.json());

// ❌ Util function sin context conversacional
function formatDate(date: Date): string {
  return date.toISOString();
}

// ❌ Tool invocado por humano, no por agente
// (aunque SÍ es herramienta en el sentido de Silver Fleet)
```

Cosas que SÍ son agentes IA:

```typescript
// ✅ Función que toma mensaje y devuelve respuesta IA
async function chat(userMessage: string): Promise<string> {
  const response = await llm.generate({
    systemPrompt: "...",
    userMessage
  });
  return response;
}

// ✅ Clase con systemPrompt + métodos de procesamiento
class Agent {
  systemPrompt = "You are...";
  async process(input: string) { ... }
}

// ✅ Agente que usa tools para resolver tareas
const agent = new Agent({
  systemPrompt: "...",
  tools: [tool1, tool2]
});
```

---

## Próximas Tareas

Con esta guía, implementar:

1. **TypeScriptProjectParser.ts** - Detectar endpoints usando patrones específicos
2. **AgentPatternDetector.ts** - Detectar system prompts en todas las formas
3. **ToolDetector.ts** - Identificar librerías y servicios
4. **DatabaseDetector.ts** - Reconocer ORMs y drivers
5. **FlowMapper.ts** - Rastrear llamadas de funciones
6. **Adapter TS → WorkflowNodes** - Convertir estructuras
7. **ConversationRunner para TS** - Ejecutar auditoría HTTP
8. **Documentar ejemplos reales** - Casos de uso prácticos

