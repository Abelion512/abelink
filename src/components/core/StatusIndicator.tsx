import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Info, TriangleAlert, XCircle } from 'lucide-react';

const StatusIndicator = ({ notifications }) => {
  const [activeToasts, setActiveToasts] = useState([]);
  // ID yang sudah dijadwalkan — ditulis di dalam efek (legal), dibaca untuk
  // dedup, jadi efek tidak perlu dep activeToasts (dep = loop karena efek
  // sendiri memanggil setActiveToasts).
  const seenIdsRef = useRef(new Set());

  useEffect(() => {
    if (notifications && notifications.length > 0) {
      const newNotifs = notifications.filter(n => !seenIdsRef.current.has(n.id));
      if (newNotifs.length > 0) {
        // Prepare toasts with types
        const enhancedNotifs = newNotifs.map(notif => {
          let alertType = 'alert-info';
          let Icon = Info;

          if (notif.type.includes('memory') || notif.type === 'plugin-done' || notif.type === 'success') {
            alertType = 'alert-info';
            Icon = CheckCircle2;
          } else if (notif.type === 'plugin-executing') {
            alertType = 'alert-warning';
            Icon = TriangleAlert;
          } else if (notif.type === 'error') {
            alertType = 'alert-error';
            Icon = XCircle;
          }

          return { ...notif, alertType, Icon };
        });

        for (const n of newNotifs) seenIdsRef.current.add(n.id)
        setActiveToasts((prev) => [...prev, ...enhancedNotifs]);

        enhancedNotifs.forEach(notif => {
          setTimeout(() => {
            seenIdsRef.current.delete(notif.id)
            setActiveToasts(prev => prev.filter(t => t.id !== notif.id));
          }, 3000);
        });
      }
    }
  }, [notifications]);

  if (activeToasts.length === 0) return null;

  return (
    <div className="toast toast-bottom toast-end z-50 p-4">
      {activeToasts.map(toast => (
        <div 
          key={toast.id} 
          className={`alert ${toast.alertType} shadow-lg rounded-xl flex items-center gap-3 animate-fade-in`}
        >
          <toast.Icon className="w-5 h-5" />
          <span className="text-sm font-medium pr-2">{toast.message}</span>
        </div>
      ))}
    </div>
  );
};

export default StatusIndicator;
