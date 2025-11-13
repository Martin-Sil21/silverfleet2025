/**
 * 🔄 ZIP to N8n Config Adapter
 * 
 * Convierte ParsedCodeProject a estructuras que usa el flujo n8n
 * para que a partir de credenciales todo sea idéntico.
 * 
 * Objetivo: Hacer que ambos flujos compartan el mismo código de auditoría
 */

import type { ParsedCodeProject, WorkflowNode, N8nConnection } from '../types';

/**
 * Convierte agentes de código ZIP a nodos de workflow simulados
 * para compatibilidad con el sistema de auditoría n8n
 */
export const convertZipAgentsToWorkflowNodes = (codeProject: ParsedCodeProject): WorkflowNode[] => {
  const nodes: WorkflowNode[] = [];
  let nodeIndex = 0;

  // 1. Convertir bases de datos a nodos especiales con tablas incluidas
  for (const db of codeProject.databases) {
    const dbTables = (db as any).tables?.map((t: any) => t.name || t) || [];
    nodes.push({
      id: `db_${nodeIndex++}`,
      name: `${db.provider} Database`,
      type: 'database',
      nodeType: db.provider.toLowerCase(),
      parameters: {
        provider: db.provider,
      },
      // 🔧 CRÍTICO: Agregar tablas al nodo para que buildDatabaseConfig las encuentre
      tables: dbTables,
    } as any); // Type assertion needed for custom tables field
  }

  // 2. Convertir cada agente detectado a un nodo de tipo "agent"
  for (const agent of codeProject.agents) {
    nodes.push({
      id: `agent_${nodeIndex++}`,
      name: agent.name,
      type: 'agent',
      systemPrompt: agent.systemPrompt || `You are an AI agent named ${agent.name}`,
      parameters: {
        framework: (agent as any).framework || 'Custom',
        description: agent.description,
      },
    });
  }

  // 3. Convertir herramientas detectadas a nodos tool simulados
  for (const tool of codeProject.tools) {
    nodes.push({
      id: `tool_${nodeIndex++}`,
      name: tool.name,
      type: 'tool',
      nodeType: `tool_${tool.type}`,
      parameters: {
        toolType: tool.type,
        toolName: tool.name,
      },
    });
  }

  return nodes;
};

/**
 * Genera conexiones simuladas entre nodos del proyecto ZIP
 */
export const generateZipWorkflowConnections = (nodes: WorkflowNode[]): N8nConnection[] => {
  const connections: N8nConnection[] = [];

  // Conectar agentes en serie
  const agentNodes = nodes.filter(n => n.type === 'agent');
  
  for (let i = 0; i < agentNodes.length - 1; i++) {
    connections.push({
      sourceNodeId: agentNodes[i].id,
      targetNodeId: agentNodes[i + 1].id,
      sourceHandle: 'main',
    });
  }

  return connections;
};

/**
 * Mapea dependencias del proyecto ZIP a formato que espera el sistema n8n
 */
export const createZipDependenciesObject = (codeProject: ParsedCodeProject) => {
  return {
    subflows: [], // ZIP no tiene subflows como n8n
    tools: codeProject.tools.map(tool => ({
      nodeId: `tool_${tool.name}`,
      nodeName: tool.name,
      toolType: tool.type,
      specificType: tool.name,
    })),
    databases: codeProject.databases.map((db, idx) => ({
      nodeId: `db_${idx}`,
      nodeName: db.provider,
      provider: db.provider,
    })),
    apis: codeProject.apis.map((api, idx) => ({
      nodeId: `api_${idx}`,
      serviceName: api.service,
    })),
  };
};

/**
 * Crea una descripción en formato workflow para prompts de Gemini
 * Similar a formatWorkflowForPrompt() de geminiService.ts
 */
export const formatZipProjectForPrompt = (codeProject: ParsedCodeProject): string => {
  const agentDescriptions = codeProject.agents
    .map((agent, idx) => {
      const framework = (agent as any).framework || 'Custom';
      const prompt = agent.systemPrompt?.substring(0, 200) + '...';
      return `Agent ${idx + 1}: ${agent.name} (${framework})\n  Prompt: ${prompt}`;
    })
    .join('\n');

  const toolDescriptions = codeProject.tools
    .map((tool, idx) => `Tool ${idx + 1}: ${tool.name} (${tool.type})`)
    .join('\n');

  const dbDescriptions = codeProject.databases
    .map((db, idx) => `Database ${idx + 1}: ${db.provider}`)
    .join('\n');

  return `
ZIP PROJECT STRUCTURE:
Framework: ${codeProject.framework?.name || 'Unknown'}
Language: ${codeProject.language}

AI AGENTS:
${agentDescriptions || 'None detected'}

EXTERNAL TOOLS:
${toolDescriptions || 'None detected'}

DATABASES:
${dbDescriptions || 'None detected'}

PROJECT ENDPOINTS:
${codeProject.apiEndpoints.map((e, idx) => `${idx + 1}. ${e}`).join('\n')}
`;
};
