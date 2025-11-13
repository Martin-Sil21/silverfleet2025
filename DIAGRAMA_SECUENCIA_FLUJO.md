# 🔄 Diagrama de Secuencia: N8N vs ZIP

## Secuencia N8N (Funciona Completo)

```
┌─────────────┐                    ┌──────────────┐                ┌─────────────┐
│   Usuario   │                    │ AgentConfig  │                │  Servicios  │
│             │                    │              │                │             │
└──────┬──────┘                    └──────┬───────┘                └────────┬────┘
       │                                   │                               │
       │ 1. Carga workflow.json           │                               │
       ├──────────────────────────────────>│                               │
       │    (con Supabase node)            │                               │
       │                                   │ 2. parseN8nWorkflow()        │
       │                                   ├──────────────────────────────>│
       │                                   │   (n8nParser.ts)             │
       │                                   │                               │
       │                                   │<──── ParsedN8nWorkflow ───────┤
       │                                   │   (nodes, connections)        │
       │                                   │                               │
       │                                   │ 3. analyzeWorkflowDependencies()
       │                                   ├──────────────────────────────>│
       │                                   │   (workflowDependencyAnalyzer)│
       │                                   │                               │
       │                                   │<── WorkflowDependencies ──────┤
       │                                   │   (databases[...],            │
       │                                   │    tools[...])                │
       │                                   │                               │
       │                                   │ 4. setDependencies(deps)      │
       │                                   │                               │
       │                                   │ 5. Avanza a Step 3            │
       │                                   │ setCurrentStep(3)             │
       │                                   │                               │
       │                                   │ 6. renderStep3()              │
       │                                   │    • Agrega BD por tipo       │
       │                                   │    • Renderiza Cards          │
       │                                   │    • Muestra [Configure]      │
       │                                   │                               │
       │ 7. Click en [Configure]           │                               │
       ├──────────────────────────────────>│                               │
       │ (PostgreSQL Database)             │                               │
       │                                   │ 8. handleConfigureTool()      │
       │                                   │    ("node1", "postgres", "db")│
       │                                   │                               │
       │                                   │ 9. Abre CredentialModal       │
       │                                   │                               │
       │ 10. Ingresa credenciales          │                               │
       ├──────────────────────────────────>│                               │
       │ (host, port, user, password)      │                               │
       │                                   │ 11. CredentialModal.onSave()  │
       │                                   │     • Guarda en localStorage  │
       │                                   │     • Genera credentialId     │
       │                                   │     • dbCredentials.set()     │
       │                                   │                               │
       │<─────────────────────────────────┤ 12. Modal cierra              │
       │ Credenciales guardadas            │                               │
       │                                   │                               │
       │                                   │ 13. Estado actualizado        │
       │                                   │ dbCredentials = {             │
       │                                   │   "node1": "cred_abc123"      │
       │                                   │ }                             │
       │                                   │                               │
       │ 14. Click [Siguiente]             │                               │
       ├──────────────────────────────────>│                               │
       │                                   │ 15. Step 4 (criterios)        │
       │                                   │                               │
       │ ... criterios, test cases ...     │                               │
       │                                   │                               │
       │ 16. Click [Iniciar Auditoría]     │                               │
       ├──────────────────────────────────>│                               │
       │                                   │ 17. buildAuditConfig()        │
       │                                   │     AuditConfig {             │
       │                                   │       dbCredentials: {...}    │
       │                                   │     }                         │
       │                                   │                               │
       │                                   │ 18. onStartAudit(config)      │
       │                                   ├───────────────────────────────>│
       │                                   │                               │
       │                                   │   realDatabaseAuditor.ts      │
       │                                   │   ├─ credId = dbCredentials   │
       │                                   │   │  .get("node1")            │
       │                                   │   ├─ cred = getCredentialById │
       │                                   │   ├─ conecta a Supabase ✅    │
       │                                   │   ├─ toma snapshots ✅        │
       │                                   │   ├─ verifica cambios ✅      │
       │                                   │   └─ retorna results ✅       │
       │                                   │                               │
       │<──────────────────────────────────┤ 19. Auditoría completada ✅   │
       │                                   │                               │
       └─────────────────────────────────────────────────────────────────────
```

