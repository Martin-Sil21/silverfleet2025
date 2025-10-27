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
  parameters: Record<string, any>;
}

export interface ToolNode {
  type: 'tool';
  id: string; // n8n node id or generated id
  name: string;
  nodeType: string; // The original n8n node type
  parameters: Record<string, any>;
}

export type WorkflowNode = AgentNode | ToolNode;

export interface N8nConnection {
  sourceNodeId: string;
  targetNodeId: string;
  sourceHandle: string;
}

export interface AuditConfig {
  workflow: WorkflowNode[];
  connections: N8nConnection[];
  criteria: string[];
  testCaseCount: number;
  samplePayload: Record<string, any>;
  auditType: 'visual' | 'real';
  endpointUrl?: string;
}

export interface TestCase {
  id: string;
  title: string;
  persona: string;
  conversationGoal: string;
  initialPayload: Record<string, any>;
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

export interface ExecutionStep {
  // Can be nodeId for visual audit, or "Turn 1", "Turn 2" for real audit.
  nodeId: string;
  status: 'SUCCESS' | 'ERROR' | 'PENDING' | 'RUNNING';
  // For visual, this is node input. For real, this is user message.
  input: any;
  // For visual, this is node output. For real, this is agent response.
  output: any;
  log: string;
  durationMs: number;
}


export interface AuditResult {
  id: string;
  testCase: TestCase;
  executionTrace: ExecutionStep[];
  analysis: Analysis;
  finalStatus: 'SUCCESS' | 'ERROR';
}

export interface ImprovementData {
  improvedWorkflow: WorkflowNode[];
  explanation: string;
  newResults: AuditResult[];
}

// Data structure returned directly from the n8n parser
export interface ParsedN8nNode {
  id: string;
  name: string;
  type: string; // n8n node type, e.g., "n8n-nodes-base.set"
  nodeType: 'agent' | 'tool';
  systemPrompt?: string;
  parameters: Record<string, any>;
  position: { x: number, y: number };
}

export interface ParsedN8nWorkflow {
  nodes: ParsedN8nNode[];
  connections: N8nConnection[];
  detectedEndpoints?: string[];
}

export interface HistoricalAudit {
  id: string;
  timestamp: number;
  config: AuditConfig;
  results: AuditResult[];
  overallScore: number;
}
