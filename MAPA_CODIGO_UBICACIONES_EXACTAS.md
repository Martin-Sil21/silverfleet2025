# 📍 Mapa de Código: Ubicaciones Exactas

## 🔍 Detección de Bases de Datos

### N8N: workflowDependencyAnalyzer.ts

```
📁 services/workflowDependencyAnalyzer.ts

Línea 72-81:        DATABASE_NODE_TYPES array
                    ├─ 'n8n-nodes-base.supabase'
                    ├─ 'n8n-nodes-base.postgres'
                    └─ ... (otros tipos)

Línea 147:          getDatabaseType(nodeType: string)
                    └─ Convierte: "n8n-nodes-base.postgres" → "postgres"

Línea 161:          detectDatabases(nodes: any[])
                    ├─ Itera nodos
                    ├─ Si coincide con DATABASE_NODE_TYPES
                    ├─ Extrae: id, name, tipo, tablas, operaciones
                    └─ Retorna: DetectedDatabase[]

Línea 302-359:      analyzeWorkflowDependencies(nodes: any[])
                    ├─ Llama detectDatabases()
                    ├─ Llama detectTools()
                    ├─ Llama detectSubflows()
                    └─ Retorna: WorkflowDependencies
```

**Flujo N8N**: n8nParser → analyzeWorkflowDependencies → dependencies.databases[]

---

### ZIP: codeProjectAnalyzer.ts

```
📁 services/codeProjectAnalyzer.ts

Línea 51:           analyzeCodeProject(zipBuffer)
                    ├─ extractProjectFiles()
                    ├─ parsePackageJson()
                    ├─ detectFramework()
                    ├─ detectAgents()
                    ├─ detectTools()
                    ├─ detectDatabases() ← AQUÍ
                    ├─ detectAPIs()
                    └─ Retorna: ParsedCodeProject

Línea 413:          detectDatabases(files, dependencies)
                    ├─ Detecta por 3 canales:
                    │  1. Dependencias (package.json)
                    │     └─ keywords: ['pg', 'postgres', 'prisma', ...]
                    │  2. Patrones código (.ts/.js)
                    │     └─ codePatterns: ['createConnection.*postgres', ...]
                    │  3. Variables entorno (.env)
                    │     └─ envPatterns: ['POSTGRES_', 'DATABASE_URL', ...]
                    │
                    └─ Retorna: Map<string, DetectedDatabase>
                       └─ { provider, confidence, evidence, credentials }

Línea 564:          detectDatabaseCredentials(files, dbName)
                    └─ Busca en .env qué variables de env se necesitan
```

**Flujo ZIP**: unzip → analyzeCodeProject → codeProject.databases[]

---

## 🎨 Renderizado de Credenciales

### N8N: AgentConfig.tsx (FUNCIONA)

```
📁 components/AgentConfig.tsx

Línea ~45:          interface AgentConfigProps
                    ├─ codeProject?: ParsedCodeProject | null
                    └─ (no se usa en renderizado)

Línea ~60:          Estado
                    ├─ dependencies: WorkflowDependencies | null
                    ├─ dbCredentials: Map<string, string>
                    └─ currentStep: ConfigStep

Línea ~165:         handleFileUpload (para n8n)
                    ├─ parseN8nWorkflow()
                    ├─ analyzeWorkflowDependencies()
                    ├─ setDependencies(deps)
                    └─ → dependencies se popula

Línea ~960:         renderStep3()
                    ├─ const hasDatabases = 
                    │    (dependencies?.databases || []).length > 0
                    │
                    ├─ if (!hasDatabases && !hasTools)
                    │  └─ return <CheckCircleIcon /> (No tools needed)
                    │
                    ├─ const databasesByType = new Map()
                    │
                    └─ Array.from(databasesByType.entries()).map(
                       ([dbType, nodes]) => {
                         <Card>
                           <h3>{dbType.toUpperCase()} Database</h3>
                           <button onClick={handleConfigureTool(nodeId, dbType, 'db')}>
                             Configure
                           </button>
                         </Card>
                       }
                    )

Línea ~920:         renderStep3() muestra Cards como:
                    ┌─────────────────────────────┐
                    │ POSTGRES Database           │
                    │ Used by 1 node: PostgreSQL  │
                    │              [Configure]    │
                    └─────────────────────────────┘
```

**Flujo Visual N8N**:
```
Step 3 renderiza:
├─ if (dependencies.databases)
│  └─ Muestra Cards por DB type
│     └─ Botón "Configure" → CredentialModal
└─ dbCredentials.set() ← credenciales guardadas
```

---

### ZIP: AgentConfig.tsx (INCOMPLETO)

