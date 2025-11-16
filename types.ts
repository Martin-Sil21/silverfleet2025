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

export interface RealDatabaseConfig {
  type: 'supabase' | 'airtable' | 'google-sheets';
  url: string;
  key: string;
  tables: string[];
}

export interface AuditConfig {
  workflow?: WorkflowNode[]; // n8n workflow (opcional si es ZIP)
  connections?: N8nConnection[];
  criteria: string[];
  testCaseCount: number;
  samplePayload: Record<string, any>;
  auditType: 'visual' | 'real';
  endpointUrl?: string;
  enableDatabaseTracking?: boolean;
  databaseSchema?: Record<string, any[]>;
  realDatabaseConfig?: RealDatabaseConfig;
  rawN8nJson?: string; // JSON original del archivo n8n para re-auditar
  toolCredentials?: Map<string, string>; // nodeId -> credentialId
  dbCredentials?: Map<string, string>; // nodeId -> credentialId
  integrationConfig?: {
    enabledIntegrations: {
      email?: { credentialId: string; type: 'gmail-oauth' | 'smtp' };
      calendar?: { credentialId: string; type: 'google-calendar-oauth' };
    };
    verificationDelay?: number;
  };
  dependencies?: any; // 🔧 WorkflowDependencies (tools + subflows detectados)
  codeProject?: ParsedCodeProject; // 🔧 Para auditorías de ZIP projects
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
  evidence?: string[]; // Evidencia cuantificable
  impact?: 'high' | 'medium' | 'low'; // Impacto del hallazgo
}

export interface KeyFinding {
  type: 'critical' | 'warning' | 'strength' | 'recommendation';
  title: string;
  description: string;
  evidence?: string[];
  priority?: 'high' | 'medium' | 'low';
  impact?: string;
}

export interface Analysis {
  overallScore: number;
  summary: string; // Resumen ejecutivo (3-5 líneas)
  criteriaBreakdown: CriterionAnalysis[];
  keyFindings?: KeyFinding[]; // Hallazgos principales
  riskAssessment?: 'high' | 'medium' | 'low'; // Evaluación de riesgo
  recommendations?: string[]; // Recomendaciones accionables
  goalAchieved?: boolean; // Si se logró el objetivo de la persona
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
  timestamp?: number;
}


export interface DatabaseDiscrepancy {
  type: 'missing_record' | 'incorrect_data' | 'unauthorized_action' | 'data_mismatch';
  severity: 'critical' | 'warning' | 'info';
  description: string;
  expected?: any;
  actual?: any;
  table?: string;
  timestamp: number;
}

export interface DatabaseChange {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  record: any;
  before?: any;
  after?: any;
  timestamp: number;
}

export interface DatabaseOperationSummary {
  totalOperations: number;
  reads: number;
  writes: number;
  updates: number;
  deletes: number;
  tablesUsed: string[];
  recordsCreated: number;
  operations: Array<{
    type: string;
    table: string;
    timestamp: number;
  }>;
  discrepancies?: DatabaseDiscrepancy[];
  changes?: DatabaseChange[];
}

export interface AuditResult {
  id: string;
  testCase: TestCase;
  executionTrace: ExecutionStep[];
  analysis: Analysis;
  finalStatus: 'SUCCESS' | 'ERROR';
  databaseActivity?: DatabaseOperationSummary;
  // ⏱️ Timing información
  startTime?: number; // Timestamp de inicio de la conversación
  endTime?: number; // Timestamp de fin de la conversación
  durationMs?: number; // Duración total en milisegundos
  // 🔧 Tool verifications (Gmail, Calendar, etc.)
  toolVerifications?: any[]; // ToolActionVerification[] from IntegrationManager
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
  rawNodes?: any[]; // 🔥 NUEVO: Nodos originales del JSON para análisis
}

export interface HistoricalAudit {
  id: string;
  timestamp: number;
  config: AuditConfig;
  results: AuditResult[];
  overallScore: number;
  auditDurationMs?: number; // ⏱️ Duración total de la auditoría
}

// ====== NUEVOS TIPOS PARA PROYECTOS NODE/TYPESCRIPT ======

export interface DetectedFramework {
  name: string; // 'Express', 'NestJS', 'TypeScript', etc.
  version?: string;
  confidence: number; // 0-1
  evidence: string[]; // Archivos/dependencias que lo evidencian
}

export interface DetectedDatabase {
  provider: string; // 'PostgreSQL', 'MongoDB', 'Supabase', etc.
  confidence: number;
  evidence: string[]; // Conexiones encontradas
  credentials?: string[]; // Variables de entorno relacionadas
}

export interface DetectedTool {
  name: string; // 'Email', 'Calendar', 'Slack', 'Twilio', etc.
  type: 'email' | 'calendar' | 'messaging' | 'crm' | 'storage' | 'other';
  confidence: number;
  evidence: string[]; // Imports/API calls encontrados
}

