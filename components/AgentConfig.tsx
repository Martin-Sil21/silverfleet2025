
import React, { useState, useMemo, useEffect } from 'react';
import type { AuditConfig, ParsedN8nWorkflow, WorkflowNode, N8nConnection, HistoricalAudit } from '../types';
import { PlusCircleIcon } from './icons/PlusCircleIcon';
import Card from './Card';
import { parseN8nWorkflow } from '../services/n8nParser';
import { UploadIcon } from './icons/UploadIcon';
import { useTranslation } from '../hooks/useTranslation';
import { XCircleIcon } from './icons/XCircleIcon';
import { CheckCircleIcon } from './icons/CheckCircleIcon';
import { SparklesIcon } from './icons/SparklesIcon';
import { suggestAuditCriteria, generateSamplePayload } from '../services/geminiService';
import { analyzeWorkflowPayload } from '../services/workflowPayloadAnalyzer';
import Loader from './Loader';
import { EyeIcon } from './icons/EyeIcon';
import { BoltIcon } from './icons/BoltIcon';
import AuditHistory from './AuditHistory';
import { ExclamationTriangleIcon } from './icons/ExclamationTriangleIcon';

interface AgentConfigProps {
  onStartAudit: (data: { config: AuditConfig, n8nData: ParsedN8nWorkflow | null }) => void;
  onViewHistory: (item: HistoricalAudit) => void;
  initialConfig?: AuditConfig | null;
}

