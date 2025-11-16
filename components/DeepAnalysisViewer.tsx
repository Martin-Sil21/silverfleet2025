/**
 * 🔬 Deep Analysis Viewer
 * 
 * Muestra el análisis profundo de código con hooks, queries y flujo de datos
 */

import React, { useState } from 'react';
import { ParsedCodeProject } from '../types';
import { DatabaseIcon, CodeIcon, ArrowRightIcon } from './icons';

interface DeepAnalysisViewerProps {
  codeProject: ParsedCodeProject;
}

export const DeepAnalysisViewer: React.FC<DeepAnalysisViewerProps> = ({ codeProject }) => {
  const [activeTab, setActiveTab] = useState<'hooks' | 'dataflow' | 'tables'>('dataflow');
  
  const deepAnalysis = codeProject.deepAnalysis;
  
  if (!deepAnalysis || 
      (deepAnalysis.hooks.length === 0 && 
       deepAnalysis.operations.length === 0 && 
       deepAnalysis.tables.length === 0)) {
    return (
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <div className="flex items-center gap-2 text-gray-400">
          <DatabaseIcon className="w-5 h-5" />
          <span>No database operations detected in this project</span>
        </div>
      </div>
    );
  }
  
  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700">
      {/* Header with tabs */}
      <div className="border-b border-gray-700 p-4">
        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <CodeIcon className="w-5 h-5" />
          Deep Code Analysis
        </h3>
        
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('dataflow')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'dataflow'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Data Flow ({deepAnalysis.dataFlow.length})
          </button>
          <button
            onClick={() => setActiveTab('hooks')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'hooks'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Custom Hooks ({deepAnalysis.hooks.length})
          </button>
          <button
            onClick={() => setActiveTab('tables')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'tables'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Database Tables ({deepAnalysis.tables.length})
          </button>
        </div>
      </div>
      
      {/* Content */}
      <div className="p-4">
        {activeTab === 'dataflow' && (
          <DataFlowTab dataFlow={deepAnalysis.dataFlow} />
        )}
        
        {activeTab === 'hooks' && (
          <HooksTab hooks={deepAnalysis.hooks} />
        )}
        
        {activeTab === 'tables' && (
          <TablesTab tables={deepAnalysis.tables} />
        )}
      </div>
    </div>
  );
};

// Data Flow Tab
const DataFlowTab: React.FC<{ dataFlow: NonNullable<ParsedCodeProject['deepAnalysis']>['dataFlow'] }> = ({ dataFlow }) => {
  if (dataFlow.length === 0) {
    return <div className="text-gray-400">No data flow detected</div>;
  }
  
  return (
    <div className="space-y-3">
      {dataFlow.map((flow, idx) => (
        <div 
          key={idx} 
          className="bg-gray-900 rounded-lg p-4 border border-gray-700 hover:border-blue-500 transition-colors"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="flex items-center gap-2 flex-1">
              <div className="bg-purple-500 bg-opacity-20 text-purple-300 px-3 py-1 rounded-full text-sm font-medium">
                {flow.from}
              </div>
              
              <ArrowRightIcon className="w-4 h-4 text-gray-500" />
              
              <div className="bg-blue-500 bg-opacity-20 text-blue-300 px-3 py-1 rounded-full text-sm font-medium">
                {flow.through}
              </div>
              
              <ArrowRightIcon className="w-4 h-4 text-gray-500" />
              
              <div className="bg-green-500 bg-opacity-20 text-green-300 px-3 py-1 rounded-full text-sm font-medium flex items-center gap-1">
                <DatabaseIcon className="w-3 h-3" />
                {flow.to}
              </div>
            </div>
          </div>
          
          <div className="text-sm text-gray-400 mt-2">
            <span className="font-medium text-gray-300">Purpose:</span> {flow.purpose}
          </div>
          
          {flow.fields.length > 0 && (
            <div className="text-sm text-gray-400 mt-1">
              <span className="font-medium text-gray-300">Fields:</span>{' '}
              {flow.fields.join(', ')}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

// Hooks Tab
const HooksTab: React.FC<{ hooks: NonNullable<ParsedCodeProject['deepAnalysis']>['hooks'] }> = ({ hooks }) => {
  if (hooks.length === 0) {
    return <div className="text-gray-400">No custom hooks with database operations detected</div>;
  }
  
  return (
    <div className="space-y-3">
      {hooks.map((hook, idx) => (
        <div 
          key={idx} 
          className="bg-gray-900 rounded-lg p-4 border border-gray-700"
        >
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-white font-mono font-bold">{hook.name}</h4>
            <span className="text-xs text-gray-500">{hook.filePath.split('/').pop()}</span>
          </div>
          
          {hook.semanticPurpose && (
            <div className="text-sm text-gray-400 mb-3 italic">
              {hook.semanticPurpose}
            </div>
          )}
          
          <div className="space-y-2">
            <div className="text-sm font-medium text-gray-300">Database Queries:</div>
            {hook.queries.map((query, qIdx) => (
              <div 
                key={qIdx}
                className="bg-gray-800 rounded p-2 border border-gray-700"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                    query.queryType === 'select' ? 'bg-blue-500 bg-opacity-20 text-blue-300' :
                    query.queryType === 'insert' ? 'bg-green-500 bg-opacity-20 text-green-300' :
                    query.queryType === 'update' ? 'bg-yellow-500 bg-opacity-20 text-yellow-300' :
                    query.queryType === 'delete' ? 'bg-red-500 bg-opacity-20 text-red-300' :
                    'bg-gray-500 bg-opacity-20 text-gray-300'
                  }`}>
                    {query.queryType.toUpperCase()}
                  </span>
                  <span className="text-white font-mono">{query.table || 'unknown'}</span>
                </div>
                
                {query.fields.length > 0 && (
                  <div className="text-xs text-gray-400 mt-1">
                    Fields: {query.fields.join(', ')}
                  </div>
                )}
              </div>
            ))}
          </div>
          
          {hook.usedBy.length > 0 && (
            <div className="mt-3 text-sm">
              <span className="text-gray-400">Used by:</span>{' '}
              <span className="text-purple-300">{hook.usedBy.join(', ')}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

// Tables Tab
const TablesTab: React.FC<{ tables: NonNullable<ParsedCodeProject['deepAnalysis']>['tables'] }> = ({ tables }) => {
  if (tables.length === 0) {
    return <div className="text-gray-400">No database tables detected</div>;
  }
  
  return (
    <div className="space-y-3">
      {tables.map((table, idx) => (
        <div 
          key={idx} 
          className="bg-gray-900 rounded-lg p-4 border border-gray-700"
        >
          <div className="flex items-center gap-2 mb-3">
            <DatabaseIcon className="w-5 h-5 text-green-400" />
            <h4 className="text-white font-mono font-bold text-lg">{table.name}</h4>
          </div>
          
          <div className="space-y-2">
            {table.operations.map((op, opIdx) => (
              <div 
                key={opIdx}
                className="bg-gray-800 rounded p-3 border border-gray-700"
              >
                <div className="flex items-center gap-3 mb-2">
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                    op.type === 'read' ? 'bg-blue-500 bg-opacity-20 text-blue-300' :
                    op.type === 'write' ? 'bg-green-500 bg-opacity-20 text-green-300' :
                    'bg-red-500 bg-opacity-20 text-red-300'
                  }`}>
                    {op.type.toUpperCase()}
                  </span>
                  
                  <div className="flex-1">
                    <div className="text-sm text-gray-400">
                      Used by: <span className="text-purple-300">{op.usedBy.join(', ')}</span>
                    </div>
                  </div>
                </div>
                
                {op.fields.length > 0 && (
                  <div className="text-sm text-gray-400 mt-2">
                    <span className="font-medium text-gray-300">Fields accessed:</span>{' '}
                    {op.fields.map((field, fIdx) => (
                      <span 
                        key={fIdx}
                        className="inline-block bg-gray-700 px-2 py-0.5 rounded text-xs mr-1 mb-1"
                      >
                        {field}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export default DeepAnalysisViewer;

