
import React, { useState, useMemo } from 'react';
import type { AuditConfig, N8nAgentConfig } from '../types';
import { PlusCircleIcon } from './icons/PlusCircleIcon';
import { XCircleIcon } from './icons/XCircleIcon';
import Card from './Card';
import { parseN8nWorkflow } from '../services/n8nParser';
import { UploadIcon } from './icons/UploadIcon';
import { TrashIcon } from './icons/TrashIcon';
import { useTranslation } from '../hooks/useTranslation';

interface AgentConfigProps {
  onStartAudit: (data: { config: AuditConfig, n8nData: N8nAgentConfig[] | null }) => void;
}

const AgentConfig: React.FC<AgentConfigProps> = ({ onStartAudit }) => {
  const { t } = useTranslation();
  
  const DEFAULT_CRITERIA = useMemo(() => [
    t('defaultCriteria1'),
    t('defaultCriteria2'),
    t('defaultCriteria3'),
    t('defaultCriteria4'),
  ], [t]);

  const [systemPrompts, setSystemPrompts] = useState<string[]>(['You are a helpful and friendly assistant.']);
  const [criteria, setCriteria] = useState<string[]>(DEFAULT_CRITERIA);
  const [newCriterion, setNewCriterion] = useState('');
  const [testCaseCount, setTestCaseCount] = useState(5);
  const [n8nAgents, setN8nAgents] = useState<N8nAgentConfig[] | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setFileError(null);
    setN8nAgents(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        if (!text) throw new Error("File is empty.");
        
        const agents = parseN8nWorkflow(text);
        setSystemPrompts(agents.map(a => a.systemPrompt));
        setN8nAgents(agents);
      } catch (error) {
        const message = error instanceof Error ? error.message : "An unknown error occurred during parsing.";
        setFileError(message);
      }
    };
    reader.onerror = () => setFileError("Failed to read the file.");
    reader.readAsText(file);
    event.target.value = '';
  };

  const handleAddCriterion = () => {
    if (newCriterion.trim() && !criteria.includes(newCriterion.trim())) {
      setCriteria([...criteria, newCriterion.trim()]);
      setNewCriterion('');
    }
  };

  const handleRemoveCriterion = (criterionToRemove: string) => {
    setCriteria(criteria.filter(c => c !== criterionToRemove));
  };
  
    const handleAddAgent = () => {
    setSystemPrompts([...systemPrompts, 'New agent prompt...']);
    setN8nAgents(null);
  };

  const handleRemoveAgent = (index: number) => {
    if (systemPrompts.length > 1) {
      setSystemPrompts(systemPrompts.filter((_, i) => i !== index));
      setN8nAgents(null);
    }
  };

  const handlePromptChange = (index: number, value: string) => {
    const newPrompts = [...systemPrompts];
    newPrompts[index] = value;
    setSystemPrompts(newPrompts);
    setN8nAgents(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (systemPrompts.every(p => p.trim()) && criteria.length > 0) {
      const config = { systemPrompts, criteria, testCaseCount };
      onStartAudit({ config, n8nData: n8nAgents });
    }
  };

  return (
    <>
      <Card className="mb-8">
         <h2 className="text-xl font-semibold text-gray-800 dark:text-white mb-2">{t('importN8nTitle')}</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          {t('importN8nDescription')}
        </p>

        <div className="relative border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6 text-center hover:border-primary-500 dark:hover:border-primary-400 transition-colors">
          <UploadIcon className="mx-auto h-12 w-12 text-gray-400" />
          <label htmlFor="file-upload" className="mt-2 block text-sm font-semibold text-primary-600 hover:text-primary-500 cursor-pointer">
            <span>{t('uploadFile')}</span>
            <input id="file-upload" name="file-upload" type="file" className="sr-only" accept=".json" onChange={handleFileChange} />
          </label>
          <p className="text-xs text-gray-500 dark:text-gray-400">{t('uploadHint')}</p>
        </div>

        {fileError && (
          <div className="mt-4 text-center p-3 bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-200 rounded-lg">
            <p>{fileError}</p>
          </div>
        )}
      </Card>
    
      <Card>
        <form onSubmit={handleSubmit} className="space-y-8">
          <h2 className="text-2xl font-semibold text-gray-800 dark:text-white text-center">{t('configTitle')}</h2>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('promptsLabel')}
            </label>
            <div className="space-y-4">
              {systemPrompts.map((prompt, index) => (
                <div key={index} className="flex items-start gap-2">
                  <span className="pt-3 text-sm font-bold text-gray-500">{index + 1}.</span>
                  <textarea
                    rows={3}
                    className="flex-grow p-3 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition"
                    value={prompt}
                    onChange={(e) => handlePromptChange(index, e.target.value)}
                    placeholder={t('promptPlaceholder', { index: index + 1 })}
                  />
                  <button type="button" onClick={() => handleRemoveAgent(index)} 
                    className="p-3 text-gray-400 hover:text-red-500 disabled:text-gray-600 disabled:cursor-not-allowed"
                    disabled={systemPrompts.length <= 1}
                  >
                    <TrashIcon className="w-6 h-6" />
                  </button>
                </div>
              ))}
            </div>
            <button type="button" onClick={handleAddAgent} className="mt-4 text-sm font-medium text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-200 flex items-center gap-1">
                <PlusCircleIcon className="w-5 h-5"/>
                {t('addAgent')}
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('criteriaLabel')}
            </label>
            <div className="flex flex-wrap gap-2 mb-3">
              {criteria.map((c) => (
                <span key={c} className="flex items-center bg-primary-100 dark:bg-primary-900 text-primary-800 dark:text-primary-200 text-sm font-medium px-3 py-1 rounded-full">
                  {c}
                  <button type="button" onClick={() => handleRemoveCriterion(c)} className="ml-2 text-primary-600 dark:text-primary-400 hover:text-primary-800 dark:hover:text-primary-200">
                    <XCircleIcon className="w-4 h-4" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                className="flex-grow p-3 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition"
                value={newCriterion}
                onChange={(e) => setNewCriterion(e.target.value)}
                onKeyDown={(e) => {if(e.key === 'Enter') { e.preventDefault(); handleAddCriterion();}}}
                placeholder={t('addCriterionPlaceholder')}
              />
              <button type="button" onClick={handleAddCriterion} className="p-3 bg-primary-100 dark:bg-primary-900 text-primary-600 dark:text-primary-300 rounded-lg hover:bg-primary-200 dark:hover:bg-primary-800 transition">
                <PlusCircleIcon className="w-6 h-6" />
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="test-case-count" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('testCaseCountLabel', { count: testCaseCount })}
            </label>
            <input
              id="test-case-count"
              type="range"
              min="1"
              max="10"
              step="1"
              value={testCaseCount}
              onChange={(e) => setTestCaseCount(parseInt(e.target.value, 10))}
              className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer"
            />
          </div>
          
          <div className="pt-4">
            <button type="submit" className="w-full py-3 px-4 bg-primary-600 text-white font-semibold rounded-lg shadow-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-transform transform hover:scale-105 disabled:bg-gray-400 disabled:cursor-not-allowed"
              disabled={systemPrompts.some(p => !p.trim()) || criteria.length === 0}
            >
              {t('startAuditButton')}
            </button>
          </div>
        </form>
      </Card>
    </>
  );
};

export default AgentConfig;