import React, { useState, useCallback, useEffect } from 'react';
import { AuditStatus, type AuditConfig, type AuditResult, type ImprovementData, type ParsedN8nNode, type WorkflowNode } from './types';
import AgentConfig from './components/AgentConfig';
import AuditProgress from './components/AuditProgress';
import AuditReport from './components/AuditReport';
import { runFullAudit, runImprovementCycle } from './services/geminiService';
import { ShieldCheckIcon } from './components/icons/ShieldCheckIcon';
import ImprovementReport from './components/ImprovementReport';
import { useTranslation } from './hooks/useTranslation';
import LanguageSwitcher from './components/LanguageSwitcher';

const App: React.FC = () => {
  const [auditStatus, setAuditStatus] = useState<AuditStatus>(AuditStatus.CONFIG);
  const [auditConfig, setAuditConfig] = useState<AuditConfig | null>(null);
  const [auditResults, setAuditResults] = useState<AuditResult[]>([]);
  const [originalAuditResults, setOriginalAuditResults] = useState<AuditResult[]>([]);
  const [improvementData, setImprovementData] = useState<ImprovementData | null>(null);
  const [n8nNodeData, setN8nNodeData] = useState<ParsedN8nNode[] | null>(null);
  const [progressMessage, setProgressMessage] = useState('');
  const [progressLogs, setProgressLogs] = useState<string[]>([]);
  const [progress, setProgress] = useState<{ current: number, total: number }>({ current: 0, total: 0 });
  const [errorMessage, setErrorMessage] = useState('');
  const { t, language } = useTranslation();

  const handleProgressUpdate = (update: { message: string, current?: number, total?: number }) => {
    setProgressMessage(update.message);
    setProgressLogs(prev => [...prev, update.message]);
    setProgress(prev => ({
        current: update.current ?? prev.current,
        total: update.total ?? prev.total,
    }));
  };

  const handleStartAudit = useCallback(async (data: { config: AuditConfig, n8nData: ParsedN8nNode[] | null }) => {
    setAuditStatus(AuditStatus.AUDITING);
    setAuditConfig(data.config);
    setN8nNodeData(data.n8nData);
    setErrorMessage('');
    setImprovementData(null);
    setProgress({ current: 0, total: data.config.testCaseCount });
    setProgressLogs([]);

    try {
      await runFullAudit(data.config, handleProgressUpdate, (results) => {
        setAuditResults(results);
        setOriginalAuditResults(results);
        setAuditStatus(AuditStatus.REPORT_READY);
      }, language);
    } catch (error) {
      console.error("Audit failed:", error);
      const message = error instanceof Error ? error.message : 'An unknown error occurred.';
      const fullMessage = `${t('errorTitle')}: ${message}`;
      setErrorMessage(fullMessage);
      setProgressLogs(prev => [...prev, `[ERROR] ${message}`]);
      setAuditStatus(AuditStatus.ERROR);
    }
  }, [language, t]);

  const handleStartImprovement = useCallback(async () => {
    if (!auditConfig || !originalAuditResults.length || auditStatus === AuditStatus.IMPROVING) return;
    
    setAuditStatus(AuditStatus.IMPROVING);
    setErrorMessage('');
    setProgress({ current: 0, total: originalAuditResults.length });
    setProgressLogs([]);

    try {
      await runImprovementCycle(auditConfig, originalAuditResults, handleProgressUpdate, (data) => {
        setImprovementData(data);
        setAuditResults(data.newResults); // Update results to show the new ones
        setAuditStatus(AuditStatus.IMPROVEMENT_REPORT_READY);
      }, language);
    } catch (error) {
       console.error("Improvement cycle failed:", error);
      const message = error instanceof Error ? error.message : 'An unknown error occurred.';
      const fullMessage = `${t('errorTitle')}: ${message}`;
      setErrorMessage(fullMessage);
      setProgressLogs(prev => [...prev, `[ERROR] ${message}`]);
      setAuditStatus(AuditStatus.ERROR);
    }
  }, [auditConfig, originalAuditResults, language, t, auditStatus]);

  useEffect(() => {
    if (auditStatus === AuditStatus.REPORT_READY) {
      const timer = setTimeout(() => {
        handleStartImprovement();
      }, 5000); // 5-second delay to allow user to see the report first

      return () => clearTimeout(timer);
    }
  }, [auditStatus, handleStartImprovement]);
  
  const handleReset = () => {
    setAuditStatus(AuditStatus.CONFIG);
    setAuditConfig(null);
    setAuditResults([]);
    setOriginalAuditResults([]);
    setImprovementData(null);
    setN8nNodeData(null);
    setProgressMessage('');
    setProgressLogs([]);
    setProgress({ current: 0, total: 0 });
    setErrorMessage('');
  };

  const renderContent = () => {
    switch (auditStatus) {
      case AuditStatus.AUDITING:
        return <AuditProgress message={progressMessage} title={t('auditInProgress')} progress={progress} logs={progressLogs} />;
      case AuditStatus.IMPROVING:
        return <AuditProgress message={progressMessage} title={t('improvementInProgress')} progress={progress} logs={progressLogs} />;
      case AuditStatus.REPORT_READY:
        if (!auditConfig) return null; // Should not happen
        return <AuditReport results={auditResults} onReset={handleReset} config={auditConfig} />;
      case AuditStatus.IMPROVEMENT_REPORT_READY:
        if (!improvementData || !originalAuditResults.length || !auditConfig) {
            return (
              <div className="text-center">
                <p className="text-red-500 text-lg mb-4">{t('errorTitle')}</p>
                <button onClick={handleReset} className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors">{t('errorAction')}</button>
              </div>
            );
        }
        return <ImprovementReport 
                  originalResults={originalAuditResults} 
                  improvementData={improvementData} 
                  onReset={handleReset} 
                  originalWorkflow={auditConfig.workflow}
                  n8nData={n8nNodeData}
               />;
      case AuditStatus.ERROR:
         return (
          <div className="text-center">
            <p className="text-red-500 text-lg mb-4">{errorMessage}</p>
            <button
              onClick={handleReset}
              className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
            >
              {t('errorAction')}
            </button>
          </div>
        );
      case AuditStatus.CONFIG:
      default:
        return <AgentConfig onStartAudit={handleStartAudit} />;
    }
  };

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
