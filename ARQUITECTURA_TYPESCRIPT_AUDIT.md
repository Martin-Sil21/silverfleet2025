# 🏗️ Arquitectura: Silver Fleet para Proyectos TypeScript

## Visión General del Sistema

```
┌─────────────────────────────────────────────────────────────────┐
│                    SILVER FLEET UI (React Vite)                 │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ├─► Upload ZIP Project
                       ├─► Analyze TypeScript Code
                       └─► Configure & Run Audit
                       
┌─────────────────────────────────────────────────────────────────┐
│              ANALYSIS LAYER (Detectores)                         │
├─────────────────────────────────────────────────────────────────┤
│  TypeScriptProjectParser      AgentPatternDetector               │
│  ToolDetector                 DatabaseDetector                   │
│  FlowMapper                   PayloadExtractor                   │
│  StateManagementDetector      DependencyAnalyzer                 │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│           CONVERSION LAYER (Adapters)                            │
├─────────────────────────────────────────────────────────────────┤
│  TypeScriptToWorkflowAdapter       AgentToolMapper               │
│  Convierte TS Components → WorkflowNodes (formato n8n)          │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│           EXECUTION LAYER (Auditoría)                            │
├─────────────────────────────────────────────────────────────────┤
│  TypeScriptConversationRunner    (Igual a runFullAudit)         │
│  - Genera test cases                                             │
│  - Envía requests HTTP a endpoints reales                        │
│  - Rastrea conversación (turns)                                  │
│  - Verifica herramientas (Gmail, Calendar, etc.)                │
│  - Audita BD (snapshots before/after)                            │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│           VERIFICATION LAYER (Análisis)                          │
├─────────────────────────────────────────────────────────────────┤
│  TypeScriptToolVerifier        DatabaseDiffAnalyzer              │
│  - Valida que agente ejecutó tools                               │
│  - Verifica side effects                                         │
│  - Genera reporte de cambios BD                                  │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                  REPORTING LAYER (Resultados)                    │
├─────────────────────────────────────────────────────────────────┤
│  AuditReport + ExecutiveReport (igual que n8n)                  │
│  - Criterios cumplidos/incumplidos                               │
│  - Análisis por persona (test case)                              │
│  - Verificación de herramientas                                  │
│  - Cambios en BD                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Fase 1: Upload ZIP → Parse TypeScript

```
┌─────────────────────────┐
│  User uploads ZIP file  │
└────────┬────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────┐
│  analyzeCodeProject(zipBuffer)                       │
├──────────────────────────────────────────────────────┤
│  1. Extract files from ZIP                           │
│     - Ignore: node_modules/, dist/, .git/            │
│     - Mantener: src/**/*.ts, package.json            │
│                                                      │
│  2. Parse package.json                              │
│     - Dependencias                                  │
│     - Scripts disponibles                            │
│                                                      │
│  3. Detect Framework                                │
│     - Express? → buscar app.post(), app.get()       │
│     - NestJS? → buscar @Controller, @Post           │
│     - Fastify? → buscar fastify()                   │
│                                                      │
│  4. Detect Agentes IA                               │
│     - Buscar system prompts                          │
│     - Frameworks: LangChain, CrewAI, custom          │
│                                                      │
│  5. Detect Herramientas                             │
│     - Email: nodemailer, @sendgrid/mail             │
│     - Calendar: googleapis, microsoft-graph          │
│     - CRM: salesforce, hubspot                       │
│     - Messaging: @slack/web-api, twilio             │
│                                                      │
│  6. Detect Bases de Datos                           │
│     - @prisma/client, typeorm, mongoose             │
│     - connection strings en .env                    │
│                                                      │
│  7. Detect Endpoints                                │
│     - Routes HTTP con métodos, parámetros           │
│                                                      │
│  RESULTADO: ParsedCodeProject                       │
│  {                                                  │
│    framework: { name: 'Express', version: '4.x' }  │
│    agents: [{ name, systemPrompt, framework }]      │
│    tools: [{ name, type, confidence }]              │
│    databases: [{ provider, confidence }]            │
│    dependencies: { ... }                            │
│  }                                                  │
└──────────────────────────────────────────────────────┘
```

---

## Fase 2: Extract Endpoints & Payloads

```
┌──────────────────────────────────────────────────────┐
│  detectEndpoints(files)                              │
├──────────────────────────────────────────────────────┤
│  Buscar en archivos TypeScript:                      │
│                                                      │
│  app.post('/conversation', async (req, res) => {    │
│    const { message, conversationId } = req.body;    │
│    ↑                                                 │
│    │                                                 │
│  Detecta:                                            │
│  - Ruta: /conversation                              │
│  - Método: POST                                      │
│  - Parámetro entrada: message, conversationId       │
│                                                      │
│  @Controller('api/messages')                        │
│  @Post()                                             │
│  async send(@Body() dto: SendMessageDTO) {}         │
│  ↑                                                   │
│  │                                                   │
│  Detecta:                                            │
│  - Ruta: POST /api/messages                          │
│  - DTO: SendMessageDTO                              │
└──────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────┐
│  extractExpectedPayload(endpoint)                    │
├──────────────────────────────────────────────────────┤
│  1. Encontrar tipos TypeScript                       │
│     interface SendMessageDTO {                      │
│       message: string;                              │
│       conversationId: string;                        │
│     }                                                │
│                                                      │
│  2. Buscar validadores                              │
│     @IsString()                                      │
│     @MinLength(1)                                    │
│     message: string;                                │
│                                                      │
│  3. Generar ejemplo                                 │
│     {                                               │
│       "message": "Hello agent",                      │
│       "conversationId": "conv_12345"                 │
│     }                                               │
│                                                      │
│  RESULTADO: ExpectedPayload                         │
│  {                                                  │
│    fields: { message, conversationId },             │
│    types: { message: 'string', conversationId: ... },│
│    validators: [...],                               │
│    examplePayload: { ... }                          │
│  }                                                  │
└──────────────────────────────────────────────────────┘
```

---

## Fase 3: Detect Agents & Extract System Prompts

### Búsqueda de System Prompts

```typescript
// PATRÓN 1: Variable miembro de clase
class ConversationAgent {
  private systemPrompt = `You are...`;  ← FOUND
}

// PATRÓN 2: En constructor
class Agent {
  constructor() {
    this.systemPrompt = `You are...`;  ← FOUND
  }
}

// PATRÓN 3: En inicialización de framework
const agent = new Agent({
  systemPrompt: `You are...`  ← FOUND
});

// PATRÓN 4: En método/función
async function initAgent() {
  const systemPrompt = `You are...`;  ← FOUND
  return new LLMAgent(systemPrompt);
}

// PATRÓN 5: En archivo separado
import { SYSTEM_PROMPT } from './prompts.ts';
// Requiere seguir imports y cargar archivos

// PATRÓN 6: Constante global
const AGENT_SYSTEM_PROMPT = `You are...`;  ← FOUND
```

### Algoritmo de Extracción

```
PARA CADA archivo TypeScript:
  1. Buscar patrones de system prompt
     - Regex: /(systemPrompt|system_prompt|systemMessage|backstory)\s*[=:]\s*[`'"]([^`'"]+)[`'"]/s
     
  2. Si encontrado:
     a) Extraer contenido COMPLETO (multilineales)
     b) Limpiar escape characters
     c) Guardar ubicación (archivo, línea)
     d) Calcular confidence score basado en:
        - ¿Es variable con nombre claro? (+0.3)
        - ¿Está en clase con métodos de chat? (+0.3)
        - ¿Uso de LLM SDK evidente? (+0.2)
        - ¿Métodos que aceptan history? (+0.1)
        - ¿Parámetros tools/functions? (+0.1)
  
  3. Retornar AgentComponent con:
     - name: inferir de clase/función
     - systemPrompt: contenido exacto
     - framework: LangChain/CrewAI/OpenAI/custom
     - tools: array de nombres
     - confidence: 0-1
