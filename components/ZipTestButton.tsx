/**
 * 🧪 ZIP Test Button - Ejecuta testing exhaustivo del análisis
 */

import React, { useState } from 'react';
import { testExistingAnalysis, exportReportAsMarkdown, BUILDERBOT_EXPECTATIONS } from '../services/zipAnalysisTester';
import type { ParsedCodeProject } from '../types';

interface Props {
  codeProject: ParsedCodeProject;
  projectName?: string;
}

export function ZipTestButton({ codeProject, projectName }: Props) {
  const [testing, setTesting] = useState(false);
  const [report, setReport] = useState<any>(null);
  const [showReport, setShowReport] = useState(false);
  
  const handleTest = () => {
    if (!codeProject) {
      alert('No project analyzed');
      return;
    }
    
    setTesting(true);
    setReport(null);
    
    try {
      console.log('🧪 Testing existing analysis results (no re-analysis)...');
      console.time('⚡ Test completed in');
      
      // Testear resultados existentes (INSTANTÁNEO - no vuelve a analizar)
      const testReport = testExistingAnalysis(codeProject, BUILDERBOT_EXPECTATIONS);
      
      console.timeEnd('⚡ Test completed in');
      
      setReport(testReport);
      setShowReport(true);
      
      // También loguear en consola
      console.log('📊 Test Report:', testReport);
      
    } catch (error) {
      console.error('❌ Test failed:', error);
      alert(`Test failed: ${error}`);
    } finally {
      setTesting(false);
    }
  };
  
  const handleDownloadReport = () => {
    if (!report) return;
    
    const markdown = exportReportAsMarkdown(report);
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `test-report-${projectName || 'project'}-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };
  
  if (!codeProject) {
    return null;
  }
  
  return (
    <div className="mt-4">
      <button
        onClick={handleTest}
        disabled={testing}
        className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
      >
        {testing ? (
          <>
            <span className="animate-spin">⚙️</span>
            Running Tests...
          </>
        ) : (
          <>
            🧪 Test Analysis
          </>
        )}
      </button>
      
      {report && showReport && (
        <div className="mt-4 bg-slate-900 border border-slate-700 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              🧪 Test Report
            </h3>
            <div className="flex items-center gap-3">
              <span className={`text-2xl font-bold ${
                report.overallScore >= 90 ? 'text-green-400' :
                report.overallScore >= 75 ? 'text-yellow-400' :
                'text-red-400'
              }`}>
                {report.overallScore}/100
              </span>
              <button
                onClick={() => setShowReport(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>
          </div>
          
          <div className="space-y-3">
            {/* Agents */}
            <div className={`p-3 rounded-lg ${
              report.sections.agents.passed ? 'bg-green-900/20 border border-green-700' : 'bg-red-900/20 border border-red-700'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-white">🤖 Agents</span>
                <span className={`font-bold ${
                  report.sections.agents.passed ? 'text-green-400' : 'text-red-400'
                }`}>
                  {report.sections.agents.score}/100
                </span>
              </div>
              {report.sections.agents.issues.length > 0 && (
                <div className="mt-2 space-y-1">
                  {report.sections.agents.issues.map((issue: string, idx: number) => (
                    <p key={idx} className="text-sm text-red-300">❌ {issue}</p>
                  ))}
                </div>
              )}
            </div>
            
            {/* Wrappers */}
            <div className={`p-3 rounded-lg ${
              report.sections.wrappers.passed ? 'bg-green-900/20 border border-green-700' : 'bg-red-900/20 border border-red-700'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-white">🗄️ Database Wrappers</span>
                <span className={`font-bold ${
                  report.sections.wrappers.passed ? 'text-green-400' : 'text-red-400'
                }`}>
                  {report.sections.wrappers.score}/100
                </span>
              </div>
              {report.sections.wrappers.issues.length > 0 && (
                <div className="mt-2 space-y-1">
                  {report.sections.wrappers.issues.map((issue: string, idx: number) => (
                    <p key={idx} className="text-sm text-red-300">❌ {issue}</p>
                  ))}
                </div>
              )}
            </div>
            
            {/* Data Flows */}
            <div className={`p-3 rounded-lg ${
              report.sections.dataFlows.passed ? 'bg-green-900/20 border border-green-700' : 'bg-red-900/20 border border-red-700'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-white">🔗 Data Flows</span>
                <span className={`font-bold ${
                  report.sections.dataFlows.passed ? 'text-green-400' : 'text-red-400'
                }`}>
                  {report.sections.dataFlows.score}/100
                </span>
              </div>
              {report.sections.dataFlows.issues.length > 0 && (
                <div className="mt-2 space-y-1">
                  {report.sections.dataFlows.issues.map((issue: string, idx: number) => (
                    <p key={idx} className="text-sm text-red-300">❌ {issue}</p>
                  ))}
                </div>
              )}
            </div>
            
            {/* Tables */}
            <div className={`p-3 rounded-lg ${
              report.sections.tables.passed ? 'bg-green-900/20 border border-green-700' : 'bg-red-900/20 border border-red-700'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-white">📊 Tables</span>
                <span className={`font-bold ${
                  report.sections.tables.passed ? 'text-green-400' : 'text-red-400'
                }`}>
                  {report.sections.tables.score}/100
                </span>
              </div>
              {report.sections.tables.issues.length > 0 && (
                <div className="mt-2 space-y-1">
                  {report.sections.tables.issues.map((issue: string, idx: number) => (
                    <p key={idx} className="text-sm text-red-300">❌ {issue}</p>
                  ))}
                </div>
              )}
            </div>
          </div>
          
          {/* Recommendations */}
          {report.recommendations.length > 0 && (
            <div className="mt-4 p-3 bg-blue-900/20 border border-blue-700 rounded-lg">
              <p className="font-medium text-blue-300 mb-2">💡 Recommendations:</p>
              <ul className="space-y-1">
                {report.recommendations.map((rec: string, idx: number) => (
                  <li key={idx} className="text-sm text-blue-200">• {rec}</li>
                ))}
              </ul>
            </div>
          )}
          
          <div className="mt-4 flex gap-2">
            <button
              onClick={handleDownloadReport}
              className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded transition-colors"
            >
              📥 Download Report
            </button>
            <button
              onClick={() => console.log('Full Report:', report)}
              className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded transition-colors"
            >
              📋 Log to Console
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