---

## Secuencia ZIP (Actual - Incompleto)

```
┌─────────────┐                    ┌──────────────┐                ┌─────────────┐
│   Usuario   │                    │ AgentConfig  │                │  Servicios  │
│             │                    │              │                │             │
└──────┬──────┘                    └──────┬───────┘                └────────┬────┘
       │                                   │                               │
       │ 1. Carga proyecto.zip             │                               │
       ├──────────────────────────────────>│                               │
       │    (con prisma + postgres)        │                               │
       │                                   │ 2. CodeAgentUploader          │
       │                                   │ handleZipUpload()             │
       │                                   │                               │
       │                                   │ 3. analyzeCodeProject()       │
       │                                   ├──────────────────────────────>│
       │                                   │   (codeProjectAnalyzer.ts)    │
       │                                   │                               │
       │                                   │   detectDatabases():          │
       │                                   │   ├─ Busca en package.json    │
       │                                   │   ├─ "prisma", "pg" → found   │
       │                                   │   ├─ Busca en .env            │
       │                                   │   ├─ DATABASE_URL → found     │
       │                                   │   ├─ Busca en código          │
       │                                   │   └─ createConnection → found │
       │                                   │                               │
       │                                   │<──── ParsedCodeProject ───────┤
       │                                   │   {                           │
       │                                   │    databases: [{              │
       │                                   │      provider: 'PostgreSQL'   │
       │                                   │      confidence: 0.95         │
       │                                   │      evidence: [...]          │
       │                                   │    }]                         │
       │                                   │   }                           │
       │                                   │                               │
       │                                   │ 4. Props: codeProject={...}   │
       │                                   │                               │
       │                                   │ 5. currentStep = 1 (default)  │
       │                                   │                               │
       │                                   │ 6. Usuario completa Step 1    │
       │                                   │    (sin upload n8n)           │
       │                                   │                               │
       │ 7. Click [Siguiente]              │                               │
       ├──────────────────────────────────>│                               │
       │                                   │ 8. Avanza a Step 2 (subflows) │
       │                                   │    (vacío para ZIP)           │
       │                                   │                               │
       │ 9. Click [Siguiente]              │                               │
       ├──────────────────────────────────>│                               │
       │                                   │ 10. Avanza a Step 3           │
       │                                   │     renderStep3()             │
       │                                   │                               │
       │                                   │ 11. Intenta renderizar:       │
       │                                   │     ├─ hasDatabases =         │
       │                                   │     │  (dependencies?.        │
       │                                   │     │   databases || [])      │
       │                                   │     │  .length > 0            │
       │                                   │     ├─ dependencies = null    │
       │                                   │     ├─ hasDatabases = false   │
       │                                   │                               │
       │                                   │ 12. ❌ Condicional falla      │
       │                                   │     Busca: dependencies       │
       │                                   │     Encuentra: null           │
       │                                   │     NO busca: codeProject     │
       │                                   │                               │
       │                                   │ 13. ❌ Renderiza:             │
       │                                   │     <CheckCircleIcon />       │
       │                                   │     "No External Tools"       │
       │                                   │                               │
       │<─────────────────────────────────┤ 14. Muestra "No tools needed" │
       │ ⚠️ Ver: "No tools" (INCORRECTO)   │                               │
       │   (Pero detectó PostgreSQL!)      │                               │
       │                                   │                               │
       │ 15. Click [Siguiente]             │                               │
       ├──────────────────────────────────>│                               │
       │                                   │ 16. Step 4 (criterios)        │
       │                                   │                               │
       │ ... criterios, test cases ...     │                               │
       │                                   │                               │
       │ 17. Click [Iniciar Auditoría]     │                               │
       ├──────────────────────────────────>│                               │
       │                                   │ 18. buildAuditConfig()        │
       │                                   │     AuditConfig {             │
       │                                   │       dbCredentials: {} ❌    │
       │                                   │       codeProject: {...} ✅   │
       │                                   │     }                         │
       │                                   │                               │
       │                                   │ 19. onStartAudit(config)      │
       │                                   ├───────────────────────────────>│
       │                                   │                               │
       │                                   │   realDatabaseAuditor.ts      │
       │                                   │   ├─ credId = dbCredentials   │
       │                                   │   │  .get(db.nodeId)          │
       │                                   │   ├─ credId = undefined ❌    │
       │                                   │   ├─ if (!credId) SKIP ❌     │
       │                                   │   ├─ NO conecta a BD ❌       │
       │                                   │   ├─ NO toma snapshots ❌     │
       │                                   │   ├─ NO verifica cambios ❌   │
       │                                   │   └─ DatabaseOperationSummary│
       │                                   │      = { empty } ❌           │
       │                                   │                               │
       │<──────────────────────────────────┤ 20. Auditoría SIN BD ❌       │
       │                                   │                               │
       │ 21. Reporte final:                │                               │
       │     ✅ Criterios: Incompleto      │                               │
       │     ❌ BD Auditing: Skipped       │                               │
       │     ⚠️ Conversaciones: OK          │                               │
       │                                   │                               │
       └─────────────────────────────────────────────────────────────────────
```