```

---

## Fase 4: Build Workflow Nodes

```
Después de detectar:
- Endpoints
- Agentes
- Herramientas
- BD

Construir WorkflowNodes equivalentes a n8n:

┌─────────────────────────────────────────┐
│  Endpoint POST /conversation             │ Webhook
├─────────────────────────────────────────┤
│  Input: { message, conversationId }      │
│  Output: { response, ... }               │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│  SalesAgent (LangChain)                  │ Agent
├─────────────────────────────────────────┤
│  systemPrompt: "You are a sales rep..."  │
│  tools: [send_email, schedule_meeting]   │
└────────────────┬────────────────────────┘
                 │
      ┌──────────┴──────────┐
      ▼                     ▼
┌──────────────┐    ┌──────────────────┐
│ Email Tool   │    │ Calendar Tool     │ Tools
├──────────────┤    ├──────────────────┤
│ nodemailer   │    │ googleapis        │
└──────────────┘    └──────────────────┘
      │                     │
      └──────────┬──────────┘
                 ▼
┌─────────────────────────────────────────┐
│  Save to DB (Prisma)                     │ Database
├─────────────────────────────────────────┤
│  table: messages                         │
│  operation: INSERT                       │
└─────────────────────────────────────────┘
      │
      ▼
Response to client
```

### Data Structure

```typescript
// Resultado final de analysis + conversion:

