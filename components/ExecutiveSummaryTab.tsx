import React, { useState } from 'react';
import { Card } from './Card';
import { 
  CheckCircleIcon, 
  XCircleIcon, 
  ExclamationTriangleIcon,
  ClipboardDocumentIcon,
  ChartBarIcon
} from '@heroicons/react/24/outline';
import type { ExecutiveSummary } from '../types';

interface ExecutiveSummaryTabProps {
  summary: ExecutiveSummary;
  language: string;
}

export function ExecutiveSummaryTab({ summary, language }: ExecutiveSummaryTabProps) {
  const [promptCopied, setPromptCopied] = useState(false);

  const copyPrompt = () => {
    navigator.clipboard.writeText(summary.llmPrompt);
    setPromptCopied(true);
    setTimeout(() => setPromptCopied(false), 2000);
  };

  const getScoreColor = (score: number): string => {
    if (score >= 8) return 'text-green-600 dark:text-green-400';
    if (score >= 6) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };

  const getScoreBgColor = (score: number): string => {
    if (score >= 8) return 'bg-green-100 dark:bg-green-900/20';
    if (score >= 6) return 'bg-yellow-100 dark:bg-yellow-900/20';
    return 'bg-red-100 dark:bg-red-900/20';
  };

  const getPriorityBadge = (priority: string): string => {
    switch (priority) {
      case 'high': return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400';
      case 'medium': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400';
      default: return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400';
    }
  };

  return (
    <div className="space-y-6">
      {/* Overall Score Card */}
      <Card className={`${getScoreBgColor(summary.overallScore)} border-2`}>
        <div className="text-center py-8">
          <h2 className="text-3xl font-bold mb-4 text-gray-800 dark:text-gray-200">
            {language === 'es' ? '📊 Puntuación General del Sistema' : '📊 Overall System Score'}
          </h2>
          <div className={`text-7xl font-bold ${getScoreColor(summary.overallScore)} mb-4`}>
            {summary.overallScore.toFixed(1)}/10
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8 text-sm">
            <div>
              <p className="text-gray-600 dark:text-gray-400">
                {language === 'es' ? 'Total Conversaciones' : 'Total Conversations'}
              </p>
              <p className="text-2xl font-bold text-gray-800 dark:text-gray-200">
                {summary.totalConversations}
              </p>
            </div>
            <div>
              <p className="text-gray-600 dark:text-gray-400">
                {language === 'es' ? 'Exitosas' : 'Successful'}
              </p>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                {summary.successfulConversations}
              </p>
            </div>
            <div>
              <p className="text-gray-600 dark:text-gray-400">
                {language === 'es' ? 'Errores Críticos' : 'Critical Errors'}
              </p>
              <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                {summary.criticalErrors}
              </p>
            </div>
            <div>
              <p className="text-gray-600 dark:text-gray-400">
                {language === 'es' ? 'Advertencias' : 'Warnings'}
              </p>
              <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                {summary.warnings}
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* Top Issues */}
      {summary.topIssues.length > 0 && (
        <Card>
          <div className="flex items-start gap-3 mb-4">
            <XCircleIcon className="w-6 h-6 text-red-500 flex-shrink-0 mt-1" />
            <div className="flex-1">
              <h3 className="text-xl font-semibold mb-4">
                {language === 'es' ? '🚨 Problemas Más Frecuentes' : '🚨 Most Frequent Issues'}
              </h3>
              <div className="space-y-3">
                {summary.topIssues.map((issue, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <div className="flex-1">
                      <p className="font-medium text-gray-800 dark:text-gray-200">{issue.title}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {language === 'es' ? 'Ocurrencias' : 'Occurrences'}: {issue.occurrences}
                      </p>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      issue.severity === 'critical' 
                        ? 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400' 
                        : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400'
                    }`}>
                      {issue.severity === 'critical' ? (language === 'es' ? 'CRÍTICO' : 'CRITICAL') : (language === 'es' ? 'ADVERTENCIA' : 'WARNING')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Top Strengths */}
      {summary.topStrengths.length > 0 && (
        <Card>
          <div className="flex items-start gap-3 mb-4">
            <CheckCircleIcon className="w-6 h-6 text-green-500 flex-shrink-0 mt-1" />
            <div className="flex-1">
              <h3 className="text-xl font-semibold mb-4">
                {language === 'es' ? '✅ Fortalezas del Sistema' : '✅ System Strengths'}
              </h3>
              <div className="space-y-3">
                {summary.topStrengths.map((strength, i) => (
                  <div key={i} className="p-3 bg-green-50 dark:bg-green-900/10 rounded-lg border border-green-200 dark:border-green-800">
                    <p className="font-medium text-green-800 dark:text-green-400 mb-1">{strength.title}</p>
                    <p className="text-sm text-gray-700 dark:text-gray-300">{strength.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Recommended Actions */}
      {summary.recommendedActions.length > 0 && (
        <Card>
          <div className="flex items-start gap-3 mb-4">
            <ChartBarIcon className="w-6 h-6 text-blue-500 flex-shrink-0 mt-1" />
            <div className="flex-1">
              <h3 className="text-xl font-semibold mb-4">
                {language === 'es' ? '🎯 Plan de Acción Recomendado' : '🎯 Recommended Action Plan'}
              </h3>
              <div className="space-y-3">
                {summary.recommendedActions.map((action, i) => (
                  <div key={i} className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border-l-4 border-blue-500">
                    <div className="flex items-start justify-between mb-2">
                      <span className={`px-2 py-1 rounded text-xs font-bold ${getPriorityBadge(action.priority)}`}>
                        {action.priority.toUpperCase()}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {language === 'es' ? 'Afecta a' : 'Affects'} {action.affectedConversations} {language === 'es' ? 'conversaciones' : 'conversations'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-800 dark:text-gray-200">{action.action}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* LLM Prompt for External Analysis */}
      <Card>
        <div className="flex items-start gap-3 mb-4">
          <ClipboardDocumentIcon className="w-6 h-6 text-purple-500 flex-shrink-0 mt-1" />
          <div className="flex-1">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-xl font-semibold">
                {language === 'es' ? '🤖 Prompt para Análisis Externo (Claude/GPT)' : '🤖 Prompt for External Analysis (Claude/GPT)'}
              </h3>
              <button
                onClick={copyPrompt}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2"
              >
                <ClipboardDocumentIcon className="w-4 h-4" />
                {promptCopied 
                  ? (language === 'es' ? '✓ Copiado!' : '✓ Copied!') 
                  : (language === 'es' ? 'Copiar Prompt' : 'Copy Prompt')}
              </button>
            </div>
            <div className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto max-h-96 overflow-y-auto">
              <pre className="text-xs whitespace-pre-wrap font-mono">{summary.llmPrompt}</pre>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              {language === 'es' 
                ? '💡 Usa este prompt con Claude, GPT-4 u otro LLM para obtener un análisis más profundo y recomendaciones específicas.' 
                : '💡 Use this prompt with Claude, GPT-4, or another LLM to get deeper analysis and specific recommendations.'}
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
