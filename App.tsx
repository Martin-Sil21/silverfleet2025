
import React, { useState, useCallback } from 'react';
import { AuditStatus, type AuditConfig, type AuditResult, type ImprovementData } from './types';
import AgentConfig from './components/AgentConfig';
import AuditProgress from './components/AuditProgress';
import AuditReport from './components/AuditReport';
import { runFullAudit, runImprovementCycle } from './services/geminiService';
import { ShieldCheckIcon } from './components/icons/ShieldCheckIcon';
import ImprovementReport from './components/ImprovementReport';

const App: React.FC = () => {
  const [auditStatus, setAuditStatus] = useState<AuditStatus>(AuditStatus.CONFIG);
  const [auditConfig, setAuditConfig] = useState<AuditConfig | null>(null);
  const [auditResults, setAuditResults] = useState<AuditResult[]>([]);
  const [originalAuditResults, setOriginalAuditResults] = useState<AuditResult[]>([]);
  const [improvementData, setImprovementData] = useState<ImprovementData | null>(null);
  const [progressMessage, setProgressMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const handleStartAudit = useCallback(async (config: AuditConfig) => {
    setAuditStatus(AuditStatus.AUDITING);
    setAuditConfig(config);
    setErrorMessage('');
    setImprovementData(null);
    try {
      await runFullAudit(config, setProgressMessage, (results) => {
        setAuditResults(results);
        setOriginalAuditResults(results);
        setAuditStatus(AuditStatus.REPORT_READY);
      });
    } catch (error) {
      console.error("Audit failed:", error);
      const message = error instanceof Error ? error.message : 'An unknown error occurred.';
      setErrorMessage(`Audit process failed: ${message}`);
      setAuditStatus(AuditStatus.ERROR);
    }
  }, []);

  const handleStartImprovement = useCallback(async () => {
    if (!auditConfig || !originalAuditResults.length) return;
    
    setAuditStatus(AuditStatus.IMPROVING);
    setErrorMessage('');
    try {
      await runImprovementCycle(auditConfig, originalAuditResults, setProgressMessage, (data) => {
        setImprovementData(data);
        setAuditResults(data.newResults); // Update results to show the new ones
        setAuditStatus(AuditStatus.IMPROVEMENT_REPORT_READY);
      });
    } catch (error) {
       console.error("Improvement cycle failed:", error);
      const message = error instanceof Error ? error.message : 'An unknown error occurred.';
      setErrorMessage(`Improvement process failed: ${message}`);
      setAuditStatus(AuditStatus.ERROR);
    }
  }, [auditConfig, originalAuditResults]);
  
  const handleReset = () => {
    setAuditStatus(AuditStatus.CONFIG);
    setAuditConfig(null);
    setAuditResults([]);
    setOriginalAuditResults([]);
    setImprovementData(null);
    setProgressMessage('');
    setErrorMessage('');
  };

  const renderContent = () => {
    switch (auditStatus) {
      case AuditStatus.AUDITING:
      case AuditStatus.IMPROVING:
        return <AuditProgress message={progressMessage} />;
      case AuditStatus.REPORT_READY:
        return <AuditReport results={auditResults} onReset={handleReset} onStartImprovement={handleStartImprovement} />;
      case AuditStatus.IMPROVEMENT_REPORT_READY:
        if (!improvementData || !originalAuditResults.length || !auditConfig) {
            return (
              <div className="text-center">
                <p className="text-red-500 text-lg mb-4">Could not display improvement report. Data is missing.</p>
                <button onClick={handleReset} className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors">Start New Audit</button>
              </div>
            );
        }
        return <ImprovementReport originalResults={originalAuditResults} improvementData={improvementData} onReset={handleReset} originalPrompt={auditConfig.systemPrompts[0]} />;
      case AuditStatus.ERROR:
         return (
          <div className="text-center">
            <p className="text-red-500 text-lg mb-4">{errorMessage}</p>
            <button
              onClick={handleReset}
              className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
            >
              Start New Audit
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
        <header className="text-center mb-10">
          <div className="flex items-center justify-center gap-4">
            <ShieldCheckIcon className="w-12 h-12 text-primary-500" />
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-gray-800 dark:text-white">
              AI Agent Auditor
            </h1>
          </div>
          <p className="mt-4 text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            A professional tool to rigorously test and evaluate your AI agents against key performance criteria.
          </p>
        </header>
        <main>
          {renderContent()}
        </main>
         <footer className="text-center mt-12 text-sm text-gray-500">
            <p>&copy; {new Date().getFullYear()} AI Agent Auditor. All rights reserved.</p>
        </footer>
      </div>
    </div>
  );
};

export default App;