export interface DetectedAPI {
  service: string; // 'OpenAI', 'Gemini', 'HuggingFace', etc.
  type: 'ai' | 'external' | 'internal';
  confidence: number;
  evidence: string[];
}

export interface CodeAgentComponent {
  type: 'agent' | 'tool' | 'middleware' | 'service';
  name: string;
  filePath: string;
  systemPrompt?: string; // Para agentes IA (COMPLETO - multilineales)
  description: string;
  imports: string[]; // Dependencias internas y externas
  // 🔧 Nuevos campos para mejor detección
  framework?: string; // 'LangChain', 'CrewAI', 'Custom Agent Pattern', etc.
  tools?: string[]; // Lista de herramientas/funciones del agente
  confidence?: number; // 0-1 score de confianza en la detección
  // 🆕 Campos para agentes IMPLÍCITOS
  agentDetectionType?: AgentDetectionType;
  behaviors?: AgentBehavior[];
  handlers?: { name: string; filePath: string }[];
  estimatedIntention?: string;
}

export interface ParsedCodeProject {
  projectType: 'nodejs' | 'typescript' | 'python' | 'other';
  framework?: DetectedFramework;
  language: string;
  confidence: number;
  
  // Componentes detectados
  agents: CodeAgentComponent[];
  tools: DetectedTool[];
  databases: DetectedDatabase[];
  apis: DetectedAPI[];
  
  // Metadatos del proyecto
  dependencies: Record<string, string>; // package.json o equivalent
  scripts: Record<string, string>; // Scripts disponibles
  
  // Para análisis
  fileCount: number;
  totalLines: number;
  summary: string;
  
  // Información para auditoría
  entryPoint?: string; // main file o index
  apiEndpoints?: string[]; // Rutas HTTP detectadas
  environmentVariables?: string[]; // Vars de entorno usadas
  
  // 🆕 Para detección adaptativa
  agentDetectionType?: AgentDetectionType;
  implicitAgentAnalysis?: ImplicitAgentAnalysis;
  
  // 🔥 NUEVO: Análisis profundo de código (hooks, queries, flujo de datos)
  deepAnalysis?: {
    hooks: Array<{
      name: string;
      filePath: string;
      queries: Array<{
        table: string | null;
        queryType: 'select' | 'insert' | 'update' | 'delete' | 'unknown';
        fields: string[];
      }>;
      usedBy: string[];
      semanticPurpose?: string;
    }>;
    databaseQueries: Array<{
      functionName: string;
      filePath: string;
      table: string | null;
      queryType: 'select' | 'insert' | 'update' | 'delete' | 'unknown';
      fields: string[];
      semanticContext?: string;
    }>;
    operations: Array<{
      agentName: string;
      operation: 'read' | 'write' | 'delete';
      table: string;
      fields: string[];
      hookOrFunction: string;
      semanticContext: string;
    }>;
    dataFlow: Array<{
      from: string; // Agent name
      through: string; // Hook/function name
      to: string; // Table name
      fields: string[];
      purpose: string;
    }>;
    tables: Array<{
      name: string;
      operations: Array<{
        type: 'read' | 'write' | 'delete';
        usedBy: string[];
        fields: string[];
      }>;
    }>;
  };
}

export interface CodeProjectAuditConfig extends AuditConfig {
  projectPath?: string; // Para referencia
  codeProject: ParsedCodeProject; // En lugar de workflow
  projectType: 'nodejs' | 'typescript'; // Tipo de proyecto
  rawZipBuffer?: ArrayBuffer; // Buffer original del ZIP
}

// ====== TIPOS PARA DETECCIÓN ADAPTATIVA DE AGENTES ======

export enum AgentDetectionType {
  EXPLICIT = "explicit",      // LangChain, CrewAI, OpenAI SDK - agentes con system prompt explícito
  IMPLICIT = "implicit",      // Event-driven, state machine - lógica implícita
  HYBRID = "hybrid",          // Mix de ambos
  UNKNOWN = "unknown"
}

export interface AgentBehavior {
  name: string;
  type: 'greeting' | 'validation' | 'retrieval' | 'processing' | 'unknown';
  description?: string;
  inputTypes: string[];
  outputTypes: string[];
  toolsUsed: string[];
  databasesUsed: string[];
  conditionChecks: string[];  // if conditions que evalúa
  confidenceScore: number;    // 0-1
}

export interface ImplicitAgentAnalysis {
  detectionType: AgentDetectionType;
  inferredSystemPrompt: string;
  behaviors: AgentBehavior[];
  mainHandlers: { name: string; filePath: string }[];
  estimatedIntention: string;
}