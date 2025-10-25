import React, { useState, useMemo } from 'react';
import type { AuditResult, CriterionAnalysis, AuditConfig, ExecutionStep } from '../types';
import Card from './Card';
import { CheckCircleIcon } from './icons/CheckCircleIcon';
import { XCircleIcon } from './icons/XCircleIcon';
import { ExclamationTriangleIcon } from './icons/ExclamationTriangleIcon';
import { useTranslation } from '../hooks/useTranslation';

interface AuditReportProps {
  results: AuditResult[];
  onReset: () => void;
  config: AuditConfig;
}

const ScoreIndicator: React.FC<{ score: number }> = ({ score }) => {
  const scoreColor = useMemo(() => {
    if (score >= 8) return 'text-green-500';
    if (score >= 5) return 'text-yellow-500';
    return 'text-red-500';
  }, [score]);

  const Icon = useMemo(() => {
    if (score >= 8) return CheckCircleIcon;
    if (score >= 5) return ExclamationTriangleIcon;
    return XCircleIcon;
  }, [score]);
  
  const bgColor = useMemo(() => {
    if (score >= 8) return 'bg-green-100 dark:bg-green-900/50';
    if (score >= 5) return 'bg-yellow-100 dark:bg-yellow-900/50';
    return 'bg-red-100 dark:bg-red-900/50';
  }, [score]);


  return (
    <div className={`flex items-center justify-center w-16 h-16 rounded-full ${bgColor} ${scoreColor}`}>
        <span className="text-2xl font-bold">{score.toFixed(1)}</span>
    </div>
  );
};

const NodeTraceViewer: React.FC<{ trace: ExecutionStep[], config: AuditConfig }> = ({ trace, config }) => {
  const { t } = useTranslation();
  return (
    <div className="mt-4 space-y-2 max-h-[500px] overflow-y-auto p-4 bg-gray-900 rounded-lg border border-gray-700 font-mono text-xs">
      {trace.map(step => {
        const node = config.workflow.find(n => n.id === step.nodeId);
        const statusColor = step.status === 'SUCCESS' ? 'text-green-400' : step.status === 'ERROR' ? 'text-red-400' : 'text-yellow-400';
        return (
          <details key={step.nodeId} className="p-2 bg-gray-800/50 rounded-md">
            <summary className="cursor-pointer font-semibold flex justify-between items-center">
              <span>Node: {node?.name || step.nodeId}</span>
              <span className={statusColor}>{step.status} ({step.durationMs}ms)</span>
            </summary>
            <div className="mt-2 pl-4 border-l border-gray-600">
                <h5 className="font-semibold text-gray-300 mt-2">{t('inputData')}</h5>
                <pre className="whitespace-pre-wrap text-gray-400">{JSON.stringify(step.input, null, 2)}</pre>
                <h5 className="font-semibold text-gray-300 mt-2">{t('outputData')}</h5>
                <pre className="whitespace-pre-wrap text-cyan-400">{JSON.stringify(step.output, null, 2)}</pre>
                 {step.log && (
                    <>
                    <h5 className="font-semibold text-gray-300 mt-2">{t('executionLogTitle')}</h5>
                    <pre className="whitespace-pre-wrap text-gray-400">{step.log}</pre>
                    </>
                 )}
            </div>
          </details>
        )
      })}
    </div>
  );
};

