import React from 'react';

const OrbVisualizer = ({ status = 'idle', intensity = 0 }) => {
  // status: 'idle' | 'thinking' | 'speaking' | 'listening' | 'error'
  
  let animationClass = '';
  let colorClass = '';
  let scaleStyle = {};
  
  switch (status) {
    case 'idle':
      animationClass = 'animate-[orb-breathe_4s_ease-in-out_infinite]';
      colorClass = 'from-primary to-success';
      break;
    case 'nudge':
      animationClass = 'animate-[orb-breathe_1s_ease-in-out_infinite] scale-105';
      colorClass = 'from-info to-primary';
      break;
    case 'thinking':
      animationClass = 'animate-[orb-think_3s_linear_infinite] scale-110';
      colorClass = 'from-primary to-success';
      break;
    case 'speaking':
      animationClass = ''; // Scale is handled by inline style based on intensity
      colorClass = 'from-success to-primary';
      scaleStyle = { transform: `scale(${1 + intensity * 0.3})` };
      break;
    case 'listening':
      animationClass = 'audio-pulse-ring';
      colorClass = 'from-primary to-success';
      break;
    case 'error':
      animationClass = 'animate-[orb-error_2s_ease-in-out_infinite]';
      colorClass = 'from-error to-error/50';
      break;
    default:
      animationClass = 'animate-[orb-breathe_4s_ease-in-out_infinite]';
      colorClass = 'from-primary to-success';
  }

  return (
    <div className="relative w-32 h-32 flex items-center justify-center my-8 transition-all duration-500">
      {/* Layer 3: Aura */}
      <div 
        className={`absolute inset-0 rounded-full bg-gradient-to-tr ${colorClass} blur-[60px] opacity-20 transition-all duration-200 ${animationClass}`}
        style={scaleStyle}
      />
      
      {/* Layer 2: Glow */}
      <div 
        className={`absolute inset-0 rounded-full bg-gradient-to-tr ${colorClass} blur-[30px] opacity-40 transition-all duration-200 ${animationClass}`}
        style={scaleStyle}
      />
      
      {/* Layer 1: Inti */}
      <div 
        className={`absolute inset-6 rounded-full bg-gradient-to-tr ${colorClass} shadow-[0_0_30px_oklch(var(--p)/0.15)] transition-all duration-200 ${animationClass}`}
        style={scaleStyle}
      />
    </div>
  );
};

export default OrbVisualizer;
