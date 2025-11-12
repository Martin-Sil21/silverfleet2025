# 📊 ZIP SUPPORT - DIAGRAMA DE FLUJO

## 🎯 Arquitectura General

```
┌─────────────────────────────────────────────────────────────┐
│                    SILVER FLEET UI                           │
│                                                              │
│  ┌──────────────────────┐      ┌──────────────────────┐    │
│  │   [n8n Workflow]     │      │  [TypeScript/Node]   │    │
│  │   JSON Upload        │      │   ZIP Support  ✨NEW │    │
│  └──────────────────────┘      └──────────────────────┘    │
│         │                              │                   │
│         ▼                              ▼                   │
│  ┌──────────────────┐         ┌──────────────────────┐    │
│  │  n8nParser.ts    │         │ CodeAgentUploader    │    │
│  │  (existing)      │         │ + ZIP Support ✨     │    │
│  └──────────────────┘         └──────────────────────┘    │
│         │                              │                   │
│         └──────────────┬───────────────┘                   │
│                        ▼                                    │
│            ┌────────────────────────┐                      │
│            │   UNIVERSAL ADAPTER    │                      │
│            │   (agentAdapter.ts)    │                      │
│            └────────────────────────┘                      │
│                        │                                    │
│                        ▼                                    │
│            ┌────────────────────────┐                      │
│            │  ParsedAgentWorkflow   │                      │
│            │  {nodes, connections}  │                      │
│            └────────────────────────┘                      │
│                        │                                    │
└────────────────────────┼────────────────────────────────────┘
                         │
                         ▼
        ┌────────────────────────────────────┐
        │     GEMINI AI SERVICE              │
        │  (agnóstico - sin cambios)         │
        │                                    │
        │  • generateTestCases()             │
        │  • runFullAudit()                  │
        │  • analyzeResult()                 │
        └────────────────────────────────────┘
                         │
                         ▼
        ┌────────────────────────────────────┐
        │      AUDIT REPORT                  │
        │  (n8n + TypeScript idénticos)      │
        └────────────────────────────────────┘
```

---

## 📦 ZIP Handler - Detalles

```
┌─────────────────────────────────────────────────────┐
│           USER UPLOADS FILE                          │
│                                                      │
│  Opción 1: archivo.ts (archivo individual)          │
│  Opción 2: proyecto.zip (carpeta comprimida)       │
│  Opción 3: MEZCLA (ambos tipos simultáneamente)    │
└──────────────────────┬──────────────────────────────┘
                       │
        ┌──────────────┴───────────────┐
        │                              │
        ▼                              ▼
┌──────────────────┐          ┌──────────────────┐
│  isZipFile()?    │          │  Regular .ts?    │
│  ✅ YES          │          │  ✅ YES          │
└────────┬─────────┘          └────────┬─────────┘
         │                             │
         ▼                             ▼
┌──────────────────────────┐   ┌──────────────────┐
│ extractZipFile()         │   │  Add directly    │
│ • Lee en memoria         │   │  to File[]       │
│ • Filtra archivos        │   └────────┬─────────┘
│ • Descomprime async      │            │
└────────┬─────────────────┘            │
         │                              │
         ▼                              │
┌──────────────────────────┐            │
│ convertExtractedToFiles()│            │
│ • Convierte a File[]     │            │
└────────┬─────────────────┘            │
         │                              │
         └──────────────┬───────────────┘
                        │
                        ▼
        ┌────────────────────────────────┐
        │  File[] lista para parsear      │
        │  • Contiene .ts, .js, .json    │
        │  • SIN node_modules/           │
        │  • SIN .git/                   │
        │  • SIN .env                    │
        └────────────┬───────────────────┘
                     │
                     ▼
        ┌────────────────────────────────┐
        │  parseCodeAgent()               │
        │  (Existente, sin cambios)       │
        │  Continúa como siempre...       │
        └────────────────────────────────┘
```

---

## 🔄 Comparativa: Antes vs Después

### ANTES (Solo archivos individuales)

