# 💻 Ejemplos Prácticos: Usando la Arquitectura Multi-Agente

## Ejemplo 1: Parsear un Agente Baileys (WhatsApp)

### Archivos Cargados

**`package.json`**
```json
{
  "name": "baileys-bot",
  "description": "WhatsApp bot para órdenes de construcción",
  "dependencies": {
    "@adiwajshing/baileys": "^6.0.0"
  }
}
```

**`src/agent.ts`**
```typescript
/**
 * Bot de WhatsApp que gestiona órdenes de construcción
 * - Recibe especificaciones de obra
 * - Valida presupuestos
 * - Confirma con el cliente
 */

export async function handleMessage(msg: Message): Promise<void> {
  // ... lógica del agente
}
```

**`src/tools.ts`**
```typescript
/**
 * Valida que el presupuesto esté en rango aceptable
 * @param amount Monto en USD
 * @returns true si es válido
 */
export function validateBudget(amount: number): boolean {
  return amount > 500 && amount < 1000000;
}

/**
 * Guarda la orden en la base de datos
 * @param order Objeto de orden
 */
export async function saveOrder(order: Order): Promise<void> {
  // DB logic
}

/**
 * Envía confirmación por WhatsApp
 */
export async function sendConfirmation(phone: string): Promise<void> {
  // Send logic
}
```

### Cómo Se Parsea

```typescript
import { parseCodeAgent } from '@/services/codeAgentParser';

// 1. Usuario carga archivos
const files = [packageJson, agentTs, toolsTs];

// 2. Se parsean
const workflow = await parseCodeAgent(files);

// 3. Resultado automático
{
  sourceType: 'typescript-node',
  nodes: [
    {
      type: 'agent',
      id: 'main_agent',
      name: 'Code Agent',
      systemPrompt: 'Bot de WhatsApp que gestiona órdenes de construcción...',
      parameters: {
        framework: 'baileys',
        language: 'TypeScript',
        toolCount: 3,
      },
    },
    {
      type: 'tool',
      id: 'tool_1',
      name: 'validateBudget',
      nodeType: 'code-function',
      parameters: {
        functionName: 'validateBudget',
        description: 'Valida que el presupuesto esté en rango aceptable...',
        parameters: [
          { name: 'amount', type: 'number' }
        ],
      },
    },
    // ... más herramientas
  ],
  connections: [
    { sourceNodeId: 'main_agent', targetNodeId: 'tool_1', sourceHandle: 'output_0' },
    { sourceNodeId: 'main_agent', targetNodeId: 'tool_2', sourceHandle: 'output_1' },
    { sourceNodeId: 'main_agent', targetNodeId: 'tool_3', sourceHandle: 'output_2' },
  ],
  metadata: {
    sourceType: 'typescript-node',
    sourceLanguage: 'TypeScript',
    frameworkOrTechnology: 'baileys',
    detectedFramework: 'baileys',
  },
  detectedEndpoints: ['http://localhost:3000'],
}
```

## Ejemplo 2: Usar el Adaptador

```typescript
import { adaptAgentWorkflow, validateWorkflow, getWorkflowStats } from '@/services/agentAdapter';

// Opción A: Adaptador para n8n
const n8nWorkflow = await adaptAgentWorkflow({
  sourceType: 'n8n',
  n8nJson: JSON.stringify(n8nData),
});

// Opción B: Adaptador para TypeScript
const codeWorkflow = await adaptAgentWorkflow({
  sourceType: 'typescript-node',
  codeFiles: [file1, file2, ...],
});

// Validar que sea auditable
const validation = validateWorkflow(n8nWorkflow);
if (!validation.valid) {
  console.error('Errores:', validation.errors);
} else {
  console.log('✅ Workflow válido');
}

// Obtener estadísticas
const stats = getWorkflowStats(n8nWorkflow);
console.log(`Agentes: ${stats.agentCount}, Herramientas: ${stats.toolCount}`);
```

## Ejemplo 3: Crear AuditConfig desde Workflow

