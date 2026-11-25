import type { CSSProperties, ReactNode } from 'react';

interface AnimatedContentProps {
  children: ReactNode;
  index?: number;
  delay?: number;
  distance?: number;
  duration?: number;
  className?: string;
  style?: CSSProperties;
}

export default function AnimatedContent({
  children,
  index = 0,
  delay,
  distance = 10,
  duration = 240,
  className = '',
  style = {},
}: AnimatedContentProps) {
  // Staggered by 25ms per item, capped at 250ms total
  const calculatedDelay = delay !== undefined ? delay : Math.min(index * 25, 250);

  return (
    <div
      className={`animate-content-enter ${className}`}
      style={{
        animationDuration: `${duration}ms`,
        animationDelay: `${calculatedDelay}ms`,
        animationFillMode: 'both',
        '--enter-distance': `${distance}px`,
        ...style,
      } as CSSProperties}
    >
      {children}
    </div>
  );
}
