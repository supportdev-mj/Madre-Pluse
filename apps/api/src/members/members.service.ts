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
  createdAt: Date;
  user: { id: string; name: string; email: string; initials: string; avatarColor: string };
}

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
      include: { user: true },
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
      return { member: this.toSummary({ ...membership, user: existingUser }) };
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

    return { member: this.toSummary({ ...membership, user }), temporaryPassword };
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

    const updated = await this.prisma.membership.update({
      where: { id: membershipId },
      data: { role: nextRole, status: nextStatus },
      include: { user: true },
    });
    return this.toSummary(updated);
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
      createdAt: m.createdAt.toISOString(),
    };
  }
}
