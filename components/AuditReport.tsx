
import React, { useState, useMemo, useRef, useEffect } from 'react';
import type { AuditResult, CriterionAnalysis, AuditConfig, ExecutionStep } from '../types';
import Card from './Card';
import { useTranslation } from '../hooks/useTranslation';

interface AuditReportProps {
  results: AuditResult[];
  onReset: () => void;
  config: AuditConfig;
  isHistoryView?: boolean;
}

const ScoreIndicator: React.FC<{ score: number, size?: 'normal' | 'large' }> = ({ score, size = 'normal' }) => {
  const scoreColor = useMemo(() => {
    if (score >= 8) return 'text-green-500';
    if (score >= 5) return 'text-yellow-500';
    return 'text-red-500';
  }, [score]);
  
  const bgColor = useMemo(() => {
    if (score >= 8) return 'bg-green-100 dark:bg-green-900/50';
    if (score >= 5) return 'bg-yellow-100 dark:bg-yellow-900/50';
    return 'bg-red-100 dark:bg-red-900/50';
  }, [score]);
  
  const sizeClasses = size === 'large' 
    ? 'w-24 h-24 text-4xl' 
    : 'w-16 h-16 text-2xl';

  return (
    <div className={`flex items-center justify-center rounded-full ${bgColor} ${scoreColor} ${sizeClasses}`}>
        <span className="font-bold">{score.toFixed(1)}</span>
    </div>
  );
};

const NodeTraceViewer: React.FC<{ trace: ExecutionStep[], config: AuditConfig }> = ({ trace, config }) => {
  const { t } = useTranslation();
  return (
    <div className="mt-4 space-y-2 max-h-[500px] overflow-y-auto p-4 bg-gray-900 rounded-lg border border-gray-700 font-mono text-xs">
      {trace.map((step, index) => {
        const node = config.workflow.find(n => n.id === step.nodeId);
        const statusColor = step.status === 'SUCCESS' ? 'text-green-400' : step.status === 'ERROR' ? 'text-red-400' : 'text-yellow-400';
        return (
          <details key={`${step.nodeId}-${index}`} className="p-2 bg-gray-800/50 rounded-md">
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

export const ConversationTraceViewer: React.FC<{ trace: ExecutionStep[] }> = ({ trace }) => {
    const { t } = useTranslation();
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [trace]);

    const findMessage = (data: any): string => {
        if (typeof data !== 'object' || data === null) return JSON.stringify(data);
        const messageKey = Object.keys(data).find(k => k.toLowerCase().includes('message') || k.toLowerCase().includes('text') || k.toLowerCase().includes('query'));
        return messageKey ? data[messageKey] : JSON.stringify(data);
    };

    return (
        <div className="flex-1 flex flex-col h-full bg-gray-100 dark:bg-gray-900 rounded-lg p-2 md:p-4">
            <div className="flex-1 overflow-y-auto space-y-4 pr-2">
                {trace.map(turn => (
                    <React.Fragment key={turn.nodeId}>
                        {/* User Message Bubble */}
                        <div className="flex justify-end animate-fade-in">
                            <div className="bg-blue-500 text-white p-3 rounded-l-lg rounded-br-lg max-w-xs md:max-w-md shadow">
                                <p className="text-sm">{findMessage(turn.input)}</p>
                            </div>
                        </div>

                        {/* Agent Message Bubble */}
                        <div className="flex justify-start animate-fade-in">
                            <div className="bg-white dark:bg-gray-700 p-3 rounded-r-lg rounded-bl-lg max-w-xs md:max-w-md shadow">
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
                    </React.Fragment>
                ))}
                <div ref={messagesEndRef} />
            </div>
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
  const [isExpanded, setIsExpanded] = useState(false);
  const [isTraceVisible, setIsTraceVisible] = useState(false);
  const { t } = useTranslation();
  const traceTitle = config.auditType === 'real' ? t('showConversationLog') : t('showNodeLog');
  const hideTraceTitle = config.auditType === 'real' ? t('hideConversationLog') : t('hideNodeLog');

  return (
    <Card className="mb-6">
      <div className="cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="flex items-center gap-4">
          <div className="flex-shrink-0">
            <ScoreIndicator score={result.analysis.overallScore} />
          </div>
          <div className="flex-grow min-w-0">
            <h3 className="text-xl font-bold text-gray-800 dark:text-white truncate">{result.testCase.title}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t('finalStatusLabel')}: <span className={result.finalStatus === 'SUCCESS' ? 'font-semibold text-green-600 dark:text-green-400' : 'font-semibold text-red-600 dark:text-red-400'}>{result.finalStatus}</span>
            </p>
          </div>
          <div className="flex-shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={`w-6 h-6 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
            </svg>
          </div>
        </div>
      </div>
      {isExpanded && (
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 animate-fade-in">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">{t('personaLabel')}: {result.testCase.persona}</p>
          <p className="text-gray-700 dark:text-gray-300">{result.analysis.summary}</p>
          
          <div className="mt-4">
            <h4 className="font-semibold text-gray-800 dark:text-gray-200">{t('criteriaBreakdown')}</h4>
             <CriterionBreakdown analysis={result.analysis.criteriaBreakdown} />
          </div>

          <div className="flex items-center gap-4 mt-4">
            <button
              onClick={(e) => { e.stopPropagation(); setIsTraceVisible(!isTraceVisible); }}
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
      )}
    </Card>
  );
};

const AuditReport: React.FC<AuditReportProps> = ({ results, onReset, config, isHistoryView = false }) => {
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
                    <ScoreIndicator score={overallAverageScore} size="large" />
                </div>
            </div>
        </Card>

      {results.map((result) => (
        <ReportCard key={result.id} result={result} config={config} />
      ))}
      
      <div className="text-center mt-8 flex flex-col sm:flex-row justify-center items-center gap-4">
        <button
          onClick={onReset}
          className="py-3 px-6 bg-primary-600 text-white font-semibold rounded-lg shadow-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-transform transform hover:scale-105"
        >
          {isHistoryView ? t('backToConfig') : t('runNewAudit')}
        </button>
        {!isHistoryView && (
          <button
            disabled
            className="py-3 px-6 bg-yellow-500 text-white font-semibold rounded-lg shadow-md hover:bg-yellow-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500 transition-transform transform hover:scale-105 disabled:bg-yellow-400/50 disabled:cursor-not-allowed"
          >
            {t('suggestImprovements')}
          </button>
        )}
      </div>
    </div>
  );
};

export default AuditReport;