```
📁 components/AgentConfig.tsx

Línea ~45:          interface AgentConfigProps
                    ├─ codeProject?: ParsedCodeProject | null
                    └─ (LLEGA AQUÍ pero NO se procesa)

Línea ~60:          Estado
                    ├─ dependencies: WorkflowDependencies | null (null para ZIP)
                    ├─ codeProject?: ParsedCodeProject (recibido pero sin usar)
                    ├─ dbCredentials: Map<string, string>
                    └─ currentStep: ConfigStep

Línea ~165:         handleFileUpload (para ZIP)
                    ├─ CodeAgentUploader sube ZIP
                    ├─ analyzeCodeProject() devuelve ParsedCodeProject
                    └─ Pasa a AgentConfig como prop codeProject
                       └─ ❌ Pero NO se asigna a estado!
                       └─ ❌ NO hay setCodeProjectData()
                       └─ ❌ Se queda como prop sin usar

Línea ~960:         renderStep3()
                    ├─ const hasDatabases = 
                    │    (dependencies?.databases || []).length > 0
                    │    ↑ ❌ dependencies es NULL para ZIP
                    │
                    ├─ if (!hasDatabases && !hasTools)
                    │  └─ return <CheckCircleIcon /> ← RESULTADO
                    │                                    (No tools detected)
                    │
                    ├─ ❌ NO EXISTE:
                    │    if (codeProject?.databases?.length > 0)
                    │
                    └─ Termina sin pedir credenciales ❌
```

**Flujo Visual ZIP (Actual - Roto)**:
```
Step 3 renderiza:
├─ if (dependencies.databases)  ← FALSE (null)
│  └─ no entra
├─ ❌ if (codeProject.databases)  ← NO EXISTE
│  └─ nunca se ejecuta
└─ return <NoToolsCard />  ← ❌ RESULTADO INCORRECTO
   (aunque debería mostrar credenciales)
```

---

## 🔐 Almacenamiento de Credenciales

### Map de Credenciales

```
📁 components/AgentConfig.tsx

Línea ~75:          const [dbCredentials, setDbCredentials] = 
                       useState<Map<string, string>>(new Map());

Actualización (N8N):
├─ handleConfigureTool("node1", 'postgres', 'db')
│  └─ setModalConfig({nodeId: "node1", credType: 'postgres'})
│
└─ En CredentialModal.onSave(credId):
   └─ dbCredentials.set("node1", "cred_abc123")

Actualización (ZIP - Necesaria):
├─ handleConfigureCodeProjectDB("PostgreSQL", 'postgres')
│  └─ setModalConfig({
│      nodeId: "code_db_PostgreSQL",  ← Clave única
│      credType: 'postgres'
│     })
│
└─ En CredentialModal.onSave(credId):
   └─ dbCredentials.set("code_db_PostgreSQL", "cred_xyz789")

Resultado en AuditConfig:
├─ dbCredentials: {
│  "node1": "cred_abc123",              // N8N
│  "code_db_PostgreSQL": "cred_xyz789"  // ZIP (si se implementa)
│ }
```

---

## 🔗 Uso en Auditoría

### realDatabaseAuditor.ts

```
📁 services/realDatabaseAuditor.ts

Línea ~XXX:         runRealDatabaseAudit(config: AuditConfig)
                    ├─ Para cada testCase:
                    │  └─ Para cada DetectedDatabase:
                    │     ├─ credId = config.dbCredentials.get(db.nodeId)
                    │     ├─ if (credId)
                    │     │  └─ cred = getCredentialById(credId)
                    │     │     └─ conecta a BD
                    │     │        └─ toma snapshots
                    │     │           └─ compara cambios
                    │     └─ else
                    │        └─ SKIP BD auditing
                    └─ Retorna: DatabaseOperationSummary
```

**Problema actual (ZIP)**:
```
runRealDatabaseAudit() recibe:
├─ config.dbCredentials = {}  (vacío)
├─ Itera config.databases (tiene PostreSQL)
│  └─ credId = config.dbCredentials.get("code_db_PostgreSQL")
│     └─ credId = undefined
│        └─ if (!credId) { SKIP }
│
├─ ❌ No se audita BD
└─ ❌ No se verifica si cumple criterios de BD
```

**Después de fix (ZIP)**:
```
runRealDatabaseAudit() recibe:
├─ config.dbCredentials = {"code_db_PostgreSQL": "cred_xyz789"}
├─ Itera config.databases (tiene PostreSQL)
│  └─ credId = config.dbCredentials.get("code_db_PostgreSQL")
│     └─ credId = "cred_xyz789"
│        └─ if (credId)
│           ├─ cred = getCredentialById("cred_xyz789")
│           ├─ conecta a BD ✅
│           ├─ toma snapshots ✅
│           ├─ compara cambios ✅
│           └─ DatabaseOperationSummary con datos
│
├─ ✅ Se audita BD
└─ ✅ Se verifica criterios de BD
```