```typescript
import { workflowToAuditConfig } from '@/services/agentAdapter';

// Convertir workflow a AuditConfig
const baseConfig = workflowToAuditConfig(standardizedWorkflow, {
  criteria: [
    'No Hallucinations',
    'Maintains Context',
    'Correct Tool Usage',
  ],
  testCaseCount: 5,
  auditType: 'visual',
});

// Completar con datos adicionales
const fullConfig: AuditConfig = {
  ...baseConfig,
  samplePayload: {
    message: 'Quiero presupuesto para obra',
    sender: '+5491234567890',
    conversationId: 'conv_123',
  },
  enableDatabaseTracking: true,
  realDatabaseConfig: {
    type: 'supabase',
    url: 'https://...',
    key: '...',
    tables: ['orders', 'conversations'],
  },
};

// Listo para auditar
console.log('Config listo:', fullConfig);
```

## Ejemplo 4: Uso en AgentConfig Component

```tsx
import React, { useState } from 'react';
import AgentTypeSelector from '@/components/AgentTypeSelector';
import CodeAgentUploader from '@/components/CodeAgentUploader';
import WorkflowUploader from '@/components/WorkflowUploader';
import type { AgentSourceType, ParsedAgentWorkflow } from '@/types';

const AgentConfigComponent = () => {
  const [agentType, setAgentType] = useState<AgentSourceType>('n8n');
  const [workflow, setWorkflow] = useState<ParsedAgentWorkflow | null>(null);
  
  const handleAgentLoaded = (parsedWorkflow: ParsedAgentWorkflow) => {
    setWorkflow(parsedWorkflow);
    console.log('✅ Agent loaded:', parsedWorkflow);
  };
  
  return (
    <div>
      {/* Step 0: Selector */}
      <AgentTypeSelector
        selectedType={agentType}
        onSelectType={(type) => {
          setAgentType(type);
          setWorkflow(null); // Reset
        }}
      />
      
      {/* Step 1: Cargar correspondiente */}
      <div className="mt-6">
        {agentType === 'n8n' && (
          <WorkflowUploader
            onSuccess={handleAgentLoaded}
            onError={(error) => console.error(error)}
          />
        )}
        
        {agentType === 'typescript-node' && (
          <CodeAgentUploader
            onSuccess={handleAgentLoaded}
            onError={(error) => console.error(error)}
          />
        )}
      </div>
      
      {/* Step 2: Mostrar información */}
      {workflow && (
        <div className="mt-6 p-4 bg-green-50 rounded-lg">
          <h3 className="font-bold text-green-900">✅ Agente Cargado</h3>
          <p>Framework: {workflow.metadata.frameworkOrTechnology}</p>
          <p>Nodos: {workflow.nodes.length}</p>
          <p>Conexiones: {workflow.connections.length}</p>
        </div>
      )}
    </div>
  );
};

export default AgentConfigComponent;
```

## Ejemplo 5: Flujo Completo de Auditoría

```typescript
import { adaptAgentWorkflow } from '@/services/agentAdapter';
import { runFullAudit } from '@/services/geminiService';
import type { AuditConfig } from '@/types';

async function auditMyAgent() {
  // 1. Usuario carga agente TypeScript
  const files = [...]; // del file picker
  
  // 2. Adaptar
  const standardized = await adaptAgentWorkflow({
    sourceType: 'typescript-node',
    codeFiles: files,
  });
  
  // 3. Crear config
  const config: AuditConfig = {
    workflow: standardized.nodes,
    connections: standardized.connections,
    criteria: [
      'No Hallucinations',
      'Correct Tool Usage',
      'Maintains Context',
    ],
    testCaseCount: 3,
    samplePayload: {
      message: 'Test message',
      conversationId: 'conv_test',
    },
    auditType: 'visual',
    agentSourceType: standardized.sourceType,
    agentMetadata: standardized.metadata,
  };
  
  // 4. Ejecutar auditoría (funciona igual que n8n!)
  const results = await runFullAudit(
    config,
    'en',
    (progress) => console.log('Progress:', progress.message),
    (result) => console.log('Result:', result),
    () => console.log('Complete!'),
  );
  
  // 5. Generar reporte
  const report = {
    agentType: config.agentSourceType,
    framework: config.agentMetadata?.frameworkOrTechnology,
    testResults: results,
    summary: `Audited ${results.length} test cases`,
  };
  
  return report;
}
```