const workflowNodes: WorkflowNode[] = [
  // 1. ENDPOINT NODE (simular webhook)
  {
    type: 'tool',
    id: 'endpoint_post_conversation',
    name: 'HTTP POST /conversation',
    nodeType: 'webhook',
    parameters: {
      method: 'POST',
      path: '/conversation',
      expectedFields: ['message', 'conversationId']
    }
  },
  
  // 2. AGENT NODE
  {
    type: 'agent',
    id: 'agent_salesagent',
    name: 'SalesAgent',
    systemPrompt: 'You are a professional sales representative...',
    parameters: {
      framework: 'LangChain',
      model: 'gpt-4',
      tools: ['send_email', 'schedule_meeting'],
      temperature: 0.7
    }
  },
  
  // 3. TOOL NODES
  {
    type: 'tool',
    id: 'tool_send_email',
    name: 'Send Email',
    nodeType: 'email',
    parameters: {
      provider: 'nodemailer',
      methods: ['sendMail']
    }
  },
  
  // 4. DATABASE NODE
  {
    type: 'tool',
    id: 'db_prisma',
    name: 'Save Message',
    nodeType: 'database',
    parameters: {
      orm: 'Prisma',
      table: 'messages',
      operation: 'INSERT'
    }
  }
];

// CONEXIONES
const connections: N8nConnection[] = [
  { sourceNodeId: 'endpoint_post_conversation', targetNodeId: 'agent_salesagent', sourceHandle: 'output' },
  { sourceNodeId: 'agent_salesagent', targetNodeId: 'tool_send_email', sourceHandle: 'output' },
  { sourceNodeId: 'agent_salesagent', targetNodeId: 'db_prisma', sourceHandle: 'output' }
];
```

---

## Fase 5: Generate Test Cases

```
IGUAL QUE n8n, usando Gemini:

1. Analizar workflow/proyecto
   - Agentes: qué hacen, qué tools tienen
   - Herramientas: qué acciones pueden hacer
   - BD: qué datos pueden cambiar

2. Generar 5-100 personas (test cases) con:
   - Persona: descripción del usuario
   - Conversación Goal: qué quiere lograr
   - initialPayload: datos de entrada

EJEMPLO para SalesAgent:
┌─────────────────────────────────────────────────────────┐
│ TestCase 1: "María - Consulta Inicial"                  │
├─────────────────────────────────────────────────────────┤
│ persona: "María es dueña de un negocio de alquileres.   │
│           Busca soluciones para automatizar procesos.    │
│           Es desconfiada con nueva tecnología."          │
│                                                          │
│ conversationGoal: "Obtener una cotización del servicio   │
│                   y agendar una demo"                    │
│                                                          │
│ initialPayload: {                                        │
│   conversationId: "conv_maria_001",                      │
│   message: "Hola, me interesa saber sobre sus planes",   │
│   userId: "user_maria",                                  │
│   email: "maria@example.com"                             │
│ }                                                        │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ TestCase 2: "Juan - Cliente Existente con Problema"     │
├─────────────────────────────────────────────────────────┤
│ persona: "Juan es cliente hace 1 año. Tiene un problema  │
│           crítico con integración. Está frustrado."      │
│                                                          │
│ conversationGoal: "Resolver problema de integración y   │
│                   obtener soporte técnico"               │
│                                                          │
│ initialPayload: {                                        │
│   conversationId: "conv_juan_001",                       │
│   message: "Tengo un error en la integración con...",   │
│   userId: "user_juan",                                  │
│   email: "juan@company.com",                             │
│   accountId: "acc_juan"                                  │
│ }                                                        │
└─────────────────────────────────────────────────────────┘
```

---

## Fase 6: Execute Full Audit

```
Para cada test case:

