'use client';

import { useEffect, useState } from 'react';
import { type CreateMemberInput, type MemberSummary, type MembershipStatusName, type RoleName } from '@madre-pulse/shared';
import { AppNav } from '../../components/app-nav';
import { apiFetch } from '../../lib/api-client';
import { useRequireAuth } from '../../lib/use-require-auth';
import { AddMemberModal } from './add-member-modal';
import { EditMemberModal } from './edit-member-modal';

export default function TeamPage() {
  const { status, role } = useRequireAuth();
  const [members, setMembers] = useState<MemberSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [editingMember, setEditingMember] = useState<MemberSummary | null>(null);

  useEffect(() => {
    if (status !== 'authenticated') return;
    apiFetch<MemberSummary[]>('/members')
      .then(setMembers)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load members'))
      .finally(() => setLoading(false));
  }, [status]);

  async function onAddMember(input: CreateMemberInput) {
    setNotice(null);
    const result = await apiFetch<{ member: MemberSummary; temporaryPassword?: string }>('/members', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    setMembers((prev) => [...prev, result.member]);
    if (result.temporaryPassword) {
      setNotice(`${result.member.name} was added. Temporary password (share this with them securely): ${result.temporaryPassword}`);
    } else {
      setNotice(`${result.member.name} already had an account and was added to this organization.`);
    }
  }

  async function onUpdateMember(
    membershipId: string,
    patch: { role?: RoleName; status?: MembershipStatusName; managerId?: string | null },
  ) {
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

  async function onResetPassword(member: MemberSummary) {
    if (!window.confirm(`Reset ${member.name}'s password? They'll be signed out everywhere and need the new password to sign back in.`)) return;
    setError(null);
    setNotice(null);
    try {
      const result = await apiFetch<{ member: MemberSummary; temporaryPassword: string }>(
        `/members/${member.membershipId}/reset-password`,
        { method: 'POST' },
      );
      setNotice(`${member.name}'s password was reset. Temporary password (share this with them securely): ${result.temporaryPassword}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset password.');
    }
  }

  if (status !== 'authenticated') return null;

  const isAdmin = role === 'ADMIN';

  return (
    <div className="min-h-screen sm:pl-60">
      <AppNav />
      <main className="mx-auto max-w-7xl px-4 pb-4 pt-16 sm:px-8 sm:pb-8 sm:pt-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-xl font-bold text-text">Team</h1>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 rounded-card bg-accent px-4 py-2 text-sm font-medium text-white"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="h-4 w-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Team Member
            </button>
          )}
        </div>

        {error && <p className="mb-4 text-sm text-red-500">{error}</p>}
        {notice && <p className="mb-4 rounded-card border border-accent bg-surface-alt p-3 text-sm text-text">{notice}</p>}

        {loading ? (
          <p className="text-muted">Loading…</p>
        ) : (
          <div className="overflow-x-auto rounded-card border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-alt text-muted">
                <tr>
                  <th className="px-4 py-2">Name</th>
                  <th className="px-4 py-2">Designation</th>
                  <th className="px-4 py-2">Email</th>
                  <th className="px-4 py-2">Role</th>
                  <th className="px-4 py-2">Manager</th>
                  <th className="px-4 py-2">Status</th>
                  {isAdmin && <th className="px-4 py-2">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.membershipId} className="border-t border-border">
                    <td className="px-4 py-2.5 align-middle text-text">{m.name}</td>
                    <td className="px-4 py-2.5 align-middle text-muted">{m.designation ?? '—'}</td>
                    <td className="px-4 py-2.5 align-middle text-muted">{m.email}</td>
                    <td className="px-4 py-2.5 align-middle text-text">
                      {isAdmin ? (
                        <select
                          value={m.role}
                          onChange={(e) => onUpdateMember(m.membershipId, { role: e.target.value as RoleName })}
                          className="rounded-card border border-border bg-surface px-2 py-1 text-sm text-text"
                        >
                          <option value="ADMIN">ADMIN</option>
                          <option value="MANAGER">MANAGER</option>
                          <option value="USER">USER</option>
                        </select>
                      ) : (
                        m.role
                      )}
                    </td>
                    <td className="px-4 py-2.5 align-middle text-text">
                      {isAdmin ? (
                        <select
                          value={m.managerId ?? ''}
                          onChange={(e) => onUpdateMember(m.membershipId, { managerId: e.target.value || null })}
                          className="rounded-card border border-border bg-surface px-2 py-1 text-sm text-text"
                        >
                          <option value="">None</option>
                          {members
                            .filter((c) => c.membershipId !== m.membershipId && (c.role === 'ADMIN' || c.role === 'MANAGER'))
                            .map((c) => (
                              <option key={c.membershipId} value={c.membershipId}>
                                {c.name}
                              </option>
                            ))}
                        </select>
                      ) : (
                        (m.managerName ?? '—')
                      )}
                    </td>
                    <td className="px-4 py-2.5 align-middle">
                      <span
                        className={
                          m.status === 'ACTIVE'
                            ? 'rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700'
                            : 'rounded-full bg-surface-alt px-2 py-0.5 text-xs font-medium text-muted'
                        }
                      >
                        {m.status}
                      </span>
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-2.5 align-middle">
                        <div className="flex items-center gap-3 whitespace-nowrap">
                          <button type="button" onClick={() => setEditingMember(m)} className="text-sm text-accent">
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateMember(m.membershipId, { status: m.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE' })
                            }
                            className={m.status === 'ACTIVE' ? 'text-sm text-red-500' : 'text-sm text-accent'}
                          >
                            {m.status === 'ACTIVE' ? 'Disable' : 'Enable'}
                          </button>
                          <button type="button" onClick={() => onResetPassword(m)} className="text-sm text-accent">
                            Reset password
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {showAddModal && <AddMemberModal onClose={() => setShowAddModal(false)} onSubmit={onAddMember} />}

        {editingMember && (
          <EditMemberModal
            member={editingMember}
            onClose={() => setEditingMember(null)}
            onSaved={(updated) => setMembers((prev) => prev.map((m) => (m.membershipId === updated.membershipId ? updated : m)))}
          />
        )}
      </main>
    </div>
  );
}