## Ejemplo 6: Detección Automática de Framework

```typescript
// El parser detecta automáticamente el framework

// Entrada: Archivos de un proyecto
const files = [
  { name: 'package.json', content: '{"dependencies": {"@adiwajshing/baileys": "..."}}'  },
  { name: 'agent.ts', content: 'export function...' },
];

// Proceso interno del parser
const deps = parseJSON(packageJson).dependencies;
if (deps['@adiwajshing/baileys']) framework = 'baileys';
if (deps['openai']) framework = 'openai';
if (deps['langchain']) framework = 'langchain';

// Resultado automático
console.log(workflow.metadata.frameworkOrTechnology); // 'baileys'
```

## Ejemplo 7: Manejo de Errores

```typescript
import { validateWorkflow, adaptAgentWorkflow } from '@/services/agentAdapter';

try {
  // 1. Adaptar
  const workflow = await adaptAgentWorkflow({
    sourceType: 'typescript-node',
    codeFiles: files,
  });
  
  // 2. Validar
  const validation = validateWorkflow(workflow);
  
  if (!validation.valid) {
    // Mostrar errores al usuario
    validation.errors.forEach(error => {
      console.error('❌', error);
      // Error: "Workflow must contain at least one AI agent node"
      // Error: "Connection references non-existent source node: tool_999"
    });
    return;
  }
  
  // 3. Proceder
  console.log('✅ Workflow válido, procediendo con auditoría');
  
} catch (error) {
  if (error instanceof Error) {
    console.error('Error:', error.message);
    // "n8n JSON is required for n8n workflows"
    // "Code files are required for TypeScript/Node workflows"
    // "Unknown agent source type: golang"
  }
}
```

## Ejemplo 8: Exportar Información del Agente

```typescript
import { exportAgentInfo } from '@/services/codeAgentParser';

const workflow = await parseCodeAgent(files);
const info = exportAgentInfo(workflow);

console.log(info);
// {
//   framework: 'baileys',
//   toolCount: 3,
//   tools: [
//     { id: 'tool_1', name: 'validateBudget' },
//     { id: 'tool_2', name: 'saveOrder' },
//     { id: 'tool_3', name: 'sendConfirmation' },
//   ],
//   endpoints: ['http://localhost:3000/webhook'],
//   purpose: 'Bot de WhatsApp que gestiona órdenes de construcción',
// }
```

## Ejemplo 9: Comparar n8n vs TypeScript

```typescript
const n8nWorkflow = await adaptAgentWorkflow({
  sourceType: 'n8n',
  n8nJson: n8nJson,
});

const codeWorkflow = await adaptAgentWorkflow({
  sourceType: 'typescript-node',
  codeFiles: files,
});

// Ambos tienen el mismo formato
console.log(n8nWorkflow.sourceType);    // 'n8n'
console.log(codeWorkflow.sourceType);   // 'typescript-node'

// Pero el estructura es idéntica
console.log(n8nWorkflow.nodes);         // WorkflowNode[]
console.log(codeWorkflow.nodes);        // WorkflowNode[]

// Pueden procesarse de forma idéntica
const config1 = workflowToAuditConfig(n8nWorkflow);
const config2 = workflowToAuditConfig(codeWorkflow);

// Ambos listos para auditar
const result1 = await runFullAudit(config1);
const result2 = await runFullAudit(config2);
```

---

Estos ejemplos te muestran cómo funcionan todos los componentes juntos. ¡Puedes copiar y pegar cualquiera en tu código! 🚀
