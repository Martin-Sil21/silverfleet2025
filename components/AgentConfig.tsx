import React, { useState, useMemo } from 'react';
import type { AuditConfig, ParsedN8nNode, WorkflowNode } from '../types';
import { PlusCircleIcon } from './icons/PlusCircleIcon';
import Card from './Card';
import { parseN8nWorkflow } from '../services/n8nParser';
import { UploadIcon } from './icons/UploadIcon';
import { TrashIcon } from './icons/TrashIcon';
import { useTranslation } from '../hooks/useTranslation';
import { XCircleIcon } from './icons/XCircleIcon';
import { SparklesIcon } from './icons/SparklesIcon';
import { suggestAuditCriteria } from '../services/geminiService';
import Loader from './Loader';

interface AgentConfigProps {
  onStartAudit: (data: { config: AuditConfig, n8nData: ParsedN8nNode[] | null }) => void;
}

const AgentConfig: React.FC<AgentConfigProps> = ({ onStartAudit }) => {
  const { t, language } = useTranslation();
  
  const DEFAULT_CRITERIA = useMemo(() => [
    t('defaultCriteria1'),
    t('defaultCriteria2'),
    t('defaultCriteria3'),
    t('defaultCriteria4'),
  ], [t]);

  const [workflow, setWorkflow] = useState<WorkflowNode[]>([{
    type: 'agent',
    id: `default-${Date.now()}`,
    name: 'Agent 1',
    systemPrompt: 'You are a helpful and friendly assistant.'
  }]);
  const [criteria, setCriteria] = useState<string[]>(DEFAULT_CRITERIA);
  const [newCriterion, setNewCriterion] = useState('');
  const [testCaseCount, setTestCaseCount] = useState(5);
  const [parsedN8nData, setParsedN8nData] = useState<ParsedN8nNode[] | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isSuggestingCriteria, setIsSuggestingCriteria] = useState(false);
  
  const fetchAndSetCriteria = async (workflowForSuggestion: WorkflowNode[]) => {
    setIsSuggestingCriteria(true);
    setCriteria([]); // Clear existing
    try {
      const suggested = await suggestAuditCriteria(workflowForSuggestion, language);
      setCriteria(suggested);
    } catch(error) {
      const message = error instanceof Error ? error.message : "Could not suggest criteria.";
      setFileError(message);
      setCriteria(DEFAULT_CRITERIA); // Fallback
    } finally {
      setIsSuggestingCriteria(false);
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setFileError(null);
    setParsedN8nData(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        if (!text) throw new Error("File is empty.");
        
        const parsedNodes = parseN8nWorkflow(text);
        const newWorkflow: WorkflowNode[] = parsedNodes.map(node => {
          if (node.nodeType === 'agent' && node.systemPrompt) {
            return {
              type: 'agent',
              id: node.id,
              name: node.name,
              systemPrompt: node.systemPrompt,
            };
          }
          return {
            type: 'tool',
            id: node.id,
            name: node.name,
            nodeType: node.type,
          };
        });
        setWorkflow(newWorkflow);
        setParsedN8nData(parsedNodes);
        fetchAndSetCriteria(newWorkflow);
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
    const newAgent: WorkflowNode = {
      type: 'agent',
      id: `manual-${Date.now()}`,
      name: `Agent ${workflow.filter(n => n.type === 'agent').length + 1}`,
      systemPrompt: 'New agent prompt...'
    };
    setWorkflow([...workflow, newAgent]);
    setParsedN8nData(null);
  };

  const handleRemoveNode = (index: number) => {
    if (workflow.length > 1) {
      setWorkflow(workflow.filter((_, i) => i !== index));
      setParsedN8nData(null);
    }
  };

  const handleNodeChange = (index: number, value: string) => {
    const newWorkflow = [...workflow];
    const node = newWorkflow[index];
    if (node.type === 'agent') {
      node.systemPrompt = value;
    }
    setWorkflow(newWorkflow);
    setParsedN8nData(null);
  };

  const handleSuggestCriteria = async () => {
    await fetchAndSetCriteria(workflow);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const isWorkflowValid = workflow.every(node => 
      node.type === 'tool' || (node.type === 'agent' && node.systemPrompt.trim())
    );
    if (isWorkflowValid && criteria.length > 0) {
      const config = { workflow, criteria, testCaseCount };
      onStartAudit({ config, n8nData: parsedN8nData });
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
            <label className="block text-lg font-medium text-gray-700 dark:text-gray-300 mb-4">
              {t('workflowConfigLabel')}
            </label>
            <div className="space-y-6 border-l-2 border-gray-200 dark:border-gray-700 pl-6">
              {workflow.map((node, index) => (
                <div key={node.id} className="relative">
                   <div className="absolute -left-[33px] top-1 h-4 w-4 rounded-full bg-primary-500 ring-4 ring-white dark:ring-gray-800"></div>
                  {node.type === 'agent' ? (
                     <div className="flex items-start gap-4">
                        <div className="flex-grow">
                           <h3 className="font-semibold text-gray-800 dark:text-white">{t('agentNodeTitle', { name: node.name })}</h3>
                           <textarea
                              rows={3}
                              className="w-full mt-2 p-3 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition"
                              value={node.systemPrompt}
                              onChange={(e) => handleNodeChange(index, e.target.value)}
                              placeholder={t('promptPlaceholder', { index: index + 1 })}
                           />
                        </div>
                         <button type="button" onClick={() => handleRemoveNode(index)} 
                           className="p-3 text-gray-400 hover:text-red-500 disabled:text-gray-600 disabled:cursor-not-allowed"
                           disabled={workflow.length <= 1}
                         >
                           <TrashIcon className="w-6 h-6" />
                         </button>
                     </div>
                  ) : (
                      <div className="flex items-start gap-4">
                        <div className="flex-grow">
                            <h3 className="font-semibold text-gray-800 dark:text-white">{t('toolNodeTitle', { name: node.name })}</h3>
                             <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">{t('toolNodeType', { type: node.nodeType })}</p>
                             <p className="text-sm font-medium text-blue-600 dark:text-blue-300 p-3 bg-blue-50 dark:bg-blue-900/50 border-l-4 border-blue-500 rounded-r-lg">
                                {t('toolSimulationAuto')}
                             </p>
                        </div>
                        <button type="button" onClick={() => handleRemoveNode(index)} 
                          className="p-3 text-gray-400 hover:text-red-500 disabled:text-gray-600 disabled:cursor-not-allowed"
                          disabled={workflow.length <= 1}
                        >
                           <TrashIcon className="w-6 h-6" />
                        </button>
                      </div>
                  )}
                </div>
              ))}
            </div>
            <button type="button" onClick={handleAddAgent} className="mt-4 text-sm font-medium text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-200 flex items-center gap-1">
                <PlusCircleIcon className="w-5 h-5"/>
                {t('addAgent')}
            </button>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
                <label className="block text-lg font-medium text-gray-700 dark:text-gray-300">
                  {t('criteriaLabel')}
                </label>
                <button type="button" onClick={handleSuggestCriteria} disabled={isSuggestingCriteria} className="flex items-center gap-2 text-sm font-semibold py-2 px-3 bg-yellow-400/20 text-yellow-700 dark:text-yellow-300 rounded-lg hover:bg-yellow-400/40 disabled:opacity-50 disabled:cursor-wait">
                    {isSuggestingCriteria ? <Loader/> : <SparklesIcon className="w-5 h-5"/>}
                    {isSuggestingCriteria ? t('suggestingCriteria') : t('suggestCriteria')}
                </button>
            </div>
             <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{t('criteriaDescription')}</p>
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
            <label htmlFor="test-case-count" className="block text-lg font-medium text-gray-700 dark:text-gray-300 mb-2">
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
              disabled={workflow.some(n => n.type === 'agent' && !n.systemPrompt.trim()) || criteria.length === 0}
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
