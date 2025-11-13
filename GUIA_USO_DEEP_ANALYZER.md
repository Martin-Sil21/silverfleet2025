# 🚀 Guía de Uso: Sistema de Análisis Profundo de Proyectos ZIP

## 📋 Descripción General

Este sistema te permite auditar proyectos **reales y complejos** (Node.js, TypeScript, Python) subidos como archivos ZIP, detectando automáticamente:

- **Agentes IA** (con y sin frameworks)
- **Prompts del sistema** (explícitos e inferidos)
- **Bases de datos** (schemas completos)
- **Integraciones externas** (50+ servicios)
- **Arquitectura** y flujos de negocio

## 🎯 ¿Cuándo Usar Este Sistema?

| Situación | Usar n8n Analyzer | Usar Deep ZIP Analyzer |
|-----------|-------------------|------------------------|
| Workflow n8n simple | ✅ | ⚠️ Overkill |
| Proyecto TypeScript/Node | ❌ | ✅ |
| Bot de WhatsApp (Baileys) | ❌ | ✅ |
| Backend con Prisma + APIs | ❌ | ✅ |
| Sistema event-driven complejo | ❌ | ✅ |
| Microservicios | ❌ | ✅ |

---

## 🔧 Cómo Usar

### Opción 1: Desde la UI (AgentConfig.tsx)

1. **Sube el ZIP del proyecto**:
   ```
   [Drag & Drop] proyecto.zip
   ```

2. **El sistema automáticamente**:
   - Extrae y clasifica archivos
   - Detecta framework (Express, NestJS, etc.)
   - Identifica agentes (explícitos e implícitos)
   - Parsea schemas de BD
   - Mapea integraciones

3. **Configura la auditoría**:
   - Define criterios de evaluación
   - Configura credenciales si es necesario
   - Selecciona modo (Visual o Real)

4. **Ejecuta y obtén reporte**:
   - Visualiza agentes detectados
   - Ve schemas de BD
   - Analiza integraciones
   - Obtén puntuación y recomendaciones

### Opción 2: Uso Programático

```typescript
import { deepAnalyzeProject } from './services/deepProjectAnalyzer';

// 1. Obtener ArrayBuffer del ZIP
const zipFile = await file.arrayBuffer();

// 2. Analizar proyecto
const analysis = await deepAnalyzeProject(zipFile, 'es');

// 3. Acceder a resultados
console.log(`Agentes detectados: ${analysis.agents.length}`);
console.log(`Bases de datos: ${analysis.databases.length}`);
console.log(`Integraciones: ${analysis.tools.length + analysis.apis.length}`);

// 4. Examinar agentes
for (const agent of analysis.agents) {
  console.log(`\n📍 ${agent.name}`);
  console.log(`   Tipo: ${agent.agentDetectionType}`);
  console.log(`   Framework: ${agent.framework}`);
  console.log(`   System Prompt: ${agent.systemPrompt?.substring(0, 100)}...`);
  
  if (agent.tools) {
    console.log(`   Tools: ${agent.tools.join(', ')}`);
  }
  
  if (agent.behaviors) {
    console.log(`   Behaviors: ${agent.behaviors.length}`);
  }
}

// 5. Examinar bases de datos
for (const db of analysis.databases) {
  console.log(`\n💾 ${db.provider}`);
  console.log(`   Confidence: ${db.confidence}`);
  console.log(`   Evidence: ${db.evidence.join(', ')}`);
}

// 6. Examinar integraciones
for (const tool of analysis.tools) {
  console.log(`\n🔌 ${tool.name}`);
  console.log(`   Type: ${tool.type}`);
  console.log(`   Confidence: ${tool.confidence}`);
}
```

---

## 📊 Ejemplos de Proyectos Soportados

### Ejemplo 1: Bot de WhatsApp con Baileys

**Estructura del proyecto**:
```
bot-whatsapp.zip
├── src/
│   ├── bot.ts              (makeWASocket, maneja eventos)
│   ├── handlers/
│   │   ├── menu.ts         (Detectado como agente implícito)
│   │   ├── orders.ts       (Detectado como agente implícito)
│   │   └── support.ts      (Detectado como agente implícito)
│   ├── services/
│   │   ├── database.ts     (Prisma)
│   │   └── openai.ts       (OpenAI API)
│   └── prisma/
│       └── schema.prisma   (3 tablas detectadas)
├── package.json
└── .env.example
```

