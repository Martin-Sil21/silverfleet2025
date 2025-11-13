# 🔄 Flujo Visual: Detección BD y Credenciales

## ESCENARIO 1: N8N Workflow ✅ FUNCIONA

```
┌─────────────────────────────────────────────────────────────────┐
│                    USUARIO CARGA N8N JSON                      │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
        ┌────────────────────────────────┐
        │  AgentConfig.handleFileUpload()│
        │  parseN8nWorkflow(json)        │
        └────────┬───────────────────────┘
                 │
                 ▼
    ┌──────────────────────────────────┐
    │  n8nParser.ts:parseN8nWorkflow() │
    │  ├─ Extrae nodos                │
    │  ├─ Mapea conexiones            │
    │  └─ Devuelve ParsedN8nWorkflow  │
    └──────────┬─────────────────────┘
               │
               ▼
    ┌────────────────────────────────────┐
    │  workflowDependencyAnalyzer.ts     │
    │  analyzeWorkflowDependencies()     │
    │  ├─ detectDatabases()             │
    │  │  └─ Busca DATABASE_NODE_TYPES  │
    │  │     ['n8n-nodes-base.supabase']│
    │  │     ['n8n-nodes-base.postgres']│
    │  │     ['n8n-nodes-base.mysql']   │
    │  │     etc.                       │
    │  ├─ detectTools()                 │
    │  └─ detectSubflows()              │
    │  RETORNA:                         │
    │  {                                │
    │    databases: [                  │
    │      {                           │
    │        nodeId: "node1"           │
    │        nodeName: "PostgreSQL"    │
    │        databaseType: 'postgres'  │
    │        requiresCredentials: true │
    │      }                           │
    │    ]                            │
    │  }                              │
    └──────────┬───────────────────────┘
               │
               ▼
    ┌─────────────────────────────────────┐
    │  AgentConfig.tsx: renderStep3()     │
    │  ├─ Recibe: dependencies.databases  │
    │  ├─ Agrupa por databaseType         │
    │  └─ Para cada tipo:                 │
    │     ├─ Crea Card                    │
    │     ├─ Muestra: "PostgreSQL DB"     │
    │     ├─ Botón "Configure"            │
    │     └─ onClick → handleConfigureTool│
    └──────────┬───────────────────────┘
               │
               ▼
    ┌────────────────────────────────┐
    │  CredentialModal.tsx (abierto) │
    │  ├─ Título: "PostgreSQL"       │
    │  ├─ Campos:                    │
    │  │  - Host                     │
    │  │  - Port                     │
    │  │  - User                     │
    │  │  - Password                 │
    │  ├─ Botón "Save"               │
    │  └─ Guarda en localStorage     │
    └──────────┬───────────────────────┘
               │
               ▼
    ┌────────────────────────────────┐
    │  dbCredentials Map actualizado │
    │  {                             │
    │    "node1": "cred_abc123"      │
    │  }                             │
    └──────────┬───────────────────────┘
               │
               ▼
    ┌────────────────────────────────┐
    │  AuditConfig guardado con:     │
    │  ├─ dbCredentials map          │
    │  ├─ database.databaseType      │
    │  ├─ database.tables            │
    │  └─ database.operations        │
    └──────────┬───────────────────────┘
               │
               ▼
    ┌────────────────────────────────┐
    │  Auditoría Real / Visual       │
    │  realDatabaseAuditor.ts        │
    │  ├─ Lee credenciales           │
    │  ├─ Se conecta a BD            │
    │  ├─ Verifica cambios           │
    │  └─ ✅ OK                       │
    └────────────────────────────────┘

✅ RESULTADO: Flujo completo, credenciales guardadas
```

---

## ESCENARIO 2: Code Project (ZIP) ❌ INCOMPLETO