---

## Secuencia ZIP (Después de Fix)

```
┌─────────────┐                    ┌──────────────┐                ┌─────────────┐
│   Usuario   │                    │ AgentConfig  │                │  Servicios  │
│             │                    │              │                │             │
└──────┬──────┘                    └──────┬───────┘                └────────┬────┘
       │                                   │                               │
       │ 1-4. (igual a anterior)           │                               │
       │      codeProject llega con        │                               │
       │      databases: [{PostgreSQL}]    │                               │
       │                                   │                               │
       │ 5-10. (igual a anterior)          │                               │
       │       Llega a Step 3              │                               │
       │                                   │                               │
       │                                   │ 11. renderStep3() (MEJORADO)  │
       │                                   │     if (dependencies?.db)      │
       │                                   │       → false (null)           │
       │                                   │     if (codeProject?.db) ✅    │
       │                                   │       → true (tiene datos)     │
       │                                   │                               │
       │                                   │ 12. renderDatabasesFromCode() │
       │                                   │     (NUEVA FUNCIÓN)           │
       │                                   │     ├─ Agrupa por provider    │
       │                                   │     ├─ mapProviderToCredType  │
       │                                   │     │  'PostgreSQL' → 'pg'     │
       │                                   │     └─ Renderiza Cards        │
       │                                   │                               │
       │<─────────────────────────────────┤ 13. Muestra:                  │
       │ Ver: "PostgreSQL Database ✅"     │     ┌──────────────────────┐  │
       │      "Evidence: pg in deps"       │     │ PostgreSQL Database  │  │
       │      "Confidence: 95%"            │     │ Evidence: pg, prisma │  │
       │      [Configure]                  │     │          [Configure] │  │
       │                                   │     └──────────────────────┘  │
       │                                   │                               │
       │ 14. Click [Configure]             │                               │
       ├──────────────────────────────────>│                               │
       │                                   │ 15. handleConfigureCodeProjectDB()
       │                                   │     "PostgreSQL", 'postgres'   │
       │                                   │     setModalConfig({            │
       │                                   │       nodeId: "code_db_PG"      │
       │                                   │       credType: 'postgres'      │
       │                                   │     })                          │
       │                                   │                               │
       │                                   │ 16. Abre CredentialModal      │
       │                                   │                               │
       │ 17. Ingresa credenciales          │                               │
       ├──────────────────────────────────>│                               │
       │ (host, port, user, password)      │                               │
       │                                   │ 18. CredentialModal.onSave()  │
       │                                   │     • Guarda en localStorage  │
       │                                   │     • Genera credentialId     │
       │                                   │     • dbCredentials.set(      │
       │                                   │        "code_db_PG",          │
       │                                   │        credId                 │
       │                                   │     ) ✅ (NUEVO)              │
       │                                   │                               │
       │<─────────────────────────────────┤ 19. Modal cierra              │
       │ Credenciales guardadas ✅         │                               │
       │                                   │                               │
       │                                   │ 20. Estado actualizado        │
       │                                   │ dbCredentials = {             │
       │                                   │   "code_db_PostgreSQL":       │
       │                                   │   "cred_xyz789"               │
       │                                   │ } ✅                          │
       │                                   │                               │
       │ 21. Click [Siguiente]             │                               │
       ├──────────────────────────────────>│                               │
       │                                   │ 22. Step 4 (criterios)        │
       │                                   │                               │
       │ ... criterios, test cases ...     │                               │
       │                                   │                               │
       │ 23. Click [Iniciar Auditoría]     │                               │
       ├──────────────────────────────────>│                               │
       │                                   │ 24. buildAuditConfig()        │
       │                                   │     AuditConfig {             │
       │                                   │       dbCredentials: {        │
       │                                   │         "code_db_PG": "cred"  │
       │                                   │       } ✅ (NUEVO)            │
       │                                   │     }                         │
       │                                   │                               │
       │                                   │ 25. onStartAudit(config)      │
       │                                   ├───────────────────────────────>│
       │                                   │                               │
       │                                   │   realDatabaseAuditor.ts      │
       │                                   │   ├─ credId = dbCredentials   │
       │                                   │   │  .get("code_db_PG")       │
       │                                   │   ├─ credId = "cred_xyz789"   │
       │                                   │   ├─ if (credId) ✅            │
       │                                   │   ├─ cred = getCredentialById │
       │                                   │   ├─ conecta a PostgreSQL ✅  │
       │                                   │   ├─ toma snapshots ✅        │
       │                                   │   ├─ verifica cambios ✅      │
       │                                   │   └─ retorna results ✅       │
       │                                   │                               │
       │<──────────────────────────────────┤ 26. Auditoría completada ✅   │
       │                                   │                               │
       │ 27. Reporte final:                │                               │
       │     ✅ Criterios: OK              │                               │
       │     ✅ BD Auditing: OK            │                               │
       │     ✅ Conversaciones: OK          │                               │
       │                                   │                               │
       └─────────────────────────────────────────────────────────────────────
```

