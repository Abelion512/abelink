import { useEffect, useState } from 'react';
import Swal from 'sweetalert2';

const StatusIndicator = ({ notifications }) => {
  const [activeToasts, setActiveToasts] = useState([]);

  useEffect(() => {
    if (notifications && notifications.length > 0) {
      const newNotifs = notifications.filter(n => !activeToasts.find(t => t.id === n.id));
      if (newNotifs.length > 0) {
        setActiveToasts(prev => [...prev, ...newNotifs]);
        
        newNotifs.forEach(notif => {
          let iconType = 'info';
          
          if (notif.type.includes('memory') || notif.type === 'plugin-done' || notif.type === 'success') {
            iconType = 'success';
          } else if (notif.type === 'plugin-executing') {
            iconType = 'warning';
          } else if (notif.type === 'error') {
            iconType = 'error';
          } else if (notif.type === 'web-searching') {
            iconType = 'info';
          }

          Swal.fire({
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 3000,
            timerProgressBar: true,
            icon: iconType,
            title: notif.message,
            background: 'oklch(var(--b2))',
            color: 'oklch(var(--bc))',
            didOpen: (toast) => {
              toast.addEventListener('mouseenter', Swal.stopTimer)
              toast.addEventListener('mouseleave', Swal.resumeTimer)
            }
          });
          
          setTimeout(() => {
            setActiveToasts(prev => prev.filter(t => t.id !== notif.id));
          }, 3000);
        });
      }
    }
  }, [notifications]);

  return null;
};

export default StatusIndicator;
