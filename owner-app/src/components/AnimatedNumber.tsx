import { useEffect, useRef, useState } from 'react';

interface AnimatedNumberProps {
  value: number | string;
  duration?: number;
  className?: string;
}

interface ParsedNumberInfo {
  num: number;
  prefix: string;
  decimals: number;
  isINR: boolean;
}

function parseValue(val: number | string): ParsedNumberInfo | null {
  if (typeof val === 'number') {
    if (isNaN(val)) return null;
    return {
      num: val,
      prefix: '',
      decimals: Number.isInteger(val) ? 0 : 2,
      isINR: false,
    };
  }

  const str = String(val).trim();
  const isINR = str.startsWith('₹');
  const hasPlus = str.startsWith('+');
  const hasMinus = str.startsWith('-');

  let prefix = '';
  if (isINR) prefix = '₹';
  else if (hasPlus) prefix = '+';
  else if (hasMinus) prefix = '-';

  // Remove currency, +, commas, whitespace
  const cleaned = str.replace(/[₹+,\s]/g, '');
  const parsed = parseFloat(cleaned);

  if (isNaN(parsed)) {
    return null;
  }

  const parts = cleaned.split('.');
  const decimals = parts.length > 1 ? parts[1].length : 0;

  return {
    num: parsed,
    prefix,
    decimals,
    isINR,
  };
}

function formatDisplay(num: number, info: ParsedNumberInfo): string {
  const { prefix, decimals, isINR } = info;

  if (isINR) {
    const formattedNum = num.toLocaleString('en-IN', {
      maximumFractionDigits: decimals,
      minimumFractionDigits: decimals,
    });
    return `${prefix}${formattedNum}`;
  } else if (prefix === '+' || prefix === '-') {
    const formattedNum = Math.abs(num).toLocaleString('en-IN', {
      maximumFractionDigits: decimals,
    });
    return `${prefix}${formattedNum}`;
  } else {
    return num.toLocaleString('en-IN', {
      maximumFractionDigits: decimals,
    });
  }
}

export default function AnimatedNumber({ value, duration = 650, className }: AnimatedNumberProps) {
  const parsed = parseValue(value);
  const [display, setDisplay] = useState<string>(() => (parsed ? formatDisplay(parsed.num, parsed) : String(value)));
  const prevNumRef = useRef<number>(parsed ? parsed.num : 0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!parsed) {
      setDisplay(String(value));
      return;
    }

    const target = parsed.num;
    const start = prevNumRef.current;

    // Check prefers-reduced-motion
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion || start === target) {
      prevNumRef.current = target;
      setDisplay(formatDisplay(target, parsed));
      return;
    }

    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease-out cubic: 1 - (1 - progress)^3
      const ease = 1 - Math.pow(1 - progress, 3);
      const current = start + (target - start) * ease;

      setDisplay(formatDisplay(current, parsed));

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        prevNumRef.current = target;
        setDisplay(formatDisplay(target, parsed));
      }
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [value, duration]);

  return <span className={`tabular-nums ${className || ''}`}>{display}</span>;
}
