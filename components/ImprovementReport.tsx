import React, { useMemo, useState } from 'react';
import type { AuditResult, ImprovementData } from '../types';
import Card from './Card';
import { ArrowRightIcon } from './icons/ArrowRightIcon';
import { ClipboardIcon } from './icons/ClipboardIcon';

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

const PromptDiff: React.FC<{ oldPrompt: string, newPrompt: string, onCopy: () => void, copyText: string }> = ({ oldPrompt, newPrompt, onCopy, copyText }) => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
            <h4 className="font-semibold mb-2 text-gray-800 dark:text-gray-200">Original Prompt (Agent 1)</h4>
            <textarea readOnly value={oldPrompt} className="w-full h-48 p-3 bg-gray-100 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg text-sm" />
        </div>
        <div>
            <div className="flex justify-between items-center mb-2">
                <h4 className="font-semibold text-gray-800 dark:text-gray-200">Improved Prompt (Agent 1)</h4>
                <button onClick={onCopy} className="flex items-center gap-1 text-sm text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-200">
                    <ClipboardIcon className="w-4 h-4" />
                    {copyText}
                </button>
            </div>
            <textarea readOnly value={newPrompt} className="w-full h-48 p-3 bg-green-50 dark:bg-green-900/50 border border-green-300 dark:border-green-700 rounded-lg text-sm" />
        </div>
    </div>
);

interface ImprovementReportProps {
    originalResults: AuditResult[];
    improvementData: ImprovementData;
    onReset: () => void;
    originalPrompt: string;
}

const ImprovementReport: React.FC<ImprovementReportProps> = ({ originalResults, improvementData, onReset, originalPrompt }) => {
    
    const { improvedPrompt, explanation, newResults } = improvementData;
    const [copyText, setCopyText] = useState('Copy');

    const overallScores = useMemo(() => {
        const oldTotal = originalResults.reduce((sum, r) => sum + r.analysis.overallScore, 0);
        const newTotal = newResults.reduce((sum, r) => sum + r.analysis.overallScore, 0);
        return {
            old: originalResults.length > 0 ? oldTotal / originalResults.length : 0,
            new: newResults.length > 0 ? newTotal / newResults.length : 0,
        };
    }, [originalResults, newResults]);

    const handleCopy = () => {
        navigator.clipboard.writeText(improvedPrompt);
        setCopyText('Copied!');
        setTimeout(() => setCopyText('Copy'), 2000);
    };

    return (
        <div className="space-y-8">
            <Card>
                <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                    <div>
                        <h2 className="text-3xl font-bold text-gray-800 dark:text-white">Improvement Report</h2>
                        <p className="text-gray-600 dark:text-gray-400 mt-1">Comparison of the agent's performance before and after improvements.</p>
                    </div>
                    <div className="text-center">
                        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Overall Average Score</p>
                        <ScoreComparison oldScore={overallScores.old} newScore={overallScores.new} />
                    </div>
                </div>
            </Card>

            <Card>
                <h3 className="text-xl font-semibold mb-3 text-gray-800 dark:text-white">Summary of Changes</h3>
                <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{explanation}</p>
            </Card>

            <Card>
                <h3 className="text-xl font-semibold mb-4 text-gray-800 dark:text-white">System Prompt Comparison</h3>
                <PromptDiff oldPrompt={originalPrompt} newPrompt={improvedPrompt} onCopy={handleCopy} copyText={copyText}/>
            </Card>
            
            <Card>
                <h3 className="text-xl font-semibold mb-4 text-gray-800 dark:text-white">Detailed Test Case Comparison</h3>
                <div className="space-y-4">
                    {originalResults.map((origResult) => {
                        const newResult = newResults.find(nr => nr.id === origResult.id);
                        if (!newResult) return null;
                        return (
                            <div key={origResult.id} className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700">
                                <h4 className="font-bold text-lg text-gray-800 dark:text-white">{origResult.testCase.title}</h4>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">{origResult.testCase.scenario}</p>
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
                    Run New Audit
                </button>
            </div>
        </div>
    );
};

export default ImprovementReport;