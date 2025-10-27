import React, { useState, useMemo } from 'react';
import type { AuditConfig, ParsedN8nWorkflow, WorkflowNode, N8nConnection } from '../types';
import { PlusCircleIcon } from './icons/PlusCircleIcon';
import Card from './Card';
import { parseN8nWorkflow } from '../services/n8nParser';
import { UploadIcon } from './icons/UploadIcon';
import { TrashIcon } from './icons/TrashIcon';
import { useTranslation } from '../hooks/useTranslation';
import { XCircleIcon } from './icons/XCircleIcon';
import { CheckCircleIcon } from './icons/CheckCircleIcon';
import { SparklesIcon } from './icons/SparklesIcon';
import { suggestAuditCriteria, generateSamplePayload } from '../services/geminiService';
import Loader from './Loader';
import { EyeIcon } from './icons/EyeIcon';
import { BoltIcon } from './icons/BoltIcon';

interface AgentConfigProps {
  onStartAudit: (data: { config: AuditConfig, n8nData: ParsedN8nWorkflow | null }) => void;
}

const AgentConfig: React.FC<AgentConfigProps> = ({ onStartAudit }) => {
  const { t, language } = useTranslation();
  
  const DEFAULT_CRITERIA = useMemo(() => [
    t('defaultCriteria1'),
    t('defaultCriteria2'),
    t('defaultCriteria3'),
    t('defaultCriteria4'),
    t('defaultCriteria5'),
  ], [t]);

  const [workflow, setWorkflow] = useState<WorkflowNode[]>([]);
  const [connections, setConnections] = useState<N8nConnection[]>([]);
  const [criteria, setCriteria] = useState<string[]>(DEFAULT_CRITERIA);
  const [newCriterion, setNewCriterion] = useState('');
  const [testCaseCount, setTestCaseCount] = useState(5);
  const [parsedN8nData, setParsedN8nData] = useState<ParsedN8nWorkflow | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isSuggestingCriteria, setIsSuggestingCriteria] = useState(false);
  
  const [endpointUrl, setEndpointUrl] = useState('');
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');

  const [samplePayload, setSamplePayload] = useState<Record<string, any> | null>(null);
  const [rawPayloadText, setRawPayloadText] = useState('');
  const [payloadError, setPayloadError] = useState<string | null>(null);
  const [isGeneratingPayload, setIsGeneratingPayload] = useState(false);
  
  const [auditType, setAuditType] = useState<'visual' | 'real'>('visual');


  const fetchAndSetCriteria = async (workflowForSuggestion: WorkflowNode[], connectionsForSuggestion: N8nConnection[]) => {
    setIsSuggestingCriteria(true);
    try {
      const suggested = await suggestAuditCriteria(workflowForSuggestion, connectionsForSuggestion, language);
      const combined = [...DEFAULT_CRITERIA, ...suggested];
      const uniqueCriteria = [...new Set(combined)];
      setCriteria(uniqueCriteria);
    } catch(error) {
      const message = error instanceof Error ? error.message : "Could not suggest criteria.";
      setFileError(message);
      setCriteria(DEFAULT_CRITERIA); // Fallback to default
    } finally {
      setIsSuggestingCriteria(false);
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setFileError(null);
    setParsedN8nData(null);
    setEndpointUrl('');
    setTestStatus('idle');
    setSamplePayload(null);
    setRawPayloadText('');
    setPayloadError(null);


    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        if (!text) throw new Error("File is empty.");
        
        const parsedWorkflow = parseN8nWorkflow(text);
        if (parsedWorkflow.detectedEndpoints && parsedWorkflow.detectedEndpoints.length > 0) {
            setEndpointUrl(parsedWorkflow.detectedEndpoints[0]);
        }
        
        const newWorkflow: WorkflowNode[] = parsedWorkflow.nodes.map(node => {
          if (node.nodeType === 'agent' && node.systemPrompt) {
            return {
              type: 'agent',
              id: node.id,
              name: node.name,
              systemPrompt: node.systemPrompt,
              parameters: node.parameters,
            };
          }
          return {
            type: 'tool',
            id: node.id,
            name: node.name,
            nodeType: node.type,
            parameters: node.parameters,
          };
        });
        setWorkflow(newWorkflow);
        setConnections(parsedWorkflow.connections);
        setParsedN8nData(parsedWorkflow);
        fetchAndSetCriteria(newWorkflow, parsedWorkflow.connections);
      } catch (error) {
        const message = error instanceof Error ? error.message : "An unknown error occurred during parsing.";
        setFileError(message);
        setCriteria(DEFAULT_CRITERIA);
      }
    };
    reader.onerror = () => setFileError("Failed to read the file.");
    reader.readAsText(file);
    event.target.value = '';
  };

  const handlePayloadFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setPayloadError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        if (!text) throw new Error("File is empty.");
        setRawPayloadText(text);
        const parsedPayload = JSON.parse(text);
        setSamplePayload(parsedPayload);
      } catch (error) {
        setPayloadError(t('payloadError'));
        setSamplePayload(null);
      }
    };
    reader.onerror = () => setPayloadError("Failed to read the payload file.");
    reader.readAsText(file);
    event.target.value = '';
  };
  
  const handleGeneratePayload = async () => {
      if(!workflow || !connections) return;
      setIsGeneratingPayload(true);
      setPayloadError(null);
      try {
          const payload = await generateSamplePayload(workflow, connections, language);
          setSamplePayload(payload);
          setRawPayloadText(JSON.stringify(payload, null, 2));
      } catch (error) {
          const message = error instanceof Error ? error.message : "Could not generate payload.";
          setPayloadError(message);
      } finally {
          setIsGeneratingPayload(false);
      }
  };

  const handlePayloadTextChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = event.target.value;
    setRawPayloadText(newText);
    if (newText.trim() === '') {
      setSamplePayload(null);
      setPayloadError(null);
      return;
    }
    try {
      const parsed = JSON.parse(newText);
      setSamplePayload(parsed);
      setPayloadError(null);
    } catch (e) {
      setSamplePayload(null);
      setPayloadError(t('payloadError'));
    }
  };

  const handleAddCriterion = () => {
    if (newCriterion.trim() && !criteria.includes(newCriterion.trim())) {
      setCriteria([...criteria, newCriterion.trim()]);
      setNewCriterion('');
    }
  };

  const handleRemoveCriterion = (criterionToRemove: string) => {
    if(DEFAULT_CRITERIA.includes(criterionToRemove)) return;
    setCriteria(criteria.filter(c => c !== criterionToRemove));
  };

  const handleSuggestCriteria = async () => {
    await fetchAndSetCriteria(workflow, connections);
  };
  
  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEndpointUrl(e.target.value);
    setTestStatus('idle');
    setTestMessage('');
  };

  const handleTestEndpoint = async () => {
    if (!endpointUrl.trim() || !endpointUrl.startsWith('http')) {
        setTestStatus('error');
        setTestMessage(t('testError', { error: 'Please enter a valid URL.' }));
        return;
    }
    setTestStatus('testing');
    setTestMessage('');
    try {
        const response = await fetch(endpointUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(samplePayload || { message: "Silver Fleet audit connectivity test" })
        });
        if (!response.ok) {
            throw new Error(`Endpoint returned status ${response.status}: ${response.statusText}`);
        }
        setTestStatus('success');
        setTestMessage(t('testSuccess'));
    } catch (error) {
        const message = error instanceof Error ? error.message : "An unknown network error occurred.";
        setTestStatus('error');
        setTestMessage(t('testError', { error: message }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!parsedN8nData) {
        setFileError("Please upload an n8n workflow to run the visual audit.");
        return;
    }
    if (!samplePayload) {
        setPayloadError("A sample payload is required to generate test cases.");
        return;
    }
    if (auditType === 'real' && testStatus !== 'success') {
        setTestMessage(t('testEndpointFirstError'));
        setTestStatus('error');
        return;
    }
    const isWorkflowValid = workflow.every(node => 
      node.type === 'tool' || (node.type === 'agent' && node.systemPrompt.trim())
    );
    if (isWorkflowValid && criteria.length > 0) {
      const config: AuditConfig = { 
          workflow, 
          connections, 
          criteria, 
          testCaseCount, 
          samplePayload, 
          auditType,
          endpointUrl: auditType === 'real' ? endpointUrl : undefined
      };
      onStartAudit({ config, n8nData: parsedN8nData });
    }
  };
  
  const renderTestStatus = () => {
    switch (testStatus) {
      case 'testing':
        return <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400"><Loader /> {t('testingEndpoint')}</div>;
      case 'success':
        return <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400"><CheckCircleIcon className="w-5 h-5" /> {testMessage}</div>;
      case 'error':
        return <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400"><XCircleIcon className="w-5 h-5" /> {testMessage}</div>;
      default:
        return null;
    }
  };

  const isPayloadInvalid = payloadError && rawPayloadText.trim() !== '';

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
            <span>{parsedN8nData ? t('uploadSuccess') : t('uploadFile')}</span>
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

      {parsedN8nData && (
        <Card className="mb-8">
            <h2 className="text-xl font-semibold text-gray-800 dark:text-white mb-2">{t('samplePayloadTitle')}</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{t('samplePayloadDescription')}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                    <label htmlFor="payload-upload" className="w-full text-center cursor-pointer bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-bold py-3 px-4 rounded-lg transition">
                        <span>{samplePayload ? t('uploadPayloadSuccess') : t('uploadPayload')}</span>
                        <input id="payload-upload" type="file" className="sr-only" accept=".json" onChange={handlePayloadFileChange} />
                    </label>
                    <button type="button" onClick={handleGeneratePayload} disabled={isGeneratingPayload} className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-yellow-400/20 text-yellow-700 dark:text-yellow-300 rounded-lg hover:bg-yellow-400/40 disabled:opacity-50 disabled:cursor-not-allowed">
                        {isGeneratingPayload ? <Loader/> : <SparklesIcon className="w-5 h-5"/>}
                        {isGeneratingPayload ? t('suggestingPayload') : t('suggestPayload')}
                    </button>
                </div>
                <div>
                     <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('payloadPreviewTitle')}</label>
                     <textarea
                        value={rawPayloadText}
                        onChange={handlePayloadTextChange}
                        placeholder={t('payloadPreviewPlaceholder')}
                        className={`w-full h-40 p-2 font-mono text-xs bg-gray-50 dark:bg-gray-700 border rounded-md resize-none transition-colors focus:outline-none focus:ring-2 ${
                            isPayloadInvalid
                            ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
                            : 'border-gray-300 dark:border-gray-600 focus:border-primary-500 focus:ring-primary-500'
                        }`}
                    />
                </div>
            </div>
             {payloadError && (
              <div className="mt-4 text-center p-3 bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-200 rounded-lg">
                <p>{payloadError}</p>
              </div>
            )}
        </Card>
      )}
      
      {parsedN8nData && (
        <Card className="mb-8">
            <h2 className="text-xl font-semibold text-gray-800 dark:text-white mb-2">{t('endpointTestTitle')}</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{t('endpointTestDescription')}</p>
            <div className="flex flex-col sm:flex-row gap-2">
                <input
                    type="url"
                    className="flex-grow p-3 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition"
                    value={endpointUrl}
                    onChange={handleUrlChange}
                    placeholder={t('endpointUrlPlaceholder')}
                />
                <button 
                    type="button" 
                    onClick={handleTestEndpoint} 
                    disabled={testStatus === 'testing' || !endpointUrl || !samplePayload}
                    className="px-4 py-2 bg-primary-600 text-white font-semibold rounded-lg shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                    {testStatus === 'testing' ? t('testingEndpoint') : t('testEndpointButton')}
                </button>
            </div>
             <div className="mt-3 min-h-[24px]">
                {renderTestStatus()}
            </div>
        </Card>
      )}
    
      <Card>
        <form onSubmit={handleSubmit} className="space-y-8">
          <h2 className="text-2xl font-semibold text-gray-800 dark:text-white text-center">{t('configTitle')}</h2>
          
          <div>
            <div className="flex items-center justify-between mb-2">
                <label className="block text-lg font-medium text-gray-700 dark:text-gray-300">
                  {t('criteriaLabel')}
                </label>
                <button type="button" onClick={handleSuggestCriteria} disabled={isSuggestingCriteria || !parsedN8nData} className="flex items-center gap-2 text-sm font-semibold py-2 px-3 bg-yellow-400/20 text-yellow-700 dark:text-yellow-300 rounded-lg hover:bg-yellow-400/40 disabled:opacity-50 disabled:cursor-not-allowed">
                    {isSuggestingCriteria ? <Loader/> : <SparklesIcon className="w-5 h-5"/>}
                    {isSuggestingCriteria ? t('suggestingCriteria') : t('suggestCriteria')}
                </button>
            </div>
             <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{t('criteriaDescription')}</p>
            <div className="flex flex-wrap gap-2 mb-3">
              {criteria.map((c) => (
                <span key={c} className={`flex items-center text-sm font-medium px-3 py-1 rounded-full ${DEFAULT_CRITERIA.includes(c) ? 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200' : 'bg-primary-100 dark:bg-primary-900 text-primary-800 dark:text-primary-200'}`}>
                  {c}
                  {!DEFAULT_CRITERIA.includes(c) && (
                    <button type="button" onClick={() => handleRemoveCriterion(c)} className="ml-2 text-primary-600 dark:text-primary-400 hover:text-primary-800 dark:hover:text-primary-200">
                        <XCircleIcon className="w-4 h-4" />
                    </button>
                  )}
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

          <div>
             <label className="block text-lg font-medium text-gray-700 dark:text-gray-300 mb-3">{t('auditModeTitle')}</label>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div onClick={() => setAuditType('visual')} className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${auditType === 'visual' ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/40' : 'border-gray-300 dark:border-gray-600 hover:border-primary-400'}`}>
                    <div className="flex items-center gap-3">
                        <EyeIcon className="w-6 h-6 text-primary-600 dark:text-primary-400"/>
                        <div>
                            <h4 className="font-semibold text-gray-800 dark:text-white">{t('visualAuditMode')}</h4>
                            <p className="text-sm text-gray-600 dark:text-gray-300">{t('visualAuditModeDesc')}</p>
                        </div>
                    </div>
                </div>
                <div onClick={() => testStatus === 'success' ? setAuditType('real') : null} className={`p-4 border-2 rounded-lg transition-all ${auditType === 'real' ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/40' : 'border-gray-300 dark:border-gray-600'} ${testStatus === 'success' ? 'cursor-pointer hover:border-primary-400' : 'cursor-not-allowed opacity-60'}`}>
                     <div className="flex items-center gap-3">
                        <BoltIcon className="w-6 h-6 text-primary-600 dark:text-primary-400"/>
                        <div>
                            <h4 className="font-semibold text-gray-800 dark:text-white">{t('liveAuditMode')}</h4>
                            <p className="text-sm text-gray-600 dark:text-gray-300">{t('liveAuditModeDesc')}</p>
                        </div>
                    </div>
                </div>
             </div>
          </div>
          
          <div className="pt-4">
            <button type="submit" className="w-full py-3 px-4 bg-primary-600 text-white font-semibold rounded-lg shadow-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-transform transform hover:scale-105 disabled:bg-gray-400 disabled:cursor-not-allowed"
              disabled={!parsedN8nData || !samplePayload || criteria.length === 0}
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