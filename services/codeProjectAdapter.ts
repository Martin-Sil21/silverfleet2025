/**
 * 🔌 Code Project to Audit Config Adapter
 * 
 * Convierte ParsedCodeProject a AuditConfig compatible
 * para reusar toda la lógica de auditoría existente
 */

import { ParsedCodeProject, AuditConfig, WorkflowNode, AgentNode, ToolNode, N8nConnection } from '../types';

/**
 * Convierte un proyecto Node/TypeScript analizado a una estructura de AuditConfig
 * compatible con el resto del sistema
 */
export function convertCodeProjectToAuditConfig(
  codeProject: ParsedCodeProject,
  criteria: string[],
  testCaseCount: number
): AuditConfig {
  // 1. Crear nodos para agentes IA
  const agentNodes: AgentNode[] = codeProject.agents.map((agent, idx) => ({
    type: 'agent',
    id: `agent-${idx}`,
    name: agent.name,
    systemPrompt: agent.systemPrompt || `AI Agent: ${agent.name}`,
    parameters: {
      description: agent.description,
      filePath: agent.filePath,
      imports: agent.imports,
    },
  }));

  // 2. Crear nodos para herramientas
  const toolNodes: ToolNode[] = codeProject.tools.map((tool, idx) => ({
    type: 'tool',
    id: `tool-${idx}`,
    name: tool.name,
    nodeType: tool.type,
    parameters: {
      type: tool.type,
      confidence: tool.confidence,
      evidence: tool.evidence,
    },
  }));

  // 3. Crear nodos para bases de datos
  const dbNodes: ToolNode[] = codeProject.databases.map((db, idx) => ({
    type: 'tool',
    id: `db-${idx}`,
    name: db.provider,
    nodeType: 'database',
    parameters: {
      provider: db.provider,
      confidence: db.confidence,
      evidence: db.evidence,
      credentials: db.credentials,
    },
  }));

  // 4. Crear nodos para APIs
  const apiNodes: ToolNode[] = codeProject.apis.map((api, idx) => ({
    type: 'tool',
    id: `api-${idx}`,
    name: api.service,
    nodeType: 'api',
    parameters: {
      service: api.service,
      type: api.type,
      confidence: api.confidence,
      evidence: api.evidence,
    },
  }));

  // 5. Combinar todos los nodos
  const allNodes: WorkflowNode[] = [
    ...agentNodes,
    ...toolNodes,
    ...dbNodes,
    ...apiNodes,
  ];

  // 6. Crear conexiones simuladas (agentes → herramientas)
  const connections: N8nConnection[] = [];
  agentNodes.forEach((agent) => {
    // Conectar cada agente a todas las herramientas
    toolNodes.forEach((tool) => {
      connections.push({
        sourceNodeId: agent.id,
        targetNodeId: tool.id,
        sourceHandle: 'default',
      });
    });
  });

  // 7. Generar payload de ejemplo
  const samplePayload = generateSamplePayloadFromProject(codeProject);

  // 8. Generar descripción del proyecto para prompt de Gemini
  const projectDescription = generateProjectDescription(codeProject);

  const config: AuditConfig = {
    workflow: allNodes,
    connections,
    criteria,
    testCaseCount,
    samplePayload,
    auditType: 'visual', // Por defecto, visual para proyectos Node/TS
    // Información adicional para referencia
    rawN8nJson: JSON.stringify({
      nodes: allNodes,
      connections,
      projectInfo: {
        projectType: codeProject.projectType,
        framework: codeProject.framework,
        language: codeProject.language,
        summary: codeProject.summary,
        fileCount: codeProject.fileCount,
        totalLines: codeProject.totalLines,
        apiEndpoints: codeProject.apiEndpoints,
      },
    }, null, 2),
  };

  return config;
}

/**
 * Genera un payload de ejemplo basado en el proyecto
 */
function generateSamplePayloadFromProject(codeProject: ParsedCodeProject): Record<string, any> {
  const payload: Record<string, any> = {
    // IDs y identificadores
    conversationId: `conv_${Date.now()}`,
    userId: 'user_123',
    
    // Información de usuario
    user: {
      id: 'user_123',
      name: 'Test User',
      email: 'test@example.com',
    },
    
    // Mensaje de entrada
    message: 'Hello, I need assistance',
    
    // Contexto
    context: {
      timestamp: new Date().toISOString(),
      platform: 'web',
      locale: 'en-US',
    },
    
    // Metadatos del proyecto
    project: {
      type: codeProject.projectType,
      framework: codeProject.framework?.name,
      agents: codeProject.agents.length,
      databases: codeProject.databases.map(d => d.provider),
      tools: codeProject.tools.map(t => t.name),
    },
  };
  
  // Agregar endpoints si existen
  if (codeProject.apiEndpoints && codeProject.apiEndpoints.length > 0) {
    payload.endpoint = codeProject.apiEndpoints[0];
  }
  
  return payload;
}

/**
 * Genera descripción del proyecto para usar en prompts de Gemini
 */
function generateProjectDescription(codeProject: ParsedCodeProject): string {
  const parts: string[] = [];
  
  parts.push(`## Project Analysis`);
  parts.push(`- **Type**: ${codeProject.projectType}`);
  if (codeProject.framework) {
    parts.push(`- **Framework**: ${codeProject.framework.name} (confidence: ${(codeProject.framework.confidence * 100).toFixed(0)}%)`);
  }
  parts.push(`- **Language**: ${codeProject.language}`);
  parts.push(`- **Files**: ${codeProject.fileCount}, ~${codeProject.totalLines} lines total`);
  
  if (codeProject.agents.length > 0) {
    parts.push(`\n### AI Agents (${codeProject.agents.length})`);
    codeProject.agents.forEach(agent => {
      parts.push(`- **${agent.name}** (${agent.filePath}): ${agent.description}`);
      if (agent.systemPrompt) {
        parts.push(`  - System Prompt: ${agent.systemPrompt.substring(0, 100)}...`);
      }
    });
  }
  
  if (codeProject.databases.length > 0) {
    parts.push(`\n### Databases (${codeProject.databases.length})`);
    codeProject.databases.forEach(db => {
      parts.push(`- **${db.provider}**: ${db.evidence.join(', ')}`);
    });
  }
  
  if (codeProject.tools.length > 0) {
    parts.push(`\n### External Tools (${codeProject.tools.length})`);
    codeProject.tools.forEach(tool => {
      parts.push(`- **${tool.name}** (${tool.type}): ${tool.evidence.join(', ')}`);
    });
  }
  
  if (codeProject.apis.length > 0) {
    parts.push(`\n### External APIs (${codeProject.apis.length})`);
    codeProject.apis.forEach(api => {
      parts.push(`- **${api.service}** (${api.type}): ${api.evidence.join(', ')}`);
    });
  }
  
  if (codeProject.apiEndpoints && codeProject.apiEndpoints.length > 0) {
    parts.push(`\n### API Endpoints`);
    codeProject.apiEndpoints.forEach(endpoint => {
      parts.push(`- ${endpoint}`);
    });
  }
  
  return parts.join('\n');
}