**Resultado del análisis**:

```json
{
  "projectType": "nodejs",
  "framework": { "name": "Express", "confidence": 0.9 },
  "language": "TypeScript",
  "confidence": 0.92,
  
  "agents": [
    {
      "name": "Menu Handler",
      "type": "agent",
      "filePath": "src/handlers/menu.ts",
      "systemPrompt": "Implicit agent that manages menu interactions. Displays options, validates selections, and routes user to appropriate handlers.",
      "framework": "Implicit/Event-Driven",
      "agentDetectionType": "IMPLICIT",
      "behaviors": [
        { "name": "showMenu", "type": "greeting" },
        { "name": "validateOption", "type": "validation" }
      ],
      "confidence": 0.7
    },
    {
      "name": "Orders Handler",
      "type": "agent",
      "filePath": "src/handlers/orders.ts",
      "systemPrompt": "Implicit agent responsible for processing customer orders. Validates inventory, creates order records, and sends confirmations.",
      "framework": "Implicit/Event-Driven",
      "agentDetectionType": "IMPLICIT",
      "behaviors": [
        { "name": "createOrder", "type": "processing", "toolsUsed": ["Database", "WhatsApp"], "databasesUsed": ["Prisma"] }
      ],
      "confidence": 0.75
    }
  ],
  
  "databases": [
    {
      "provider": "Prisma/PostgreSQL",
      "confidence": 0.95,
      "evidence": ["schema.prisma"]
    }
  ],
  
  "tools": [
    {
      "name": "WhatsApp Business API",
      "type": "messaging",
      "confidence": 0.95,
      "evidence": ["@whiskeysockets/baileys in dependencies"]
    }
  ],
  
  "apis": [
    {
      "service": "OpenAI",
      "type": "ai",
      "confidence": 0.95,
      "evidence": ["openai in dependencies", "src/services/openai.ts"]
    }
  ],
  
  "environmentVariables": [
    "OPENAI_API_KEY",
    "DATABASE_URL",
    "WHATSAPP_PHONE_NUMBER"
  ],
  
  "summary": "Express backend, 2 AI agents, Prisma/PostgreSQL, 1 tool"
}
```

---

### Ejemplo 2: Backend con LangChain

**Estructura del proyecto**:
```
backend-langchain.zip
├── src/
│   ├── agents/
│   │   └── supportAgent.ts (LangChain AgentExecutor)
│   ├── tools/
│   │   ├── searchDB.ts
│   │   ├── sendEmail.ts
│   │   └── createTicket.ts
│   ├── routes/
│   │   └── chat.ts
│   └── prisma/
│       └── schema.prisma
└── package.json
```

**Código del agente** (`supportAgent.ts`):

```typescript
import { ChatOpenAI } from "langchain/chat_models/openai";
import { AgentExecutor, createReactAgent } from "langchain/agents";
import { searchDBTool, sendEmailTool, createTicketTool } from "../tools";

const systemPrompt = `You are a helpful customer support agent.

Your responsibilities:
- Answer customer questions by searching the database
- Send email confirmations when needed
- Create support tickets for complex issues

Be polite, efficient, and always verify information before acting.`;

const llm = new ChatOpenAI({ modelName: "gpt-4", temperature: 0 });

const tools = [searchDBTool, sendEmailTool, createTicketTool];

const agent = createReactAgent({
  llm,
  tools,
  prompt: systemPrompt
});

export const executor = new AgentExecutor({
  agent,
  tools,
});
```

**Resultado del análisis**:

