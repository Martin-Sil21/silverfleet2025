/**
 * 🔄 Agent Adapter - Arquitectura Agnóstica
 * 
 * Convierte diferentes tipos de agentes a un formato común.
 * Actúa como traductor entre n8n, TypeScript/Node, Python, etc.
 * 
 * Permite que geminiService, auditService y otros servicios
 * trabajen de forma agnóstica sin conocer la tecnología subyacente.
 */

import type { ParsedAgentWorkflow, AuditConfig, AgentSourceType, WorkflowNode, N8nConnection } from '../types';
import { parseN8nWorkflow } from './n8nParser';
import { parseCodeAgent } from './codeAgentParser';

export interface AdapterInput {
  sourceType: AgentSourceType;
  n8nJson?: string; // Para n8n workflows
  codeFiles?: File[]; // Para code agents
}

export interface StandardizedWorkflow {
  sourceType: AgentSourceType;
  nodes: WorkflowNode[];
  connections: N8nConnection[];
  metadata: {
    framework?: string;
    language?: string;
    purpose?: string;
    endpoints?: string[];
  };
}

/**
 * Adaptador principal: convierte cualquier tipo de agente al formato estándar
 */
export const adaptAgentWorkflow = async (input: AdapterInput): Promise<StandardizedWorkflow> => {
  console.log(`🔄 Adapting agent workflow from source type: ${input.sourceType}`);
  
  let parsedWorkflow: ParsedAgentWorkflow;
  
  switch (input.sourceType) {
    case 'n8n':
      if (!input.n8nJson) throw new Error('n8n JSON is required for n8n workflows');
      const n8nParsed = parseN8nWorkflow(input.n8nJson);
      parsedWorkflow = {
        sourceType: 'n8n',
        nodes: n8nParsed.nodes as WorkflowNode[],
        connections: n8nParsed.connections,
        metadata: { 
          sourceType: 'n8n',
          sourceLanguage: 'JSON',
          frameworkOrTechnology: 'n8n'
        },
        detectedEndpoints: n8nParsed.detectedEndpoints,
        rawN8nJson: input.n8nJson,
        rawNodes: n8nParsed.rawNodes,
      };
      break;
    
    case 'typescript-node':
      if (!input.codeFiles) throw new Error('Code files are required for TypeScript/Node workflows');
      parsedWorkflow = await parseCodeAgent(input.codeFiles);
      break;
    
    case 'python':
      throw new Error('Python agents not yet implemented');
    
    default:
      throw new Error(`Unknown agent source type: ${input.sourceType}`);
  }
  
  return {
    sourceType: parsedWorkflow.sourceType,
    nodes: parsedWorkflow.nodes,
    connections: parsedWorkflow.connections,
    metadata: {
      framework: parsedWorkflow.metadata.frameworkOrTechnology,
      language: parsedWorkflow.metadata.sourceLanguage,
      purpose: getWorkflowPurpose(parsedWorkflow.nodes),
      endpoints: parsedWorkflow.detectedEndpoints,
    },
  };
};

/**
 * Extrae el propósito del workflow desde el nodo agente
 */
export const getWorkflowPurpose = (nodes: WorkflowNode[]): string => {
  const agentNode = nodes.find(n => n.type === 'agent');
  if (agentNode && agentNode.type === 'agent') {
    return agentNode.systemPrompt || 'Agent workflow';
  }
  return 'Agent workflow';
};

/**
 * Obtiene estadísticas del workflow
 */
export const getWorkflowStats = (workflow: StandardizedWorkflow) => {
  const agents = workflow.nodes.filter(n => n.type === 'agent');
  const tools = workflow.nodes.filter(n => n.type === 'tool');
  
  return {
    totalNodes: workflow.nodes.length,
    agentCount: agents.length,
    toolCount: tools.length,
    connectionCount: workflow.connections.length,
    sourceType: workflow.sourceType,
    framework: workflow.metadata.framework,
  };
};

/**
 * Convierte un workflow estándar a AuditConfig
 */
export const workflowToAuditConfig = (
  workflow: StandardizedWorkflow,
  overrides: Partial<AuditConfig> = {}
): Partial<AuditConfig> => {
  return {
    workflow: workflow.nodes,
    connections: workflow.connections,
    agentSourceType: workflow.sourceType,
    agentMetadata: {
      sourceType: workflow.sourceType,
      sourceLanguage: workflow.metadata.language,
      frameworkOrTechnology: workflow.metadata.framework,
    },
    criteria: overrides.criteria || [],
    testCaseCount: overrides.testCaseCount || 5,
    auditType: overrides.auditType || 'visual',
    endpointUrl: workflow.metadata.endpoints?.[0] || overrides.endpointUrl,
    samplePayload: overrides.samplePayload || {},
    ...overrides,
  };
};

/**
 * Obtiene el nombre legible del tipo de agente
 */
export const getSourceTypeName = (sourceType: AgentSourceType): string => {
  const names: Record<AgentSourceType, string> = {
    'n8n': 'n8n Workflow',
    'typescript-node': 'TypeScript/Node Agent',
    'python': 'Python Agent',
    'other': 'Other',
  };
  
  return names[sourceType] || 'Unknown';
};

/**
 * Detecta el tipo de agente basado en el contenido cargado
 */
export const detectAgentSourceType = async (
  n8nJson?: string,
  codeFiles?: File[]
): Promise<AgentSourceType> => {
  // Si hay JSON, asumir n8n
  if (n8nJson) {
    try {
      const parsed = JSON.parse(n8nJson);
      if (parsed.nodes && parsed.connections) {
        return 'n8n';
      }
    } catch (e) {
      // No es JSON válido
    }
  }
  
  // Si hay archivos de código
  if (codeFiles && codeFiles.length > 0) {
    for (const file of codeFiles) {
      if (file.name.includes('baileys')) return 'typescript-node';
      if (file.name.includes('openai') || file.name.includes('langchain')) return 'typescript-node';
      if (file.name.endsWith('.ts') || file.name.endsWith('.js')) return 'typescript-node';
    }
    return 'typescript-node';
  }
  
  return 'other';
};

/**
 * Valida que el workflow sea compatible con auditoría
 */
export const validateWorkflow = (workflow: StandardizedWorkflow): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];
  
  // Debe tener al menos un agente
  const agents = workflow.nodes.filter(n => n.type === 'agent');
  if (agents.length === 0) {
    errors.push('Workflow must contain at least one AI agent node');
  }
  
  // Los agentes deben tener system prompt
  for (const agent of agents) {
    if (agent.type === 'agent' && !agent.systemPrompt) {
      errors.push(`Agent "${agent.name}" is missing a system prompt`);
    }
  }
  
  // Las conexiones deben referenciar nodos válidos
  const nodeIds = new Set(workflow.nodes.map(n => n.id));
  for (const conn of workflow.connections) {
    if (!nodeIds.has(conn.sourceNodeId)) {
      errors.push(`Connection references non-existent source node: ${conn.sourceNodeId}`);
    }
    if (!nodeIds.has(conn.targetNodeId)) {
      errors.push(`Connection references non-existent target node: ${conn.targetNodeId}`);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
};
