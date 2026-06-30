import React, { useEffect, useState } from 'react';
import { FaBrain, FaExclamationTriangle, FaCheckCircle, FaBolt, FaSearch } from 'react-icons/fa';

const StatusIndicator = ({ notifications }) => {
  const [activeToasts, setActiveToasts] = useState([]);

  useEffect(() => {
    if (notifications && notifications.length > 0) {
      const newNotifs = notifications.filter(n => !activeToasts.find(t => t.id === n.id));
      if (newNotifs.length > 0) {
        setActiveToasts(prev => [...prev, ...newNotifs]);
        
        newNotifs.forEach(notif => {
          setTimeout(() => {
            setActiveToasts(prev => prev.filter(t => t.id !== notif.id));
          }, 3000);
        });
      }
    }
  }, [notifications]);

  if (activeToasts.length === 0) return null;

  return (
    <div className="fixed top-8 right-8 z-50 flex flex-col gap-3 items-end pointer-events-none">
      {activeToasts.map(toast => {
        let icon = null;
        let colorClass = '';

        if (toast.type.includes('memory')) {
          icon = <FaBrain />;
          colorClass = 'text-success border-success/30 bg-success/10';
        } else if (toast.type === 'plugin-executing') {
          icon = <FaBolt />;
          colorClass = 'text-warning border-warning/30 bg-warning/10';
        } else if (toast.type === 'plugin-done') {
          icon = <FaCheckCircle />;
          colorClass = 'text-primary border-primary/30 bg-primary/10';
        } else if (toast.type === 'error') {
          icon = <FaExclamationTriangle />;
          colorClass = 'text-error border-error/30 bg-error/10';
        } else if (toast.type === 'web-searching') {
          icon = <FaSearch />;
          colorClass = 'text-info border-info/30 bg-info/10';
        }

        return (
          <div 
            key={toast.id}
            className={`flex items-center gap-3 backdrop-blur-md px-4 py-3 rounded-2xl border ${colorClass} shadow-[0_8px_32px_rgba(0,0,0,0.3)] animate-[toast-slide-in_0.3s_ease-out_forwards]`}
          >
            <div className={`text-xl drop-shadow-[0_0_8px_currentColor]`}>
              {icon}
            </div>
            <p className="text-sm font-semibold tracking-wide text-white/90">{toast.message}</p>
          </div>
        );
      })}
    </div>
  );
};

export default StatusIndicator;