```
┌─────────────────────────────────────────────────────────────────┐
│                    USUARIO CARGA ZIP                           │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
        ┌────────────────────────────────┐
        │  CodeAgentUploader.tsx         │
        │  handleZipUpload()             │
        │  ├─ Extrae archivos            │
        │  └─ Llama analyzeCodeProject() │
        └────────┬───────────────────────┘
                 │
                 ▼
    ┌──────────────────────────────────┐
    │  codeProjectAnalyzer.ts          │
    │  analyzeCodeProject(zipBuffer)   │
    │  ├─ extractProjectFiles()        │
    │  ├─ parsePackageJson()           │
    │  ├─ detectFramework()            │
    │  ├─ detectAgents()               │
    │  ├─ detectTools()                │
    │  ├─ detectDatabases()            │
    │  │  └─ Busca por:                │
    │  │     • Dependencias             │
    │  │     • Patrones en código       │
    │  │     • Variables de entorno     │
    │  │     RETORNA:                  │
    │  │     [{                        │
    │  │       provider: 'PostgreSQL'  │
    │  │       confidence: 0.95        │
    │  │       evidence: [...]         │
    │  │       credentials: [...]      │
    │  │     }]                        │
    │  ├─ detectEndpoints()            │
    │  └─ detectEnvironmentVariables()│
    │                                 │
    │  RETORNA: ParsedCodeProject {   │
    │    framework: {...}             │
    │    agents: [...]                │
    │    databases: [...]  ← AQUÍ     │
    │    tools: [...]      ← AQUÍ     │
    │  }                              │
    └──────────┬───────────────────────┘
               │
               ▼
    ┌─────────────────────────────────────┐
    │  ProjectAnalysisDispatcher.tsx      │
    │  (u otra lógica de routing)         │
    │  ├─ Detecta: projectType = 'code'   │
    │  └─ Pasa a:                         │
    │     AgentConfig({                  │
    │       codeProject: ParsedCodeProject│
    │     })                              │
    └──────────┬───────────────────────┘
               │
               ▼
    ┌─────────────────────────────────────┐
    │  AgentConfig.tsx (recibe codeProject)
    │  ├─ State: codeProject = {...}      │
    │  ├─ currentStep = 1                 │
    │  └─ renderStep3():                  │
    │     ├─ Busca: dependencies          │
    │     │  (null, porque no es n8n)     │
    │     ├─ ❌ NO busca: codeProject     │
    │     ├─ rendertools():               │
    │     │  (vacío, sin BD)              │
    │     └─ Continúa a Step 4            │
    │        (criterios, sin credenciales)│
    └──────────┬───────────────────────┘
               │
               ▼ (SIN CREDENCIALES)
    ┌────────────────────────────────┐
    │  AuditConfig guardado CON:     │
    │  ├─ ❌ dbCredentials = empty    │
    │  ├─ codeProject.databases[]    │
    │  └─ (pero no se usarán)        │
    └──────────┬───────────────────────┘
               │
               ▼
    ┌────────────────────────────────┐
    │  Auditoría Real / Visual       │
    │  realDatabaseAuditor.ts        │
    │  ├─ Busca credenciales         │
    │  ├─ ❌ NO ENCUENTRA nada       │
    │  ├─ Intenta conectarse         │
    │  ├─ ❌ FALLA                   │
    │  └─ BD Auditing = SKIPPED      │
    └────────────────────────────────┘

❌ RESULTADO: BD detectada pero credenciales NO pedidas
```

---

## COMPARATIVA EN ÁRBOL

### N8N: Flujo Completo
```
├─ parseN8nWorkflow()
│  └─ workflowDependencyAnalyzer.detectDatabases()
│     ├─ Busca tipos de nodos predefinidos
│     ├─ Si encuentra: Supabase, Postgres, etc.
│     └─ Retorna: DetectedDatabase[] con requiresCredentials=true
│
└─ AgentConfig.renderStep3()
   ├─ Lee: dependencies.databases
   ├─ Agrupa por databaseType
   ├─ Para cada BD: Muestra UI + pide credenciales
   └─ Guarda: dbCredentials Map
```