```
Usuario tiene proyecto con 100 archivos
            │
            ▼
    1. Seleccionar agent.ts
    2. Seleccionar tools.ts
    3. Seleccionar config.ts
    4. Seleccionar handlers.ts
    5. Seleccionar package.json
    ...
    100. Seleccionar index.ts
            │
            ▼
        ✅ Upload (pero... 100 clicks!)
```

### AHORA (ZIP + archivos individuales)

```
Usuario tiene proyecto con 100 archivos
            │
            ▼
    1. Comprimir: zip -r proyecto.zip .
    2. Arrastra proyecto.zip a Silver Fleet
            │
            ▼
        ✅ Sistema descomprime
        ✅ Filtra automáticamente
        ✅ Procesa todo junto
```

---

## 🛡️ Seguridad - Capas de Filtrado

```
┌─────────────────────────────────────────────────────┐
│                    ZIP FILE                          │
│  ├─ node_modules/  → 🚫 FILTRADO                   │
│  ├─ .git/          → 🚫 FILTRADO                   │
│  ├─ dist/          → 🚫 FILTRADO                   │
│  ├─ build/         → 🚫 FILTRADO                   │
│  ├─ .env           → 🚫 FILTRADO                   │
│  ├─ *.exe          → 🚫 FILTRADO                   │
│  ├─ *.dll          → 🚫 FILTRADO                   │
│  ├─ .DS_Store      → 🚫 FILTRADO                   │
│  └─ src/           → ✅ INCLUIDO                    │
│     ├─ agent.ts    → ✅ PROCESADO                   │
│     ├─ tools.ts    → ✅ PROCESADO                   │
│     └─ config.ts   → ✅ PROCESADO                   │
│  package.json      → ✅ PROCESADO                   │
│  tsconfig.json     → ✅ PROCESADO                   │
└─────────────────────────────────────────────────────┘
           │
           ▼
    ┌─────────────────────┐
    │  zipHandler Filter  │
    │  • Ignora dir       │
    │  • Ignora binarios  │
    │  • Ignora patterns  │
    │  • Valida extensión │
    └─────────────────────┘
           │
           ▼
    ┌─────────────────────┐
    │  Safe File[]        │
    │  Ready to parse     │
    └─────────────────────┘
```

---

## 📱 UX Flow - Lo que ve el usuario

```
PASO 1: Seleccionar Tipo de Agente
┌──────────────────────────────────────┐
│  ¿Qué tipo de agente?                │
│                                      │
│  [n8n Workflow]  [TypeScript/Node]  │
└──────────────────────────────────────┘
         Click en TypeScript/Node
                    │
                    ▼
PASO 2: Cargar Proyecto
┌──────────────────────────────────────┐
│  Drag files or ZIP here              │
│                                      │
│  📦 Drop zone: 50x50px               │
│  "or click to select"                │
└──────────────────────────────────────┘
    Arrastra proyecto.zip aquí
                    │
                    ▼
PASO 3: Procesamiento
┌──────────────────────────────────────┐
│  Parsing your agent...               │
│  [████████████████] 75%              │
└──────────────────────────────────────┘
    Sistema descomprime y parsea
                    │
                    ▼
PASO 4: Resultados
┌──────────────────────────────────────┐
│  ✅ Framework detected: Express       │
│  ✅ Tools detected: 2                 │
│  ✅ Endpoints detected: 1             │
│                                      │
│  [Configure Audit] [Next Step]       │
└──────────────────────────────────────┘
```

---

## 🔗 Código - Conexión de Componentes

```
CodeAgentUploader.tsx
    │
    ├─ handleFileSelect()
    │  │
    │  └─▶ isZipFile(file)
    │      │
    │      └─▶ processZipFile(file)
    │          │
    │          ├─▶ extractZipFile()
    │          │   ├─▶ new JSZip()
    │          │   ├─▶ zip.loadAsync()
    │          │   └─▶ forEach() + filter
    │          │
    │          └─▶ convertExtractedToFiles()
    │              └─▶ File[]
    │
    └─ parseCodeAgent(File[])
       ├─▶ detectFramework()
       ├─▶ extractTools()
       ├─▶ extractEndpoints()
       └─▶ ParsedAgentWorkflow
```

