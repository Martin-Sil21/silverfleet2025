export enum AuditStatus {
  CONFIG = 'CONFIG',
  AUDITING = 'AUDITING',
  REPORT_READY = 'REPORT_READY',
  ERROR = 'ERROR',
  IMPROVING = 'IMPROVING',
  IMPROVEMENT_REPORT_READY = 'IMPROVEMENT_REPORT_READY',
}

export interface AuditConfig {
  systemPrompts: string[];
  criteria: string[];
  testCaseCount: number;
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

export interface AuditResult {
  id: string;
  testCase: TestCase;
  conversation: ConversationTurn[];
  analysis: Analysis;
}

export interface ImprovementData {
  improvedPrompt: string;
  explanation: string;
  newResults: AuditResult[];
}

export interface N8nAgentConfig {
  id: string;
  name: string;
  type: string;
  systemPrompt: string;
}