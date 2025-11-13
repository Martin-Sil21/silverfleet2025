# 💻 Ejemplos de Código: Comparativa N8N vs ZIP

## 1. DETECCIÓN: Cómo detecta N8N vs ZIP

### N8N: Detección por Tipo de Nodo

```typescript
// 📁 workflowDependencyAnalyzer.ts (Línea 72-81)
const DATABASE_NODE_TYPES = [
  'n8n-nodes-base.supabase',    // ← Busca este STRING exacto en JSON
  'n8n-nodes-base.postgres',
  'n8n-nodes-base.mysql',
];

// 📁 workflowDependencyAnalyzer.ts (Línea 161)
function detectDatabases(nodes: any[]): DetectedDatabase[] {
  for (const node of nodes) {
    // INPUT: node.type = "n8n-nodes-base.supabase"
    const isDatabase = DATABASE_NODE_TYPES.some(type => 
      node.type.toLowerCase().includes(type.toLowerCase())
    );
    
    if (isDatabase) {
      // OUTPUT: DetectedDatabase con requiresCredentials: true
      databases.push({
        nodeId: node.id,
        databaseType: getDatabaseType(node.type),  // 'supabase'
        requiresCredentials: true,  // 🔐 Flag crítico
      });
    }
  }
}
```

**Ejemplo JSON n8n:**
```json
{
  "nodes": [
    {
      "id": "postgres_1",
      "name": "PostgreSQL Read",
      "type": "n8n-nodes-base.postgres",
      "parameters": {
        "operation": "executeQuery",
        "query": "SELECT * FROM users"
      }
    }
  ]
}
```

**Detección**: Coincide con `n8n-nodes-base.postgres` → Detecta BD → Pide credenciales ✅

---

### ZIP: Detección Múltiple

```typescript
// 📁 codeProjectAnalyzer.ts (Línea 413)
function detectDatabases(
  files: ExtractedFile[],
  dependencies: Record<string, string>
): DetectedDatabase[] {
  const dbPatterns = {
    postgresql: {
      // Canal 1: Dependencias
      keywords: ['pg', 'postgres', 'typeorm', 'prisma', 'sequelize'],
      
      // Canal 2: Patrones en código
      codePatterns: [
        'createConnection.*postgres',
        'new Client',
        'DATABASE_URL.*postgres'
      ],
      
      // Canal 3: Variables de entorno
      envPatterns: ['POSTGRES_', 'DATABASE_URL', 'DB_HOST']
    },
    mongodb: {
      keywords: ['mongoose', 'mongodb', '@mongodb/client'],
      codePatterns: ['mongoose\\.connect', 'MongoClient'],
      envPatterns: ['MONGODB_', 'MONGO_']
    },
    supabase: {
      keywords: ['@supabase/supabase-js'],
      codePatterns: ['createClient.*supabase', 'supabase\\.from'],
      envPatterns: ['SUPABASE_']
    }
  };

  // Detectar por dependencias
  for (const [dbName, pattern] of Object.entries(dbPatterns)) {
    for (const keyword of pattern.keywords) {
      if (dependencies[keyword]) {  // ← Busca en package.json
        databases.set(dbName, {
          provider: 'PostgreSQL',
          confidence: 0.95,
          evidence: [`Package '${keyword}' found`],  // ← Prueba
          credentials: detectDatabaseCredentials(files, dbName)
        });
      }
    }
  }

  // Detectar por patrones en código
  for (const file of files) {
    for (const pattern of patterns.codePatterns) {
      if (new RegExp(pattern, 'i').test(file.content)) {
        // ← Coincidencia en código TypeScript/JS
        databases.set(dbName, {...});
      }
    }
  }

  // Detectar por .env
  const envFile = files.find(f => f.name === '.env');
  if (envFile) {
    for (const pattern of patterns.envPatterns) {
      if (new RegExp(pattern, 'i').test(envFile.content)) {
        databases.set(dbName, {...});
      }
    }
  }

  return Array.from(databases.values());
}
```