### Code Project: Flujo Roto
```
├─ analyzeCodeProject()
│  └─ codeProjectAnalyzer.detectDatabases()
│     ├─ Busca: dependencias, patrones, env vars
│     ├─ Si encuentra: pg, mongoose, etc.
│     └─ Retorna: ParsedCodeProject.databases[] con provider, evidence
│
└─ AgentConfig (RECIBE codeProject pero...)
   ├─ ❌ NO lee: codeProject.databases
   ├─ ❌ NO agrupa
   ├─ ❌ NO muestra UI
   └─ ❌ NO pide credenciales
```

---

## MATRIZ DE DECISIÓN: ¿Por Qué Falta?

| Factor | Causa |
|--------|-------|
| **Arquitectura** | AgentConfig diseñado para n8n, asume dependencies |
| **Referencia** | codeProject pasa pero no se procesa |
| **Condicional** | `if (dependencies)` en renderStep3, nunca verifica codeProject |
| **Mapeo** | No hay correspondencia provider → CredentialType para code |
| **Testing** | ZIP testing no llegó a verificar credenciales |

---

## SOLUCIÓN VISUAL

### Antes
```
AgentConfig.renderStep3()
│
├─ if (dependencies) → renderDatabasesFromN8n() ✅
│
├─ if (codeProject) → ??? ❌
│
└─ else → NoToolsCard()
```

### Después
```
AgentConfig.renderStep3()
│
├─ if (dependencies?.databases?.length > 0)
│  └─ renderDatabasesFromN8n() ✅
│
├─ if (codeProject?.databases?.length > 0)
│  └─ renderDatabasesFromCodeProject() ✅ (NUEVA FUNCIÓN)
│     ├─ Agrupa por provider
│     ├─ Mapea provider → CredentialType
│     ├─ Muestra Card por BD
│     ├─ Botón "Configure" abre modal
│     └─ Guarda en dbCredentials Map
│
├─ if (codeProject?.tools?.length > 0)
│  └─ renderToolsFromCodeProject() ✅ (NUEVA FUNCIÓN)
│
└─ else → NoToolsCard()
```

---

## IMPACTO POR ESCENARIO

### Caso 1: PostgreSQL en N8N JSON
```
Actual:  ✅ Detecta → Pide cred → Audita BD
Cambio:  (sin cambios)
```

### Caso 2: PostgreSQL en Code ZIP
```
Actual:  ✅ Detecta → ❌ NO pide cred → ❌ NO audita BD
Cambio:  ✅ Detecta → ✅ Pide cred → ✅ Audita BD
```

### Caso 3: Gmail/Calendar en Code ZIP
```
Actual:  ✅ Detecta → ❌ NO pide cred → ⚠️ No verifica
Cambio:  ✅ Detecta → ✅ Pide cred → ✅ Verifica herramientas
```

---

## LÍNEA DE IMPLEMENTACIÓN

```
Paso 1: Agregar condicional para codeProject en renderStep3()
        ├─ Crear nueva función renderDatabasesFromCodeProject()
        └─ Crear nueva función renderToolsFromCodeProject()

Paso 2: Implementar mapeo provider → CredentialType
        └─ Agregar a credentialsManager.ts

Paso 3: Handlers para BD del código
        ├─ handleConfigureCodeProjectDB()
        └─ Guardar en dbCredentials Map (igual que n8n)

Paso 4: Handlers para tools del código
        ├─ handleConfigureCodeProjectTool()
        └─ Guardar en toolCredentials Map (igual que n8n)

Paso 5: Testing
        ├─ Regresión: ZIP sin BD sigue siendo paso 1
        ├─ Regresión: N8N con BD sigue pidiendo credenciales
        └─ Nuevo: ZIP con BD pide credenciales
```
