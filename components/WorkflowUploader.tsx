import React, { useState, useCallback } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import Card from './Card';
import { UploadIcon } from './icons/UploadIcon';
import { CheckCircleIcon } from './icons/CheckCircleIcon';
import { BoltIcon } from './icons/BoltIcon';
import { SparklesIcon } from './icons/SparklesIcon';
import { parseN8nWorkflow } from '../services/n8nParser';
import { analyzeWorkflow } from '../services/workflowAnalyzer';
import { analyzeWorkflowDatabases } from '../services/workflowDatabaseAnalyzer';
import type { ParsedN8nWorkflow, WorkflowDatabaseInfo } from '../types';

interface WorkflowUploaderProps {
  onWorkflowLoaded: (workflow: ParsedN8nWorkflow, databaseInfo: WorkflowDatabaseInfo) => void;
}

interface WorkflowStats {
  totalNodes: number;
  aiAgents: number;
  tools: number;
  databases: number;
  externalApis: number;
  subflows: number;
}

const WorkflowUploader: React.FC<WorkflowUploaderProps> = ({ onWorkflowLoaded }) => {
  const { t } = useTranslation();
  const [isDragging, setIsDragging] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [workflow, setWorkflow] = useState<ParsedN8nWorkflow | null>(null);
  const [stats, setStats] = useState<WorkflowStats | null>(null);
  const [databaseInfo, setDatabaseInfo] = useState<WorkflowDatabaseInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const analyzeWorkflowFile = async (file: File) => {
    setIsAnalyzing(true);
    setError(null);

    try {
      const text = await file.text();
      
      // Parse workflow - pass the TEXT, not the parsed JSON object
      const parsed = parseN8nWorkflow(text);
      
      // For analysis, we need the object
      const json = JSON.parse(text);
      
      // Analyze workflow structure (requiere el JSON completo, no los nodos parseados)
      const analysis = analyzeWorkflow(json);
      
      // Analyze database connections - convertir a WorkflowNode[] compatible
      const workflowNodes = parsed.nodes.map(node => ({
        id: node.id,
        name: node.name,
        type: node.type as 'agent' | 'tool',
        nodeType: node.nodeType,
        systemPrompt: node.systemPrompt || '',
        position: node.position
      }));
      const dbInfo = analyzeWorkflowDatabases(workflowNodes as any);
      
      // MERGE: Add subflows from workflow analysis to database info
      const mergedDbInfo = {
        ...dbInfo,
        subflows: analysis.subflows
      };
      
      console.log('📊 Análisis completo:', {
        databases: dbInfo.tables,
        tools: dbInfo.tools,
        subflows: analysis.subflows,
        externalApis: analysis.externalTools
      });
      
      // Calculate stats
      const calculatedStats: WorkflowStats = {
        totalNodes: parsed.nodes.length,
        aiAgents: parsed.nodes.filter(n => n.nodeType === 'agent').length,
        tools: parsed.nodes.filter(n => n.nodeType === 'tool').length,
        databases: dbInfo.tables.length,
        externalApis: analysis.externalTools.length,
        subflows: analysis.subflows.length
      };

      setWorkflow(parsed);
      setStats(calculatedStats);
      setDatabaseInfo(mergedDbInfo);
      
      // Notify parent with merged info
      onWorkflowLoaded(parsed, mergedDbInfo);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse workflow');
      console.error('Workflow parse error:', err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    const jsonFile = files.find(f => f.name.endsWith('.json'));

    if (jsonFile) {
      analyzeWorkflowFile(jsonFile);
    } else {
      setError('Please upload a valid .json workflow file');
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      analyzeWorkflowFile(file);
    }
  }, []);

  if (workflow && stats) {
    return (
      <Card className="p-6">
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center space-x-2 mb-2">
              <CheckCircleIcon className="w-6 h-6 text-green-500" />
              <h2 className="text-2xl font-bold text-gray-900">Workflow Loaded</h2>
            </div>
            <p className="text-gray-600">Workflow with {stats.totalNodes} nodes</p>
          </div>
          <button
            onClick={() => {
              setWorkflow(null);
              setStats(null);
              setDatabaseInfo(null);
            }}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg hover:border-gray-400"
          >
            Upload Different Workflow
          </button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
          <StatCard
            icon="📦"
            label="Total Nodes"
            value={stats.totalNodes}
            color="bg-blue-500"
          />
          <StatCard
            icon="🤖"
            label="AI Agents"
            value={stats.aiAgents}
            color="bg-purple-500"
          />
          <StatCard
            icon="🔧"
            label="Tools"
            value={stats.tools}
            color="bg-orange-500"
          />
          <StatCard
            icon="🗄️"
            label="Databases"
            value={stats.databases}
            color="bg-green-500"
          />
          <StatCard
            icon="🌐"
            label="External APIs"
            value={stats.externalApis}
            color="bg-blue-600"
          />
          <StatCard
            icon="🔄"
            label="Subflows"
            value={stats.subflows}
            color="bg-indigo-500"
          />
        </div>

        {/* Detailed Analysis */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* AI Agents */}
          {stats.aiAgents > 0 && (
            <div className="border border-purple-200 rounded-lg p-4 bg-purple-50">
              <div className="flex items-center space-x-2 mb-3">
                <SparklesIcon className="w-5 h-5 text-purple-600" />
                <h3 className="font-semibold text-purple-900">AI Agents Detected</h3>
              </div>
              <div className="space-y-2">
                {workflow.nodes
                  .filter(n => n.type === 'agent')
                  .map((agent, idx) => (
                    <div key={idx} className="flex items-center space-x-2 text-sm">
                      <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                      <span className="text-gray-700">{agent.name}</span>
                      <span className="text-gray-400 text-xs">({agent.nodeType})</span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Databases */}
          {stats.databases > 0 && databaseInfo && (
            <div className="border border-green-200 rounded-lg p-4 bg-green-50">
              <div className="flex items-center space-x-2 mb-3">
                <span className="text-xl">🗄️</span>
                <h3 className="font-semibold text-green-900">Database Tables</h3>
              </div>
              <div className="space-y-2">
                {databaseInfo.tables.map((table, idx) => (
                  <div key={idx} className="flex items-center justify-between text-sm">
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span className="text-gray-700 font-medium">{table}</span>
                    </div>
                    {databaseInfo.mappings.find(m => m.table === table) && (
                      <span className="text-xs text-green-600 bg-green-100 px-2 py-0.5 rounded">
                        Auto-mapped
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tools */}
          {stats.tools > 0 && (
            <div className="border border-orange-200 rounded-lg p-4 bg-orange-50">
              <div className="flex items-center space-x-2 mb-3">
                <BoltIcon className="w-5 h-5 text-orange-600" />
                <h3 className="font-semibold text-orange-900">Tool Nodes</h3>
              </div>
              <div className="space-y-2">
                {workflow.nodes
                  .filter(n => n.type === 'tool')
                  .slice(0, 5)
                  .map((tool, idx) => (
                    <div key={idx} className="flex items-center space-x-2 text-sm">
                      <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                      <span className="text-gray-700">{tool.name}</span>
                      <span className="text-gray-400 text-xs">({tool.nodeType})</span>
                    </div>
                  ))}
                {stats.tools > 5 && (
                  <p className="text-xs text-gray-500 ml-4">
                    +{stats.tools - 5} more tools
                  </p>
                )}
              </div>
            </div>
          )}

          {/* External APIs */}
          {stats.externalApis > 0 && (
            <div className="border border-blue-200 rounded-lg p-4 bg-blue-50">
              <div className="flex items-center space-x-2 mb-3">
                <span className="text-xl">🌐</span>
                <h3 className="font-semibold text-blue-900">External Integrations</h3>
              </div>
              <div className="space-y-2">
                {databaseInfo?.tools.email?.detected && (
                  <IntegrationBadge icon="📧" name="Email" provider={databaseInfo.tools.email.provider} />
                )}
                {databaseInfo?.tools.calendar?.detected && (
                  <IntegrationBadge icon="📅" name="Calendar" provider={databaseInfo.tools.calendar.provider} />
                )}
                {databaseInfo?.tools.sms?.detected && (
                  <IntegrationBadge icon="💬" name="SMS" provider={databaseInfo.tools.sms.provider} />
                )}
                {databaseInfo?.tools.whatsapp?.detected && (
                  <IntegrationBadge icon="💚" name="WhatsApp" />
                )}
                {databaseInfo?.tools.slack?.detected && (
                  <IntegrationBadge icon="💼" name="Slack" />
                )}
              </div>
            </div>
          )}
        </div>

        {/* Workflow Ready Indicator */}
        <div className="mt-6 p-4 bg-gradient-to-r from-green-50 to-blue-50 border-2 border-green-200 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <CheckCircleIcon className="w-8 h-8 text-green-500" />
              <div>
                <h4 className="font-semibold text-gray-900">Workflow Analysis Complete</h4>
                <p className="text-sm text-gray-600">
                  Ready to configure connections and start auditing
                </p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-green-600">{stats.totalNodes}</div>
              <div className="text-xs text-gray-500">nodes analyzed</div>
            </div>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">📤 Upload n8n Workflow</h2>
      
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-800 text-sm">{error}</p>
        </div>
      )}

      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          relative border-2 border-dashed rounded-xl p-12 text-center transition-all
          ${isDragging 
            ? 'border-blue-500 bg-blue-50' 
            : 'border-gray-300 hover:border-gray-400 bg-gray-50'
          }
          ${isAnalyzing ? 'opacity-50 pointer-events-none' : ''}
        `}
      >
        {isAnalyzing ? (
          <div className="space-y-4">
            <div className="w-16 h-16 mx-auto border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Analyzing Workflow...</h3>
              <p className="text-sm text-gray-600 mt-2">
                Detecting agents, tools, databases, and dependencies
              </p>
            </div>
          </div>
        ) : (
          <>
            <UploadIcon className="w-16 h-16 mx-auto text-gray-400 mb-4" />
            
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              Drag & Drop Your Workflow
            </h3>
            <p className="text-gray-600 mb-6">
              or click to browse for a .json file
            </p>

            <input
              type="file"
              accept=".json"
              onChange={handleFileSelect}
              className="hidden"
              id="workflow-upload"
            />
            <label
              htmlFor="workflow-upload"
              className="inline-flex items-center space-x-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer transition-colors"
            >
              <UploadIcon className="w-5 h-5" />
              <span>Select Workflow File</span>
            </label>

            <div className="mt-8 pt-8 border-t border-gray-200">
              <h4 className="font-medium text-gray-900 mb-3">What happens next?</h4>
              <div className="grid md:grid-cols-3 gap-4 text-left">
                <FeatureCard
                  icon="🤖"
                  title="AI Detection"
                  description="Automatically identifies AI agents and their prompts"
                />
                <FeatureCard
                  icon="🗄️"
                  title="Database Mapping"
                  description="Detects database operations and creates smart mappings"
                />
                <FeatureCard
                  icon="🔌"
                  title="Integration Analysis"
                  description="Finds email, calendar, SMS, and other external tools"
                />
              </div>
            </div>
          </>
        )}
      </div>
    </Card>
  );
};

// Helper Components
const StatCard: React.FC<{ icon: string; label: string; value: number; color: string }> = ({
  icon, label, value, color
}) => (
  <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
    <div className={`${color} w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-2 text-2xl`}>
      {icon}
    </div>
    <div className="text-2xl font-bold text-gray-900">{value}</div>
    <div className="text-xs text-gray-600 mt-1">{label}</div>
  </div>
);

const FeatureCard: React.FC<{ icon: string; title: string; description: string }> = ({
  icon, title, description
}) => (
  <div className="flex space-x-3">
    <div className="text-2xl">{icon}</div>
    <div>
      <h5 className="font-medium text-gray-900 text-sm">{title}</h5>
      <p className="text-xs text-gray-600 mt-1">{description}</p>
    </div>
  </div>
);

const IntegrationBadge: React.FC<{ icon: string; name: string; provider?: string }> = ({
  icon, name, provider
}) => (
  <div className="flex items-center justify-between text-sm bg-white rounded px-3 py-2">
    <div className="flex items-center space-x-2">
      <span>{icon}</span>
      <span className="text-gray-700 font-medium">{name}</span>
    </div>
    {provider && (
      <span className="text-xs text-gray-500">{provider}</span>
    )}
  </div>
);

export default WorkflowUploader;
