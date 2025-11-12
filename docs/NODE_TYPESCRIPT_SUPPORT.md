# 🎯 Silver Fleet - Soporte Node/TypeScript

## ¿Qué es nuevo?

Se agregó soporte completo para auditar proyectos Node.js/TypeScript, además de workflows n8n.

## Flujo de Uso

### 1. Selector de Tipo de Proyecto
Al abrir la app, verás dos opciones:

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│       🤖 Silver Fleet - Auditor de Agentes IA             │
│                                                             │
│   ┌────────────────────┐   ┌────────────────────┐         │
│   │       🔄 n8n       │   │    💻 Node/TS      │         │
│   │   Workflow.json    │   │  Proyecto ZIP      │         │
│   │                    │   │                    │         │
│   │ Seleccionar n8n →  │   │ Cargar ZIP      →  │         │
│   └────────────────────┘   └────────────────────┘         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 2. Cargar ZIP de Proyecto
Si seleccionas "Node/TypeScript", puedes cargar un archivo `.zip` con tu proyecto.

**El ZIP debe contener:**
```
mi-proyecto.zip
├── src/
│   ├── agent.ts          ← Agent IA
│   ├── services.ts       ← Herramientas
│   └── ...
├── package.json          ← Dependencias
├── .env.example          ← Variables de entorno
└── ...
```

**Se IGNORA automáticamente:**
- `node_modules/`
- `.git/`
- `dist/`
- `build/`
- Archivos binarios

### 3. Análisis Automático

El sistema detecta:

#### 🤖 **Agentes IA**
- Busca imports de: `openai`, `langchain`, `anthropic`, `@google/generative-ai`, etc.
- Extrae el `systemPrompt` si existe
- Identifica funciones/clases que usan IA

#### 🗄️ **Bases de Datos**
- `PostgreSQL` → pg, typeorm, prisma
- `MongoDB` → mongoose, mongodb
- `MySQL` → mysql2, sequelize
- `Supabase` → @supabase/supabase-js
- `Firebase` → firebase, firebase-admin
- `Redis` → redis, ioredis

#### 🔧 **Herramientas Externas**
- **Email**: nodemailer, sendgrid, mailgun, gmail
- **Calendar**: google-calendar, outlook
- **Messaging**: slack, telegram, discord, whatsapp, twilio
- **CRM**: salesforce, hubspot
- **Storage**: aws-sdk, s3, firebase, supabase-storage

#### 🌐 **APIs Externas**
- OpenAI
- Google Gemini
- Anthropic Claude
- HuggingFace

#### 📊 **Información del Proyecto**
- Framework: Express, NestJS, Fastify, Hapi
- Lenguaje: TypeScript, JavaScript
- Endpoints HTTP detectados
- Variables de entorno usadas

### 4. Configuración de Auditoría

Después del análisis, sigues el mismo flujo que n8n:

```
Step 1: [✓] Proyecto Cargado → Detecta componentes
Step 2: [✓] Subflows/Tools  → (skipeable para Node/TS)
Step 3: [ ] Credenciales    → Configura BD, APIs, etc.
Step 4: [ ] Criterios       → Auditoría evalúa qué
Step 5: [ ] Revisar         → Final y empezar
```

### 5. Auditoría

La auditoría crea **personas de prueba realistas** basadas en:
- Tipo de proyecto
- Agentes IA detectados
- APIs y herramientas disponibles
- Estructura de BD

Ejemplo para un bot de soporte:
```json
{
  "id": "TC-001",
  "title": "Impatient Customer - Quick Resolution",
  "persona": "María - Impatient customer who values speed",
  "conversationGoal": "Report a billing issue and get immediate refund",
  "initialPayload": {
    "conversationId": "conv_123",
    "userId": "user_456",
    "message": "I was charged twice!",
    "context": { "timestamp": "...", "platform": "web" }
  }
}
```

## Ejemplo: Mi Proyecto Node/TS

### Antes (sin soporte)
❌ No podía cargar ZIP  
❌ No podía analizar código fuente  
❌ Tenía que convertir a workflow n8n manualmente

### Ahora (con soporte Node/TS)
✅ Carga ZIP directamente  
✅ Detecta automáticamente: frameworks, agentes, BD, APIs  
✅ Genera test cases basados en análisis real del código  
✅ Audita igual que n8n  

## Pasos para Auditar tu Proyecto

### 1. Preparar ZIP
```bash
cd mi-proyecto-node
zip -r mi-proyecto.zip . \
  -x "node_modules/*" \
  ".git/*" \
  "dist/*" \
  ".env"
```

### 2. Abrir Silver Fleet
```bash
npm run dev
# http://localhost:3000
```

### 3. Seleccionar Node/TypeScript
Click en el botón "Cargar ZIP"

### 4. Cargar ZIP
Arrastra tu `.zip` o haz click para seleccionar

### 5. Revisar Análisis
Verás:
```
✅ Proyecto analizado:
• Framework: Express
• Agentes IA: 2
• Bases de datos: 1
• Herramientas: 3
• APIs: 1
• Archivos: 127
```

### 6. Configurar y Auditar
Mismo proceso que n8n:
- Paso 3: Credenciales (si necesita BD)
- Paso 4: Criterios de auditoría
- Paso 5: Revisar y empezar

## Tecnologías Soportadas

### Frameworks
- ✅ Express
- ✅ NestJS
- ✅ Fastify
- ✅ Hapi
- (Fácil agregar más)

### Lenguajes
- ✅ TypeScript
- ✅ JavaScript
- (Python support planeado)

### AI Providers
- ✅ OpenAI
- ✅ Google Gemini
- ✅ Anthropic Claude
- ✅ LangChain
- ✅ LlamaIndex
- ✅ HuggingFace
- (Fácil agregar más)

### Bases de Datos
- ✅ PostgreSQL
- ✅ MongoDB
- ✅ MySQL
- ✅ Supabase
- ✅ Firebase
- ✅ Redis
- (Fácil agregar más)

## Arquitectura Técnica

```
user ZIP
    ↓
zipHandler.ts (extrae archivos)
    ↓
codeProjectAnalyzer.ts (analiza código)
    ├─ detectFramework()
    ├─ detectAgents()
    ├─ detectDatabases()
    ├─ detectTools()
    └─ detectAPIs()
    ↓
ParsedCodeProject
    ↓
codeProjectAdapter.ts (convierte a AuditConfig)
    ↓
AuditConfig (compatible con n8n)
    ↓
geminiService (genera test cases, ejecuta auditoría)
    ↓
AuditResult (reporte)
```

## Próximas Mejoras

- [ ] Soporte Python
- [ ] Soporte Go
- [ ] Análisis más profundo de dependencias
- [ ] Extracción de comentarios como documentación
- [ ] Análisis de seguridad del código
- [ ] Validación de tipos automática

## Troubleshooting

### El ZIP no carga
✅ Asegúrate que:
- Es un archivo `.zip` válido
- Contiene archivos `.ts`, `.js`, o `package.json`
- No está corrompido

### No detecta mi framework
✅ Verifica:
- ¿Está en `package.json` como dependencia?
- ¿El código tiene imports explícitos?

### No detecta mi BD
✅ Verifica:
- ¿Está el driver en `package.json`?
- ¿Hay imports en el código?
- ¿Hay variables de entorno en `.env.example`?

## Preguntas?

Consulta los archivos:
- `services/codeProjectAnalyzer.ts` - Lógica de detección
- `services/zipHandler.ts` - Descompresión de ZIP
- `components/ProjectTypeSelector.tsx` - UI de selector
- `services/codeProjectAdapter.ts` - Conversión a AuditConfig