TURNO 1:
├─► Generar mensaje usuario (Gemini)
│   "Hola, me interesa saber sobre sus planes"
│
├─► Enviar HTTP POST /conversation
│   Payload: { message: "...", conversationId: "..." }
│
├─► Recibir respuesta del agente
│   Response: { response: "Claro, contamos con 3 planes..." }
│
├─► Registrar turno en ExecutionTrace
│   { nodeId: "Turn 1", input: "...", output: "...", ... }
│
├─► Verificar herramientas (¿se cumplió promesa?)
│   "Le enviaré más información por email"
│   ✓ Email verificado en Gmail
│
├─► Tomar snapshot de BD
│   SELECT * FROM conversations WHERE conversationId = ...
│   SELECT * FROM leads WHERE email = ...
│
└─► Verificar si se logró objetivo
    ¿Consiguió la cotización? ¿Agendó demo?
    NO → Continuar al siguiente turno
    SÍ → Conversación completada

TURNO 2, 3, ... hasta turno 12 o goal met

RESULTADO: AuditResult
{
  id: "result_maria_001",
  testCase: { ... },
  executionTrace: [
    { nodeId: "Turn 1", status: "SUCCESS", input: "...", output: "...", durationMs: 1234 },
    { nodeId: "Turn 2", status: "SUCCESS", input: "...", output: "...", durationMs: 2345 },
    ...
  ],
  analysis: { overallScore: 8.5, ... },
  finalStatus: "SUCCESS",
  databaseActivity: { operations: [...], changes: [...] },
  toolVerifications: [
    { tool: "email", verified: true, timestamp: ... },
    { tool: "calendar", verified: true, timestamp: ... }
  ]
}
```

---

## Fase 7: Analyze Results

```
IGUAL QUE n8n, usando Gemini para análisis:

Para cada AuditResult:

1. Evaluar criterios de auditoría
   ✓ "Agente responde coherentemente" - 9/10
   ✓ "Agente usa herramientas correctamente" - 8/10
   ✓ "Agente mantiene contexto de conversación" - 9/10
   ✗ "Agente maneja errores apropiadamente" - 4/10
   ✓ "Agente cumple promesas" - 8/10

2. Detectar hallazgos clave (KeyFindings)
   - ¿Qué salió bien?
   - ¿Qué falló?
   - ¿Riesgos identificados?

3. Generar reporte ejecutivo
   - Score general: 7.6/10
   - Resumen: 2-3 párrafos
   - Recomendaciones

RESULTADO: AuditReport (UI)
```

---

## Flujo Completo: Visual vs Real Audit

### VISUAL AUDIT (n8n)
```
1. Cargar workflow JSON
2. Parsear nodos y conexiones
3. Para cada test case:
   - Generar mensaje usuario
   - Emular ejecución de cada nodo con Gemini
   - Rastrear output a través del flujo
   - Grabar en ExecutionTrace
4. Analizar resultados
5. Mostrar reporte
```

### REAL AUDIT (TypeScript)
```
1. Cargar ZIP project
2. Analizar código (detectores)
3. Convertir a WorkflowNodes (simulación visual)
4. Para cada test case:
   - Generar mensaje usuario
   - Enviar HTTP POST a endpoint REAL
   - Recibir respuesta REAL del agente
   - Verificar cambios reales en BD
   - Verificar tools reales (Gmail, Calendar, etc.)
   - Rastrear en ExecutionTrace
5. Analizar resultados
6. Mostrar reporte
```

**Diferencia clave:**
- Visual: Todo simulado con Gemini
- Real: Ejecución REAL contra endpoints reales

---

## Componentes a Implementar

### 1. TypeScriptProjectParser.ts

```typescript
export interface ParsedTypeScriptProject {
  framework?: DetectedFramework;
  endpoints: Endpoint[];
  agents: CodeAgentComponent[];
  tools: DetectedTool[];
  databases: DetectedDatabase[];
  apis: DetectedAPI[];
  payloads: Map<string, ExpectedPayload>;
  stateManagement: StateManagementInfo;
}