const ConversationTraceViewer: React.FC<{ trace: ExecutionStep[] }> = ({ trace }) => {
    const { t } = useTranslation();
    
    // Find a message key in the user input.
    const findMessage = (data: any): string => {
        if (!data || typeof data !== 'object') return JSON.stringify(data);
        const messageKey = Object.keys(data).find(k => k.toLowerCase().includes('message') || k.toLowerCase().includes('text') || k.toLowerCase().includes('query'));
        return messageKey ? data[messageKey] : JSON.stringify(data);
    };

    return (
        <div className="mt-4 space-y-4 max-h-[500px] overflow-y-auto p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700">
            {trace.map(turn => (
                <div key={turn.nodeId}>
                    <div className="flex justify-end">
                        <div className="bg-primary-500 text-white p-3 rounded-lg max-w-xs md:max-w-md">
                            <p className="text-sm font-bold mb-1">{t('userTurnTitle', { turn: turn.nodeId.split(' ')[1] })}</p>
                            <p className="text-sm">{findMessage(turn.input)}</p>
                        </div>
                    </div>
                    <div className="flex justify-start mt-2">
                        <div className="bg-white dark:bg-gray-700 p-3 rounded-lg max-w-xs md:max-w-md shadow">
                             <p className="text-sm font-bold mb-1 text-gray-700 dark:text-gray-300">{t('agentResponseTitle')}</p>
                             {turn.status === 'SUCCESS' ? (
                                 <pre className="text-xs whitespace-pre-wrap text-gray-800 dark:text-gray-200">{JSON.stringify(turn.output, null, 2)}</pre>
                             ) : (
                                <div className="text-red-500 dark:text-red-400">
                                    <p className="font-bold">{t('error')}</p>
                                    <p className="text-xs">{turn.log}</p>
                                </div>
                             )}
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
};

const CriterionBreakdown: React.FC<{ analysis: CriterionAnalysis[] }> = ({ analysis }) => (
    <div className="space-y-3 mt-4">
        {analysis.map((item) => (
            <div key={item.criterion} className="p-3 bg-gray-100 dark:bg-gray-800 rounded-lg">
                <div className="flex justify-between items-center">
                    <p className="font-semibold text-gray-800 dark:text-gray-200">{item.criterion}</p>
                    <ScoreIndicator score={item.score} />
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{item.justification}</p>
            </div>
        ))}
    </div>
);


const ReportCard: React.FC<{ result: AuditResult; config: AuditConfig }> = ({ result, config }) => {
  const [isTraceVisible, setIsTraceVisible] = useState(false);
  const { t } = useTranslation();
  const traceTitle = config.auditType === 'real' ? t('showConversationLog') : t('showNodeLog');
  const hideTraceTitle = config.auditType === 'real' ? t('hideConversationLog') : t('hideNodeLog');

  return (
    <Card className="mb-6">
      <div className="flex flex-col md:flex-row items-start gap-6">
        <div className="flex-shrink-0">
          <ScoreIndicator score={result.analysis.overallScore} />
        </div>
        <div className="flex-grow">
          <h3 className="text-xl font-bold text-gray-800 dark:text-white">{result.testCase.title}</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">{t('personaLabel')}: {result.testCase.persona}</p>
          <p className="text-gray-700 dark:text-gray-300">{result.analysis.summary}</p>
          
          <div className="mt-4">
            <h4 className="font-semibold text-gray-800 dark:text-gray-200">{t('criteriaBreakdown')}</h4>
             <CriterionBreakdown analysis={result.analysis.criteriaBreakdown} />
          </div>

          <div className="flex items-center gap-4 mt-4">
            <button
              onClick={() => setIsTraceVisible(!isTraceVisible)}
              className="text-sm font-medium text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-200"
            >
              {isTraceVisible ? hideTraceTitle : traceTitle}
            </button>
          </div>
          {isTraceVisible && (
            config.auditType === 'real' 
              ? <ConversationTraceViewer trace={result.executionTrace} />
              : <NodeTraceViewer trace={result.executionTrace} config={config} />
          )}
        </div>
      </div>
    </Card>
  );
};

const AuditReport: React.FC<AuditReportProps> = ({ results, onReset, config }) => {
  const { t } = useTranslation();
  const overallAverageScore = useMemo(() => {
    if (results.length === 0) return 0;
    const total = results.reduce((sum, r) => sum + r.analysis.overallScore, 0);
    return total / results.length;
  }, [results]);


  return (
    <div>
        <Card className="mb-8">
            <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                <div>
                    <h2 className="text-3xl font-bold text-gray-800 dark:text-white">{t('auditReportTitle')}</h2>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">{t('auditReportDescription')}</p>
                </div>
                <div className="text-center">
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('overallAverageScore')}</p>
                    <ScoreIndicator score={overallAverageScore} />
                </div>
            </div>
        </Card>

      {results.map((result) => (
        <ReportCard key={result.id} result={result} config={config} />
      ))}
      
      <div className="text-center mt-8 flex flex-col sm:flex-row justify-center items-center gap-4">
        <button
          onClick={onReset}
          className="py-3 px-6 bg-gray-600 text-white font-semibold rounded-lg shadow-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-transform transform hover:scale-105"
        >
          {t('runNewAudit')}
        </button>
        <button
          disabled
          className="py-3 px-6 bg-primary-600 text-white font-semibold rounded-lg shadow-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-transform transform hover:scale-105 disabled:bg-primary-400/50 disabled:cursor-not-allowed"
        >
          {t('suggestImprovements')}
        </button>
      </div>
    </div>
  );
};

export default AuditReport;