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

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return (
    d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) +
    ', ' +
    d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
  );
}

export function waLink(phone: string, message: string): string {
  const clean = phone.replace(/\D/g, '');
  const withCode = clean.length === 10 ? '91' + clean : clean;
  return `https://wa.me/${withCode}?text=${encodeURIComponent(message)}`;
}

export function telLink(phone: string): string {
  const clean = phone.replace(/\D/g, '');
  return `tel:${clean}`;
}

export function upiPayLink(upiId: string, shopName: string, amount: number): string {
  const cleanUpi = upiId.trim();
  const amt = Math.max(0, amount).toFixed(2);
  return `upi://pay?pa=${encodeURIComponent(cleanUpi)}&pn=${encodeURIComponent(shopName)}&am=${amt}&cu=INR`;
}
