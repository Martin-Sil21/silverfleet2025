import React, { useState, useMemo } from 'react';
import type { TraceEvent, WorkflowNode } from '../types';
import { useTranslation } from '../hooks/useTranslation';
import { PlayIcon } from './icons/PlayIcon';
import { ChevronLeftIcon } from './icons/ChevronLeftIcon';
import { ChevronRightIcon } from './icons/ChevronRightIcon';

const NodeIcon: React.FC<{ type: 'agent' | 'tool' }> = ({ type }) => {
  if (type === 'agent') {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.486 2 2 6.486 2 12s4.486 10 10 10 10-4.486 10-10S17.514 2 12 2zm0 18c-4.411 0-8-3.589-8-8s3.589-8 8-8 8 3.589 8 8-3.589 8-8 8z"></path>
        <path d="M12 8c-2.206 0-4 1.794-4 4s1.794 4 4 4 4-1.794 4-4-1.794-4-4-4zm0 6c-1.103 0-2-.897-2-2s.897-2 2-2 2 .897 2 2-.897 2-2 2z"></path>
      </svg>
    );
  }
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="m21.274 12.43 1.713-1.028a.5.5 0 0 0 0-.804l-1.713-1.028-1.293-.775V7.182l1.293-.775 1.713-1.028a.5.5 0 0 0 0-.804l-1.713-1.028-3.921-2.352a.5.5 0 0 0-.49 0l-3.921 2.352-1.713 1.028a.5.5 0 0 0 0 .804l1.713 1.028 1.293.775v1.613l-1.293.775-1.713 1.028a.5.5 0 0 0 0 .804l1.713 1.028 3.921 2.352a.5.5 0 0 0 .49 0l3.921-2.352zm-1.958 1.174-3.08 1.848-3.08-1.848-1.353-.812V9.592l1.353-.812 3.08-1.848 3.08 1.848 1.353.812v3.184l-1.353.812zM2.726 18.57 1 19.598a.5.5 0 0 0 0 .804l1.726 1.028 3.921 2.352a.5.5 0 0 0 .49 0l3.921-2.352 1.726-1.028a.5.5 0 0 0 0-.804L11.077 18.57l-1.293-.775v-1.613l1.293-.775 1.726-1.028a.5.5 0 0 0 0-.804L11.077 12.57l-3.921-2.352a.5.5 0 0 0-.49 0L2.746 12.57 1 13.598a.5.5 0 0 0 0 .804l1.726 1.028 1.293.775v1.613l-1.293.775zM8.836 21.43l-3.08-1.848-1.353-.812v-3.184l1.353-.812 3.08-1.848 3.08 1.848 1.353.812v3.184l-1.353.812-3.08 1.848z"></path>
    </svg>
  );
};


interface VisualTracePlayerProps {
  trace: TraceEvent[];
  workflow: WorkflowNode[];
}

const VisualTracePlayer: React.FC<VisualTracePlayerProps> = ({ trace, workflow }) => {
  const { t } = useTranslation();
  const [currentStep, setCurrentStep] = useState(0);

  const activeEvent = useMemo(() => trace[currentStep], [trace, currentStep]);

  const handleStepChange = (newStep: number) => {
    if (newStep >= 0 && newStep < trace.length) {
      setCurrentStep(newStep);
    }
  };
  
  const getNodeStatus = (nodeId: string) => {
    if (!activeEvent) return 'idle';
    if (activeEvent.nodeId !== nodeId) {
      const nodeEvents = trace.slice(0, currentStep + 1).filter(e => e.nodeId === nodeId);
      return nodeEvents.length > 0 ? 'completed' : 'idle';
    }
    return 'active';
  }

  return (
    <div className="mt-4 p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800/50">
      <div className="flex items-center space-x-2 overflow-x-auto pb-4">
        {workflow.map((node, index) => {
           const status = getNodeStatus(node.id);
           const statusClasses = {
                idle: 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600',
                active: 'bg-primary-100 dark:bg-primary-900/50 border-primary-500 ring-2 ring-primary-500',
                completed: 'bg-green-50 dark:bg-green-900/50 border-green-500'
           }[status];

          return (
            <React.Fragment key={node.id}>
              <div className={`flex-shrink-0 w-48 p-3 border rounded-lg shadow-sm transition-all ${statusClasses}`}>
                <div className="flex items-center gap-2 mb-1">
                    <div className="flex-shrink-0">
                        <NodeIcon type={node.type} />
                    </div>
                    <p className="font-semibold text-sm truncate">{node.name}</p>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">{node.type}</p>
              </div>
              {index < workflow.length - 1 && (
                <div className="w-8 h-px bg-gray-300 dark:bg-gray-600"></div>
              )}
            </React.Fragment>
          );
        })}
      </div>
      
      <div className="mt-4 p-4 bg-white dark:bg-gray-800 rounded-lg">
         <div className="mb-4">
            <label htmlFor="trace-slider" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('traceStep', { step: currentStep + 1, total: trace.length })}
                <span className="font-semibold text-primary-600 dark:text-primary-400 ml-2">
                    {activeEvent.eventType === 'INPUT' ? t('inputFor') : t('outputFrom')}: {activeEvent.nodeName}
                </span>
            </label>
             <input
              id="trace-slider"
              type="range"
              min="0"
              max={trace.length - 1}
              value={currentStep}
              onChange={(e) => handleStepChange(parseInt(e.target.value, 10))}
              className="w-full h-2 mt-1 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer"
            />
         </div>
         <div className="flex items-center justify-center gap-4 mb-4">
            <button onClick={() => handleStepChange(currentStep - 1)} disabled={currentStep === 0} className="p-2 rounded-full bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed">
                <ChevronLeftIcon className="w-5 h-5" />
            </button>
             <button onClick={() => handleStepChange(0)} className="p-2 rounded-full bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50">
                <PlayIcon className="w-5 h-5 transform rotate-180" />
            </button>
            <button onClick={() => handleStepChange(currentStep + 1)} disabled={currentStep === trace.length - 1} className="p-2 rounded-full bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed">
                <ChevronRightIcon className="w-5 h-5" />
            </button>
         </div>

         <div className="relative">
            <pre className="w-full max-h-60 overflow-y-auto p-3 bg-gray-900 text-white text-xs rounded-md whitespace-pre-wrap font-mono">
                {activeEvent.content}
            </pre>
         </div>
      </div>
    </div>
  );
};

export default VisualTracePlayer;
