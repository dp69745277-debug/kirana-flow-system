import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  UserCheck,
  UserPlus,
  Trash2,
  RefreshCw,
  Mail,
  Phone,
  Shield,
  Key,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAdminAuth } from '@/context/AdminAuthContext';
import type { PlatformAdmin, AdminRole } from '@/lib/types';
import { Card, Button, Input, Label, Select, Badge, Modal, ConfirmDialog, useToast } from '@/components/ui';
import { formatDateTime } from '@/lib/format';

export const AdminsScreen: React.FC = () => {
  const { toast } = useToast();
  const { admin: currentAdmin } = useAdminAuth();
  const [admins, setAdmins] = useState<PlatformAdmin[]>([]);
  const [loading, setLoading] = useState(true);

  // Add modal
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<AdminRole>('admin');
  const [adding, setAdding] = useState(false);

  // Delete modal
  const [adminToDelete, setAdminToDelete] = useState<PlatformAdmin | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchAdmins = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('platform_admins')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) throw error;
      setAdmins((data as PlatformAdmin[]) || []);
    } catch (err: unknown) {
      toast((err as Error).message || 'Failed to load platform admins', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdmins();
  }, []);

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return toast('Please enter admin name', 'error');
    if (!email.trim() && !phone.trim()) return toast('Please enter Email or Phone', 'error');

    try {
      setAdding(true);
      const cleanEmail = email.trim() || (phone.trim() ? `${phone.trim()}@kirana.app` : null);
      const cleanPhone = phone.trim() || null;

      const { data, error } = await supabase.rpc('setup_platform_admin', {
        p_name: name.trim(),
        p_email: cleanEmail,
        p_phone: cleanPhone,
        p_role: role,
      });

      if (error) throw error;

      toast(`Successfully added platform admin: ${name}`, 'success');
      setAddModalOpen(false);
      setName('');
      setEmail('');
      setPhone('');
      setRole('admin');
      fetchAdmins();
    } catch (err: unknown) {
      toast((err as Error).message || 'Failed to add admin', 'error');
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteAdmin = async () => {
    if (!adminToDelete) return;
    if (admins.length <= 1) {
      toast('Cannot remove the only remaining platform administrator', 'error');
      setAdminToDelete(null);
      return;
    }
    if (adminToDelete.id === currentAdmin?.id) {
      toast('Cannot revoke your own active admin session', 'error');
      setAdminToDelete(null);
      return;
    }

    try {
      setDeleting(true);
      const { error } = await supabase
        .from('platform_admins')
        .delete()
        .eq('id', adminToDelete.id);

      if (error) throw error;

      toast(`Revoked admin privileges for ${adminToDelete.name}`, 'info');
      setAdminToDelete(null);
      fetchAdmins();
    } catch (err: unknown) {
      toast((err as Error).message || 'Failed to delete admin', 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <span>Platform Administrators</span>
            <Badge variant="emerald" size="sm">
              {admins.length} Admins
            </Badge>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Strict admin-only access control. Only accounts listed in this table can log into this control panel.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchAdmins}
            loading={loading}
            icon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            Refresh
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setAddModalOpen(true)}
            icon={<UserPlus className="w-4 h-4" />}
          >
            + Add Platform Admin
          </Button>
        </div>
      </div>

      {/* Admins Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-bold uppercase tracking-wider">
              <tr>
                <th className="py-3.5 px-4">Admin Name</th>
                <th className="py-3.5 px-4">Email</th>
                <th className="py-3.5 px-4">Phone</th>
                <th className="py-3.5 px-4">Role</th>
                <th className="py-3.5 px-4">Added On</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {admins.map((adm) => {
                const isCurrent = adm.id === currentAdmin?.id;

                return (
                  <tr key={adm.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30">
                    <td className="py-3 px-4 font-bold text-slate-900 dark:text-slate-100">
                      <div className="flex items-center gap-2">
                        <span>{adm.name}</span>
                        {isCurrent && (
                          <Badge variant="blue" size="xs">
                            You
                          </Badge>
                        )}
                      </div>
                    </td>

                    <td className="py-3 px-4 text-slate-600 dark:text-slate-300 font-mono">
                      {adm.email || '-'}
                    </td>

                    <td className="py-3 px-4 text-slate-600 dark:text-slate-300 font-mono">
                      {adm.phone || '-'}
                    </td>

                    <td className="py-3 px-4">
                      <Badge
                        variant={adm.role === 'super_admin' ? 'emerald' : adm.role === 'admin' ? 'blue' : 'slate'}
                        size="xs"
                      >
                        {adm.role.replace('_', ' ').toUpperCase()}
                      </Badge>
                    </td>

                    <td className="py-3 px-4 text-slate-400">
                      {formatDateTime(adm.created_at)}
                    </td>

                    <td className="py-3 px-4 text-right">
                      {!isCurrent && (
                        <button
                          onClick={() => setAdminToDelete(adm)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                          title="Revoke Admin Access"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Add Admin Modal */}
      <Modal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        title={
          <div className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-emerald-600" />
            <span>Add Platform Administrator</span>
          </div>
        }
        description="Grants portal access to another team member. They can log in with their email/phone and password."
      >
        <form onSubmit={handleAddAdmin} className="space-y-4">
          <div>
            <Label required>Full Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Ramesh Sharma"
              required
            />
          </div>

          <div>
            <Label>Email Address</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. ramesh@kirana.app"
            />
          </div>

          <div>
            <Label>10-Digit Mobile Number</Label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. 9876501234"
            />
          </div>

          <div>
            <Label required>Administrative Role</Label>
            <Select value={role} onChange={(e) => setRole(e.target.value as AdminRole)}>
              <option value="super_admin">Super Admin (Full Access + Deletions)</option>
              <option value="admin">Operations Admin (Stores & Payments)</option>
              <option value="support">Support Agent (Read-only)</option>
            </Select>
          </div>

          <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
            <Button variant="outline" size="sm" type="button" onClick={() => setAddModalOpen(false)} disabled={adding}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit" loading={adding} icon={<UserCheck className="w-4 h-4" />}>
              Save Admin
            </Button>
          </div>
        </form>
      </Modal>

      {/* Revoke Admin Confirmation */}
      <ConfirmDialog
        isOpen={Boolean(adminToDelete)}
        onClose={() => setAdminToDelete(null)}
        onConfirm={handleDeleteAdmin}
        loading={deleting}
        variant="danger"
        title="Revoke Admin Access?"
        message={`Are you sure you want to revoke administrative access for ${adminToDelete?.name}? They will no longer be able to log in to this control panel.`}
        confirmText="Yes, Revoke Access"
      />
    </div>
  );
};
