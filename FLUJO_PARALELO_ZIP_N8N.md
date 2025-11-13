/** FLUJO PARALELO: Auditoría ZIP idéntica a n8n a partir de credenciales

## Arquitectura Implementada

### 🎯 Objetivo
Que los proyectos ZIP (Node.js/TypeScript) se auditen exactamente como los workflows n8n:
- **Step 1-3**: Procesamiento específico (detectar agentes, analizar código, etc.)
- **Step 4 (credenciales) en adelante**: Idéntico al flujo n8n

### 📁 Nuevos Servicios Creados

#### 1. `zipProjectPayloadBuilder.ts`
**Función**: Genera payloads de prueba específicos para proyectos ZIP

```typescript
generateZipProjectPayload(codeProject, language): Promise<Record<string, any>>
```

- Analiza endpoints detectados
- Usa Gemini AI para generar payload realista basado en:
  - Framework (Express, NestJS, etc.)
  - Agentes detectados
  - Herramientas disponibles
  - APIs externas
- Asegura que el payload tenga `conversationId` y campo de mensaje

**Similar a**: `generateSamplePayload()` para n8n

---

#### 2. `codeProjectDependencyAnalyzer.ts`
**Función**: Analiza e identifica dependencias del proyecto ZIP

```typescript
analyzeCodeProjectDependencies(codeProject): CodeProjectDependencies
- databases: DetectedDatabase[]
- tools: DetectedTool[]
- apis: DetectedAPI[]
- credentials: { database, tools, apis }

validateCodeProjectDependencies(dependencies, credentials): { valid, missing }
```

**Similar a**: `analyzeWorkflowDependencies()` para n8n

**Mapea dependencias a campos requeridos**:
- PostgreSQL → [host, port, username, password, database]
- Gmail → [oauth_token, refresh_token]
- Slack → [bot_token, app_token]
- etc.

---

#### 3. `zipToN8nAdapter.ts`
**Función**: Convierte estructura ZIP a estructura n8n para compatibilidad total

```typescript
convertZipAgentsToWorkflowNodes(codeProject): WorkflowNode[]
  // Convierte cada agente a un nodo tipo "agent"
  // Cada herramienta a un nodo tipo "tool"

generateZipWorkflowConnections(nodes): N8nConnection[]
  // Conecta agentes en serie (pipeline)

createZipDependenciesObject(codeProject)
  // Formatea dependencias al formato esperado por n8n

formatZipProjectForPrompt(codeProject): string
  // Crea descripción similar a formatWorkflowForPrompt()
```

**Propósito**: A partir de Step 4, ambos flujos usan las mismas funciones

---

### 🔄 Flujo de Datos

```
PROYECTO ZIP CARGADO
    ↓
[ProjectTypeSelector.tsx]
    ↓ analyzeCodeProject()
    ↓
[AgentConfig.tsx] - codeProject prop recibido
    ↓
    ├─→ useEffect detecta codeProject
    │   ├─ convertZipAgentsToWorkflowNodes()
    │   ├─ generateZipWorkflowConnections()
    │   ├─ generateZipProjectPayload() [Gemini]
    │   └─ fetchAndSetZipCriteria() [Gemini]
    │
    ├─→ Step 1: ZIP específica (ya completa)
    │
    ├─→ Step 2: Auto-complete (no subflows)
    │
    ├─→ Step 3: Mostrar dependencias ZIP
    │   (convertidas a formato n8n)
    │
    ├─→ Step 4: Credenciales [PUNTO DE CONVERGENCIA]
    │   (Idéntico n8n + ZIP)
    │   └─ buildDatabaseConfig()
    │   └─ buildIntegrationConfig()
    │
    └─→ Step 5: Revisión final + Inicio
        └─ handleSubmit() prepara config
        
AUDITORÍA [IDÉNTICA PARA AMBOS]
    ↓
generateTestCases()
    ├─ Detecta tipo (n8n vs ZIP)
    ├─ Genera payloads específicos
    └─ Crea Test Cases

runFullAudit()
    ├─ Valida config
    ├─ Inicializa conversaciones
    ├─ Ejecuta contra endpoint
    ├─ Audita BD (si configurada)
    └─ Genera reporte
```

---

### 🔑 Puntos Clave

#### 1. **Step 1-3 Completamente Diferentes**

**n8n**:
- Step 1: Upload workflow .json → Parse → Detectar endpoints
- Step 2: Upload subflows (si hay)
- Step 3: Config credenciales específicas

**ZIP**:
- Step 1: Upload .zip → Analizar código → Auto-detect agentes
- Step 2: Auto-complete (no subflows)
- Step 3: Show agentes detectados + herramientas

#### 2. **Step 4+ IDÉNTICO**

A partir de credenciales, ambos usan:
- Mismo modal de credenciales
- Misma validación
- Mismo `buildDatabaseConfig()`
- Mismo `buildIntegrationConfig()`
- Mismo flujo de auditoría

#### 3. **Convertir ZIP → N8n Structure**

La clave está en `zipToN8nAdapter.ts`:
- Agentes ZIP se convierten a `WorkflowNode[]` tipo agent
- Herramientas se convierten a `WorkflowNode[]` tipo tool
- Se generan conexiones simuladas (agentes en serie)
- A partir de aquí, el código no sabe la diferencia

#### 4. **Payload Generation**

- **n8n**: Extrae de estructura del workflow → `generateSamplePayload()`
- **ZIP**: Usa Gemini + análisis de endpoints → `generateZipProjectPayload()`

Ambos producen:
```json
{
  "conversationId": "conv_xxx",
  "message/input": "user message",
  "...otros campos": "..."
}
```

#### 5. **Test Case Generation**

`generateTestCases()` detecta:
```typescript
if (workflow) {
  // n8n: usar formatWorkflowForPrompt()
} else if (codeProject) {
  // ZIP: usar formatZipProjectForPrompt()
}
```

Ambos generan `TestCase[]` idénticos en estructura

---

### 🚀 Flujo de Auditoría Real (Idéntico para ambos)

```
runFullAudit()
    ├─ Detectar tipo (isN8nWorkflow vs isCodeProject)
    ├─ Validar endpoint URL
    ├─ Generar test cases
    │  ├─ Para n8n: usa workflow structure
    │  └─ Para ZIP: usa agents convertidos
    ├─ Inicializar conversaciones
    ├─ Ejecutar turno por turno (MAX_CONVERSATION_TURNS = 12)
    │  ├─ Generar mensaje del usuario
    │  ├─ Enviar a endpoint
    │  ├─ Recibir respuesta
    │  ├─ Verificar BD (si configurada)
    │  ├─ Verificar herramientas
    │  └─ Actualizar UI
    ├─ Analizar resultados contra criterios
    └─ Generar reporte
```

**Mismo código para ambos tipos de proyecto**

---

### 📊 Estructura de Tipos

```typescript
// Ambos producen:
AuditConfig {
  workflow?: WorkflowNode[]      // n8n o ZIP convertido
  connections?: N8nConnection[]  // n8n o ZIP generado
  codeProject?: ParsedCodeProject // Original ZIP (si es ZIP)
  samplePayload: Record<string, any>
  endpointUrl: string            // Ambos requieren
  realDatabaseConfig?: RealDatabaseConfig
  integrationConfig?: IntegrationConfig
  criteria: string[]
  // ... resto idéntico
}
```

---

### ✅ Ventajas de esta Arquitectura

1. **No duplicación de código**: Step 4+ completamente compartida
2. **Mantenibilidad**: Cambios en auditoría afectan ambos tipos
3. **Consistencia**: Mismo flujo de verificación para ambos
4. **Extensibilidad**: Agregar nuevo tipo = solo agregar Steps 1-3
5. **Experiencia UX**: Mismo flujo conocido para ambos después de Step 3

---

### 🔧 Archivos Modificados

1. **services/zipProjectPayloadBuilder.ts** ✅ NUEVO
2. **services/codeProjectDependencyAnalyzer.ts** ✅ NUEVO
3. **services/zipToN8nAdapter.ts** ✅ NUEVO
4. **components/AgentConfig.tsx** ✅ MODIFICADO
   - Agregar imports
   - useEffect para procesar codeProject
   - handleGenerateZipPayload()
   - fetchAndSetZipCriteria()

5. **services/geminiService.ts** ✅ YA SOPORTA
   - generateTestCases() detecta tipo
   - runFullAudit() detecta tipo

6. **App.tsx** ✅ YA SOPORTA
   - Recibe codeProject en handleStartAudit()

---

### 🎯 Próximos Pasos

1. **Pruebas**:
   - Cargar ZIP con agentes
   - Verificar que payloads se generen correctamente
   - Verificar que test cases se generen
   - Ejecutar auditoría contra endpoint

2. **Optimizaciones**:
   - Cachear payloads generados
   - Mejor detección de frameworks
   - Validación de agentes mejorada

3. **Expansión**:
   - Soportar Python (FastAPI, Django)
   - Soportar Go (Gin, Echo)
   - Soportar otros lenguajes
*/
