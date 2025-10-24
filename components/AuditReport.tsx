
import React, { useState, useMemo } from 'react';
import type { AuditResult, ConversationTurn, CriterionAnalysis } from '../types';
import Card from './Card';
import { CheckCircleIcon } from './icons/CheckCircleIcon';
import { XCircleIcon } from './icons/XCircleIcon';
import { ExclamationTriangleIcon } from './icons/ExclamationTriangleIcon';

interface AuditReportProps {
  results: AuditResult[];
  onReset: () => void;
  onStartImprovement: () => void;
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
    if (score >= 8) return 'bg-green-100 dark:bg-green-900';
    if (score >= 5) return 'bg-yellow-100 dark:bg-yellow-900';
    return 'bg-red-100 dark:bg-red-900';
  }, [score]);


  return (
    <div className={`flex items-center justify-center w-16 h-16 rounded-full ${bgColor} ${scoreColor}`}>
        <span className="text-2xl font-bold">{score}</span>
    </div>
  );
};

const ConversationLog: React.FC<{ conversation: ConversationTurn[] }> = ({ conversation }) => {
  return (
    <div className="mt-4 space-y-4 max-h-96 overflow-y-auto p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
      {conversation.map((turn, index) => (
        <div key={index} className={`flex ${turn.author === 'user' ? 'justify-end' : 'justify-start'}`}>
          <div className={`max-w-xs md:max-w-md lg:max-w-lg px-4 py-2 rounded-xl ${turn.author === 'user' ? 'bg-primary-500 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200'}`}>
            <p className="text-sm">{turn.message}</p>
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


const ReportCard: React.FC<{ result: AuditResult }> = ({ result }) => {
  const [isLogVisible, setIsLogVisible] = useState(false);

  return (
    <Card className="mb-6">
      <div className="flex flex-col md:flex-row items-start gap-6">
        <div className="flex-shrink-0">
          <ScoreIndicator score={result.analysis.overallScore} />
        </div>
        <div className="flex-grow">
          <h3 className="text-xl font-bold text-gray-800 dark:text-white">{result.testCase.title}</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">{result.testCase.scenario}</p>
          <p className="text-gray-700 dark:text-gray-300">{result.analysis.summary}</p>
          
          <div className="mt-4">
            <h4 className="font-semibold text-gray-800 dark:text-gray-200">Criteria Breakdown</h4>
             <CriterionBreakdown analysis={result.analysis.criteriaBreakdown} />
          </div>

          <button
            onClick={() => setIsLogVisible(!isLogVisible)}
            className="mt-4 text-sm font-medium text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-200"
          >
            {isLogVisible ? 'Hide' : 'Show'} Conversation Log
          </button>
          {isLogVisible && <ConversationLog conversation={result.conversation} />}
        </div>
      </div>
    </Card>
  );
};

const AuditReport: React.FC<AuditReportProps> = ({ results, onReset, onStartImprovement }) => {
  const overallAverageScore = useMemo(() => {
    if (results.length === 0) return 0;
    const total = results.reduce((sum, r) => sum + r.analysis.overallScore, 0);
    return parseFloat((total / results.length).toFixed(1));
  }, [results]);

  return (
    <div>
        <Card className="mb-8">
            <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                <div>
                    <h2 className="text-3xl font-bold text-gray-800 dark:text-white">Audit Report</h2>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">Summary of all test cases executed.</p>
                </div>
                <div className="text-center">
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Overall Average Score</p>
                    <ScoreIndicator score={overallAverageScore} />
                </div>
            </div>
        </Card>

      {results.map((result) => (
        <ReportCard key={result.id} result={result} />
      ))}
      
      <div className="text-center mt-8 flex flex-col sm:flex-row justify-center items-center gap-4">
        <button
          onClick={onReset}
          className="py-3 px-6 bg-gray-600 text-white font-semibold rounded-lg shadow-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-transform transform hover:scale-105"
        >
          Run New Audit
        </button>
        <button
          onClick={onStartImprovement}
          className="py-3 px-6 bg-primary-600 text-white font-semibold rounded-lg shadow-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-transform transform hover:scale-105"
        >
          Suggest & Test Improvements
        </button>
      </div>
    </div>
  );
};

export default AuditReport;