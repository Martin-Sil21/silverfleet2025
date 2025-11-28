import React from 'react';
import Loader from './Loader';
import { useTranslation } from '../hooks/useTranslation';

interface AuditProgressProps {
  message: string;
  totalCases: number;
  completedCases: number;
  onCancel: () => void;
}

const AuditProgress: React.FC<AuditProgressProps> = ({ message, totalCases, completedCases, onCancel }) => {
  const { t } = useTranslation();
  const progressPercentage = totalCases > 0 ? (completedCases / totalCases) * 100 : 0;

  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-900 p-4 text-center">
      <Loader />
      <h2 className="text-lg font-bold text-gray-800 dark:text-white mt-6 mb-2">{t('auditInProgress')}</h2>
      <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-md">{message}</p>
      
      <div className="w-full max-w-md">
        <div className="flex justify-between items-center mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">
          <span>{t('progress')}</span>
          <span>{completedCases} / {totalCases}</span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
          <div 
            className="bg-primary-600 h-2.5 rounded-full transition-all duration-500" 
            style={{ width: `${progressPercentage}%` }}
          ></div>
        </div>
      </div>
      
      <button 
        onClick={onCancel} 
        className="mt-8 px-6 py-2 bg-gray-600 text-white font-semibold rounded-lg shadow-md hover:bg-gray-700 transition-colors"
      >
        {t('cancelAudit')}
      </button>
    </div>
  );
};

export default AuditProgress;
