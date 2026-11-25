import React from 'react';

interface ShinyTextProps {
  children: React.ReactNode;
  className?: string;
  speed?: number;
}

export function ShinyText({ children, className = '', speed = 4 }: ShinyTextProps) {
  return (
    <span
      className={`inline-block font-extrabold bg-clip-text text-transparent bg-[length:250%_100%] animate-shine ${className}`}
      style={{
        backgroundImage:
          'linear-gradient(110deg, #059669 0%, #10b981 25%, #6ee7b7 45%, #ffffff 50%, #6ee7b7 55%, #10b981 75%, #059669 100%)',
        animationDuration: `${speed}s`,
      }}
    >
      {children}
    </span>
  );
}

export default ShinyText;
