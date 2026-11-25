import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

interface Spark {
  x: number;
  y: number;
  angle: number;
  startTime: number;
}

export function triggerClickSpark(e: React.MouseEvent | MouseEvent, color: string = '#10b981') {
  const x = e.clientX;
  const y = e.clientY;

  const canvas = document.createElement('canvas');
  canvas.style.position = 'fixed';
  canvas.style.left = '0';
  canvas.style.top = '0';
  canvas.style.width = '100vw';
  canvas.style.height = '100vh';
  canvas.style.pointerEvents = 'none';
  canvas.style.zIndex = '99999';

  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;

  document.body.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    document.body.removeChild(canvas);
    return;
  }
  ctx.scale(dpr, dpr);

  const sparkCount = 8;
  const sparkLength = 12;
  const sparkDistance = 26;
  const duration = 360;
  const startTime = performance.now();

  const sparks: Spark[] = Array.from({ length: sparkCount }, (_, i) => ({
    x,
    y,
    angle: (2 * Math.PI * i) / sparkCount + (Math.random() * 0.2 - 0.1),
    startTime,
  }));

  const animate = (currentTime: number) => {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    // Ease out: 1 - (1 - progress)^3
    const ease = 1 - Math.pow(1 - progress, 3);

    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

    sparks.forEach((spark) => {
      const distance = ease * sparkDistance;
      const currentX = spark.x + distance * Math.cos(spark.angle);
      const currentY = spark.y + distance * Math.sin(spark.angle);

      const tailDistance = Math.max(0, distance - sparkLength * (1 - progress));
      const tailX = spark.x + tailDistance * Math.cos(spark.angle);
      const tailY = spark.y + tailDistance * Math.sin(spark.angle);

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(tailX, tailY);
      ctx.lineTo(currentX, currentY);
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1, 2.5 * (1 - progress));
      ctx.lineCap = 'round';
      ctx.globalAlpha = 1 - progress;
      ctx.stroke();
      ctx.restore();
    });

    if (progress < 1) {
      requestAnimationFrame(animate);
    } else {
      if (canvas.parentNode) {
        canvas.parentNode.removeChild(canvas);
      }
    }
  };

  requestAnimationFrame(animate);
}

export default function ClickSpark({
  children,
  sparkColor = '#10b981',
  sparkCount = 8,
  className = '',
}: {
  children: ReactNode;
  sparkColor?: string;
  sparkCount?: number;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    triggerClickSpark(e, sparkColor);
  };

  return (
    <div ref={containerRef} onClick={handleClick} className={`inline-block ${className}`}>
      {children}
    </div>
  );
}
