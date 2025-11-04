/**
 * 🎯 AgentConfig with Step-by-Step Configuration Flow
 * 
 * FLOW:
 * Step 1: Upload Main Workflow + Test Endpoint + Generate Payload
 * Step 2: Upload Detected Subflows (if any)
 * Step 3: Configure Credentials for Detected Tools/Databases
 * Step 4: Configure Audit Criteria + Test Case Count
 * Step 5: Final Review & Start Audit
 */

import React, { useState, useMemo, useEffect } from 'react';
import type { AuditConfig, ParsedN8nWorkflow, WorkflowNode, N8nConnection, HistoricalAudit } from '../types';
import Card from './Card';
import { parseN8nWorkflow } from '../services/n8nParser';
import { useTranslation } from '../hooks/useTranslation';
import { suggestAuditCriteria, generateSamplePayload } from '../services/geminiService';
import { analyzeWorkflowPayload } from '../services/workflowPayloadAnalyzer';
import { analyzeWorkflowDependencies, validateDependencies, type WorkflowDependencies, type DetectedDatabase } from '../services/workflowDependencyAnalyzer';
import { buildDatabaseConfig } from '../services/databaseConfigBuilder';
import { buildIntegrationConfig } from '../services/integrationConfigBuilder';
import CredentialModal from './CredentialModal';
import type { CredentialType } from '../services/credentialsManager';
import { mapToolTypeToCredentialType, getCredentialTypeLabel } from '../services/credentialsManager';
import AuditHistory from './AuditHistory';

// Icons
import { UploadIcon } from './icons/UploadIcon';
import { CheckCircleIcon } from './icons/CheckCircleIcon';
import { XCircleIcon } from './icons/XCircleIcon';
import { ExclamationTriangleIcon } from './icons/ExclamationTriangleIcon';
import { SparklesIcon } from './icons/SparklesIcon';
import { PlusCircleIcon } from './icons/PlusCircleIcon';
import { EyeIcon } from './icons/EyeIcon';
import { BoltIcon } from './icons/BoltIcon';
import Loader from './Loader';

interface AgentConfigProps {
  onStartAudit: (data: { config: AuditConfig, n8nData: ParsedN8nWorkflow | null }) => void;
  onViewHistory: (item: HistoricalAudit) => void;
  onManageCredentials?: () => void;
  initialConfig?: AuditConfig | null;
}

type ConfigStep = 1 | 2 | 3 | 4 | 5;

