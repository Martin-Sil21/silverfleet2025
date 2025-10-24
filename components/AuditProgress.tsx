

import React from 'react';
import Loader from './Loader';
import Card from './Card';

interface AuditProgressProps {
  message: string;
  title: string;
}

const AuditProgress: React.FC<AuditProgressProps> = ({ message, title }) => {
  return (
    <Card>
      <div className="flex flex-col items-center justify-center p-8 space-y-6">
        <Loader />
        <h2 className="text-xl font-semibold text-gray-800 dark:text-white">{title}</h2>
        <p className="text-gray-600 dark:text-gray-400 text-center">{message}</p>
      </div>
    </Card>
  );
};

export default AuditProgress;