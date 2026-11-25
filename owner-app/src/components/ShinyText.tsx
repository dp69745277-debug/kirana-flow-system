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

interface BlurTextProps {
  text: string;
  className?: string;
  delay?: number;
}

export function BlurText({ text, className = '', delay = 40 }: BlurTextProps) {
  const words = text.split(' ');

  return (
    <span className={`inline-flex flex-wrap gap-x-1.5 ${className}`}>
      {words.map((word, i) => (
        <span
          key={i}
          className="inline-block animate-blur-word-in"
          style={{
            animationDelay: `${i * delay}ms`,
            animationFillMode: 'both',
          }}
        >
          {word}
        </span>
      ))}
    </span>
  );
}

export default ShinyText;
