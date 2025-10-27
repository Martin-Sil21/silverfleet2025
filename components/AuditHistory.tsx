import React, { useState, useEffect } from 'react';
import type { HistoricalAudit } from '../types';
import Card from './Card';
import { useTranslation } from '../hooks/useTranslation';
import * as historyService from '../services/historyService';
import { TrashIcon } from './icons/TrashIcon';
import { EyeIcon } from './icons/EyeIcon';

interface AuditHistoryProps {
    onViewReport: (item: HistoricalAudit) => void;
}

const AuditHistory: React.FC<AuditHistoryProps> = ({ onViewReport }) => {
    const { t } = useTranslation();
    const [history, setHistory] = useState<HistoricalAudit[]>([]);

    useEffect(() => {
        setHistory(historyService.getAudits());
    }, []);

    const handleDelete = (id: string) => {
        if (window.confirm(t('confirmDelete'))) {
            const updatedHistory = historyService.deleteAudit(id);
            setHistory(updatedHistory);
        }
    };
    
    return (
        <Card>
            <h3 className="text-xl font-semibold text-gray-800 dark:text-white mb-2">{t('auditHistoryTitle')}</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{t('auditHistoryDescription')}</p>
            <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                {history.length === 0 ? (
                    <p className="text-center text-gray-500 dark:text-gray-400 py-4">{t('noHistory')}</p>
                ) : (
                    history.map(item => (
                        <div key={item.id} className="p-3 bg-gray-100 dark:bg-gray-700/50 rounded-lg flex items-center justify-between gap-2">
                            <div>
                                <p className="font-semibold text-gray-800 dark:text-white">{new Date(item.timestamp).toLocaleString()}</p>
                                <p className="text-sm text-gray-600 dark:text-gray-400">Score: {item.overallScore.toFixed(1)} | {item.results.length} cases</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button onClick={() => onViewReport(item)} title={t('viewReport')} className="p-2 rounded-full hover:bg-primary-100 dark:hover:bg-primary-900 text-primary-600 dark:text-primary-300">
                                    <EyeIcon className="w-5 h-5"/>
                                </button>
                                <button onClick={() => handleDelete(item.id)} title={t('delete')} className="p-2 rounded-full hover:bg-red-100 dark:hover:bg-red-900 text-red-600 dark:text-red-400">
                                    <TrashIcon className="w-5 h-5"/>
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </Card>
    );
};

export default AuditHistory;
