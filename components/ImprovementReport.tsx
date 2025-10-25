import React, { useMemo, useState } from 'react';
import type { AuditResult, ImprovementData, ParsedN8nNode, WorkflowNode } from '../types';
import Card from './Card';
import { ArrowRightIcon } from './icons/ArrowRightIcon';
import { ClipboardIcon } from './icons/ClipboardIcon';
import { useTranslation } from '../hooks/useTranslation';

const DownloadIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
  </svg>
);


const ScoreComparison: React.FC<{ oldScore: number, newScore: number }> = ({ oldScore, newScore }) => {
    const change = newScore - oldScore;
    const color = change > 0 ? 'text-green-500' : change < 0 ? 'text-red-500' : 'text-gray-500';
    const sign = change > 0 ? '+' : '';
    return (
        <div className="flex items-center gap-2">
            <span className="font-bold text-lg">{oldScore.toFixed(1)}</span>
            <ArrowRightIcon className="w-5 h-5 text-gray-400" />
            <span className="font-bold text-lg">{newScore.toFixed(1)}</span>
            <span className={`font-semibold text-sm ${color}`}>
                ({sign}{change.toFixed(1)})
            </span>
        </div>
    );
};

const PromptComparisonCard: React.FC<{ oldNode: WorkflowNode, newNode: WorkflowNode }> = ({ oldNode, newNode }) => {
    const { t } = useTranslation();
    const [copyText, setCopyText] = useState(t('copyNewPrompt'));

    if (oldNode.type !== 'agent' || newNode.type !== 'agent') {
      return null;
    }

    const handleCopy = () => {
        navigator.clipboard.writeText(newNode.systemPrompt);
        setCopyText(t('copied'));
        setTimeout(() => setCopyText(t('copyNewPrompt')), 2000);
    };
    
    const hasChanged = oldNode.systemPrompt !== newNode.systemPrompt;
    
    const agentTitle = t('agentNameLabel', { name: oldNode.name });

    return (
        <div className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="flex justify-between items-center mb-3">
                <h4 className="font-bold text-lg text-gray-800 dark:text-white">
                    {agentTitle}
                </h4>
                 <button onClick={handleCopy} className="flex items-center gap-1 text-sm text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-200">
                    <ClipboardIcon className="w-4 h-4" />
                    {copyText}
                </button>
            </div>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <h5 className="font-semibold mb-1 text-sm text-gray-600 dark:text-gray-400">{t('originalPrompt')}</h5>
                    <textarea readOnly value={oldNode.systemPrompt} className="w-full h-40 p-2 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md text-xs" />
                </div>
                <div>
                    <h5 className="font-semibold mb-1 text-sm text-gray-600 dark:text-gray-400">{t('improvedPrompt')}</h5>
                    <textarea readOnly value={newNode.systemPrompt} className={`w-full h-40 p-2 border rounded-md text-xs ${hasChanged ? 'bg-green-50 dark:bg-green-900/50 border-green-300 dark:border-green-700' : 'bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600'}`} />
                </div>
            </div>
        </div>
    )
};


interface ImprovementReportProps {
    originalResults: AuditResult[];
    improvementData: ImprovementData;
    onReset: () => void;
    originalWorkflow: WorkflowNode[];
    n8nData: ParsedN8nNode[] | null;
}

const ImprovementReport: React.FC<ImprovementReportProps> = ({ originalResults, improvementData, onReset, originalWorkflow, n8nData }) => {
    const { t } = useTranslation();
    const { improvedWorkflow, explanation, newResults } = improvementData;

    const overallScores = useMemo(() => {
        const oldTotal = originalResults.reduce((sum, r) => sum + r.analysis.overallScore, 0);
        const newTotal = newResults.reduce((sum, r) => sum + r.analysis.overallScore, 0);
        return {
            old: originalResults.length > 0 ? oldTotal / originalResults.length : 0,
            new: newResults.length > 0 ? newTotal / newResults.length : 0,
        };
    }, [originalResults, newResults]);

    const handleDownload = () => {
        if (!n8nData) return;
        
        const dataToDownload = {
            agentsToUpdate: improvedWorkflow
                .filter(node => node.type === 'agent')
                .map(improvedNode => {
                    const originalNode = originalWorkflow.find(n => n.id === improvedNode.id);
                    if (!originalNode || originalNode.type !== 'agent' || improvedNode.type !== 'agent') return null;
                    
                    return {
                        nodeName: originalNode.name,
                        nodeId: originalNode.id,
                        originalPrompt: originalNode.systemPrompt,
                        improvedPrompt: improvedNode.systemPrompt,
                    }
                })
                .filter(Boolean),
        };

        const jsonString = JSON.stringify(dataToDownload, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'n8n_prompt_updates.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    return (
        <div className="space-y-8">
            <Card>
                <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                    <div>
                        <h2 className="text-3xl font-bold text-gray-800 dark:text-white">{t('improvementReportTitle')}</h2>
                        <p className="text-gray-600 dark:text-gray-400 mt-1">{t('improvementReportDescription')}</p>
                    </div>
                    <div className="text-center">
                        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('overallAverageScore')}</p>
                        <ScoreComparison oldScore={overallScores.old} newScore={overallScores.new} />
                    </div>
                </div>
            </Card>

            <Card>
                <h3 className="text-xl font-semibold mb-3 text-gray-800 dark:text-white">{t('summaryOfChanges')}</h3>
                <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{explanation}</p>
            </Card>

            <Card>
                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2 mb-4">
                    <h3 className="text-xl font-semibold text-gray-800 dark:text-white">{t('promptComparisonTitle')}</h3>
                    {n8nData && (
                        <button 
                            onClick={handleDownload}
                            className="flex items-center justify-center gap-2 py-2 px-4 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition"
                        >
                            <DownloadIcon className="w-5 h-5"/>
                            {t('downloadN8nJson')}
                        </button>
                    )}
                </div>
                <div className="space-y-4">
                    {originalWorkflow.map((node, index) => {
                         const improvedNode = improvedWorkflow.find(n => n.id === node.id);
                         if (node.type === 'agent' && improvedNode) {
                             return <PromptComparisonCard 
                                 key={node.id}
                                 oldNode={node}
                                 newNode={improvedNode}
                             />
                         }
                         return null;
                    })}
                </div>
            </Card>
            
            <Card>
                <h3 className="text-xl font-semibold mb-4 text-gray-800 dark:text-white">{t('detailedTestComparison')}</h3>
                <div className="space-y-4">
                    {originalResults.map((origResult) => {
                        const newResult = newResults.find(nr => nr.id === origResult.id);
                        if (!newResult) return null;
                        return (
                            <div key={origResult.id} className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700">
                                <h4 className="font-bold text-lg text-gray-800 dark:text-white">{origResult.testCase.title}</h4>
                                {/* FIX: Property 'scenario' does not exist on type 'TestCase'. Replaced with 'persona' which is available and fits the UI context. */}
                                <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">{origResult.testCase.persona}</p>
                                <ScoreComparison oldScore={origResult.analysis.overallScore} newScore={newResult.analysis.overallScore} />
                            </div>
                        );
                    })}
                </div>
            </Card>

            <div className="text-center mt-8">
                <button
                    onClick={onReset}
                    className="py-3 px-6 bg-primary-600 text-white font-semibold rounded-lg shadow-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-transform transform hover:scale-105"
                >
                    {t('runNewAudit')}
                </button>
            </div>
        </div>
    );
};

export default ImprovementReport;