**Ejemplo ZIP con Prisma:**
```
package.json:
  {
    "dependencies": {
      "prisma": "^5.0.0",  // ← Canal 1: detecta "prisma"
      "@prisma/client": "^5.0.0"
    }
  }

src/db.ts:
  const prisma = new PrismaClient();  // ← Canal 2: coincide con patrón
  
.env:
  DATABASE_URL=postgresql://...  // ← Canal 3: coincide con patrón
```

**Detección**: 3 canales encuentran PostgreSQL → Detecta BD → Pero ❌ NO pide credenciales

---

## 2. MAPEO TIPO → CREDENCIALES

### N8N: Mapeo Automático

```typescript
// 📁 workflowDependencyAnalyzer.ts (Línea 147)
function getDatabaseType(nodeType: string): DetectedDatabase['databaseType'] {
  const type = nodeType.toLowerCase();
  
  if (type.includes('supabase')) return 'supabase';      // String exacto
  if (type.includes('postgres')) return 'postgres';      // String exacto
  if (type.includes('mysql')) return 'mysql';            // String exacto
  if (type.includes('mongodb')) return 'mongodb';        // String exacto
  if (type.includes('googlesheets')) return 'google-sheets';
  
  return 'other';
}

// 📁 AgentConfig.tsx (Línea ~980)
handleConfigureTool(firstNode.nodeId, dbType as CredentialType, 'db')
// dbType = 'postgres' (tipo exacto, coincide con CredentialType)

// En CredentialModal:
// - CredentialType['postgres'] → campos: host, port, user, password, db
// - Ya está mapeado 100%
```

**Flujo N8N**:
```
JSON: "type": "n8n-nodes-base.postgres"
  ↓ getDatabaseType()
  → return 'postgres'
  ↓ mapear a CredentialType
  → type = 'postgres' (EXISTE en CredentialType union)
  ↓ CredentialModal muestra campos de postgres
  → usuario ingresa
  ✅ Credenciales guardadas
```

---

### ZIP: Mapeo Falta (GAP IDENTIFICADO)

```typescript
// 📁 codeProjectAnalyzer.ts (Línea ~470)
// Retorna: ParsedCodeProject.databases[]
// Estructura:
{
  provider: 'PostgreSQL',        // ← String amigable, NO es CredentialType
  confidence: 0.95,
  evidence: ['pg in package.json'],
  credentials: ['DATABASE_URL']
}

// En AgentConfig.tsx:
// ❌ codeProject.databases NO se procesa
// ❌ provider = 'PostgreSQL' NO se mapea a CredentialType['postgres']
// ❌ renderStep3() no existe para code projects
```

**Mapeo Necesario (FALTA):**
```typescript
// Este código NO EXISTE:
const mapProviderToCredentialType = (provider: string): CredentialType => {
  // Mapeo manual necesario
  const map: Record<string, CredentialType> = {
    'PostgreSQL': 'postgres',      // ← Relación que falta
    'MySQL': 'mysql',
    'MongoDB': 'mongodb',
    'Supabase': 'supabase',
    'Firebase': 'firebase',
    'Redis': 'redis',
    'Google Sheets': 'google-sheets',
    'Airtable': 'airtable'
  };
  
  return map[provider] || 'postgres';
};
```

**Flujo Code ZIP (Actual - Roto)**:
```
ZIP → analyzeCodeProject()
  ↓
provider: 'PostgreSQL'
  ↓ ??? (NO HAY MAPEO)
  ❌ NO se convierte a CredentialType
  ↓
renderStep3() NO ve nada
  ↓
❌ NO pide credenciales
```

---

## 3. RENDERIZADO DE CREDENCIALES

### N8N: Renderizado Actual (Funciona)