---

## 📊 Estado del Código

```
┌────────────────────────────────────────────────────┐
│  SERVICIOS                                          │
├────────────────────────────────────────────────────┤
│  ✅ services/zipHandler.ts          NEW            │
│  ✅ services/codeAgentParser.ts     Compatible     │
│  ✅ services/geminiService.ts       UNTOUCHED      │
│  ✅ services/n8nParser.ts           UNTOUCHED      │
└────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────┐
│  COMPONENTES                                        │
├────────────────────────────────────────────────────┤
│  ✅ components/CodeAgentUploader.tsx UPDATED       │
│  ✅ components/AgentConfig.tsx       Compatible    │
│  ✅ components/AuditReport.tsx       UNTOUCHED     │
└────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────┐
│  CONFIGURACIÓN                                      │
├────────────────────────────────────────────────────┤
│  ✅ package.json                    +jszip         │
│  ✅ locales/en.json                 +4 keys        │
│  ✅ locales/es.json                 +4 keys        │
│  ✅ types.ts                        COMPATIBLE     │
└────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────┐
│  COMPILACIÓN                                        │
├────────────────────────────────────────────────────┤
│  ✅ npm run build                   ✓ 4.20s        │
│  ✅ TypeScript errors               0              │
│  ✅ Breaking changes                0              │
│  ✅ n8n impact                      0              │
└────────────────────────────────────────────────────┘
```

---

## 🎯 Punto de Entrada - CodeAgentUploader

```
┌─────────────────────────────────────────────────┐
│   CodeAgentUploader.tsx                          │
│                                                 │
│   handleFileSelect(event)                       │
│   │                                             │
│   ├─ Recibe FileList                           │
│   │                                             │
│   ├─ Itera files                               │
│   │  ├─ isZipFile()? → processZipFile()        │
│   │  └─ Archivo regular → agregar directo      │
│   │                                             │
│   ├─ Merge all into File[]                     │
│   │                                             │
│   └─ parseAgent(File[])                        │
│      │                                          │
│      └─ onSuccess(ParsedAgentWorkflow)         │
│         └─ AgentConfig recibe workflow         │
│            └─ Se habilita "Run Audit"          │
│                                                 │
│   handleDrop(event)                            │
│   (Mismo flujo para drag-drop)                 │
└─────────────────────────────────────────────────┘
```

---

## 🚀 Casos de Uso Soportados

```
CASO 1: ZIP único
┌────────────┐
│ agent.zip  │ ──▶ Extrae ──▶ Parsea ──▶ ✅ Audita
└────────────┘

CASO 2: Archivos individuales (como siempre)
┌────────────┐
│ agent.ts   │ ──▶ Parsea ──▶ ✅ Audita
└────────────┘

CASO 3: Mezcla
┌────────────┐
│ agent.zip  │ ──▶ Extrae ──┐
└────────────┘              │
                            ├─ Merge ──▶ Parsea ──▶ ✅ Audita
┌────────────┐              │
│ tools.ts   │ ──────────────┘
└────────────┘

CASO 4: Múltiples ZIPs
┌────────────┐
│ agent1.zip │ ──▶ Extrae ──┐
└────────────┘              │
                            ├─ Merge ──▶ Parsea ──▶ ✅ Audita
┌────────────┐              │
│ agent2.zip │ ──▶ Extrae ──┘
└────────────┘
```

---

## ✨ Conclusión

El flujo es **clean, seguro, eficiente**:

1. **Usuario** carga archivo (ZIP o individual)
2. **Sistema** detecta tipo
3. **Sistema** descomprime si es ZIP
4. **Sistema** filtra automáticamente
5. **Sistema** parsea como siempre
6. **Usuario** audita normalmente

**0 cambios al pipeline existente. 0 breaking changes. 100% seguro.**

