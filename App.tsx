import React, { useState, useCallback, useEffect } from 'react';
import { AuditStatus, type AuditConfig, type AuditResult, type ImprovementData, type ParsedN8nWorkflow, type TestCase, type ExecutionStep, HistoricalAudit, type ParsedCodeProject } from './types';
import ProjectTypeSelector from './components/ProjectTypeSelector';
import AuditReport from './components/AuditReport';
import ProfessionalAuditReport from './components/ProfessionalAuditReport';
import { generateTestCases, runFullAudit } from './services/geminiService';
import { ShieldCheckIcon } from './components/icons/ShieldCheckIcon';
import ImprovementReport from './components/ImprovementReport';
import { useTranslation } from './hooks/useTranslation';
import LanguageSwitcher from './components/LanguageSwitcher';
import ExecutionCanvas from './components/ExecutionCanvas';
import Card from './components/Card';
import AuditProgress from './components/AuditProgress';
import * as historyService from './services/historyService';
import LiveAuditView from './components/LiveAuditView';
import CredentialsPanel from './components/CredentialsPanel';

const App: React.FC = () => {
  const [auditStatus, setAuditStatus] = useState<AuditStatus>(AuditStatus.CONFIG);
  const [auditConfig, setAuditConfig] = useState<AuditConfig | null>(null);
  const [auditResults, setAuditResults] = useState<AuditResult[]>([]);
  const [improvementData, setImprovementData] = useState<ImprovementData | null>(null);
  const [n8nNodeData, setN8nNodeData] = useState<ParsedN8nWorkflow | null>(null);
  const [progressMessage, setProgressMessage] = useState('');
  const [currentTrace, setCurrentTrace] = useState<AuditResult | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const { t, language } = useTranslation();

  // New state for live audit view
  const [liveAuditData, setLiveAuditData] = useState<AuditResult[]>([]);
  const [liveLogs, setLiveLogs] = useState<string[]>([]);
  const [isViewingHistory, setIsViewingHistory] = useState(false);
  
  // 🛑 AbortController para cancelar auditorías
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  
  // 🔐 State para panel de credenciales
  const [showCredentialsPanel, setShowCredentialsPanel] = useState(false);

  useEffect(() => {
    // Save the audit automatically when it's finished and not a history view
    if (auditStatus === AuditStatus.REPORT_READY && auditConfig && auditResults.length > 0 && !isViewingHistory) {
      historyService.saveAudit(auditConfig, auditResults);
    }
  }, [auditStatus, auditConfig, auditResults, isViewingHistory]);

  const handleProgressUpdate = useCallback((update: { message: string, trace?: AuditResult, testCaseId?: string, step?: ExecutionStep }) => {
    setProgressMessage(update.message);
    setLiveLogs(prev => [...prev, update.message]);
    
    if(update.trace) { // For visual audit
      setCurrentTrace(update.trace);
    }
    
    if(update.testCaseId && update.step) { // For real audit
      setLiveAuditData(prevData => {
        const newData = [...prevData];
        const caseIndex = newData.findIndex(item => item.id === update.testCaseId);
        if (caseIndex !== -1) {
            const existingTrace = newData[caseIndex].executionTrace;
            // Check if we need to replace a pending step (RUNNING status with same nodeId)
            const pendingIndex = existingTrace.findIndex(
              step => step.nodeId === update.step!.nodeId && step.status === 'RUNNING'
            );
            
            let newTrace;
            if (pendingIndex !== -1 && update.step.status !== 'RUNNING') {
              // Replace the pending step with the completed one
              newTrace = [...existingTrace];
              newTrace[pendingIndex] = update.step;
            } else {
              // Add new step
              newTrace = [...existingTrace, update.step];
            }
            
            newData[caseIndex] = { ...newData[caseIndex], executionTrace: newTrace };
        }
        return newData;
      });
    }
  }, []);

  const handleResultComplete = useCallback((result: AuditResult) => {
    console.log(`📊 [App.tsx] handleResultComplete llamado para: "${result.testCase.title}"`);
    setAuditResults(prevResults => {
      const newResults = [...prevResults, result];
      console.log(`📊 [App.tsx] Total resultados ahora: ${newResults.length}`);
      return newResults;
    });
  }, []);

  const handleAllComplete = useCallback(() => {
    console.log('🏁🏁🏁 [App.tsx] handleAllComplete LLAMADO - Cambiando estado a REPORT_READY');
    setAuditStatus(AuditStatus.REPORT_READY);
    console.log('✅ [App.tsx] Estado cambiado a REPORT_READY');
  }, []);

  const handleStartAudit = useCallback(async (data: { config: AuditConfig, n8nData: ParsedN8nWorkflow | null, codeProject?: ParsedCodeProject }) => {
    setAuditStatus(AuditStatus.AUDITING);
    setAuditConfig(data.config);
    setN8nNodeData(data.n8nData);
    setAuditResults([]);
    setErrorMessage('');
    setImprovementData(null);
    setCurrentTrace(null);
    setLiveLogs([]);

    try {
      handleProgressUpdate({ message: `🎭 Generando ${data.config.testCaseCount} personalidades de prueba...` });
      
      // 🔥 NUEVO: Acumular test cases generados
      const allTestCases: TestCase[] = [];
      let totalGenerated = 0;
      
      // 🚀 Callback para mostrar cada lote a medida que se genera
      const onBatchGenerated = (batch: TestCase[]) => {
        allTestCases.push(...batch);
        totalGenerated += batch.length;
        
        handleProgressUpdate({ message: `   ✅ ${totalGenerated}/${data.config.testCaseCount} personalidades generadas...` });
        
        // Mostrar las personalidades del lote
        batch.forEach((tc, idx) => {
          const personaText = typeof tc.persona === 'string' ? tc.persona : JSON.stringify(tc.persona);
          const shortPersona = personaText.length > 60 ? personaText.substring(0, 60) + '...' : personaText;
          handleProgressUpdate({ message: `      👤 "${tc.title}" - ${shortPersona}` });
        });
        
        // 🔥 NUEVO: Inicializar en UI inmediatamente para auditoría real
        if (data.config.auditType === 'real') {
          const batchResults: AuditResult[] = batch.map(tc => ({
            id: tc.id,
            testCase: tc,
            executionTrace: [],
            analysis: { overallScore: 0, summary: t('auditInProgress'), criteriaBreakdown: [] },
            finalStatus: 'SUCCESS', // Temporary
          }));
          setLiveAuditData(prev => [...prev, ...batchResults]);
        }
      };
      
      const testCases = await generateTestCases(data.config, language, onBatchGenerated);
      
      handleProgressUpdate({ message: `🎉 ${testCases.length} personalidades listas! Iniciando auditoría...` });

      // 🛑 Crear nuevo AbortController para esta auditoría
      const controller = new AbortController();
      setAbortController(controller);

      await runFullAudit(
        data.config,
        testCases,
        handleProgressUpdate,
        handleResultComplete,
        handleAllComplete,
        language,
        controller // 🛑 Pasar el controller
      );
      
      // 🧹 Limpiar controller cuando termine
      setAbortController(null);
      
    } catch (error) {
      console.error("Audit failed:", error);
      
      // 🛑 Verificar si fue cancelación intencional
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('✅ Auditoría cancelada correctamente');
        setErrorMessage(t('auditCancelled') || 'Auditoría cancelada por el usuario');
      } else {
        const message = error instanceof Error ? error.message : 'An unknown error occurred.';
        const fullMessage = `${t('errorTitle')}: ${message}`;
        setErrorMessage(fullMessage);
      }
      
      setAuditStatus(AuditStatus.ERROR);
      setAbortController(null); // Limpiar controller en caso de error
    }
  }, [language, t, handleProgressUpdate, handleResultComplete, handleAllComplete]);

  
  const handleReset = () => {
    // 🛑 Cancelar auditoría en progreso si existe
    if (abortController) {
      console.log('🛑 Cancelando auditoría en progreso...');
      abortController.abort();
      setAbortController(null);
    }
    
    setAuditStatus(AuditStatus.CONFIG);
    setAuditConfig(null);
    setAuditResults([]);
    setImprovementData(null);
    setN8nNodeData(null);
    setProgressMessage('');
    setCurrentTrace(null);
    setErrorMessage('');
    setLiveAuditData([]);
    setLiveLogs([]);
    setIsViewingHistory(false);
  };

  const handleReaudit = (config: AuditConfig) => {
    console.log('🔄 Re-auditar clicked with config:', config);
    // Guardar la configuración actual
    setAuditConfig(config);
    // Limpiar resultados previos
    setAuditResults([]);
    setLiveAuditData([]);
    setLiveLogs([]);
    setProgressMessage('');
    setErrorMessage('');
    // Volver a estado de configuración (para poder ver/editar antes de re-ejecutar)
    setAuditStatus(AuditStatus.CONFIG);
    setIsViewingHistory(false);
  };

  const handleRepeatAudit = useCallback(async (config: AuditConfig) => {
    console.log('🔁 Repetir auditoría con configuración exacta:', config);
    
    // Extraer testCases de los resultados anteriores
    const previousTestCases = auditResults.map(r => r.testCase);
    console.log(`🔁 Reutilizando ${previousTestCases.length} casos de prueba anteriores`);
    
    // Limpiar resultados previos
    setAuditResults([]);
    setLiveAuditData([]);
    setLiveLogs([]);
    setProgressMessage('');
    setErrorMessage('');
    setCurrentTrace(null);
    setIsViewingHistory(false);
    
    // Guardar config y cambiar a estado AUDITING
    setAuditConfig(config);
    setAuditStatus(AuditStatus.AUDITING);
    
    // Crear nuevo AbortController
    const newAbortController = new AbortController();
    setAbortController(newAbortController);
    
    try {
      console.log('🚀 Iniciando auditoría repetida...');
      handleProgressUpdate({ message: `🔁 Repitiendo auditoría con ${previousTestCases.length} casos anteriores...` });
      
      // Inicializar UI para auditoría real
      if (config.auditType === 'real') {
        const initialResults: AuditResult[] = previousTestCases.map(tc => ({
          id: tc.id,
          testCase: tc,
          executionTrace: [],
          analysis: {} as any,
          finalStatus: 'SUCCESS' as const,
          startTime: Date.now()
        }));
        setLiveAuditData(initialResults);
      }
      
      // Ejecutar auditoría completa con mismos test cases
      await runFullAudit(
        config,
        previousTestCases,
        handleProgressUpdate,
        handleResultComplete,
        handleAllComplete,
        language,
        newAbortController
      );
      
      console.log('✅ Auditoría repetida completada');
    } catch (error: any) {
      console.error('❌ Error en auditoría repetida:', error);
      if (error.name === 'AbortError') {
        console.log('🛑 Auditoría repetida cancelada por el usuario');
        setErrorMessage(t('auditCancelled') || 'Auditoría cancelada');
      } else {
        setErrorMessage(error.message || 'Error desconocido');
      }
      setAuditStatus(AuditStatus.ERROR);
    } finally {
      setAbortController(null);
    }
  }, [auditResults, handleProgressUpdate, handleResultComplete, handleAllComplete, language, t]);

  const handleViewHistory = (item: HistoricalAudit) => {
    setAuditConfig(item.config);
    setAuditResults(item.results);
    setAuditStatus(AuditStatus.REPORT_READY);
    setIsViewingHistory(true);
  };

  const renderContent = () => {
    switch (auditStatus) {
      case AuditStatus.AUDITING:
        if (!auditConfig) return null;
        if (auditConfig.auditType === 'visual' && n8nNodeData) {
            return <ExecutionCanvas
                key={currentTrace?.id || 'initial'}
                n8nWorkflow={n8nNodeData}
                currentTrace={currentTrace}
                message={progressMessage}
                totalCases={auditConfig.testCaseCount}
                completedCases={auditResults.length}
                onReset={handleReset}
            />;
        }
        if (auditConfig.auditType === 'real') {
          return <LiveAuditView 
              results={liveAuditData} 
              logs={liveLogs} 
              onCancel={handleReset} 
              totalCases={auditConfig.testCaseCount}
              completedCases={auditResults.length}
              config={auditConfig}
          />
        }
        // Fallback for visual audit without n8n data
        return <AuditProgress 
            message={progressMessage}
            totalCases={auditConfig.testCaseCount}
            completedCases={auditResults.length}
            onCancel={handleReset}
        />;
      case AuditStatus.REPORT_READY:
        if (!auditConfig) return null; // Should not happen
        return <ProfessionalAuditReport results={auditResults} config={auditConfig} onReset={handleReset} />;
      case AuditStatus.IMPROVEMENT_REPORT_READY:
        if (!improvementData || !auditResults.length || !auditConfig) {
            return (
              <Card className="text-center">
                <p className="text-red-500 text-lg mb-4">{t('errorTitle')}</p>
                <button onClick={handleReset} className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors">{t('errorAction')}</button>
              </Card>
            );
        }
        return <ImprovementReport 
                  originalResults={auditResults} 
                  improvementData={improvementData} 
                  onReset={handleReset} 
                  originalWorkflow={auditConfig.workflow}
                  n8nData={n8nNodeData?.nodes || null}
               />;
      case AuditStatus.ERROR:
         return (
          <Card className="text-center">
            <p className="text-red-500 text-lg mb-4">{errorMessage}</p>
            <button
              onClick={handleReset}
              className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
            >
              {t('errorAction')}
            </button>
          </Card>
        );
      case AuditStatus.CONFIG:
      default:
        return <ProjectTypeSelector onStartAudit={handleStartAudit} onViewHistory={handleViewHistory} onManageCredentials={() => setShowCredentialsPanel(true)} initialConfig={auditConfig} />;
    }
  };
  
  if (auditStatus === AuditStatus.AUDITING && auditConfig?.auditType !== 'real') {
      return (
        <div className="w-screen h-screen bg-gray-100 dark:bg-gray-900 overflow-hidden">
            {renderContent()}
        </div>
      )
  }
  
  if (auditStatus === AuditStatus.AUDITING && auditConfig?.auditType === 'real') {
    return renderContent();
  }
  
  // 🔐 Panel de credenciales
  if (showCredentialsPanel) {
    return <CredentialsPanel onClose={() => setShowCredentialsPanel(false)} />;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <header className="mb-10">
          <div className="flex justify-between items-start">
            <div className="flex-1 text-center">
              <div className="flex items-center justify-center gap-4">
                <ShieldCheckIcon className="w-12 h-12 text-primary-500" />
                <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-gray-800 dark:text-white">
                  {t('appTitle')}
                </h1>
              </div>
              <p className="mt-4 text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
                {t('appDescription')}
              </p>
            </div>
            <LanguageSwitcher />
          </div>
        </header>
        <main>
          {renderContent()}
        </main>
         <footer className="text-center mt-12 text-sm text-gray-500">
            <p>{t('footerText', { year: new Date().getFullYear() })}</p>
        </footer>
      </div>
    </div>
  );
};

export default App;