```typescript
// 📁 AgentConfig.tsx (Línea ~960)
const renderStep3 = () => {
  const hasDatabases = (dependencies?.databases || []).length > 0;
  const hasTools = (dependencies?.tools || []).length > 0;

  if (!hasDatabases && !hasTools) {
    return <CheckCircleIcon .../>;  // No necesita credenciales
  }

  // Agrupar bases de datos por tipo
  const databasesByType = new Map<string, DetectedDatabase[]>();
  dependencies?.databases.forEach(db => {
    const existing = databasesByType.get(db.databaseType) || [];
    databasesByType.set(db.databaseType, [...existing, db]);
  });

  return (
    <div className="space-y-6">
      {/* Bases de datos */}
      {hasDatabases && (
        <Card>
          <h2>🗄️ Database Credentials</h2>
          {Array.from(databasesByType.entries()).map(([dbType, nodes]) => {
            const isConfigured = nodes.some(node => 
              dbCredentials.has(node.nodeId)
            );
            
            return (
              <div key={dbType}>
                <h3>{dbType.toUpperCase()} Database</h3>
                <p>Used by {nodes.length} node(s): {nodes.map(n => n.nodeName)}</p>
                
                {isConfigured ? (
                  <button onClick={() => handleConfigureTool(...)}>Change</button>
                ) : (
                  <button onClick={() => handleConfigureTool(...)}>Configure</button>
                )}
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
};
```

**Salida (N8N con Postgres):**
```
┌─────────────────────────────────────┐
│ 🗄️ Database Credentials              │
├─────────────────────────────────────┤
│ POSTGRES Database                    │
│ Used by 1 node: PostgreSQL Read      │
│                           [Configure]│
└─────────────────────────────────────┘
```

---

### ZIP: Renderizado Necesario (NUEVA FUNCIÓN)

```typescript
// 📁 AgentConfig.tsx - NUEVA FUNCIÓN
const renderDatabasesFromCodeProject = (codeProject: ParsedCodeProject) => {
  // Agrupar por provider (similar a n8n, pero con ParsedCodeProject.databases)
  const databasesByType = new Map<string, DetectedDatabase[]>();
  
  codeProject.databases.forEach(db => {
    const existing = databasesByType.get(db.provider) || [];
    databasesByType.set(db.provider, [...existing, db]);
  });

  return (
    <div className="space-y-6">
      <Card>
        <h2>🗄️ Database Credentials (from Code)</h2>
        <p className="text-sm text-gray-600">
          Detected from package.json, code patterns, and .env files
        </p>
        
        {Array.from(databasesByType.entries()).map(([provider, dbs]) => {
          // ← MAPEO NECESARIO
          const credType = mapProviderToCredentialType(provider);
          
          // Usar provider como ID único (ej: "PostgreSQL" → "PostgreSQL_1")
          const configKey = `code_db_${provider}`;
          const isConfigured = dbCredentials.has(configKey);
          
          return (
            <div key={provider} className="p-4 border-2 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">{provider} Database</h3>
                  <p className="text-sm text-gray-600">
                    Evidence: {dbs[0].evidence.slice(0, 2).join(', ')}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Confidence: {(dbs[0].confidence * 100).toFixed(0)}%
                  </p>
                </div>
                
                {isConfigured ? (
                  <div className="flex items-center gap-2">
                    <CheckCircleIcon className="w-6 h-6 text-green-500" />
                    <button
                      type="button"
                      onClick={() => handleConfigureCodeProjectDB(provider, credType)}
                      className="text-sm text-primary-600 hover:underline"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleConfigureCodeProjectDB(provider, credType)}
                    className="px-4 py-2 bg-primary-600 text-white rounded-lg"
                  >
                    Configure
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </Card>
    </div>
  );
};
```

**Salida (ZIP con Prisma + PostgreSQL):**
```
┌──────────────────────────────────────────────┐
│ 🗄️ Database Credentials (from Code)          │
├──────────────────────────────────────────────┤
│ PostgreSQL Database                           │
│ Evidence: pg in package.json, prisma in deps │
│ Confidence: 95%                               │
│                                  [Configure] │
└──────────────────────────────────────────────┘
```