const AgentConfig: React.FC<AgentConfigProps> = ({ onStartAudit, onViewHistory, initialConfig }) => {
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
  const [rawN8nJson, setRawN8nJson] = useState<string | null>(null); // 🔥 NUEVO
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
  const [enableDatabase, setEnableDatabase] = useState(false);
  const [databaseSchema, setDatabaseSchema] = useState<string>('{\n  "productos": [\n    {"id": "prod_1", "nombre": "Cielorraso PVC", "precio": 4500}\n  ],\n  "clientes": [],\n  "pedidos": []\n}');
  
  // Real Database Config
  const [useRealDatabase, setUseRealDatabase] = useState(false);
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [supabaseKey, setSupabaseKey] = useState('');
  const [availableTables, setAvailableTables] = useState<string[]>([]);
  const [selectedTables, setSelectedTables] = useState<string[]>([]);
  const [isLoadingTables, setIsLoadingTables] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [tableSearchTerm, setTableSearchTerm] = useState('');
  const [testConnectionMessage, setTestConnectionMessage] = useState<string>('');
  const [isTestingConnection, setIsTestingConnection] = useState(false);

  // Pre-llenar campos cuando hay initialConfig (Re-auditar)
  useEffect(() => {
    if (initialConfig) {
      console.log('🔄 Cargando config para Re-auditar:', initialConfig);
      
      // Cargar configuración general
      setAuditType(initialConfig.auditType);
      setCriteria(initialConfig.criteria);
      setTestCaseCount(initialConfig.testCaseCount);
      setWorkflow(initialConfig.workflow || []);
      setConnections(initialConfig.connections || []);
      setEndpointUrl(initialConfig.endpointUrl || '');
      
      // 🔥 NUEVO: Reconstruir parsedN8nData desde rawN8nJson
      if (initialConfig.rawN8nJson) {
        try {
          const parsedWorkflow = parseN8nWorkflow(initialConfig.rawN8nJson);
          setParsedN8nData(parsedWorkflow);
          setRawN8nJson(initialConfig.rawN8nJson);
          console.log('✅ Workflow n8n reconstruido desde JSON guardado');
        } catch (error) {
          console.error('❌ Error reconstruyendo workflow:', error);
        }
      }
      
      // Cargar payload sample
      if (initialConfig.samplePayload) {
        setSamplePayload(initialConfig.samplePayload);
        setRawPayloadText(JSON.stringify(initialConfig.samplePayload, null, 2));
      }
      
      // Cargar config de BD mock
      if (initialConfig.enableDatabaseTracking) {
        setEnableDatabase(true);
        if (initialConfig.databaseSchema) {
          setDatabaseSchema(JSON.stringify(initialConfig.databaseSchema, null, 2));
        }
      }
      
      // Cargar config de BD real (Supabase)
      if (initialConfig.realDatabaseConfig) {
        setUseRealDatabase(true);
        setSupabaseUrl(initialConfig.realDatabaseConfig.url);
        setSupabaseKey(initialConfig.realDatabaseConfig.key);
        setSelectedTables(initialConfig.realDatabaseConfig.tables);
        setAvailableTables(initialConfig.realDatabaseConfig.tables); // Al menos las que estaban seleccionadas
        setConnectionStatus('success'); // Marcar como conectado
      }
    }
  }, [initialConfig]);

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

  const handleConnectToSupabase = async () => {
    if (!supabaseUrl.trim() || !supabaseKey.trim()) {
      setFileError("Por favor ingresa la URL y Key de Supabase");
      return;
    }

    setIsLoadingTables(true);
    setConnectionStatus('idle');
    setFileError(null);

    try {
      const { fetchSupabaseTables } = await import('../services/supabaseTablesFetcher');
      const tables = await fetchSupabaseTables(supabaseUrl.trim(), supabaseKey.trim());
      
      if (tables.length === 0) {
        setFileError("No se encontraron tablas. Verifica que la base de datos tenga tablas o que tengas permisos de lectura.");
        setConnectionStatus('error');
      } else {
        setAvailableTables(tables);
        setConnectionStatus('success');
        setFileError(null);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error al conectar con Supabase";
      setFileError(message);
      setConnectionStatus('error');
      setAvailableTables([]);
    } finally {
      setIsLoadingTables(false);
    }
  };

  // 🔥 NUEVO: Test exhaustivo de conexión y RLS
  const handleTestDatabaseConnection = async () => {
    if (!supabaseUrl.trim() || !supabaseKey.trim()) {
      setTestConnectionMessage("❌ Por favor ingresa URL y Key de Supabase");
      return;
    }
    
    if (selectedTables.length === 0) {
      setTestConnectionMessage("❌ Por favor selecciona al menos una tabla para testear");
      return;
    }

    setIsTestingConnection(true);
    setTestConnectionMessage("🔄 Testeando conexión...");

    try {
      // Importar el cliente de Supabase
      const { createClient } = await import('@supabase/supabase-js');
      const client = createClient(supabaseUrl.trim(), supabaseKey.trim(), {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        }
      });

      let successCount = 0;
      let rlsWarnings = 0;
      const results: string[] = [];

      // Testear cada tabla seleccionada
      for (const table of selectedTables) {
        try {
          const { data, error } = await client
            .from(table)
            .select('*')
            .limit(1);

          if (error) {
            results.push(`❌ ${table}: ${error.message}`);
          } else if (!data || data.length === 0) {
            rlsWarnings++;
            results.push(`⚠️ ${table}: 0 registros (¿RLS activo o tabla vacía?)`);
          } else {
            successCount++;
            results.push(`✅ ${table}: Conectado correctamente (${data.length} registro de prueba)`);
          }
        } catch (err) {
          results.push(`❌ ${table}: ${err instanceof Error ? err.message : 'Error desconocido'}`);
        }
      }

      // Generar mensaje resumen
      let message = `\n📊 RESULTADO DEL TEST:\n\n`;
      message += results.join('\n') + '\n\n';
      
      if (successCount === selectedTables.length) {
        message += `✅ EXCELENTE: Todas las ${successCount} tablas son accesibles.\n`;
        message += `✅ La auditoría de BD funcionará correctamente.`;
      } else if (rlsWarnings > 0 && successCount === 0) {
        message += `🚨 PROBLEMA CRÍTICO: 0 registros en todas las tablas.\n\n`;
        message += `Posibles causas:\n`;
        message += `1. Row Level Security (RLS) está bloqueando las consultas\n`;
        message += `2. Las tablas están vacías\n\n`;
        message += `✅ SOLUCIÓN: Usa la 'service_role' key en vez de 'anon' key\n`;
        message += `📍 La encuentras en: Supabase Dashboard → Settings → API → Project API keys`;
      } else if (rlsWarnings > 0) {
        message += `⚠️ ADVERTENCIA: ${rlsWarnings} tabla(s) devolvieron 0 registros.\n`;
        message += `Esto puede afectar la precisión de la auditoría de BD.\n`;
        message += `Recomendación: Verifica RLS o usa 'service_role' key.`;
      } else {
        message += `⚠️ Algunos problemas detectados.\n`;
        message += `Revisa los errores arriba antes de continuar.`;
      }

      setTestConnectionMessage(message);
      
      // Actualizar estado general de conexión
      if (successCount > 0) {
        setConnectionStatus('success');
      } else {
        setConnectionStatus('error');
      }

    } catch (error) {
      const message = error instanceof Error ? error.message : "Error desconocido";
      setTestConnectionMessage(`❌ ERROR DE CONEXIÓN:\n\n${message}\n\nVerifica que la URL y Key sean correctas.`);
      setConnectionStatus('error');
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handleToggleTable = (table: string) => {
    setSelectedTables(prev => 
      prev.includes(table) 
        ? prev.filter(t => t !== table)
        : [...prev, table]
    );
  };

  const handleSelectAllTables = () => {
    if (selectedTables.length === availableTables.length) {
      setSelectedTables([]);
    } else {
      setSelectedTables([...availableTables]);
    }
  };

  const handleGeneratePayload = async (workflowForGen?: WorkflowNode[], connectionsForGen?: N8nConnection[]) => {
    const wf = workflowForGen || workflow;
    const conns = connectionsForGen || connections;

    if (!wf || wf.length === 0 || !conns) return;

    setIsGeneratingPayload(true);
    setPayloadError(null);
    try {
      // 🔥 ESTRATEGIA 1: Analizar el SEGUNDO NODO del workflow (más rápido y preciso)
      if (parsedN8nData && parsedN8nData.rawNodes && parsedN8nData.rawNodes.length >= 2) {
        console.log('🔍 Intentando extraer payload del segundo nodo del workflow...');
        const payloadSchema = analyzeWorkflowPayload(parsedN8nData.rawNodes);
        
        if (payloadSchema && Object.keys(payloadSchema.examplePayload).length > 0) {
          console.log('✅ Payload extraído del workflow:', payloadSchema.examplePayload);
          setSamplePayload(payloadSchema.examplePayload);
          setRawPayloadText(JSON.stringify(payloadSchema.examplePayload, null, 2));
          setIsGeneratingPayload(false);
          return;
        } else {
          console.warn('⚠️ No se pudo extraer payload del segundo nodo.');
          console.warn('   Razones posibles:');
          console.warn('   - El segundo nodo NO es un nodo "Set" o "Code"');
          console.warn('   - El nodo Set no tiene campos configurados');
          console.warn('   - La estructura del nodo no es la esperada');
          console.warn('   Usando Gemini AI como fallback...');
        }
      } else {
        console.warn('⚠️ No hay suficientes nodos en el workflow (se necesitan al menos 2)');
      }
      
      // 🔥 ESTRATEGIA 2 (FALLBACK): Usar Gemini AI para generar el payload
      console.log('🤖 Generando payload con Gemini AI (puede tardar unos segundos)...');
      const payload = await generateSamplePayload(wf, conns, language);
      setSamplePayload(payload);
      setRawPayloadText(JSON.stringify(payload, null, 2));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not generate payload.";
      setPayloadError(message);
      console.error('❌ Error generando payload:', error);
    } finally {
      setIsGeneratingPayload(false);
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
        
        // 🔥 NUEVO: Guardar el JSON original para re-auditar
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
        fetchAndSetCriteria(newWorkflow, parsedWorkflow.connections);
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
            body: JSON.stringify({})
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
    
    let parsedDatabaseSchema: Record<string, any[]> | undefined = undefined;
    if (enableDatabase) {
      try {
        parsedDatabaseSchema = JSON.parse(databaseSchema);
      } catch (error) {
        setFileError("Invalid database schema JSON. Please check the format.");
        return;
      }
    }
    
    let realDbConfig = undefined;
    if (useRealDatabase) {
      if (!supabaseUrl.trim() || !supabaseKey.trim()) {
        setFileError("Please provide Supabase URL and Key for real database auditing.");
        return;
      }
      if (selectedTables.length === 0) {
        setFileError("Please select at least one table to monitor.");
        return;
      }
      
      realDbConfig = {
        type: 'supabase' as const,
        url: supabaseUrl.trim(),
        key: supabaseKey.trim(),
        tables: selectedTables
      };
    }
    
    if (isWorkflowValid && criteria.length > 0) {
      const config: AuditConfig = { 
          workflow, 
          connections, 
          criteria, 
          testCaseCount, 
          samplePayload, 
          auditType,
          endpointUrl: auditType === 'real' ? endpointUrl : undefined,
          enableDatabaseTracking: enableDatabase,
          databaseSchema: parsedDatabaseSchema,
          realDatabaseConfig: realDbConfig,
          rawN8nJson: rawN8nJson || undefined // 🔥 NUEVO: Guardar JSON original
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
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <Card>
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
            <Card>
                <h2 className="text-xl font-semibold text-gray-800 dark:text-white mb-2">{t('samplePayloadTitle')}</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{t('samplePayloadDescription')}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                        <label htmlFor="payload-upload" className="w-full text-center cursor-pointer bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-bold py-3 px-4 rounded-lg transition">
                            <span>{samplePayload ? t('uploadPayloadSuccess') : t('uploadPayload')}</span>
                            <input id="payload-upload" type="file" className="sr-only" accept=".json" onChange={handlePayloadFileChange} />
                        </label>
                        <button type="button" onClick={() => handleGeneratePayload()} disabled={isGeneratingPayload} className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-yellow-400/20 text-yellow-700 dark:text-yellow-300 rounded-lg hover:bg-yellow-400/40 disabled:opacity-50 disabled:cursor-not-allowed">
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
            <Card>
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
                        disabled={testStatus === 'testing' || !endpointUrl}
                        className="px-4 py-2 bg-primary-600 text-white font-semibold rounded-lg shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                        {testStatus === 'testing' ? t('testingEndpoint') : t('testEndpointButton')}
                    </button>
                </div>
                <div className="mt-3 min-h-[24px]">
                    {renderTestStatus()}
                </div>
                <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/40 border-l-4 border-yellow-400 dark:border-yellow-600 rounded-r-lg flex items-start gap-3">
                    <ExclamationTriangleIcon className="w-5 h-5 text-yellow-600 dark:text-yellow-300 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-yellow-800 dark:text-yellow-200">{t('corsWarning')}</p>
                </div>
            </Card>
          )}

        </div>
        <div className="lg:col-span-1">
          <AuditHistory onViewReport={onViewHistory} />
        </div>
      </div>
    
      <Card className="mt-8">
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
              max="100"
              step="1"
              value={testCaseCount}
              onChange={(e) => setTestCaseCount(parseInt(e.target.value, 10))}
              className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer"
            />
          </div>

          <div className="p-4 bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 border border-purple-200 dark:border-purple-700 rounded-lg">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <input 
                  type="checkbox" 
                  id="enable-database" 
                  checked={enableDatabase}
                  onChange={(e) => setEnableDatabase(e.target.checked)}
                  className="w-5 h-5 text-purple-600 bg-gray-100 border-gray-300 rounded focus:ring-purple-500 dark:focus:ring-purple-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                />
                <label htmlFor="enable-database" className="text-lg font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
                  🗄️ Habilitar Auditoría de Base de Datos (Mock)
                </label>
              </div>
            </div>
            
            {enableDatabase && (
              <div className="mt-3 space-y-2">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Define el esquema inicial de la base de datos. El sistema verificará que el agente consulte y manipule correctamente esta información.
                </p>
                <textarea
                  value={databaseSchema}
                  onChange={(e) => setDatabaseSchema(e.target.value)}
                  className="w-full p-3 bg-white dark:bg-gray-800 border border-purple-300 dark:border-purple-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 font-mono text-sm"
                  rows={8}
                  placeholder='{\n  "productos": [...],\n  "clientes": [...]\n}'
                />
              </div>
            )}
          </div>

          <div className="p-4 bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 border border-blue-200 dark:border-blue-700 rounded-lg">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <input 
                  type="checkbox" 
                  id="use-real-database" 
                  checked={useRealDatabase}
                  onChange={(e) => setUseRealDatabase(e.target.checked)}
                  className="w-5 h-5 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                />
                <label htmlFor="use-real-database" className="text-lg font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
                  🔗 Conectar a Base de Datos Real (Supabase)
                </label>
              </div>
            </div>
            
            <p className="text-xs text-blue-700 dark:text-blue-300 mb-3 bg-blue-100 dark:bg-blue-900/30 p-2 rounded">
              ⚠️ <strong>Importante:</strong> Esto verificará que el bot realmente haga lo que dice (ej: que sí creó la cita, que no bloqueó al usuario, etc.)
            </p>
            
            {useRealDatabase && (
              <div className="mt-3 space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Supabase URL
                  </label>
                  <input
                    type="url"
                    value={supabaseUrl}
                    onChange={(e) => {
                      setSupabaseUrl(e.target.value);
                      setConnectionStatus('idle');
                      setAvailableTables([]);
                      setSelectedTables([]);
                    }}
                    placeholder="https://tu-proyecto.supabase.co"
                    className="w-full p-2 bg-white dark:bg-gray-800 border border-blue-300 dark:border-blue-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Supabase Key
                  </label>
                  <input
                    type="password"
                    value={supabaseKey}
                    onChange={(e) => {
                      setSupabaseKey(e.target.value);
                      setConnectionStatus('idle');
                      setAvailableTables([]);
                      setSelectedTables([]);
                    }}
                    placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                    className="w-full p-2 bg-white dark:bg-gray-800 border border-blue-300 dark:border-blue-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-mono"
                  />
                  {/* 🚨 Advertencia sobre RLS */}
                  <div className="mt-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700 rounded-lg">
                    <div className="flex items-start gap-2">
                      <span className="text-yellow-600 dark:text-yellow-400 text-lg flex-shrink-0">⚠️</span>
                      <div className="text-xs text-yellow-800 dark:text-yellow-200">
                        <p className="font-semibold mb-1">Si tienes Row Level Security (RLS) activo:</p>
                        <ul className="list-disc list-inside space-y-1 ml-2">
                          <li>Usa la <span className="font-mono bg-yellow-100 dark:bg-yellow-900/40 px-1 py-0.5 rounded">service_role</span> key para auditar correctamente</li>
                          <li>Con <span className="font-mono bg-yellow-100 dark:bg-yellow-900/40 px-1 py-0.5 rounded">anon</span> key, RLS bloqueará las consultas y verás 0 registros</li>
                          <li>⚠️ La service_role key bypasea RLS - úsala solo en ambientes seguros</li>
                        </ul>
                        <p className="mt-2 text-yellow-700 dark:text-yellow-300">
                          📍 Encuentras la service_role key en: <span className="font-mono text-xs">Settings → API → Project API keys</span>
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
                
                <button
                  type="button"
                  onClick={handleConnectToSupabase}
                  disabled={isLoadingTables || !supabaseUrl.trim() || !supabaseKey.trim()}
                  className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium transition"
                >
                  {isLoadingTables ? (
                    <>
                      <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Conectando...
                    </>
                  ) : connectionStatus === 'success' ? (
                    <>
                      ✓ Reconectar a Supabase
                    </>
                  ) : (
                    '🔗 Conectar a Supabase'
                  )}
                </button>

                {/* 🔥 NUEVO: Botón de test de conexión */}
                {connectionStatus === 'success' && selectedTables.length > 0 && (
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={handleTestDatabaseConnection}
                      disabled={isTestingConnection}
                      className="w-full py-2 px-4 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium transition"
                    >
                      {isTestingConnection ? (
                        <>
                          <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Testeando...
                        </>
                      ) : (
                        <>
                          🧪 Testear Conexión y RLS
                        </>
                      )}
                    </button>

                    {testConnectionMessage && (
                      <div className="p-3 bg-gray-900 text-gray-100 text-xs font-mono rounded-lg whitespace-pre-wrap border border-gray-700 max-h-60 overflow-y-auto">
                        {testConnectionMessage}
                      </div>
                    )}
                  </div>
                )}

                {connectionStatus === 'success' && availableTables.length > 0 && (
                  <div className="p-3 bg-white dark:bg-gray-800 border border-blue-300 dark:border-blue-600 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Selecciona las tablas a monitorear ({selectedTables.length}/{availableTables.length})
                      </label>
                      <button
                        type="button"
                        onClick={handleSelectAllTables}
                        className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                      >
                        {selectedTables.length === availableTables.length ? 'Deseleccionar todas' : 'Seleccionar todas'}
                      </button>
                    </div>
                    
                    {/* Buscador de tablas */}
                    <div className="mb-2">
                      <input
                        type="text"
                        value={tableSearchTerm}
                        onChange={(e) => setTableSearchTerm(e.target.value)}
                        placeholder="🔍 Buscar tabla..."
                        className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                      />
                      {tableSearchTerm && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {availableTables.filter(t => t.toLowerCase().includes(tableSearchTerm.toLowerCase())).length} tabla(s) encontrada(s)
                        </p>
                      )}
                    </div>
                    
                    <div className="max-h-60 overflow-y-auto space-y-1">
                      {availableTables
                        .filter(table => 
                          table.toLowerCase().includes(tableSearchTerm.toLowerCase())
                        )
                        .map(table => (
                        <label
                          key={table}
                          className="flex items-center gap-2 p-2 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded cursor-pointer transition"
                        >
                          <input
                            type="checkbox"
                            checked={selectedTables.includes(table)}
                            onChange={() => handleToggleTable(table)}
                            className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                          />
                          <span className="text-sm text-gray-700 dark:text-gray-300 font-mono">{table}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
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