```json
{
  "agents": [
    {
      "name": "Support Agent",
      "type": "agent",
      "filePath": "src/agents/supportAgent.ts",
      "systemPrompt": "You are a helpful customer support agent.\n\nYour responsibilities:\n- Answer customer questions by searching the database\n- Send email confirmations when needed\n- Create support tickets for complex issues\n\nBe polite, efficient, and always verify information before acting.",
      "framework": "LangChain",
      "agentDetectionType": "EXPLICIT",
      "tools": ["searchDBTool", "sendEmailTool", "createTicketTool"],
      "confidence": 0.95
    }
  ],
  
  "databases": [
    {
      "provider": "Prisma/PostgreSQL",
      "confidence": 0.95,
      "evidence": ["schema.prisma"],
      "credentials": ["DATABASE_URL"]
    }
  ],
  
  "apis": [
    {
      "service": "OpenAI",
      "type": "ai",
      "confidence": 0.95,
      "evidence": ["langchain in dependencies", "ChatOpenAI found"]
    }
  ],
  
  "tools": [
    {
      "name": "Email Service",
      "type": "email",
      "confidence": 0.85,
      "evidence": ["sendEmail function found"]
    }
  ]
}
```

---

## 🔍 Tipos de Agentes Detectados

### 1. Agentes Explícitos (EXPLICIT)

**Características**:
- Usan frameworks conocidos: LangChain, OpenAI SDK, Anthropic
- System prompt declarado explícitamente
- Function calling / tools visible
- **Confidence alto** (>= 0.9)

**Ejemplo**:
```typescript
const agent = new ChatOpenAI({
  systemPrompt: "You are a helpful assistant..."
});
```

**Detectado como**:
```json
{
  "name": "Assistant Agent",
  "agentDetectionType": "EXPLICIT",
  "framework": "OpenAI",
  "systemPrompt": "You are a helpful assistant...",
  "confidence": 0.95
}
```

---

### 2. Agentes Implícitos (IMPLICIT)

**Características**:
- Lógica codificada en handlers/controllers
- No tienen system prompt explícito
- Basados en eventos (Express routes, webhooks)
- **System prompt INFERIDO con Gemini IA**
- **Confidence medio** (0.6 - 0.8)

**Ejemplo**:
```typescript
// orderHandler.ts
export async function handleOrder(req, res) {
  // Validar inventario
  const available = await checkInventory(req.body.items);
  if (!available) return res.status(400).json({ error: 'Out of stock' });
  
  // Procesar pago
  await stripe.charges.create({ ... });
  
  // Crear pedido
  await prisma.order.create({ ... });
  
  // Enviar confirmación
  await sendEmail( ... );
}
```

**Detectado como**:
```json
{
  "name": "Order Handler",
  "agentDetectionType": "IMPLICIT",
  "framework": "Implicit/Event-Driven",
  "systemPrompt": "Implicit agent responsible for processing orders. Validates inventory, processes payments, creates database records, and sends confirmation emails.",
  "behaviors": [
    { "name": "checkInventory", "type": "validation", "toolsUsed": ["Database"] },
    { "name": "processPayment", "type": "processing", "toolsUsed": ["Stripe"] },
    { "name": "sendConfirmation", "type": "communication", "toolsUsed": ["Email"] }
  ],
  "confidence": 0.7
}
```

---

## 💾 Schemas de Bases de Datos Detectados

El sistema parsea **automáticamente** 6 tipos de schemas:

| ORM/Tool | Archivos Detectados | Información Extraída |
|----------|---------------------|----------------------|
| **Prisma** | `schema.prisma` | Tablas, campos, tipos, relaciones, enums, índices |
| **Drizzle** | `*.ts` (pgTable, mysqlTable) | Tablas, campos, constraints |
| **TypeORM** | `*.ts` (@Entity, @Column) | Entidades, decoradores, relaciones |
| **Sequelize** | `*.ts` (sequelize.define) | Modelos, tipos de datos |
| **Mongoose** | `*.ts` (new Schema) | Schemas MongoDB, validaciones |
| **SQL** | `*.sql` (migrations/) | CREATE TABLE, ALTER TABLE |

**Ejemplo - Schema Prisma detectado**:

```prisma
model User {
  id        Int      @id @default(autoincrement())
  email     String   @unique
  name      String?
  posts     Post[]
  createdAt DateTime @default(now())
}

model Post {
  id        Int      @id
  title     String
  published Boolean  @default(false)
  author    User     @relation(fields: [authorId], references: [id])
  authorId  Int
}
```

**Parseado como**:

