'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { createMemberSchema, type MemberSummary, type MembershipStatusName, type RoleName } from '@madre-pulse/shared';
import { AppNav } from '../../components/app-nav';
import { FormField } from '../../components/form-field';
import { apiFetch } from '../../lib/api-client';
import { useRequireAuth } from '../../lib/use-require-auth';

export default function TeamPage() {
  const { status, role } = useRequireAuth();
  const [members, setMembers] = useState<MemberSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [newRole, setNewRole] = useState<RoleName>('USER');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (status !== 'authenticated') return;
    apiFetch<MemberSummary[]>('/members')
      .then(setMembers)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load members'))
      .finally(() => setLoading(false));
  }, [status]);

  async function onAddMember(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    const parsed = createMemberSchema.safeParse({ email, name, role: newRole });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Please check your input.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await apiFetch<{ member: MemberSummary; temporaryPassword?: string }>('/members', {
        method: 'POST',
        body: JSON.stringify(parsed.data),
      });
      setMembers((prev) => [...prev, result.member]);
      setEmail('');
      setName('');
      setNewRole('USER');
      if (result.temporaryPassword) {
        setNotice(`${result.member.name} was added. Temporary password (share this with them securely): ${result.temporaryPassword}`);
      } else {
        setNotice(`${result.member.name} already had an account and was added to this organization.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add member.');
    } finally {
      setSubmitting(false);
    }
  }

  async function onUpdateMember(membershipId: string, patch: { role?: RoleName; status?: MembershipStatusName }) {
    setError(null);
    try {
      const updated = await apiFetch<MemberSummary>(`/members/${membershipId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      setMembers((prev) => prev.map((m) => (m.membershipId === membershipId ? updated : m)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update member.');
    }
  }

  if (status !== 'authenticated') return null;

  const isAdmin = role === 'ADMIN';

  return (
    <div className="min-h-screen sm:pl-60">
      <AppNav />
      <main className="mx-auto max-w-3xl px-4 pb-4 pt-16 sm:px-8 sm:pb-8 sm:pt-8">
        <h1 className="mb-6 text-xl font-bold text-text">Team</h1>

        {error && <p className="mb-4 text-sm text-red-500">{error}</p>}
        {notice && <p className="mb-4 rounded-card border border-accent bg-surface-alt p-3 text-sm text-text">{notice}</p>}

        {loading ? (
          <p className="text-muted">Loading…</p>
        ) : (
          <div className="mb-8 overflow-x-auto rounded-card border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-alt text-muted">
                <tr>
                  <th className="px-4 py-2">Name</th>
                  <th className="px-4 py-2">Email</th>
                  <th className="px-4 py-2">Role</th>
                  <th className="px-4 py-2">Status</th>
                  {isAdmin && <th className="px-4 py-2" />}
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.membershipId} className="border-t border-border">
                    <td className="px-4 py-2 text-text">{m.name}</td>
                    <td className="px-4 py-2 text-muted">{m.email}</td>
                    <td className="px-4 py-2 text-text">
                      {isAdmin ? (
                        <select
                          value={m.role}
                          onChange={(e) => onUpdateMember(m.membershipId, { role: e.target.value as RoleName })}
                          className="rounded border border-border bg-surface px-2 py-1 text-sm text-text"
                        >
                          <option value="ADMIN">ADMIN</option>
                          <option value="MANAGER">MANAGER</option>
                          <option value="USER">USER</option>
                        </select>
                      ) : (
                        m.role
                      )}
                    </td>
                    <td className="px-4 py-2 text-text">{m.status}</td>
                    {isAdmin && (
                      <td className="px-4 py-2">
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateMember(m.membershipId, { status: m.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE' })
                          }
                          className="text-sm text-accent"
                        >
                          {m.status === 'ACTIVE' ? 'Disable' : 'Enable'}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {isAdmin && (
          <div className="max-w-sm rounded-card border border-border bg-surface p-6">
            <h2 className="mb-4 text-base font-semibold text-text">Add a team member</h2>
            <form onSubmit={onAddMember} className="flex flex-col gap-4">
              <FormField label="Name" value={name} onChange={setName} />
              <FormField label="Email" type="email" value={email} onChange={setEmail} />
              <label className="flex flex-col gap-1 text-sm text-text">
                Role
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as RoleName)}
                  className="rounded-card border border-border bg-surface-alt px-3 py-2 text-sm text-text"
                >
                  <option value="USER">USER</option>
                  <option value="MANAGER">MANAGER</option>
                  <option value="ADMIN">ADMIN</option>
                </select>
              </label>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-card bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {submitting ? 'Adding…' : 'Add member'}
              </button>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}
