import { useEffect, useRef } from 'react';

interface DotGridProps {
  dotSize?: number;
  gap?: number;
  className?: string;
  glowColor?: string;
}

export default function DotGrid({
  dotSize = 1.5,
  gap = 24,
  className = '',
  glowColor,
}: DotGridProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mouseRef = useRef<{ x: number; y: number; active: boolean }>({ x: -1000, y: -1000, active: false });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = 0;
    let height = 0;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const handleResize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      width = rect.width;
      height = rect.height;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.scale(dpr, dpr);
      draw();
    };

    const isDarkMode = () =>
      document.documentElement.classList.contains('dark');

    const draw = () => {
      ctx.clearRect(0, 0, width, height);

      const dark = isDarkMode();
      const baseDotColor = dark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.07)';
      const activeDotColor = dark ? 'rgba(52, 211, 153, 0.55)' : 'rgba(5, 150, 105, 0.55)';
      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;
      const hasMouse = mouseRef.current.active;
      const hoverRadius = 140;

      const cols = Math.floor(width / gap);
      const rows = Math.floor(height / gap);
      const startX = (width - cols * gap) / 2;
      const startY = (height - rows * gap) / 2;

      for (let i = 0; i <= cols; i++) {
        for (let j = 0; j <= rows; j++) {
          const x = startX + i * gap;
          const y = startY + j * gap;

          let r = dotSize;
          let color = baseDotColor;

          if (hasMouse && !prefersReducedMotion) {
            const dx = mx - x;
            const dy = my - y;
            const dist = Math.hypot(dx, dy);

            if (dist < hoverRadius) {
              const factor = 1 - dist / hoverRadius;
              r = dotSize + factor * 1.8;
              color = activeDotColor;
            }
          }

          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();
        }
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        active: true,
      };
      if (!prefersReducedMotion) {
        draw();
      }
    };

    const handleMouseLeave = () => {
      mouseRef.current.active = false;
      draw();
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    const parent = canvas.parentElement;
    if (parent) {
      parent.addEventListener('mousemove', handleMouseMove);
      parent.addEventListener('mouseleave', handleMouseLeave);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      if (parent) {
        parent.removeEventListener('mousemove', handleMouseMove);
        parent.removeEventListener('mouseleave', handleMouseLeave);
      }
      cancelAnimationFrame(animationFrameId);
    };
  }, [dotSize, gap]);

  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      {/* Soft emerald radial atmospheric background glow */}
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full blur-3xl opacity-40 dark:opacity-25"
        style={{
          background: glowColor || 'radial-gradient(circle, rgba(16, 185, 129, 0.22) 0%, rgba(5, 150, 105, 0.08) 45%, transparent 70%)',
        }}
      />
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}
