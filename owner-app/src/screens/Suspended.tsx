import { ShieldOff, LifeBuoy } from 'lucide-react';
import { Button, Card } from '@/components/ui';

export default function SuspendedScreen() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <Card className="p-8 max-w-md w-full text-center">
        <div className="mx-auto w-14 h-14 rounded-full bg-red-100 text-red-600 flex items-center justify-center">
          <ShieldOff size={28} />
        </div>
        <h1 className="mt-4 text-xl font-bold text-slate-900">Account Suspended</h1>
        <p className="mt-2 text-sm text-slate-500">
          Your store account has been suspended. Please contact support to restore access.
        </p>
        <Button variant="secondary" className="mt-5 w-full">
          <LifeBuoy size={16} /> Contact Support
        </Button>
      </Card>
    </div>
  );
}
