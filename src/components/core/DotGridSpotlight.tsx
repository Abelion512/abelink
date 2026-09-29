import { useEffect, useRef, useState } from 'react';

function parseRgba(color) {
  const m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/.exec(color);
  if (!m) return null;
  return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: m[4] === undefined ? 1 : Number(m[4]) };
}

export function DotGridSpotlight({
  dotColor = 'rgba(255,255,255,0.05)',
  activeDotColor = 'rgba(10,132,255,0.12)',
  spacing = 12,
  baseRadius = 1,
  activeRadius = 2,
  interactionRadius = 128,
  activeMaxAlpha = 1.0,
  activeMinAlpha = 0.5,
  className = '',
}) {
  const canvasRef = useRef(null);
  const mouseRef = useRef({ x: -9999, y: -9999, active: false });
  const rafRef = useRef(0);
  const propsRef = useRef({ dotColor, activeDotColor, spacing, baseRadius, activeRadius, interactionRadius, activeMaxAlpha, activeMinAlpha });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    propsRef.current = { dotColor, activeDotColor, spacing, baseRadius, activeRadius, interactionRadius, activeMaxAlpha, activeMinAlpha };
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    const parent = canvas.parentElement || canvas;

    const draw = () => {
      rafRef.current = 0;
      if (document.hidden) return;
      const p = propsRef.current;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (!w || !h) return;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const mouse = mouseRef.current;
      const active = parseRgba(p.activeDotColor);
      const ar = active || { r: 10, g: 132, b: 255, a: 0.12 };
      const ir2 = p.interactionRadius * p.interactionRadius;
      for (let y = p.spacing / 2; y < h; y += p.spacing) {
        for (let x = p.spacing / 2; x < w; x += p.spacing) {
          if (mouse.active) {
            const dx = x - mouse.x;
            const dy = y - mouse.y;
            const d2 = dx * dx + dy * dy;
            if (d2 < ir2) {
              const t = 1 - Math.sqrt(d2) / p.interactionRadius;
              const alpha = p.activeMinAlpha + (p.activeMaxAlpha - p.activeMinAlpha) * t;
              const radius = p.baseRadius + (p.activeRadius - p.baseRadius) * t;
              ctx.beginPath();
              ctx.arc(x, y, radius, 0, Math.PI * 2);
              ctx.fillStyle = `rgba(${ar.r},${ar.g},${ar.b},${(ar.a * alpha).toFixed(3)})`;
              ctx.fill();
              continue;
            }
          }
          ctx.beginPath();
          ctx.arc(x, y, p.baseRadius, 0, Math.PI * 2);
          ctx.fillStyle = p.dotColor;
          ctx.fill();
        }
      }
      setReady(true);
    };

    const schedule = () => {
      if (document.hidden) return;
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(draw);
    };

    const onMouseMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top, active: true };
      schedule();
    };
    const onMouseLeave = () => {
      mouseRef.current = { x: -9999, y: -9999, active: false };
      schedule();
    };
    const onVisibility = () => {
      if (document.hidden) {
        if (rafRef.current) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = 0;
        }
      } else {
        schedule();
      }
    };

    const observer = new ResizeObserver(schedule);
    observer.observe(parent);

    parent.addEventListener('mousemove', onMouseMove);
    parent.addEventListener('mouseleave', onMouseLeave);
    document.addEventListener('visibilitychange', onVisibility);
    schedule();

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      observer.disconnect();
      parent.removeEventListener('mousemove', onMouseMove);
      parent.removeEventListener('mouseleave', onMouseLeave);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`absolute inset-0 h-full w-full transition-opacity duration-700 ${ready ? 'opacity-100' : 'opacity-0'}${className ? ` ${className}` : ''}`}
    />
  );
}
