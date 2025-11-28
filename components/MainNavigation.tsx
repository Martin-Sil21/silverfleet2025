/**
 * 🧭 MainNavigation - Navegación horizontal tipo tabs
 * Permite acceso directo a Nueva Auditoría, Historial y Credenciales
 */

import React from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { PlusCircleIcon } from './icons/PlusCircleIcon';
import { ClockIcon } from './icons/ClockIcon.tsx';
import { KeyIcon } from './icons/KeyIcon.tsx';

export type NavigationTab = 'new-audit' | 'history' | 'credentials';

interface MainNavigationProps {
  activeTab: NavigationTab;
  onTabChange: (tab: NavigationTab) => void;
  historyCount?: number;
  credentialsCount?: number;
}

const MainNavigation: React.FC<MainNavigationProps> = ({ 
  activeTab, 
  onTabChange,
  historyCount = 0,
  credentialsCount = 0
}) => {
  const { t } = useTranslation();

  const tabs = [
    {
      id: 'new-audit' as NavigationTab,
      label: t('newAudit') || 'Nueva Auditoría',
      icon: PlusCircleIcon,
      badge: null,
    },
    {
      id: 'history' as NavigationTab,
      label: t('auditHistoryTitle') || 'Historial',
      icon: ClockIcon,
      badge: historyCount > 0 ? historyCount : null,
    },
    {
      id: 'credentials' as NavigationTab,
      label: t('credentialsManagement') || 'Credenciales',
      icon: KeyIcon,
      badge: credentialsCount > 0 ? credentialsCount : null,
    },
  ];

  return (
    <nav className="mb-8">
      <div className="border-b border-gray-200 dark:border-gray-700">
        <div className="flex space-x-1 overflow-x-auto scrollbar-thin">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`
                  relative flex items-center gap-2 px-6 py-4 font-medium text-sm
                  whitespace-nowrap transition-all duration-200
                  border-b-2 
                  ${isActive 
                    ? 'border-primary-500 text-primary-600 dark:text-primary-400 bg-primary-50/50 dark:bg-primary-900/20' 
                    : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                  }
                `}
              >
                <Icon className="w-5 h-5" />
                <span>{tab.label}</span>
                {tab.badge !== null && (
                  <span className={`
                    ml-1 px-2 py-0.5 rounded-full text-xs font-semibold
                    ${isActive 
                      ? 'bg-primary-500 text-white' 
                      : 'bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300'
                    }
                  `}>
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
};

export default MainNavigation;