---

## Comparativa Visual

### N8N ✅
```
Upload JSON
  ↓
parseN8nWorkflow()
  ↓
analyzeWorkflowDependencies()
  ↓
dependencies.databases[] POPULATED
  ↓
renderStep3() FINDS dependencies
  ↓
showsUI, pide credenciales
  ↓
dbCredentials.set()
  ↓
Auditoría RECIBE credenciales
  ↓
✅ realDatabaseAuditor CONECTA A BD
```

### ZIP Actual ❌
```
Upload ZIP
  ↓
analyzeCodeProject()
  ↓
codeProject.databases[] POPULATED ✅
  ↓
renderStep3() BUSCA dependencies ❌
  ↓
dependencies = null ❌
  ↓
NO muestra UI ❌
  ↓
NO pide credenciales ❌
  ↓
dbCredentials = {} ❌
  ↓
Auditoría NO RECIBE credenciales ❌
  ↓
❌ realDatabaseAuditor SKIPS BD
```

### ZIP Después de Fix ✅
```
Upload ZIP
  ↓
analyzeCodeProject()
  ↓
codeProject.databases[] POPULATED ✅
  ↓
renderStep3() BUSCA codeProject ✅ (NUEVA RAMA)
  ↓
codeProject.databases FOUND ✅
  ↓
renderDatabasesFromCodeProject() ✅ (NUEVA FUNCIÓN)
  ↓
showsUI, pide credenciales ✅
  ↓
dbCredentials.set() ✅
  ↓
Auditoría RECIBE credenciales ✅
  ↓
✅ realDatabaseAuditor CONECTA A BD
```

---

## Puntos Críticos del Flujo

| Paso | N8N | ZIP (Actual) | ZIP (Fix) |
|------|-----|------------|-----------|
| **Detecta BD** | ✅ | ✅ | ✅ |
| **Busca en renderStep3()** | ✅ dependencies | ❌ null | ✅ codeProject |
| **Mapea a CredentialType** | Automático | N/A | Mapeo nuevo |
| **Pide credenciales** | ✅ UI Modal | ❌ No existe | ✅ UI Modal |
| **Guarda credenciales** | ✅ dbCredentials | ❌ Nunca | ✅ dbCredentials |
| **Recibe en auditoría** | ✅ | ❌ | ✅ |
| **Conecta a BD** | ✅ | ❌ SKIP | ✅ |