```json
{
  "provider": "Prisma",
  "type": "postgresql",
  "tables": [
    {
      "name": "User",
      "fields": [
        { "name": "id", "type": "Int", "nullable": false, "autoIncrement": true },
        { "name": "email", "type": "String", "nullable": false, "unique": true },
        { "name": "name", "type": "String", "nullable": true },
        { "name": "posts", "type": "Post[]", "nullable": false }
      ],
      "primaryKey": "id"
    },
    {
      "name": "Post",
      "fields": [
        { "name": "id", "type": "Int", "nullable": false },
        { "name": "title", "type": "String", "nullable": false },
        { "name": "published", "type": "Boolean", "nullable": false, "defaultValue": "false" },
        { 
          "name": "author", 
          "type": "User", 
          "nullable": false,
          "references": { "table": "User", "field": "id" }
        }
      ],
      "primaryKey": "id"
    }
  ],
  "relationships": [
    {
      "type": "one-to-many",
      "from": { "table": "User", "field": "posts" },
      "to": { "table": "Post", "field": "author" }
    }
  ]
}
```

---

## 🔌 Integraciones Detectadas

### Categorías Soportadas

El sistema detecta automáticamente **50+ servicios** en 9 categorías:

1. **AI APIs**: OpenAI, Anthropic, Google AI, Hugging Face, Cohere
2. **Messaging**: WhatsApp, Twilio, Telegram, Slack, Discord
3. **Email**: SendGrid, Nodemailer, Mailgun, Resend, AWS SES
4. **Calendar**: Google Calendar, Outlook Calendar
5. **CRM**: Salesforce, HubSpot, Pipedrive
6. **Payment**: Stripe, PayPal, Mercado Pago
7. **Storage**: AWS S3, Google Cloud Storage, Azure Blob, Cloudinary
8. **Auth**: Auth0, Clerk, Firebase Auth
9. **Webhooks**: Endpoints customizados

### Ejemplo de Detección

**Código**:
```typescript
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const transporter = nodemailer.createTransport({ ... });

// ...
await stripe.charges.create({ ... });
await supabase.from('orders').insert({ ... });
await transporter.sendMail({ ... });
```

**Detectado**:
```json
{
  "integrations": [
    {
      "name": "Stripe",
      "category": "payment",
      "confidence": 0.95,
      "detectedIn": ["src/services/payment.ts"],
      "operations": ["charges.create", "subscriptions.create"],
      "credentials": [
        { "name": "STRIPE_SECRET_KEY", "type": "api_key", "required": true }
      ]
    },
    {
      "name": "Supabase",
      "category": "database",
      "confidence": 0.95,
      "detectedIn": ["src/services/database.ts"],
      "operations": ["from", "insert", "select"],
      "credentials": [
        { "name": "SUPABASE_URL", "type": "custom", "required": true },
        { "name": "SUPABASE_KEY", "type": "api_key", "required": true }
      ]
    },
    {
      "name": "Nodemailer",
      "category": "email",
      "confidence": 0.9,
      "detectedIn": ["src/services/email.ts"],
      "operations": ["sendMail"],
      "credentials": [
        { "name": "SMTP_HOST", "type": "custom", "required": true },
        { "name": "SMTP_USER", "type": "custom", "required": true },
        { "name": "SMTP_PASS", "type": "custom", "required": true }
      ]
    }
  ]
}
```

---

## ⚙️ Configuración Avanzada

### Caché de Análisis

Para evitar re-analizar proyectos idénticos:

```typescript
import { deepAnalyzeProject } from './services/deepProjectAnalyzer';

const cacheKey = `analysis_${await hashZipBuffer(zipBuffer)}`;
const cached = localStorage.getItem(cacheKey);

if (cached) {
  const analysis = JSON.parse(cached);
  console.log('✅ Using cached analysis');
  return analysis;
}

const analysis = await deepAnalyzeProject(zipBuffer, 'es');
localStorage.setItem(cacheKey, JSON.stringify(analysis));
```

### Filtrado de Archivos

Personalizar qué archivos analizar:

```typescript
// En extractAndClassifyFiles()
const customBlacklist = [
  'node_modules/', 'dist/', '.git/',
  'custom-folder/', 'temp/'
];
```

### Ajuste de Confidence

Modificar umbrales de detección:

```typescript
// En detectImplicitAgents()
const MIN_CONFIDENCE = 0.15; // Más permisivo
const MIN_BEHAVIORS = 1;     // Aceptar con 1 behavior
```

