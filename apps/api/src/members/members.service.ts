import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { ClsService } from 'nestjs-cls';
import type { CreateMemberInput, MemberSummary, MembershipStatusName, RoleName, UpdateMemberInput } from '@madre-pulse/shared';
import type { AppClsStore } from '../common/tenant/cls-store.type';
import { requireOrgId } from '../common/tenant/require-org-id';
import { deriveInitials, pickAvatarColor } from '../common/utils/avatar';
import { generateTempPassword } from '../common/utils/random';
import { PrismaService } from '../prisma/prisma.service';

const BCRYPT_ROUNDS = 10;

interface MembershipWithUser {
  id: string;
  role: string;
  status: string;
  managerId: string | null;
  createdAt: Date;
  user: { id: string; name: string; email: string; initials: string; avatarColor: string };
  manager?: { user: { name: string } } | null;
}

const MEMBER_INCLUDE = { user: true, manager: { include: { user: true } } } as const;

@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  async list(): Promise<MemberSummary[]> {
    const orgId = requireOrgId(this.cls);
    const memberships = await this.prisma.membership.findMany({
      where: { orgId },
      include: MEMBER_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
    return memberships.map((m) => this.toSummary(m));
  }

  async create(input: CreateMemberInput): Promise<{ member: MemberSummary; temporaryPassword?: string }> {
    const orgId = requireOrgId(this.cls);
    const email = input.email.toLowerCase();

    const existingUser = await this.prisma.user.findUnique({ where: { email } });

    if (existingUser) {
      const existingMembership = await this.prisma.membership.findUnique({
        where: { userId_orgId: { userId: existingUser.id, orgId } },
      });
      if (existingMembership) {
        throw new ConflictException('This person is already a member of this organization');
      }
      const membership = await this.prisma.membership.create({
        data: { userId: existingUser.id, orgId, role: input.role, status: 'ACTIVE' },
      });
      return { member: this.toSummary({ ...membership, user: existingUser, manager: null }) };
    }

    const temporaryPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(temporaryPassword, BCRYPT_ROUNDS);
    const initials = deriveInitials(input.name);
    const avatarColor = pickAvatarColor(input.name + email);

    const { user, membership } = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email, passwordHash, name: input.name, initials, avatarColor },
      });
      const membership = await tx.membership.create({
        data: { userId: user.id, orgId, role: input.role, status: 'ACTIVE' },
      });
      return { user, membership };
    });

    return { member: this.toSummary({ ...membership, user, manager: null }), temporaryPassword };
  }

  async update(membershipId: string, input: UpdateMemberInput): Promise<MemberSummary> {
    const orgId = requireOrgId(this.cls);
    const membership = await this.prisma.membership.findFirst({
      where: { id: membershipId, orgId },
      include: { user: true },
    });
    if (!membership) throw new NotFoundException('Member not found');

    const nextRole = input.role ?? membership.role;
    const nextStatus = input.status ?? membership.status;
    const losingAdminCoverage = membership.role === 'ADMIN' && (nextRole !== 'ADMIN' || nextStatus !== 'ACTIVE');

    if (losingAdminCoverage) {
      const otherActiveAdmins = await this.prisma.membership.count({
        where: { orgId, role: 'ADMIN', status: 'ACTIVE', id: { not: membershipId } },
      });
      if (otherActiveAdmins === 0) {
        throw new BadRequestException('Organization must have at least one active admin');
      }
    }

    if (input.email) {
      const email = input.email.toLowerCase();
      const existing = await this.prisma.user.findUnique({ where: { email } });
      if (existing && existing.id !== membership.userId) {
        throw new ConflictException('This email is already in use');
      }
    }

    if (input.managerId !== undefined) {
      await this.assertValidManager(membershipId, input.managerId, orgId);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (input.name !== undefined || input.email !== undefined) {
        await tx.user.update({
          where: { id: membership.userId },
          data: {
            name: input.name,
            email: input.email?.toLowerCase(),
            initials: input.name ? deriveInitials(input.name) : undefined,
          },
        });
      }
      return tx.membership.update({
        where: { id: membershipId },
        data: { role: nextRole, status: nextStatus, managerId: input.managerId },
        include: MEMBER_INCLUDE,
      });
    });
    return this.toSummary(updated);
  }

  /** ADMIN-triggered reset: generates a new temporary password (shown once), forces all of that
   * user's other sessions to re-authenticate — same treatment as a self-service password change. */
  async resetPassword(membershipId: string): Promise<{ member: MemberSummary; temporaryPassword: string }> {
    const orgId = requireOrgId(this.cls);
    const membership = await this.prisma.membership.findFirst({
      where: { id: membershipId, orgId },
      include: MEMBER_INCLUDE,
    });
    if (!membership) throw new NotFoundException('Member not found');

    const temporaryPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(temporaryPassword, BCRYPT_ROUNDS);

    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: membership.userId }, data: { passwordHash } }),
      this.prisma.refreshToken.updateMany({
        where: { userId: membership.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    return { member: this.toSummary(membership), temporaryPassword };
  }

  private async assertValidManager(membershipId: string, managerId: string | null, orgId: string): Promise<void> {
    if (managerId === null) return;
    if (managerId === membershipId) {
      throw new BadRequestException('A member cannot be their own manager');
    }
    const manager = await this.prisma.membership.findFirst({ where: { id: managerId, orgId } });
    if (!manager) throw new BadRequestException('Manager not found in this organization');
    if (manager.role !== 'ADMIN' && manager.role !== 'MANAGER') {
      throw new BadRequestException('Manager must have the Manager or Admin role');
    }
    if (manager.managerId === membershipId) {
      throw new BadRequestException('This would create a circular reporting relationship');
    }
  }

  private toSummary(m: MembershipWithUser): MemberSummary {
    return {
      membershipId: m.id,
      userId: m.user.id,
      name: m.user.name,
      email: m.user.email,
      initials: m.user.initials,
      avatarColor: m.user.avatarColor,
      role: m.role as RoleName,
      status: m.status as MembershipStatusName,
      managerId: m.managerId,
      managerName: m.manager?.user.name ?? null,
      createdAt: m.createdAt.toISOString(),
    };
  }
}
