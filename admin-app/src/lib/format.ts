export function formatCurrency(amount: number | string | null | undefined): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : (amount ?? 0);
  if (isNaN(num)) return '₹0';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(num);
}

export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return '-';
  try {
    const d = new Date(dateString);
    return new Intl.DateTimeFormat('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(d);
  } catch {
    return dateString;
  }
}

export function formatDateTime(dateString: string | null | undefined): string {
  if (!dateString) return '-';
  try {
    const d = new Date(dateString);
    return new Intl.DateTimeFormat('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return dateString;
  }
}

export function formatExpiryCountdown(
  expiryDateString: string | null | undefined,
  status: 'trial' | 'active' | 'expired' | 'suspended'
): { label: string; isUrgent: boolean; isExpired: boolean; badgeColor: string } {
  if (status === 'suspended') {
    return {
      label: 'Suspended by Admin',
      isUrgent: false,
      isExpired: true,
      badgeColor: 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-rose-300/60 dark:border-rose-800/60',
    };
  }

  if (!expiryDateString) {
    if (status === 'active') {
      return {
        label: 'Active (Lifetime/Manual)',
        isUrgent: false,
        isExpired: false,
        badgeColor: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300/60 dark:border-emerald-800/60',
      };
    }
    return {
      label: 'Expired',
      isUrgent: false,
      isExpired: true,
      badgeColor: 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-rose-300/60 dark:border-rose-800/60',
    };
  }

  const target = new Date(expiryDateString).getTime();
  const now = Date.now();
  const diffMs = target - now;

  if (diffMs <= 0) {
    const pastDays = Math.max(1, Math.floor(Math.abs(diffMs) / (1000 * 60 * 60 * 24)));
    return {
      label: `Expired ${pastDays}d ago`,
      isUrgent: true,
      isExpired: true,
      badgeColor: 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-rose-300/60 dark:border-rose-800/60',
    };
  }

  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);
  const remHours = diffHours % 24;

  const prefix = status === 'trial' ? 'Trial: ' : 'Active: ';
  let timeStr = '';
  if (diffDays > 0) {
    timeStr = `${diffDays}d ${remHours}h left`;
  } else {
    timeStr = `${diffHours}h left`;
  }

  const isUrgent = diffHours <= 24;
  let badgeColor = '';
  if (status === 'trial') {
    badgeColor = isUrgent
      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300/60 dark:border-amber-800/60'
      : 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border-blue-300/60 dark:border-blue-800/60';
  } else {
    badgeColor = isUrgent
      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300/60 dark:border-amber-800/60'
      : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300/60 dark:border-emerald-800/60';
  }

  return {
    label: `${prefix}${timeStr}`,
    isUrgent,
    isExpired: false,
    badgeColor,
  };
}
