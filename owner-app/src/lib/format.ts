export function formatINR(amount: number | null | undefined): string {
  const value = Number(amount ?? 0);
  return '₹' + value.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

export function formatQty(qty: number | null | undefined, unitType?: string, unitValue?: number, metric?: string): string {
  const q = Number(qty ?? 0);
  const base = q.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  if (unitType && unitValue && metric) {
    return `${base} ${unitType} (${(q * unitValue).toLocaleString('en-IN', { maximumFractionDigits: 2 })} ${metric})`;
  }
  return base;
}

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) + ', ' +
    d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

export function daysAgo(iso: string | null | undefined): number {
  if (!iso) return Infinity;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

export function waLink(phone: string, message: string): string {
  const clean = phone.replace(/\D/g, '');
  const withCode = clean.length === 10 ? '91' + clean : clean;
  return `https://wa.me/${withCode}?text=${encodeURIComponent(message)}`;
}

export function agingBucket(lastDate: string | null | undefined): { label: string; severity: 'ok' | 'warn' | 'danger' } {
  if (!lastDate) return { label: 'No entries', severity: 'ok' };
  const days = daysAgo(lastDate);
  if (days <= 7) return { label: '0–7 days', severity: 'ok' };
  if (days <= 30) return { label: '8–30 days', severity: 'warn' };
  return { label: '30+ days overdue', severity: 'danger' };
}