export async function analyzeTypeScriptProject(
  zipBuffer: ArrayBuffer
): Promise<ParsedTypeScriptProject> {
  // Usar codeProjectAnalyzer.ts existente
  // Pero extender con detectores específicos
}
```

### 2. TypeScriptToWorkflowAdapter.ts

```typescript
export function adaptTypeScriptToWorkflow(
  project: ParsedTypeScriptProject
): { nodes: WorkflowNode[], connections: N8nConnection[] } {
  // Convertir cada componente a WorkflowNode
  // Crear conexiones lógicas
  // Retornar estructura compatible con rest del sistema
}
```

### 3. TypeScriptConversationRunner.ts

```typescript
export async function runTypeScriptAudit(
  testCase: TestCase,
  config: AuditConfig,
  onProgress: ProgressCallback
): Promise<AuditResult> {
  // Similar a runFullAudit pero para TS
  // Envía requests HTTP en lugar de emular con Gemini
  // Verifica cambios reales en BD
}
```

### 4. TypeScriptToolVerifier.ts

```typescript
export async function verifyTypeScriptTools(
  testCase: TestCase,
  conversationHistory: ExecutionStep[],
  project: ParsedTypeScriptProject
): Promise<ToolActionVerification[]> {
  // Verificar emails reales enviados
  // Verificar calendar events creados
  // Verificar CRM records
  // Etc.
}
```

---

## Integración con UI Existente

### AgentConfig.tsx

```typescript
// Ya soporta codeProject (ZIP)
// Necesita mostrar agentes detectados:

{codeProject && (
  <Card>
    <h3>Detected Agents ({codeProject.agents.length})</h3>
    {codeProject.agents.map(agent => (
      <div key={agent.name}>
        <h4>{agent.name}</h4>
        <p>Framework: {agent.framework}</p>
        <p>Tools: {agent.tools?.join(', ')}</p>
        {agent.systemPrompt && (
          <details>
            <summary>System Prompt</summary>
            <pre>{agent.systemPrompt}</pre>
          </details>
        )}
      </div>
    ))}
  </Card>
)}

// También mostrar endpoints:
{project && (
  <Card>
    <h3>Detected Endpoints</h3>
    {Object.entries(detectedEndpoints).map(([path, methods]) => (
      <div key={path}>
        {methods.map(method => (
          <p key={method}>{method.toUpperCase()} {path}</p>
        ))}
      </div>
    ))}
  </Card>
)}
```

### App.tsx

```typescript
// handleStartAudit ya carga codeProject
// Agregar paso para auditoría en tiempo real:

if (config.auditType === 'real' && config.codeProject) {
  // Usar endpointUrl configurado
  // O detectar del proyecto
  await runTypeScriptAudit(config, ...);
} else if (config.auditType === 'visual') {
  // Usar ejecución simulada (actual)
  await runFullAudit(config, ...);
}
```

---

## Flujo Resumido: De ZIP a Auditoría

```
1. User uploads ZIP
   ↓
2. analyzeCodeProject() extracts:
   - Framework, Endpoints, Agents, Tools, DBs
   ↓
3. AgentConfig muestra detectado
   ↓
4. User configura:
   - Criteria
   - Test case count
   - Audit type (visual/real)
   - Endpoint URL (para real)
   - Credentials (tools + DB)
   ↓
5. Click "Start Audit"
   ↓
6. generateTestCases() crea personas
   ↓
7. Si real:
   a) Para cada test case:
      - generateUserMessage()
      - Enviar HTTP POST a endpoint real
      - Verificar respuesta
      - Verificar herramientas
      - Verificar BD
   b) Analizar cambios totales
   ↓
8. Mostrar AuditReport
   - Criterios evaluados
   - Hallazgos clave
   - Verificación de herramientas
   - Cambios en BD
   ↓
DONE
```

---

## Próximos Pasos Concretos

1. [ ] Extender `codeProjectAnalyzer.ts` con:
   - Detección de endpoints HTTP
   - Extracción mejorada de system prompts
   - Análisis de flujo de datos

2. [ ] Crear `TypeScriptToWorkflowAdapter.ts`:
   - Convertir agents → AgentNodes
   - Convertir tools → ToolNodes
   - Generar connections

3. [ ] Crear `TypeScriptConversationRunner.ts`:
   - Loop de conversación con HTTP
   - Verificación de BD
   - Recopilación de evidence

4. [ ] Adaptar `geminiService.ts`:
   - generateTestCases para TS projects
   - Analysis para TS results

5. [ ] Actualizar UI:
   - Mostrar agentes detectados
   - Mostrar endpoints
   - Elegir endpoint para real audit

6. [ ] Testing:
   - Con proyecto Express real
   - Con proyecto NestJS real
   - Verificar detección completa