---

## 4. MANEJADORES (Handlers)

### N8N: Handler Actual (Funciona)

```typescript
// 📁 AgentConfig.tsx
const handleConfigureTool = (
  nodeId: string,
  credType: CredentialType,
  category: 'tool' | 'db'
) => {
  // Determina el nombre amigable
  const toolName = getCredentialTypeLabel(credType);
  
  // Abre modal
  setModalConfig({
    nodeId,
    credType,
    toolName,
    category
  });
  
  setModalOpen(true);
};

// En CredentialModal:
// - nodeId = "node1" (ID del nodo en n8n)
// - credType = 'postgres'
// - Al guardar, se ejecuta:
const onSave = (credentialId: string) => {
  if (category === 'db') {
    dbCredentials.set(nodeId, credentialId);
    // dbCredentials Map: { "node1" → "cred_abc123" }
  }
};
```

---

### ZIP: Handler Nuevo (NECESARIO)

```typescript
// 📁 AgentConfig.tsx - NUEVO HANDLER
const handleConfigureCodeProjectDB = (
  provider: string,
  credType: CredentialType
) => {
  // Clave única para code projects
  const configKey = `code_db_${provider}`;
  
  // Abre modal
  setModalConfig({
    nodeId: configKey,  // ← Diferencia: usar provider como ID
    credType,
    toolName: `${provider} Database`,
    category: 'db'
  });
  
  setModalOpen(true);
};

// En CredentialModal:
// - nodeId = "code_db_PostgreSQL" (ID único para este provider)
// - credType = 'postgres' (mapeado desde provider)
// - Al guardar:
const onSave = (credentialId: string) => {
  // Mismo Map de siempre, pero con clave diferente
  dbCredentials.set(
    `code_db_${provider}`,  // Clave
    credentialId             // Valor
  );
  // dbCredentials Map: { "code_db_PostgreSQL" → "cred_xyz789" }
};
```

---

## 5. FLUJO COMPLETO: Antes vs Después

### Antes: Code Project → Sin Credenciales

```typescript
// 1️⃣ Usuario carga ZIP con node-postgres
analyzeCodeProject(zipBuffer)
  ↓
ParsedCodeProject {
  databases: [{
    provider: 'PostgreSQL',
    confidence: 0.95,
    evidence: ['pg in package.json']
  }]
}

// 2️⃣ Llega a AgentConfig
<AgentConfig codeProject={ParsedCodeProject} />

// 3️⃣ renderStep3() se ejecuta
renderStep3() {
  if (dependencies) {  // ← Busca dependencies (n8n)
    // ❌ No entra: dependencies es null
  }
  
  if (codeProject) {   // ← ❌ NO EXISTE ESTA RAMA
    // ❌ No existe renderDatabasesFromCodeProject()
  }
  
  return <NoToolsCard />  // ← Resultado
}

// 4️⃣ Salta a Step 4 (criterios) sin pedir credenciales
// 5️⃣ AuditConfig se guarda SIN dbCredentials
// 6️⃣ Auditoría falla porque no hay credenciales
```

### Después: Code Project → Con Credenciales

