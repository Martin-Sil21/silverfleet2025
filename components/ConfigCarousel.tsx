/**
 * 🎠 ConfigCarousel - Navegación tipo slides/carousel para configuración
 * 
 * Muestra un paso a la vez en formato slide con transiciones suaves
 */

import React, { useState } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { ChevronLeftIcon } from './icons/ChevronLeftIcon';
import { ChevronRightIcon } from './icons/ChevronRightIcon';

interface ConfigCarouselProps {
  currentStep: number;
  totalSteps: number;
  onPrevious: () => void;
  onNext: () => void;
  onStepClick?: (step: number) => void;
  children: React.ReactNode;
  canGoNext?: boolean;
  canGoPrevious?: boolean;
  stepTitles?: string[];
  stepStatuses?: ('completed' | 'current' | 'pending')[];
}

const ConfigCarousel: React.FC<ConfigCarouselProps> = ({
  currentStep,
  totalSteps,
  onPrevious,
  onNext,
  onStepClick,
  children,
  canGoNext = true,
  canGoPrevious = true,
  stepTitles = [],
  stepStatuses = []
}) => {
  const { t } = useTranslation();

  return (
    <div className="relative w-full max-w-6xl mx-auto">
      {/* Indicadores de paso superiores */}
      <div className="flex items-center justify-center gap-2 mb-8">
        {Array.from({ length: totalSteps }, (_, i) => i + 1).map((step) => {
          const status = stepStatuses[step - 1] || 'pending';
          const isCurrent = step === currentStep;
          
          return (
            <button
              key={step}
              onClick={() => onStepClick?.(step)}
              disabled={status === 'pending'}
              className={`
                group relative transition-all duration-300
                ${isCurrent ? 'scale-110' : 'scale-100 hover:scale-105'}
              `}
            >
              {/* Círculo del paso */}
              <div className={`
                w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm
                transition-all duration-300
                ${status === 'completed' ? 'bg-green-500 text-white' : ''}
                ${status === 'current' ? 'bg-primary-500 text-white ring-4 ring-primary-200 dark:ring-primary-800' : ''}
                ${status === 'pending' ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500' : ''}
              `}>
                {status === 'completed' ? '✓' : step}
              </div>
              
              {/* Tooltip con título */}
              {stepTitles[step - 1] && (
                <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="text-xs text-gray-600 dark:text-gray-400 font-medium">
                    {stepTitles[step - 1]}
                  </span>
                </div>
              )}
              
              {/* Línea conectora */}
              {step < totalSteps && (
                <div className={`
                  absolute top-1/2 -right-6 w-8 h-0.5 -translate-y-1/2
                  transition-colors duration-300
                  ${status === 'completed' ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}
                `} />
              )}
            </button>
          );
        })}
      </div>

      {/* Contenedor del slide con animación */}
      <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-xl overflow-hidden">
        {/* Contenido del paso actual */}
        <div className="min-h-[500px] p-8">
          {children}
        </div>

        {/* Navegación inferior */}
        <div className="flex items-center justify-between p-6 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700">
          {/* Botón Anterior */}
          <button
            onClick={onPrevious}
            disabled={!canGoPrevious || currentStep === 1}
            className={`
              flex items-center gap-2 px-6 py-3 rounded-lg font-medium
              transition-all duration-200
              ${canGoPrevious && currentStep > 1
                ? 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-600 cursor-not-allowed'
              }
            `}
          >
            <ChevronLeftIcon className="w-5 h-5" />
            <span>{t('previous') || 'Anterior'}</span>
          </button>

          {/* Indicador de paso */}
          <div className="text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Paso {currentStep} de {totalSteps}
            </p>
          </div>

          {/* Botón Siguiente */}
          <button
            onClick={onNext}
            disabled={!canGoNext}
            className={`
              flex items-center gap-2 px-6 py-3 rounded-lg font-medium
              transition-all duration-200
              ${canGoNext
                ? 'bg-primary-600 text-white hover:bg-primary-700 shadow-lg hover:shadow-xl'
                : 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-500 cursor-not-allowed'
              }
            `}
          >
            <span>{currentStep === totalSteps ? (t('finish') || 'Finalizar') : (t('next') || 'Siguiente')}</span>
            <ChevronRightIcon className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Navegación con teclado (opcional) */}
      <div className="mt-4 text-center">
        <p className="text-xs text-gray-400 dark:text-gray-600">
          💡 Usa las teclas ← → para navegar entre pasos
        </p>
      </div>
    </div>
  );
};

export default ConfigCarousel;
