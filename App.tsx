import React, { useState, useCallback } from 'react';
import { AuditStatus, type AuditConfig, type AuditResult, type ImprovementData, type ParsedN8nWorkflow } from './types';
import AgentConfig from './components/AgentConfig';
import AuditReport from './components/AuditReport';
import { runFullAudit } from './services/geminiService';
import { ShieldCheckIcon } from './components/icons/ShieldCheckIcon';
import ImprovementReport from './components/ImprovementReport';
import { useTranslation } from './hooks/useTranslation';
import LanguageSwitcher from './components/LanguageSwitcher';
import ExecutionCanvas from './components/ExecutionCanvas';
import CallCenterConsole from './components/CallCenterConsole';
import Card from './components/Card';
import AuditProgress from './components/AuditProgress';

const App: React.FC = () => {
  const [auditStatus, setAuditStatus] = useState<AuditStatus>(AuditStatus.CONFIG);
  const [auditConfig, setAuditConfig] = useState<AuditConfig | null>(null);
  const [auditResults, setAuditResults] = useState<AuditResult[]>([]);
  const [improvementData, setImprovementData] = useState<ImprovementData | null>(null);
  const [n8nNodeData, setN8nNodeData] = useState<ParsedN8nWorkflow | null>(null);
  const [progressMessage, setProgressMessage] = useState('');
  const [currentTrace, setCurrentTrace] = useState<AuditResult | null>(null);
  const [agents, setAgents] = useState<any[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const { t, language } = useTranslation();

  const handleProgressUpdate = useCallback((update: { message: string, trace?: AuditResult, agents?: any[] }) => {
    setProgressMessage(update.message);
    if(update.trace) {
      setCurrentTrace(update.trace);
    }
    if(update.agents) {
      setAgents(update.agents);
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
    setAgents([]);

    try {
      await runFullAudit(
        data.config,
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
    setAgents([]);
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

        // For 'real' audit type - use CallCenterConsole if we have agents info
        if (auditConfig.auditType === 'real' && agents.length > 0) {
            return <CallCenterConsole
                agents={agents}
                message={progressMessage}
                totalCases={auditConfig.testCaseCount}
                completedCases={auditResults.length}
                onReset={handleReset}
            />;
        }

        // Fallback for 'real' audit type without agents info yet
        return <AuditProgress
            message={progressMessage}
            totalCases={auditConfig.testCaseCount}
            completedCases={auditResults.length}
            onCancel={handleReset}
        />;
      case AuditStatus.REPORT_READY:
        if (!auditConfig) return null; // Should not happen
        return <AuditReport results={auditResults} onReset={handleReset} config={auditConfig} />;
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
        return <AgentConfig onStartAudit={handleStartAudit} />;
    }
  };
  
  if (auditStatus === AuditStatus.AUDITING) {
      return (
        <div className="w-screen h-screen bg-gray-100 dark:bg-gray-900 overflow-hidden">
            {renderContent()}
        </div>
      )
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