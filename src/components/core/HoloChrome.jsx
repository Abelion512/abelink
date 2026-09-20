import React from 'react';

// Apple HIG Frosted Glass Surface: translucent dark acrylic + hairline border + subtle specular highlight.
export const HoloChrome = ({ children, className = '', style }) => (
  <div
    className={`relative overflow-hidden rounded-2xl bg-[#161618]/90 backdrop-blur-xl border border-white/[0.08] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08),0_12px_32px_-8px_rgba(0,0,0,0.6)] transition-all duration-200 ${className}`}
    style={style}
  >
    {children}
  </div>
);

export default HoloChrome;
