import React, { useState, useEffect } from 'react';
import type { HistoricalAudit } from '../types';
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
        <div>
            <div className="space-y-3">
                {history.length === 0 ? (
                    <div className="text-center py-12">
                        <div className="text-6xl mb-4 opacity-50">📭</div>
                        <p className="text-gray-500 dark:text-gray-400">{t('noHistory')}</p>
                    </div>
                ) : (
                    history.map(item => (
                        <div key={item.id} className="p-4 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-700/50 dark:to-gray-800/50 rounded-lg flex items-center justify-between gap-3 hover:shadow-md transition-all border border-gray-200 dark:border-gray-600">
                            <div className="flex-1">
                                <p className="font-semibold text-gray-800 dark:text-white flex items-center gap-2">
                                    <span className="text-lg">🕐</span>
                                    {new Date(item.timestamp).toLocaleString()}
                                </p>
                                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                                    Score: <span className="font-bold text-primary-600 dark:text-primary-400">{item.overallScore.toFixed(1)}</span> | 
                                    <span className="ml-2">{item.results.length} casos de prueba</span>
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button 
                                    onClick={() => onViewReport(item)} 
                                    title={t('viewReport')} 
                                    className="p-2.5 rounded-lg bg-primary-500 hover:bg-primary-600 text-white transition-colors"
                                >
                                    <EyeIcon className="w-5 h-5"/>
                                </button>
                                <button 
                                    onClick={() => handleDelete(item.id)} 
                                    title={t('delete')} 
                                    className="p-2.5 rounded-lg bg-red-500 hover:bg-red-600 text-white transition-colors"
                                >
                                    <TrashIcon className="w-5 h-5"/>
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default AuditHistory;