```typescript
// 1️⃣ Usuario carga ZIP con node-postgres
analyzeCodeProject(zipBuffer)
  ↓
ParsedCodeProject {
  databases: [{
    provider: 'PostgreSQL',
    confidence: 0.95,
    evidence: ['pg in package.json']
  }]
}

// 2️⃣ Llega a AgentConfig
<AgentConfig codeProject={ParsedCodeProject} />

// 3️⃣ renderStep3() se ejecuta
renderStep3() {
  if (dependencies) {  // ← Busca dependencies (n8n)
    // ❌ No entra: dependencies es null
  }
  
  if (codeProject?.databases?.length > 0) {  // ✅ NUEVA RAMA
    return renderDatabasesFromCodeProject(codeProject);
    // ↓
    // Muestra: "PostgreSQL Database [Configure]"
  }
  
  return <NoToolsCard />
}

// 4️⃣ Usuario hace clic en "Configure"
handleConfigureCodeProjectDB('PostgreSQL', 'postgres')
  ↓
Modal abierto: "Configure PostgreSQL"
  ↓
Usuario ingresa credenciales
  ↓
dbCredentials.set('code_db_PostgreSQL', 'cred_xyz789')

// 5️⃣ AuditConfig se guarda CON dbCredentials
AuditConfig {
  dbCredentials: {
    'code_db_PostgreSQL': 'cred_xyz789'
  }
}

// 6️⃣ Auditoría recibe credenciales y ✅ FUNCIONA
```

---

## 6. TABLA DE EQUIVALENCIAS

| Concepto | N8N | ZIP |
|----------|-----|-----|
| **Detección** | `node.type = 'n8n-nodes-base.postgres'` | Dependencia: `'pg'`, Patrón: `createConnection` |
| **Resultado** | `DetectedDatabase { databaseType: 'postgres' }` | `DetectedDatabase { provider: 'PostgreSQL' }` |
| **Mapeo Tipo** | `'n8n-nodes-base.postgres'` → `'postgres'` | `'PostgreSQL'` → `'postgres'` (FALTA) |
| **ID Único** | Node ID: `'node1'` | Provider: `'code_db_PostgreSQL'` |
| **Storage** | `dbCredentials.set('node1', credId)` | `dbCredentials.set('code_db_PostgreSQL', credId)` |
| **Auditoría** | Lee `dbCredentials['node1']` | Lee `dbCredentials['code_db_PostgreSQL']` |

---

## 7. CÓDIGO A AGREGAR: Resumen Ejecutivo

### En `credentialsManager.ts`:

```typescript
// Nuevo mapeo
export const PROVIDER_TO_CREDENTIAL_TYPE: Record<string, CredentialType> = {
  'PostgreSQL': 'postgres',
  'MySQL': 'mysql',
  'MongoDB': 'mongodb',
  'Supabase': 'supabase',
  'Firebase': 'firebase',
};

export function mapProviderToCredentialType(provider: string): CredentialType {
  return PROVIDER_TO_CREDENTIAL_TYPE[provider] || 'postgres';
}
```

### En `AgentConfig.tsx`:

```typescript
// 1. Nuevo estado
const [codeProjectData, setCodeProjectData] = useState<ParsedCodeProject | null>(codeProject);

// 2. Nueva función de renderizado
const renderDatabasesFromCodeProject = (codeProject: ParsedCodeProject) => {
  // ... (ver código anterior)
};

// 3. Nuevo handler
const handleConfigureCodeProjectDB = (provider: string, credType: CredentialType) => {
  // ... (ver código anterior)
};

// 4. Actualizar renderStep3()
const renderStep3 = () => {
  if (dependencies?.databases?.length > 0) {
    return renderDatabasesFromN8n();
  }
  
  if (codeProject?.databases?.length > 0) {
    return renderDatabasesFromCodeProject(codeProject);
  }
  
  return <NoToolsCard />;
};
```

---

## Checklist de Implementación

- [ ] Agregar `mapProviderToCredentialType()` a `credentialsManager.ts`
- [ ] Agregar `renderDatabasesFromCodeProject()` a `AgentConfig.tsx`
- [ ] Agregar `handleConfigureCodeProjectDB()` a `AgentConfig.tsx`
- [ ] Actualizar `renderStep3()` para incluir rama de `codeProject`
- [ ] Prueba: N8N sigue funcionando (regresión)
- [ ] Prueba: ZIP con BD pide credenciales (nuevo)
- [ ] Prueba: Credenciales se guardan en `dbCredentials` (nuevo)
- [ ] Prueba: Auditoría real recibe y usa credenciales (nuevo)
