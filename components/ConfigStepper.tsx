/**
 * 🎯 ConfigStepper - Indicador visual de progreso paso a paso
 */

import React from 'react';
import { CheckCircleIcon } from './icons/CheckCircleIcon';

export type StepStatus = 'completed' | 'current' | 'pending' | 'skipped';

export interface Step {
  id: number;
  title: string;
  description?: string;
  status: StepStatus;
  optional?: boolean;
}

interface ConfigStepperProps {
  steps: Step[];
  onStepClick?: (stepId: number) => void;
}

const ConfigStepper: React.FC<ConfigStepperProps> = ({ steps, onStepClick }) => {
  const getStepColor = (status: StepStatus) => {
    switch (status) {
      case 'completed':
        return 'bg-green-500 text-white border-green-500';
      case 'current':
        return 'bg-primary-500 text-white border-primary-500';
      case 'skipped':
        return 'bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-600';
      case 'pending':
      default:
        return 'bg-white dark:bg-gray-800 text-gray-400 dark:text-gray-500 border-gray-300 dark:border-gray-600';
    }
  };

  const getConnectorColor = (prevStatus: StepStatus) => {
    if (prevStatus === 'completed') {
      return 'bg-green-500';
    }
    return 'bg-gray-300 dark:bg-gray-700';
  };

  return (
    <div className="w-full">
      <div className="flex items-center justify-between">
        {steps.map((step, index) => (
          <React.Fragment key={step.id}>
            {/* Step Circle */}
            <div className="flex flex-col items-center flex-shrink-0">
              <button
                onClick={() => onStepClick?.(step.id)}
                disabled={step.status === 'pending'}
                className={`
                  w-12 h-12 rounded-full border-2 flex items-center justify-center
                  font-semibold text-sm transition-all duration-200
                  ${getStepColor(step.status)}
                  ${step.status === 'completed' ? 'hover:scale-110' : ''}
                  ${step.status === 'pending' ? 'cursor-not-allowed' : 'cursor-pointer'}
                  relative z-10
                `}
              >
                {step.status === 'completed' ? (
                  <CheckCircleIcon className="w-6 h-6" />
                ) : step.status === 'skipped' ? (
                  <span className="text-xs">⊘</span>
                ) : (
                  step.id
                )}
              </button>
              
              {/* Step Label */}
              <div className="mt-2 text-center max-w-[120px]">
                <p className={`
                  text-xs font-medium
                  ${step.status === 'current' ? 'text-primary-600 dark:text-primary-400' : ''}
                  ${step.status === 'completed' ? 'text-green-600 dark:text-green-400' : ''}
                  ${step.status === 'pending' ? 'text-gray-500 dark:text-gray-500' : ''}
                  ${step.status === 'skipped' ? 'text-gray-400 dark:text-gray-600' : ''}
                `}>
                  {step.title}
                  {step.optional && (
                    <span className="ml-1 text-[10px] opacity-60">(opcional)</span>
                  )}
                </p>
                {step.description && step.status === 'current' && (
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                    {step.description}
                  </p>
                )}
              </div>
            </div>

            {/* Connector Line */}
            {index < steps.length - 1 && (
              <div className={`
                flex-1 h-0.5 mx-2 transition-colors duration-300
                ${getConnectorColor(step.status)}
              `} />
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

export default ConfigStepper;
