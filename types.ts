export enum AuditStatus {
  CONFIG = 'CONFIG',
  AUDITING = 'AUDITING',
  REPORT_READY = 'REPORT_READY',
  ERROR = 'ERROR',
  IMPROVING = 'IMPROVING',
  IMPROVEMENT_REPORT_READY = 'IMPROVEMENT_REPORT_READY',
}

export interface AgentNode {
  type: 'agent';
  id: string; // n8n node id or generated id
  name: string;
  systemPrompt: string;
}

export interface ToolNode {
  type: 'tool';
  id: string; // n8n node id or generated id
  name: string;
  nodeType: string; // The original n8n node type
}

export type WorkflowNode = AgentNode | ToolNode;

export interface N8nConfig {
  baseUrl: string; // e.g., "https://your-n8n.com"
  apiKey: string;
  workflowId?: string; // Optional: ID del workflow a auditar
}

export interface AuditConfig {
  workflow: WorkflowNode[];
  criteria: string[];
  testCaseCount: number;
  n8nConfig?: N8nConfig; // Configuración para ejecuciones reales en n8n
  useRealExecution?: boolean; // Si true, ejecuta en n8n real. Si false, usa simulación IA
}

export interface TestCase {
  id: string;
  title: string;
  scenario: string;
  prompts: string[];
}

export interface ConversationTurn {
  author: 'user' | 'agent';
  message: string;
}

export interface CriterionAnalysis {
  criterion: string;
  score: number;
  justification: string;
}

export interface Analysis {
  overallScore: number;
  summary: string;
  criteriaBreakdown: CriterionAnalysis[];
}

export interface TraceEvent {
  step: number;
  turn: number;
  nodeId: string;
  nodeName: string;
  nodeType: 'agent' | 'tool' | 'user';
  eventType: 'INPUT' | 'OUTPUT';
  content: string;
}


export interface AuditResult {
  id: string;
  testCase: TestCase;
  conversation: ConversationTurn[];
  analysis: Analysis;
  fullTrace: TraceEvent[];
}

export interface ImprovementData {
  improvedWorkflow: WorkflowNode[];
  explanation: string;
  newResults: AuditResult[];
  improvedN8nJson?: any; // JSON completo de n8n mejorado para descargar
}

// Data structure returned directly from the n8n parser
export interface ParsedN8nNode {
  id: string;
  name: string;
  type: string; // n8n node type, e.g., "n8n-nodes-base.set"
  nodeType: 'agent' | 'tool';
  systemPrompt?: string;
}