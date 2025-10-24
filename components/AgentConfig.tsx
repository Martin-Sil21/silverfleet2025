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
  onStartAudit: (data: { config: AuditConfig, n8nData: ParsedN8nNode[] | null, n8nJson?: any }) => void;
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
  const [originalN8nJson, setOriginalN8nJson] = useState<any>(null); // JSON original completo
  const [fileError, setFileError] = useState<string | null>(null);
  const [isSuggestingCriteria, setIsSuggestingCriteria] = useState(false);
  
  // n8n Real Execution Config
  const [useRealExecution, setUseRealExecution] = useState(false);
  const [n8nWebhookUrl, setN8nWebhookUrl] = useState('');

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
        
        // Guardar el JSON original completo
        const jsonData = JSON.parse(text);
        setOriginalN8nJson(jsonData);
        
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
    setIsSuggestingCriteria(true);
    try {
      const suggested = await suggestAuditCriteria(workflow, language);
      setCriteria(suggested);
    } catch(error) {
      // Basic error handling for the user
      const message = error instanceof Error ? error.message : "Could not suggest criteria.";
      alert(message);
    } finally {
      setIsSuggestingCriteria(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const isWorkflowValid = workflow.every(node => 
      node.type === 'tool' || (node.type === 'agent' && node.systemPrompt.trim())
    );
    
    if (!isWorkflowValid || criteria.length === 0) {
      alert('Por favor completa el workflow y los criterios de auditoría.');
      return;
    }

    // ⚠️ WEBHOOK OBLIGATORIO para auditoría real
    if (useRealExecution && !n8nWebhookUrl) {
      alert(
        '❌ WEBHOOK REQUERIDO\n\n' +
        'Para realizar una auditoría REAL, necesitás proporcionar el webhook de n8n.\n\n' +
        'Sin el webhook, los resultados serían INVENTADOS por IA y la auditoría sería INÚTIL.\n\n' +
        '💡 Tip: Obtené el webhook desde tu workflow de n8n (nodo Webhook).'
      );
      return;
    }

    // ⚠️ Advertencia para modo DEMO (sin webhook)
    if (!useRealExecution) {
      const proceed = confirm(
        '⚠️ ADVERTENCIA: Modo DEMO\n\n' +
        'Sin usar el webhook de n8n real, la auditoría usará datos SIMULADOS/INVENTADOS por IA.\n\n' +
        '❌ Los resultados NO reflejarán el comportamiento real de tu workflow.\n' +
        '❌ La auditoría será POCO CONFIABLE.\n' +
        '✅ Para auditoría REAL: Activa "Usar ejecución real en n8n" y proporciona el webhook.\n\n' +
        '¿Continuar con modo DEMO de todos modos?'
      );
      if (!proceed) return;
    }

    const config: AuditConfig = {
      workflow,
      criteria,
      testCaseCount,
      useRealExecution,
      ...(useRealExecution && n8nWebhookUrl && {
        n8nConfig: {
          webhookUrl: n8nWebhookUrl,
        }
      })
    };
    onStartAudit({ config, n8nData: parsedN8nData, n8nJson: originalN8nJson });
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

      <Card className="mb-8">
        <h2 className="text-xl font-semibold text-gray-800 dark:text-white mb-2">{t('n8nExecutionTitle')}</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          {t('n8nExecutionDescription')}
        </p>
        
        <div className="space-y-4">
          <div className="flex items-center">
            <input
              id="use-real-execution"
              type="checkbox"
              checked={useRealExecution}
              onChange={(e) => setUseRealExecution(e.target.checked)}
              className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
            />
            <label htmlFor="use-real-execution" className="ml-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('useRealExecution')}
            </label>
          </div>

          {useRealExecution && (
            <div className="pl-6 border-l-2 border-primary-500 space-y-4 animate-fadeIn">
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-500 rounded-lg p-4 mb-4">
                <h4 className="font-semibold text-green-800 dark:text-green-300 mb-2">
                  ✅ Modo Auditoría REAL activado
                </h4>
                <p className="text-sm text-green-700 dark:text-green-400">
                  El sistema ejecutará los test cases en tu n8n real y auditará los resultados verdaderos.
                </p>
              </div>
              
              <div>
                <label htmlFor="n8n-webhook-url" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('n8nWebhookUrl')} <span className="text-red-500">* OBLIGATORIO</span>
                </label>
                <input
                  id="n8n-webhook-url"
                  type="url"
                  value={n8nWebhookUrl}
                  onChange={(e) => setN8nWebhookUrl(e.target.value)}
                  placeholder="https://silverfleet.online/webhook/590785a9-e814-4a42-959a-7e8e4ff5ab9e"
                  className="w-full p-3 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition font-mono text-sm"
                  required={useRealExecution}
                />
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  💡 {t('n8nWebhookHint')}
                </p>
              </div>
            </div>
          )}
          
          {!useRealExecution && (
            <div className="mt-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-500 rounded-lg p-4">
              <h4 className="font-semibold text-yellow-800 dark:text-yellow-300 mb-2 flex items-center gap-2">
                ⚠️ Advertencia: Modo DEMO/Simulación
              </h4>
              <p className="text-sm text-yellow-700 dark:text-yellow-400 mb-2">
                Sin el webhook de n8n, el sistema usará <strong>datos INVENTADOS por IA</strong> para simular la ejecución.
              </p>
              <ul className="text-sm text-yellow-700 dark:text-yellow-400 space-y-1 list-disc list-inside">
                <li>Los resultados <strong>NO</strong> reflejarán el comportamiento real</li>
                <li>La auditoría será <strong>POCO CONFIABLE</strong></li>
                <li>Solo sirve para <strong>demostración</strong> de la interfaz</li>
              </ul>
              <p className="text-sm text-yellow-800 dark:text-yellow-300 mt-3 font-semibold">
                ✅ Para una auditoría real: Activa "Usar ejecución real en n8n" y proporciona el webhook.
              </p>
            </div>
          )}
        </div>
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