---

## 🧪 Testing

### Test Unitario: Detección de Agentes

```typescript
import { deepAnalyzeProject } from './services/deepProjectAnalyzer';
import { readFileSync } from 'fs';

describe('Deep Project Analyzer', () => {
  it('should detect LangChain agent', async () => {
    const zipBuffer = readFileSync('./test-projects/langchain-bot.zip');
    const analysis = await deepAnalyzeProject(zipBuffer);
    
    expect(analysis.agents.length).toBeGreaterThan(0);
    expect(analysis.agents[0].framework).toBe('LangChain');
    expect(analysis.agents[0].agentDetectionType).toBe('EXPLICIT');
    expect(analysis.agents[0].systemPrompt).toContain('helpful');
  });
  
  it('should detect implicit event-driven agents', async () => {
    const zipBuffer = readFileSync('./test-projects/express-handlers.zip');
    const analysis = await deepAnalyzeProject(zipBuffer);
    
    const implicitAgents = analysis.agents.filter(a => a.agentDetectionType === 'IMPLICIT');
    expect(implicitAgents.length).toBeGreaterThan(0);
    expect(implicitAgents[0].behaviors).toBeDefined();
  });
});
```

---

## 🚨 Troubleshooting

### Problema: No se detectan agentes

**Posibles causas**:
1. **Archivos en carpetas no reconocidas**: Verifica que los handlers estén en `src/`, `handlers/`, o `controllers/`
2. **Confidence muy bajo**: Ajusta `MIN_CONFIDENCE` en `detectImplicitAgents()`
3. **Código muy ofuscado**: El parser AST puede fallar con código minificado

**Solución**:
```typescript
// Agregar patrones customizados en findMainHandlers()
const candidateFiles = files.filter(f => {
  const lowerPath = f.path.toLowerCase();
  return (
    lowerPath.includes('your-custom-folder/') ||
    f.name.includes('your-pattern')
  );
});
```

### Problema: System prompts mal inferidos

**Causa**: Gemini no tiene suficiente contexto

**Solución**: Aumentar el snippet de código enviado:

```typescript
// En inferSystemPromptFromBehaviors()
const codeSnippet = file.content.substring(0, 3000); // Aumentar de 2000 a 3000
```

### Problema: Schemas de BD no detectados

**Causa**: Formato no reconocido

**Solución**: Agregar parser custom en `advancedSchemaParser.ts`:

```typescript
// Agregar a analyzeDatabaseSchemas()
const customFiles = files.filter(f => f.name.includes('my-schema'));
if (customFiles.length > 0) {
  const customSchemas = parseCustomSchemas(customFiles);
  schemas.push(...customSchemas);
}
```

---

## 📈 Roadmap

### Próximas Mejoras

- [ ] **Soporte Python**: FastAPI, Django, Flask
- [ ] **Soporte Java**: Spring Boot
- [ ] **Análisis de flujos de negocio**: Secuencias completas
- [ ] **Detección de patrones arquitectónicos**: MVC, Hexagonal, Clean Architecture
- [ ] **Visualización de dependencias**: Grafo de módulos
- [ ] **Análisis de seguridad**: Detectar vulnerabilidades comunes
- [ ] **Performance profiling**: Detectar posibles cuellos de botella
- [ ] **Tests automáticos**: Generar test cases basados en comportamientos

---

## 🤝 Contribuir

¿Encontraste un bug o tienes una mejora?

1. **Reporta issues**: Con ejemplo de proyecto que falla
2. **Agrega parsers**: Para nuevos ORMs/frameworks
3. **Mejora detección**: Nuevos patrones de agentes implícitos
4. **Documenta**: Casos de uso reales

---

## 📚 Referencias

- **Arquitectura completa**: `DEEP_ANALYSIS_ARCHITECTURE.md`
- **Código fuente**:
  - `services/deepProjectAnalyzer.ts` - Analizador principal
  - `services/advancedSchemaParser.ts` - Parser de BD
  - `services/integrationMapper.ts` - Detector de integraciones
- **UI**: `components/AgentConfig.tsx`

---

**¡Listo para auditar proyectos reales complejos! 🚀**
