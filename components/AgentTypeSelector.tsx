/**
 * 🔄 AgentTypeSelector
 * 
 * Permite al usuario elegir qué tipo de agente quiere auditar:
 * - n8n Workflow
 * - TypeScript/Node Agent
 * - Otros (futuro)
 */

import React from 'react';
import type { AgentSourceType } from '../types';
import { getSourceTypeName } from '../services/agentAdapter';
import Card from './Card';
import { useTranslation } from '../hooks/useTranslation';

interface AgentTypeSelectorProps {
  selectedType: AgentSourceType;
  onSelectType: (type: AgentSourceType) => void;
  onCancel?: () => void;
}

const AGENT_TYPES: AgentSourceType[] = ['n8n', 'typescript-node'];

const AgentTypeSelector: React.FC<AgentTypeSelectorProps> = ({ selectedType, onSelectType, onCancel }) => {
  const { t } = useTranslation();
  
  const getDescription = (type: AgentSourceType): string => {
    switch (type) {
      case 'n8n':
        return t('agentTypeN8nDesc') || 'Load and audit n8n workflow JSON files. Visual workflow builder with node-based automation.';
      case 'typescript-node':
        return t('agentTypeCodeDesc') || 'Load and audit TypeScript/Node agent code. Supports frameworks like Baileys, OpenAI, LangChain.';
      case 'python':
        return t('agentTypePythonDesc') || 'Python agent support coming soon.';
      default:
        return 'Unknown agent type';
    }
  };
  
  const getIcon = (type: AgentSourceType): string => {
    switch (type) {
      case 'n8n':
        return '⚙️';
      case 'typescript-node':
        return '💻';
      case 'python':
        return '🐍';
      default:
        return '❓';
    }
  };
  
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-2">
          {t('selectAgentType') || 'Select Agent Type'}
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          {t('selectAgentTypeDesc') || 'Choose which type of agent you want to audit'}
        </p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {AGENT_TYPES.map(type => (
          <button
            key={type}
            onClick={() => onSelectType(type)}
            disabled={type === 'python'} // Python coming soon
            className={`relative p-6 rounded-lg border-2 transition-all ${
              selectedType === type
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-950'
                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
            } ${type === 'python' ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:shadow-md'}`}
          >
            <div className="text-4xl mb-3">{getIcon(type)}</div>
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-2">
              {getSourceTypeName(type)}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 text-left">
              {getDescription(type)}
            </p>
            
            {type === 'python' && (
              <div className="absolute top-2 right-2 px-2 py-1 bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-100 text-xs font-semibold rounded">
                Coming Soon
              </div>
            )}
            
            {selectedType === type && (
              <div className="absolute top-2 left-2 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                <div className="text-white text-xs">✓</div>
              </div>
            )}
          </button>
        ))}
      </div>
      
      {onCancel && (
        <div className="flex justify-center">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
};

export default AgentTypeSelector;
