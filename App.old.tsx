import React, { useState, useCallback, useEffect } from 'react';
import { AuditStatus, type AuditConfig, type AuditResult, type ImprovementData, type ParsedN8nWorkflow, type TestCase, type ExecutionStep, HistoricalAudit } from './types';
import AgentConfig from './components/AgentConfig';
import AuditReport from './components/AuditReport';
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
    setAuditResults(prevResults => [...prevResults, result]);
  }, []);

  const handleAllComplete = useCallback(() => {
    setAuditStatus(AuditStatus.REPORT_READY);
  }, []);

  const handleStartAudit = useCallback(async (data: { config: AuditConfig, n8nData: ParsedN8nWorkflow | null }) => {
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
      const testCases = await generateTestCases(data.config, language);
      
      handleProgressUpdate({ message: `✅ ${testCases.length} personalidades creadas exitosamente` });
      testCases.forEach((tc, idx) => {
        const personaText = typeof tc.persona === 'string' ? tc.persona : JSON.stringify(tc.persona);
        const shortPersona = personaText.length > 60 ? personaText.substring(0, 60) + '...' : personaText;
        handleProgressUpdate({ message: `  👤 ${idx + 1}. "${tc.title}" - ${shortPersona}` });
      });

      if (data.config.auditType === 'real') {
         const initialLiveResults: AuditResult[] = testCases.map(tc => ({
            id: tc.id,
            testCase: tc,
            executionTrace: [],
            analysis: { overallScore: 0, summary: t('auditInProgress'), criteriaBreakdown: [] },
            finalStatus: 'SUCCESS', // Temporary
         }));
         setLiveAuditData(initialLiveResults);
      }

      await runFullAudit(
        data.config,
        testCases,
        handleProgressUpdate,
        handleResultComplete,
        handleAllComplete,
        language
      );
    } catch (error) {
      console.error("Audit failed:", error);
      const message = error instanceof Error ? error.message : 'An unknown error occurred.';
      const fullMessage = `${t('errorTitle')}: ${message}`;
      setErrorMessage(fullMessage);
      setAuditStatus(AuditStatus.ERROR);
    }
  }, [language, t, handleProgressUpdate, handleResultComplete, handleAllComplete]);

  
  const handleReset = () => {
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
        return <AuditReport results={auditResults} onReset={handleReset} config={auditConfig} isHistoryView={isViewingHistory} />;
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
        return <AgentConfig onStartAudit={handleStartAudit} onViewHistory={handleViewHistory} />;
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