const AgentConfig: React.FC<AgentConfigProps> = ({ onStartAudit, onViewHistory, onManageCredentials, initialConfig }) => {
  const { t, language } = useTranslation();
  
  const DEFAULT_CRITERIA = useMemo(() => [
    t('defaultCriteria1'),
    t('defaultCriteria2'),
    t('defaultCriteria3'),
    t('defaultCriteria4'),
    t('defaultCriteria5'),
  ], [t]);

  // Current step
  const [currentStep, setCurrentStep] = useState<ConfigStep>(1);
  
  // Step 1: Main Workflow
  const [workflow, setWorkflow] = useState<WorkflowNode[]>([]);
  const [connections, setConnections] = useState<N8nConnection[]>([]);
  const [parsedN8nData, setParsedN8nData] = useState<ParsedN8nWorkflow | null>(null);
  const [rawN8nJson, setRawN8nJson] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  
  const [endpointUrl, setEndpointUrl] = useState('');
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');
  
  const [samplePayload, setSamplePayload] = useState<Record<string, any> | null>(null);
  const [rawPayloadText, setRawPayloadText] = useState('');
  const [payloadError, setPayloadError] = useState<string | null>(null);
  const [isGeneratingPayload, setIsGeneratingPayload] = useState(false);
  
  // Step 2: Subflows
  const [dependencies, setDependencies] = useState<WorkflowDependencies | null>(null);
  const [uploadedSubflows, setUploadedSubflows] = useState<Map<string, string>>(new Map());
  
  // Step 3: Credentials
  const [toolCredentials, setToolCredentials] = useState<Map<string, string>>(new Map());
  const [dbCredentials, setDbCredentials] = useState<Map<string, string>>(new Map());
  const [modalOpen, setModalOpen] = useState(false);
  const [modalConfig, setModalConfig] = useState<{
    nodeId: string; 
    credType: CredentialType; 
    toolName: string; 
    category: 'tool' | 'db';
    acceptedTypes?: CredentialType[]; // Tipos de credenciales aceptados
  } | null>(null);
  
  // Step 4: Criteria
  const [criteria, setCriteria] = useState<string[]>(DEFAULT_CRITERIA);
  const [newCriterion, setNewCriterion] = useState('');
  const [testCaseCount, setTestCaseCount] = useState(5);
  const [isSuggestingCriteria, setIsSuggestingCriteria] = useState(false);
  
  // Step 5: Final config
  const [auditType, setAuditType] = useState<'visual' | 'real'>('visual');
  
  // Re-audit support
  useEffect(() => {
    if (initialConfig) {
      console.log('🔄 Loading config for re-audit:', initialConfig);
      
      setAuditType(initialConfig.auditType);
      setCriteria(initialConfig.criteria);
      setTestCaseCount(initialConfig.testCaseCount);
      setWorkflow(initialConfig.workflow || []);
      setConnections(initialConfig.connections || []);
      setEndpointUrl(initialConfig.endpointUrl || '');
      
      if (initialConfig.rawN8nJson) {
        try {
          const parsedWorkflow = parseN8nWorkflow(initialConfig.rawN8nJson);
          setParsedN8nData(parsedWorkflow);
          setRawN8nJson(initialConfig.rawN8nJson);
          
          // Analyze dependencies
          const deps = analyzeWorkflowDependencies(initialConfig.rawN8nJson);
          setDependencies(deps);
        } catch (error) {
          console.error('❌ Error reconstructing workflow:', error);
        }
      }
      
      if (initialConfig.samplePayload) {
        setSamplePayload(initialConfig.samplePayload);
        setRawPayloadText(JSON.stringify(initialConfig.samplePayload, null, 2));
      }
    }
  }, [initialConfig]);

  // ============================================================================
  // STEP 1: Main Workflow Upload
  // ============================================================================
  
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
    setDependencies(null);

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string;
        if (!text) throw new Error("File is empty.");
        
        setRawN8nJson(text);
        
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
        
        // Analyze dependencies
        const deps = analyzeWorkflowDependencies(text);
        setDependencies(deps);
        console.log('📦 Dependencies detected:', deps);
        
        // Auto-suggest criteria
        await fetchAndSetCriteria(newWorkflow, parsedWorkflow.connections);
        
        // Auto-generate payload
        handleGeneratePayload(newWorkflow, parsedWorkflow.connections);
        
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

  const handleGeneratePayload = async (wf?: WorkflowNode[], conns?: N8nConnection[]) => {
    const workflowToUse = wf || workflow;
    const connsToUse = conns || connections;

    if (!workflowToUse || workflowToUse.length === 0 || !connsToUse) return;

    setIsGeneratingPayload(true);
    setPayloadError(null);
    try {
      // Strategy 1: Extract from second node
      if (parsedN8nData && parsedN8nData.rawNodes && parsedN8nData.rawNodes.length >= 2) {
        console.log('🔍 Extracting payload from second node...');
        const payloadSchema = analyzeWorkflowPayload(parsedN8nData.rawNodes);
        
        if (payloadSchema && Object.keys(payloadSchema.examplePayload).length > 0) {
          console.log('✅ Payload extracted from workflow:', payloadSchema.examplePayload);
          setSamplePayload(payloadSchema.examplePayload);
          setRawPayloadText(JSON.stringify(payloadSchema.examplePayload, null, 2));
          setIsGeneratingPayload(false);
          return;
        }
      }
      
      // Strategy 2: Use default payload
      console.log('📝 Using default payload template');
      const defaultPayload = {
        "input": "Hola Martín. Precisamente, donde perdemos mucho tiempo y recursos es en la calificación inicial de los leads que llegan por el formulario de la web. Muchos no cumplen con el perfil que buscamos o no tienen una necesidad inmediata.",
        "nombre": "Javier Fernández",
        "telefonos": "+5491167890123"
      };
      setSamplePayload(defaultPayload);
      setRawPayloadText(JSON.stringify(defaultPayload, null, 2));
      setIsGeneratingPayload(false);
      
    } catch (error) {
      // Fallback to default payload on error
      const defaultPayload = {
        "input": "Hola Martín. Precisamente, donde perdemos mucho tiempo y recursos es en la calificación inicial de los leads que llegan por el formulario de la web. Muchos no cumplen con el perfil que buscamos o no tienen una necesidad inmediata.",
        "nombre": "Javier Fernández",
        "telefonos": "+5491167890123"
      };
      setSamplePayload(defaultPayload);
      setRawPayloadText(JSON.stringify(defaultPayload, null, 2));
      console.log('✅ Using default payload after error');
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

  const handleTestEndpoint = async () => {
    if (!endpointUrl.trim() || !endpointUrl.startsWith('http')) {
      setTestStatus('error');
      setTestMessage('Por favor ingresa una URL válida');
      return;
    }
    setTestStatus('testing');
    setTestMessage('');
    try {
      const response = await fetch(endpointUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}) // 🔥 Objeto vacío solo para probar salud del endpoint
      });
      if (!response.ok) {
        throw new Error(`El endpoint respondió con status ${response.status}: ${response.statusText}`);
      }
      setTestStatus('success');
      setTestMessage('✅ Endpoint funcionando correctamente');
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error de red desconocido";
      setTestStatus('error');
      setTestMessage(`❌ Error: ${message}`);
    }
  };

  const isStep1Complete = parsedN8nData !== null && samplePayload !== null && 
    (auditType === 'visual' || (auditType === 'real' && testStatus === 'success'));

  // ============================================================================
  // STEP 2: Subflows Upload
  // ============================================================================
  
  const handleSubflowUpload = (nodeId: string, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (text) {
        const newMap = new Map(uploadedSubflows);
        newMap.set(nodeId, text);
        setUploadedSubflows(newMap);
        
        // 🔥 NUEVO: Analizar dependencias del subflujo
        try {
          const subflowDeps = analyzeWorkflowDependencies(text);
          console.log(`📦 Subflujo "${nodeId}" dependencies:`, subflowDeps);
          
          // Merge con dependencias existentes
          if (dependencies) {
            const mergedDeps: WorkflowDependencies = {
              subflows: dependencies.subflows, // No cambiar subflujos del main
              tools: [...dependencies.tools, ...subflowDeps.tools],
              databases: [...dependencies.databases, ...subflowDeps.databases],
              hasExternalDependencies: dependencies.hasExternalDependencies || subflowDeps.hasExternalDependencies
            };
            
            // Eliminar duplicados por nodeId
            mergedDeps.tools = Array.from(new Map(mergedDeps.tools.map(t => [t.nodeId, t])).values());
            mergedDeps.databases = Array.from(new Map(mergedDeps.databases.map(d => [d.nodeId, d])).values());
            
            setDependencies(mergedDeps);
            console.log('📦 Merged dependencies:', mergedDeps);
          }
        } catch (error) {
          console.error('Error analyzing subflow dependencies:', error);
        }
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const isStep2Complete = dependencies?.subflows.length === 0 || 
    dependencies?.subflows.every(sf => uploadedSubflows.has(sf.nodeId));

  // ============================================================================
  // STEP 3: Credentials Configuration
  // ============================================================================
  
  const handleConfigureTool = (nodeId: string, specificType: string, category: 'tool' | 'db') => {
    const credTypes = mapToolTypeToCredentialType(specificType);
    if (!credTypes || credTypes.length === 0) {
      console.error('No credential type mapping for:', specificType);
      return;
    }
    
    const toolName = category === 'tool' 
      ? dependencies?.tools.find(t => t.nodeId === nodeId)?.nodeName || 'Unknown Tool'
      : dependencies?.databases.find(d => d.nodeId === nodeId)?.nodeName || 'Unknown Database';
    
    // Usar el primer tipo como preferencia (ahora es array)
    setModalConfig({ nodeId, credType: credTypes[0], toolName, category, acceptedTypes: credTypes });
    setModalOpen(true);
  };

  const handleCredentialSelected = (credentialId: string) => {
    if (!modalConfig) return;
    
    if (modalConfig.category === 'tool') {
      const newMap = new Map(toolCredentials);
      newMap.set(modalConfig.nodeId, credentialId);
      setToolCredentials(newMap);
    } else {
      // For databases: apply same credential to ALL nodes of this DB type
      const dbType = modalConfig.credType;
      const newMap = new Map(dbCredentials);
      
      // Find all database nodes with this type and assign same credential
      dependencies?.databases
        .filter(db => {
          // Check if credential type matches any accepted type for this DB
          const dbCredTypes = mapToolTypeToCredentialType(db.databaseType);
          return dbCredTypes.includes(dbType);
        })
        .forEach(db => {
          newMap.set(db.nodeId, credentialId);
        });
      
      setDbCredentials(newMap);
    }
    
    setModalOpen(false);
    setModalConfig(null);
  };

  const isStep3Complete = (() => {
    // Check all tools have credentials
    const toolsComplete = dependencies?.tools.every(t => toolCredentials.has(t.nodeId)) ?? true;
    
    // Check all database types have at least one credential configured
    const databaseTypes = new Set(dependencies?.databases.map(d => d.databaseType));
    const dbComplete = Array.from(databaseTypes).every(dbType => {
      return dependencies?.databases
        .filter(d => d.databaseType === dbType)
        .some(d => dbCredentials.has(d.nodeId)) ?? false;
    });
    
    return toolsComplete && (databaseTypes.size === 0 || dbComplete);
  })();

  // ============================================================================
  // STEP 4: Criteria Configuration
  // ============================================================================
  
  const fetchAndSetCriteria = async (wf: WorkflowNode[], conns: N8nConnection[]) => {
    setIsSuggestingCriteria(true);
    try {
      const suggested = await suggestAuditCriteria(wf, conns, language);
      const combined = [...DEFAULT_CRITERIA, ...suggested];
      const uniqueCriteria = [...new Set(combined)];
      setCriteria(uniqueCriteria);
    } catch(error) {
      const message = error instanceof Error ? error.message : "Could not suggest criteria.";
      console.error(message);
      setCriteria(DEFAULT_CRITERIA);
    } finally {
      setIsSuggestingCriteria(false);
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

  const isStep4Complete = criteria.length > 0 && testCaseCount >= 1;

  // ============================================================================
  // STEP 5: Final Review & Start
  // ============================================================================
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!parsedN8nData || !samplePayload) {
      setFileError("Missing workflow or payload");
      return;
    }
    
    if (auditType === 'real' && testStatus !== 'success') {
      setTestMessage(t('testEndpointFirstError'));
      setTestStatus('error');
      return;
    }
    
    // 📋 Construir realDatabaseConfig automáticamente si hay credenciales de BD
    const dbConfigResult = buildDatabaseConfig(workflow, dbCredentials, rawN8nJson || undefined);
    
    if (dbConfigResult.warnings.length > 0) {
      console.warn('⚠️ Database config warnings:', dbConfigResult.warnings);
    }
    
    // 🔧 RE-ANALIZAR dependencies incluyendo subflows cargados
    // El análisis inicial (línea 189) se hace sin subflows, por lo que puede tener tools: 0
    console.log('\n🔧 [AgentConfig] Re-analizando dependencies con subflows cargados...');
    const finalDependencies = rawN8nJson ? analyzeWorkflowDependencies(rawN8nJson) : dependencies;
    console.log(`   Dependencies finales - Tools: ${finalDependencies?.tools.length || 0}, Subflows: ${finalDependencies?.subflows.length || 0}`);
    
    // 🔗 Construir integrationConfig para herramientas externas (Email, Calendar, etc.)
    console.log('\n🔗 [AgentConfig] Estado antes de buildIntegrationConfig:');
    console.log(`   Dependencies: ${finalDependencies ? 'Sí' : 'No'}`);
    console.log(`   Tools detectadas: ${finalDependencies?.tools.length || 0}`);
    console.log(`   Tool credentials configuradas: ${toolCredentials.size}`);
    
    if (finalDependencies && finalDependencies.tools.length > 0) {
      console.log('   📋 Lista de tools detectadas:');
      finalDependencies.tools.forEach(tool => {
        const hasCredential = toolCredentials.has(tool.nodeId);
        const credentialId = hasCredential ? toolCredentials.get(tool.nodeId) : 'NINGUNA';
        console.log(`      - ${tool.nodeName} (${tool.toolType}): ${hasCredential ? '✅' : '❌'} ${credentialId}`);
      });
    }
    
    const integrationConfig = buildIntegrationConfig(finalDependencies, toolCredentials);
    
    if (integrationConfig) {
      console.log('   ✅ IntegrationConfig construido exitosamente:', integrationConfig);
    } else {
      console.log('   ❌ IntegrationConfig NO construido (devolvió null)');
    }
    
    const config: AuditConfig = { 
      workflow, 
      connections, 
      criteria, 
      testCaseCount, 
      samplePayload, 
      auditType,
      endpointUrl: auditType === 'real' ? endpointUrl : undefined,
      rawN8nJson: rawN8nJson || undefined,
      toolCredentials,
      dbCredentials,
      realDatabaseConfig: dbConfigResult.config || undefined,
      integrationConfig: integrationConfig || undefined,
      dependencies: finalDependencies || undefined // 🔧 Pasar dependencies RE-ANALIZADAS con tools detectadas
    };
    
    onStartAudit({ config, n8nData: parsedN8nData });
  };

  const canStartAudit = isStep1Complete && isStep2Complete && isStep3Complete && isStep4Complete;

  // ============================================================================
  // RENDER
  // ============================================================================
  
  const renderStepIndicator = () => (
    <div className="flex items-center justify-center gap-4 mb-8">
      {[1, 2, 3, 4, 5].map((step) => {
        const isActive = step === currentStep;
        
        // Each step is only complete if it AND all previous steps are complete
        const isCompleted = 
          (step === 1 && isStep1Complete) ||
          (step === 2 && isStep1Complete && isStep2Complete) ||
          (step === 3 && isStep1Complete && isStep2Complete && isStep3Complete) ||
          (step === 4 && isStep1Complete && isStep2Complete && isStep3Complete && isStep4Complete) ||
          (step === 5 && canStartAudit);
        
        return (
          <div key={step} className="flex items-center">
            <button
              onClick={() => setCurrentStep(step as ConfigStep)}
              className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition ${
                isCompleted
                  ? 'bg-green-500 text-white'
                  : isActive
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-gray-300'
              }`}
            >
              {isCompleted ? '✓' : step}
            </button>
            {step < 5 && (
              <div className={`w-12 h-1 ${isCompleted ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
            )}
          </div>
        );
      })}
    </div>
  );

  const renderStep1 = () => (
    <div className="space-y-6">
      <Card>
        <h2 className="text-xl font-semibold text-gray-800 dark:text-white mb-2">
          📤 {t('importN8nTitle')}
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          {t('importN8nDescription')}
        </p>
        <div className={`relative border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
          parsedN8nData 
            ? 'border-green-300 dark:border-green-600 bg-green-50 dark:bg-green-900/20' 
            : 'border-gray-300 dark:border-gray-600 hover:border-primary-500 dark:hover:border-primary-400'
        }`}>
          {parsedN8nData ? (
            <CheckCircleIcon className="mx-auto h-12 w-12 text-green-500" />
          ) : (
            <UploadIcon className="mx-auto h-12 w-12 text-gray-400" />
          )}
          <label htmlFor="file-upload" className="mt-2 block text-sm font-semibold text-primary-600 hover:text-primary-500 cursor-pointer">
            <span>{parsedN8nData ? '✅ Archivo cargado - Clic para cambiar' : t('uploadFile')}</span>
            <input id="file-upload" name="file-upload" type="file" className="sr-only" accept=".json" onChange={handleFileChange} />
          </label>
          {parsedN8nData && (
            <p className="text-xs text-green-700 dark:text-green-300 mt-1">
              {parsedN8nData.nodes.length} nodos detectados
            </p>
          )}
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t('uploadHint')}</p>
        </div>
        {fileError && (
          <div className="mt-4 text-center p-3 bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-200 rounded-lg">
            <p>{fileError}</p>
          </div>
        )}
      </Card>

      {parsedN8nData && (
        <>
          <Card>
            <h2 className="text-xl font-semibold text-gray-800 dark:text-white mb-2">
              🧪 Payload de Prueba
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Define el JSON que se enviará al endpoint. <strong>Puedes editarlo directamente</strong> o generar uno automático.
            </p>
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    JSON Payload (editable):
                  </label>
                  <button 
                    type="button" 
                    onClick={() => handleGeneratePayload()} 
                    disabled={isGeneratingPayload} 
                    className="flex items-center gap-2 px-3 py-1.5 text-sm bg-yellow-400/20 text-yellow-700 dark:text-yellow-300 rounded-lg hover:bg-yellow-400/40 disabled:opacity-50 transition"
                  >
                    {isGeneratingPayload ? <Loader/> : <SparklesIcon className="w-4 h-4"/>}
                    {isGeneratingPayload ? 'Generando...' : 'Auto-generar'}
                  </button>
                </div>
                <textarea
                  value={rawPayloadText}
                  onChange={handlePayloadTextChange}
                  placeholder='{\n  "input": "Hola Martín. Precisamente, donde perdemos mucho tiempo y recursos es en la calificación inicial de los leads que llegan por el formulario de la web. Muchos no cumplen con el perfil que buscamos o no tienen una necesidad inmediata.",\n  "nombre": "Javier Fernández",\n  "telefonos": "+5491167890123"\n}'
                  className={`w-full h-56 p-3 font-mono text-sm bg-white dark:bg-gray-800 border-2 rounded-lg resize-y focus:outline-none focus:ring-2 focus:ring-primary-500 transition ${
                    payloadError ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 dark:border-gray-600'
                  }`}
                />
              </div>
              {payloadError && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <p className="text-sm text-red-700 dark:text-red-300">❌ {payloadError}</p>
                </div>
              )}
              {samplePayload && !payloadError && (
                <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                  <p className="text-sm text-green-700 dark:text-green-300">✅ Payload válido ({Object.keys(samplePayload).length} campos detectados)</p>
                </div>
              )}
            </div>
          </Card>

          <Card>
            <h2 className="text-xl font-semibold text-gray-800 dark:text-white mb-2">
              🔗 Endpoint del Webhook
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              URL del webhook n8n donde se enviarán las peticiones de prueba.
            </p>
            <div className="space-y-4">
              <input
                type="url"
                className="w-full p-3 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg font-mono text-sm"
                value={endpointUrl}
                onChange={(e) => setEndpointUrl(e.target.value)}
                placeholder="https://silverfleet.com.ar/webhook/590785a9-e814-4a42-959a-7e8e4ff5ab9e"
              />
              
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  ℹ️ El test envía un objeto vacío <code className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-800 rounded font-mono text-xs">{'{}'}</code> para verificar que el endpoint responde correctamente.
                </p>
              </div>

              <button 
                type="button" 
                onClick={handleTestEndpoint} 
                disabled={testStatus === 'testing' || !endpointUrl}
                className="w-full px-4 py-3 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {testStatus === 'testing' ? '🔄 Testeando conexión...' : '🧪 Testear Salud del Endpoint'}
              </button>
              {testStatus === 'success' && (
                <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-green-700 dark:text-green-300">
                  <CheckCircleIcon className="w-5 h-5" /> 
                  <span className="font-medium">{testMessage}</span>
                </div>
              )}
              {testStatus === 'error' && (
                <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300">
                  <XCircleIcon className="w-5 h-5" /> 
                  <span className="font-medium">{testMessage}</span>
                </div>
              )}
            </div>
          </Card>

          <Card>
            <h2 className="text-xl font-semibold text-gray-800 dark:text-white mb-2">
              🎯 Tipo de Auditoría
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Selecciona cómo quieres ejecutar la auditoría.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setAuditType('visual')}
                className={`p-6 border-2 rounded-lg transition-all ${
                  auditType === 'visual' 
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/40 shadow-md' 
                    : 'border-gray-300 dark:border-gray-600 hover:border-primary-400'
                }`}
              >
                <EyeIcon className="w-8 h-8 mx-auto mb-3 text-primary-600 dark:text-primary-400" />
                <p className="font-bold text-lg mb-2">Auditoría Visual</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Simula la ejecución del workflow usando IA. No hace llamadas reales al endpoint.
                </p>
              </button>
              <button
                type="button"
                onClick={() => setAuditType('real')}
                disabled={testStatus !== 'success'}
                className={`p-6 border-2 rounded-lg transition-all ${
                  auditType === 'real' 
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/40 shadow-md' 
                    : testStatus === 'success'
                    ? 'border-gray-300 dark:border-gray-600 hover:border-primary-400'
                    : 'border-gray-300 dark:border-gray-600 opacity-50 cursor-not-allowed'
                }`}
              >
                <BoltIcon className="w-8 h-8 mx-auto mb-3 text-primary-600 dark:text-primary-400" />
                <p className="font-bold text-lg mb-2">Auditoría Real</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Envía peticiones reales al endpoint y monitorea las respuestas en vivo.
                  {testStatus !== 'success' && <span className="block mt-2 text-orange-600 dark:text-orange-400 font-semibold">⚠️ Testea el endpoint primero</span>}
                </p>
              </button>
            </div>
          </Card>
        </>
      )}
    </div>
  );

  const renderStep2 = () => {
    if (!dependencies || dependencies.subflows.length === 0) {
      return (
        <Card>
          <div className="text-center py-12">
            <CheckCircleIcon className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-800 dark:text-white mb-2">
              ✅ No Subflows Detected
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              Your workflow doesn't use any sub-workflows. You can proceed to the next step.
            </p>
          </div>
        </Card>
      );
    }

    return (
      <Card>
        <h2 className="text-2xl font-semibold text-gray-800 dark:text-white mb-4">
          📦 Upload Required Subflows
        </h2>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          Your main workflow references {dependencies.subflows.length} sub-workflow(s). Please upload their JSON files.
        </p>
        <div className="space-y-4">
          {dependencies.subflows.map((subflow) => {
            const isUploaded = uploadedSubflows.has(subflow.nodeId);
            return (
              <div 
                key={subflow.nodeId} 
                className={`p-4 border-2 rounded-lg transition-colors ${
                  isUploaded 
                    ? 'border-green-300 dark:border-green-600 bg-green-50 dark:bg-green-900/20' 
                    : 'border-gray-300 dark:border-gray-600'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 dark:text-white">
                      {subflow.nodeName}
                    </h3>
                    {subflow.workflowName && (
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Workflow: {subflow.workflowName}
                      </p>
                    )}
                  </div>
                  {isUploaded ? (
                    <div className="flex items-center gap-3">
                      <CheckCircleIcon className="w-8 h-8 text-green-500" />
                      <label className="px-4 py-2 bg-blue-600 text-white rounded-lg cursor-pointer hover:bg-blue-700 text-sm">
                        Cambiar
                        <input
                          type="file"
                          accept=".json"
                          className="sr-only"
                          onChange={(e) => handleSubflowUpload(subflow.nodeId, e)}
                        />
                      </label>
                    </div>
                  ) : (
                    <label className="px-4 py-2 bg-primary-600 text-white rounded-lg cursor-pointer hover:bg-primary-700">
                      Upload JSON
                      <input
                        type="file"
                        accept=".json"
                        className="sr-only"
                        onChange={(e) => handleSubflowUpload(subflow.nodeId, e)}
                      />
                    </label>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    );
  };

  const renderStep3 = () => {
    const hasTools = (dependencies?.tools.length ?? 0) > 0;
    const hasDatabases = (dependencies?.databases.length ?? 0) > 0;

    if (!hasTools && !hasDatabases) {
      return (
        <Card>
          <div className="text-center py-12">
            <CheckCircleIcon className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-800 dark:text-white mb-2">
              ✅ No External Tools Detected
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              Your workflow doesn't use external tools or databases requiring credentials.
            </p>
          </div>
        </Card>
      );
    }

    // Group databases by type - all nodes of same type share one credential
    const databasesByType = new Map<string, DetectedDatabase[]>();
    dependencies?.databases.forEach(db => {
      const existing = databasesByType.get(db.databaseType) || [];
      databasesByType.set(db.databaseType, [...existing, db]);
    });

    return (
      <div className="space-y-6">
        {hasDatabases && (
          <Card>
            <h2 className="text-xl font-semibold text-gray-800 dark:text-white mb-4">
              🗄️ Database Credentials
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Configure one credential per database type. It will be used for all nodes of that type.
            </p>
            <div className="space-y-3">
              {Array.from(databasesByType.entries()).map(([dbType, nodes]) => {
                // Check if this DB type has been configured (any node of this type)
                const isConfigured = nodes.some(node => dbCredentials.has(node.nodeId));
                const firstNode = nodes[0]; // Use first node for configuration
                
                return (
                  <div key={dbType} className="p-4 border-2 border-gray-300 dark:border-gray-600 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold text-gray-900 dark:text-white">
                          {dbType.toUpperCase()} Database
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          Used by {nodes.length} node{nodes.length > 1 ? 's' : ''}: {nodes.map(n => n.nodeName).join(', ')}
                        </p>
                      </div>
                      {isConfigured ? (
                        <div className="flex items-center gap-2">
                          <CheckCircleIcon className="w-6 h-6 text-green-500" />
                          <button
                            type="button"
                            onClick={() => handleConfigureTool(firstNode.nodeId, dbType as CredentialType, 'db')}
                            className="text-sm text-primary-600 hover:underline"
                          >
                            Change
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleConfigureTool(firstNode.nodeId, dbType as CredentialType, 'db')}
                          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                        >
                          Configure
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {hasTools && (
          <Card>
            <h2 className="text-xl font-semibold text-gray-800 dark:text-white mb-4">
              🛠️ External Tool Credentials
            </h2>
            <div className="space-y-3">
              {dependencies!.tools.map((tool) => {
                const isConfigured = toolCredentials.has(tool.nodeId);
                return (
                  <div key={tool.nodeId} className="p-4 border-2 border-gray-300 dark:border-gray-600 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold text-gray-900 dark:text-white">{tool.nodeName}</h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          Type: {tool.specificType}
                        </p>
                      </div>
                      {isConfigured ? (
                        <div className="flex items-center gap-2">
                          <CheckCircleIcon className="w-6 h-6 text-green-500" />
                          <button
                            type="button"
                            onClick={() => handleConfigureTool(tool.nodeId, tool.specificType, 'tool')}
                            className="text-sm text-primary-600 hover:underline"
                          >
                            Change
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleConfigureTool(tool.nodeId, tool.specificType, 'tool')}
                          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                        >
                          Configure
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </div>
    );
  };

  const renderStep4 = () => (
    <Card>
      <h2 className="text-2xl font-semibold text-gray-800 dark:text-white mb-4">
        ✅ {t('criteriaLabel')}
      </h2>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{t('criteriaDescription')}</p>
      
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-700 dark:text-gray-300">Current Criteria:</h3>
        <button 
          type="button" 
          onClick={() => fetchAndSetCriteria(workflow, connections)} 
          disabled={isSuggestingCriteria} 
          className="flex items-center gap-2 text-sm px-3 py-2 bg-yellow-400/20 text-yellow-700 dark:text-yellow-300 rounded-lg hover:bg-yellow-400/40 disabled:opacity-50"
        >
          {isSuggestingCriteria ? <Loader/> : <SparklesIcon className="w-5 h-5"/>}
          {isSuggestingCriteria ? 'Suggesting...' : 'AI Suggest'}
        </button>
      </div>
      
      <div className="flex flex-wrap gap-2 mb-4">
        {criteria.map((c) => (
          <span key={c} className={`flex items-center text-sm font-medium px-3 py-1 rounded-full ${
            DEFAULT_CRITERIA.includes(c) ? 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200' : 'bg-primary-100 dark:bg-primary-900 text-primary-800 dark:text-primary-200'
          }`}>
            {c}
            {!DEFAULT_CRITERIA.includes(c) && (
              <button type="button" onClick={() => handleRemoveCriterion(c)} className="ml-2 hover:text-primary-800 dark:hover:text-primary-200">
                <XCircleIcon className="w-4 h-4" />
              </button>
            )}
          </span>
        ))}
      </div>
      
      <div className="flex gap-2 mb-6">
        <input
          type="text"
          className="flex-grow p-3 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg"
          value={newCriterion}
          onChange={(e) => setNewCriterion(e.target.value)}
          onKeyDown={(e) => {if(e.key === 'Enter') { e.preventDefault(); handleAddCriterion();}}}
          placeholder={t('addCriterionPlaceholder')}
        />
        <button type="button" onClick={handleAddCriterion} className="p-3 bg-primary-100 dark:bg-primary-900 text-primary-600 dark:text-primary-300 rounded-lg hover:bg-primary-200">
          <PlusCircleIcon className="w-6 h-6" />
        </button>
      </div>

      <div>
        <label htmlFor="test-case-count" className="block text-lg font-medium text-gray-700 dark:text-gray-300 mb-2">
          {t('testCaseCountLabel', { count: testCaseCount })}
        </label>
        <input
          id="test-case-count"
          type="range"
          min="1"
          max="100"
          step="1"
          value={testCaseCount}
          onChange={(e) => setTestCaseCount(parseInt(e.target.value, 10))}
          className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer"
        />
      </div>
    </Card>
  );

  const renderStep5 = () => {
    // Construir DB config para mostrar preview de tablas detectadas
    let dbConfigPreview;
    try {
      dbConfigPreview = buildDatabaseConfig(workflow, dbCredentials, rawN8nJson || undefined);
    } catch (error) {
      console.error('❌ Error building database config:', error);
      dbConfigPreview = { config: null, warnings: ['Error al analizar la configuración de base de datos'] };
    }
    
    return (
    <Card>
      <h2 className="text-2xl font-semibold text-gray-800 dark:text-white mb-4">
        🎯 Final Review
      </h2>
      <div className="space-y-4">
        <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Configuration Summary:</h3>
          <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <li>✓ Workflow loaded: <strong>{parsedN8nData?.nodes.length} nodes</strong></li>
            <li>✓ Audit type: <strong>{auditType === 'visual' ? 'Visual Simulation' : 'Real Endpoint'}</strong></li>
            <li>✓ Subflows: <strong>{dependencies?.subflows.length || 0} detected, {uploadedSubflows.size} uploaded</strong></li>
            <li>✓ Tools configured: <strong>{toolCredentials.size}</strong></li>
            <li>✓ Databases configured: <strong>{dbCredentials.size}</strong></li>
            <li>✓ Audit criteria: <strong>{criteria.length}</strong></li>
            <li>✓ Test cases to generate: <strong>{testCaseCount}</strong></li>
          </ul>
        </div>

        {/* Database Tables Preview */}
        {dbConfigPreview.config && dbConfigPreview.config.tables.length > 0 && (
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <div className="flex items-start gap-3">
              <div className="text-blue-600 dark:text-blue-400 text-2xl">🗄️</div>
              <div className="flex-1">
                <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
                  Database Tracking Enabled
                </h3>
                <p className="text-sm text-blue-800 dark:text-blue-200 mb-2">
                  The following tables will be monitored for changes during real audits:
                </p>
                <div className="flex flex-wrap gap-2">
                  {dbConfigPreview.config.tables.map(table => (
                    <span 
                      key={table}
                      className="px-3 py-1 bg-blue-100 dark:bg-blue-800 text-blue-800 dark:text-blue-100 rounded-full text-sm font-medium"
                    >
                      {table}
                    </span>
                  ))}
                </div>
                <p className="text-xs text-blue-700 dark:text-blue-300 mt-2">
                  Database: {dbConfigPreview.config.type.toUpperCase()}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Database Config Warnings */}
        {dbCredentials.size > 0 && (!dbConfigPreview.config || dbConfigPreview.warnings.length > 0) && (
          <div className="p-4 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg">
            <div className="flex items-start gap-3">
              <ExclamationTriangleIcon className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-orange-900 dark:text-orange-100 mb-1">
                  Database Configuration Issues:
                </h3>
                {dbConfigPreview.warnings.length > 0 ? (
                  <ul className="list-disc list-inside text-sm text-orange-800 dark:text-orange-200">
                    {dbConfigPreview.warnings.map((warning, idx) => (
                      <li key={idx}>{warning}</li>
                    ))}
                  </ul>
                ) : null}
                <p className="text-xs text-orange-700 dark:text-orange-300 mt-2">
                  💡 Tip: Database tracking requires Supabase nodes with table names in your workflow. Check browser console for detailed logs.
                </p>
              </div>
            </div>
          </div>
        )}

        {!canStartAudit && (
          <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-400 rounded-r-lg">
            <div className="flex items-start gap-3">
              <ExclamationTriangleIcon className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-yellow-800 dark:text-yellow-200">
                <p className="font-semibold mb-1">Missing Configuration:</p>
                <ul className="list-disc list-inside">
                  {!isStep1Complete && <li>Complete Step 1 (Workflow & Payload)</li>}
                  {!isStep2Complete && <li>Upload all required subflows (Step 2)</li>}
                  {!isStep3Complete && (
                    <>
                      <li>Configure all tool/database credentials (Step 3)</li>
                      {dependencies && dependencies.tools.length > 0 && (
                        <li className="ml-6 text-red-600 dark:text-red-400 font-semibold">
                          ⚠️ {dependencies.tools.filter(t => !toolCredentials.has(t.nodeId)).length} tool(s) 
                          sin configurar (Email, Calendar, etc.) - SIN credenciales NO se verificarán las herramientas
                        </li>
                      )}
                    </>
                  )}
                  {!isStep4Complete && <li>Set audit criteria (Step 4)</li>}
                </ul>
              </div>
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={!canStartAudit}
          className="w-full py-4 px-6 bg-primary-600 text-white font-bold text-lg rounded-lg shadow-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-transform transform hover:scale-105"
        >
          🚀 {t('startAuditButton')}
        </button>
      </div>
    </Card>
    );
  };

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          {renderStepIndicator()}
          
          <form onSubmit={handleSubmit}>
            {currentStep === 1 && renderStep1()}
            {currentStep === 2 && renderStep2()}
            {currentStep === 3 && renderStep3()}
            {currentStep === 4 && renderStep4()}
            {currentStep === 5 && renderStep5()}
            
            <div className="flex items-center justify-between mt-8">
              <button
                type="button"
                onClick={() => setCurrentStep(Math.max(1, currentStep - 1) as ConfigStep)}
                disabled={currentStep === 1}
                className="px-6 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ← Previous
              </button>
              {currentStep < 5 ? (
                <button
                  type="button"
                  onClick={() => setCurrentStep(Math.min(5, currentStep + 1) as ConfigStep)}
                  className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                >
                  Next →
                </button>
              ) : null}
            </div>
          </form>
        </div>
        
        <div className="lg:col-span-1">
          {/* Botón de Gestión de Credenciales */}
          {onManageCredentials && (
            <Card className="mb-6">
              <div className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                  🔐 Credenciales
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Administra tus credenciales guardadas para bases de datos y APIs
                </p>
                <button
                  onClick={onManageCredentials}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center justify-center gap-2"
                >
                  <span>⚙️</span>
                  Gestionar Credenciales
                </button>
              </div>
            </Card>
          )}
          
          <AuditHistory onViewReport={onViewHistory} />
        </div>
      </div>

      {modalOpen && modalConfig && (
        <CredentialModal
          isOpen={modalOpen}
          credentialType={modalConfig.credType}
          toolName={modalConfig.toolName}
          acceptedTypes={modalConfig.acceptedTypes}
          onClose={() => {
            setModalOpen(false);
            setModalConfig(null);
          }}
          onCredentialSelected={handleCredentialSelected}
          preSelectedCredentialId={
            modalConfig.category === 'tool' 
              ? toolCredentials.get(modalConfig.nodeId)
              : dbCredentials.get(modalConfig.nodeId)
          }
          workflowTables={
            modalConfig.category === 'db' && rawN8nJson
              ? (() => {
                  try {
                    const parsed = JSON.parse(rawN8nJson);
                    const dbInfo = require('../services/workflowDatabaseAnalyzer').analyzeWorkflowDatabases(parsed.nodes || []);
                    return dbInfo.tables || [];
                  } catch {
                    return [];
                  }
                })()
              : []
          }
        />
      )}
    </>
  );
};

export default AgentConfig;