---

## 📋 Checklist de Archivos a Modificar

### Archivo 1: credentialsManager.ts

```
📁 services/credentialsManager.ts

AGREGAR (al final, antes de export):

  const PROVIDER_TO_CREDENTIAL_MAP: Record<string, CredentialType> = {
    'PostgreSQL': 'postgres',
    'MySQL': 'mysql',
    'MongoDB': 'mongodb',
    'Supabase': 'supabase',
    'Firebase': 'firebase',
    'Redis': 'redis',
    'Google Sheets': 'google-sheets',
    'Airtable': 'airtable'
  };

  export function mapProviderToCredentialType(
    provider: string
  ): CredentialType {
    return PROVIDER_TO_CREDENTIAL_MAP[provider] || 'postgres';
  }

MODIFICAR (para soportar código):

  - Revisar que todos los CredentialTypes necesarios existan
  - Considerar si es necesario agregar 'mongodb' etc.
```

---

### Archivo 2: AgentConfig.tsx

```
📁 components/AgentConfig.tsx

IMPORTAR (al principio):

  import { mapProviderToCredentialType } from '../services/credentialsManager';

AGREGAR ESTADO (línea ~60):

  const [codeProjectData, setCodeProjectData] = 
    useState<ParsedCodeProject | null>(codeProject);

AGREGAR NUEVA FUNCIÓN (antes de renderStep3):

  const renderDatabasesFromCodeProject = (codeProject: ParsedCodeProject) => {
    // Ver EJEMPLOS_CODIGO_COMPARATIVA.md para código completo (~50 líneas)
  };

AGREGAR NUEVO HANDLER (antes de renderStep3):

  const handleConfigureCodeProjectDB = (
    provider: string,
    credType: CredentialType
  ) => {
    // Ver EJEMPLOS_CODIGO_COMPARATIVA.md para código completo (~20 líneas)
  };

MODIFICAR renderStep3() (línea ~960):

  CAMBIAR:
    if (dependencies?.databases?.length > 0) {
      return renderDatabasesFromN8n();
    }
    return <NoToolsCard />;

  POR:
    if (dependencies?.databases?.length > 0) {
      return renderDatabasesFromN8n();
    }
    
    if (codeProject?.databases?.length > 0) {
      return renderDatabasesFromCodeProject(codeProject);
    }
    
    return <NoToolsCard />;
```

---

## 📊 Estado de Implementación

```
┌────────────────────────────────────────────────────────────┐
│ TAREA: Pedir credenciales para bases de datos en ZIP       │
├────────────────────────────────────────────────────────────┤
│ ANÁLISIS          : ✅ COMPLETO                             │
│ DOCUMENTACIÓN     : ✅ 4 archivos creados                   │
│ IMPLEMENTACIÓN    : ⏳ PENDIENTE                            │
│ TESTING          : ⏳ PENDIENTE                            │
├────────────────────────────────────────────────────────────┤
│ Complejidad       : 🟡 MEDIA (3-4 horas)                   │
│ Riesgo            : 🟢 BAJO (cambios aislados)             │
│ Impacto           : 🔴 ALTO (cierre de gap crítico)        │
└────────────────────────────────────────────────────────────┘
```

---

## Archivos de Análisis Creados

```
✅ RESUMEN_ANALISIS_BD.md                  - Resumen ejecutivo (este archivo)
✅ ANALISIS_DETECCION_BASES_DATOS.md       - Análisis técnico completo
✅ FLUJO_VISUAL_DETECCION_BD.md            - Diagramas y flujos
✅ EJEMPLOS_CODIGO_COMPARATIVA.md          - Código lado a lado
✅ MAPA_CODIGO_UBICACIONES_EXACTAS.md      - Este archivo (ubicaciones)
```

---

## Lecturas Recomendadas (Orden)

1. **RESUMEN_ANALISIS_BD.md** (5 min) - Entender el problema
2. **FLUJO_VISUAL_DETECCION_BD.md** (10 min) - Ver diagramas
3. **EJEMPLOS_CODIGO_COMPARATIVA.md** (20 min) - Código concreto
4. **ANALISIS_DETECCION_BASES_DATOS.md** (30 min) - Detalles técnicos
5. **MAPA_CODIGO_UBICACIONES_EXACTAS.md** (5 min) - Referencias

Total: ~70 minutos para entender completamente.
