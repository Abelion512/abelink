import React from 'react';

// Shared holographic chrome: glass container + animated border flow +
// HUD brackets + scanlines. Used by HoloCard and DraggableHoloCard.
export const HoloChrome = ({ children, className = '', style }) => (
  <div
    className={`relative overflow-hidden rounded-sm bg-[var(--glass-bg)] backdrop-blur-md border border-[var(--glass-border)] ${className}`}
    style={style}
  >
    {/* Animated Border Flow (Top & Bottom) */}
    <div className="absolute top-0 left-0 right-0 h-[1px] bg-[var(--color-holo-border)] bg-[length:200%_auto] animate-[holo-border-flow_3s_linear_infinite]" />
    <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-[var(--color-holo-border)] bg-[length:200%_auto] animate-[holo-border-flow_3s_linear_infinite] rotate-180" />

    {/* HUD Brackets */}
    <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-white/30 pointer-events-none" />
    <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-white/30 pointer-events-none" />
    <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-white/30 pointer-events-none" />
    <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-white/30 pointer-events-none" />

    {/* Scan lines effect */}
    <div className="absolute inset-0 pointer-events-none opacity-[0.03] bg-[repeating-linear-gradient(transparent,transparent_2px,oklch(var(--p))_3px,transparent_4px)] mix-blend-screen" />

    {children}
  </div>
)

export default HoloChrome
