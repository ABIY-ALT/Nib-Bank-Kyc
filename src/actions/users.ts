'use server';

import { prisma } from '@/lib/prisma';
import { Prisma, UserStatus } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import bcrypt from 'bcryptjs';
import { generateSecurePassword } from '@/lib/security';
import { getServerSession, verifySensitiveSession } from './auth-server';
import { createAuditLog } from './audit';
import { CreateUserSchema } from '@/lib/validation';
import { ZodError } from 'zod';
import { logInstitutionalError } from '@/lib/logger';
import { normalizeInstitutionalLogin } from '@/lib/login-identifier';

const INSTITUTIONAL_EMAIL_DOMAIN = 'nibbank.com.et';

function buildEmailLocalPart(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, '');
}

function normalizePhoneNumber(value?: string | null) {
  const normalized = value?.trim().replace(/[\s()-]/g, '') || '';
  return normalized.length > 0 ? normalized : null;
}

function normalizePersonName(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

function normalizePersonNameKey(value: string) {
  return normalizePersonName(value).toLowerCase();
}

async function resolveInstitutionalEmail(params: {
  tx: any;
  firstName: string;
  lastName: string;
  currentUserId?: string;
  currentEmail?: string | null;
  preserveExisting?: boolean;
}) {
  const firstNamePart = buildEmailLocalPart(params.firstName);
  const lastNamePart = buildEmailLocalPart(params.lastName);
  const baseLocalPart = `${firstNamePart || 'user'}.${lastNamePart || 'staff'}`;
  const baseEmail = `${baseLocalPart}@${INSTITUTIONAL_EMAIL_DOMAIN}`;

  if (params.preserveExisting && params.currentEmail) {
    return params.currentEmail.toLowerCase().trim();
  }

  let suffix = 0;

  while (suffix < 10000) {
    const localPart = suffix === 0 ? baseLocalPart : `${baseLocalPart}${suffix}`;
    const candidateEmail = `${localPart}@${INSTITUTIONAL_EMAIL_DOMAIN}`;
    const existingUser = await (params.tx as any).user.findFirst({
      where: {
        email: candidateEmail,
        NOT: params.currentUserId ? { id: params.currentUserId } : undefined
      },
      select: { id: true }
    });

    if (!existingUser) {
      return candidateEmail;
    }

    suffix += 1;
  }

  throw new Error(`Could not allocate a unique institutional email for ${baseEmail}.`);
}

async function reserveRequestedInstitutionalEmail(params: {
  tx: any;
  requestedEmail: string;
  currentUserId?: string;
}) {
  const existingUser = await (params.tx as any).user.findFirst({
    where: {
      email: params.requestedEmail,
      NOT: params.currentUserId ? { id: params.currentUserId } : undefined
    },
    select: { id: true }
  });

  if (existingUser) {
    throw new Error('Official username is already assigned to another personnel record.');
  }

  return params.requestedEmail;
}

/**
 * Robust Authorization Helper.
 */
async function verifyAdminClearance() {
  const session = await getServerSession();
  if (!session) return false;
  if (session.role === 'SUPER_ADMIN') return true;

  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: {
      roles: { 
        include: { role: { select: { name: true } } } 
      }
    }
  });

  return user?.roles.some((ur: any) => ur.role.name === 'SUPER_ADMIN') || false;
}

export async function getAllUsers() {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phoneNumber: true,
        status: true,
        branchId: true,
        branchName: true,
        districtName: true,
        assignedBranches: true,
        createdAt: true,
        updatedAt: true,
        needsPasswordChange: true,
        branch: { include: { district: true } },
        roles: { include: { role: true } }
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }]
    });

    return users.map((u: any) => ({
      id: u.id,
      firstName: u.firstName,
      lastName: u.lastName,
      email: u.email,
      phoneNumber: u.phoneNumber,
      status: u.status,
      branchId: u.branchId,
      branchName: u.branchName,
      districtName: u.districtName,
      assignedBranches: u.assignedBranches ? u.assignedBranches.split(',').filter(Boolean) : [],
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
      needsPasswordChange: u.needsPasswordChange,
      branch: u.branch,
      roles: u.roles
    }));
  } catch (error) {
    logInstitutionalError(error, 'DB_FETCH_USERS');
    return [];
  }
}

/**
 * Institutional Provisioning Action.
 * Enforces a Sensitive Session Check (session must be fresh < 5m).
 */
export async function provisionUser(data: {
  id?: string;
  firstName: string;
  lastName: string;
  email?: string;
  password?: string;
  phoneNumber: string;
  role: string;
  branchId?: string | null;
  districtName?: string | null;
  status: UserStatus;
}) {
  if (!(await verifyAdminClearance())) {
    return { success: false, error: 'Unauthorized: Administrative clearance required.' };
  }

  // SENSITIVE ACTION GUARD: Requires fresh session context
  if (!(await verifySensitiveSession())) {
    return { success: false, error: 'Security Protocol: Session too old for personnel modification. Please refresh or re-login.' };
  }

  try {
    const validated = CreateUserSchema.parse(data);
    const isUpdate = !!data.id;
    const normalizedFirstName = normalizePersonName(validated.firstName);
    const normalizedLastName = normalizePersonName(validated.lastName);
    const normalizedPhoneNumber = normalizePhoneNumber(validated.phoneNumber);
    const requestedEmail = validated.email ? normalizeInstitutionalLogin(validated.email) : '';
    let tempPass = validated.password?.trim() || undefined;

    if (!normalizedFirstName) {
      return { success: false, error: 'First name required' };
    }

    if (!normalizedLastName) {
      return { success: false, error: 'Last name required' };
    }

    if (!isUpdate && !tempPass) {
      tempPass = generateSecurePassword(10);
    }
    
    // SECURITY SAFEGUARD: Prevent SUPER_ADMIN users from being created as INACTIVE
    if (data.role === 'SUPER_ADMIN' && data.status === 'INACTIVE') {
      return { 
        success: false, 
        error: 'Security Policy: SUPER_ADMIN accounts cannot be created with INACTIVE status. Defaulting to ACTIVE.' 
      };
    }
    
    // Force SUPER_ADMIN users to ACTIVE status
    let finalStatus = data.status;
    if (data.role === 'SUPER_ADMIN' && data.status !== 'ACTIVE') {
      finalStatus = 'ACTIVE';
    }
    
    const isDistrictDirector = data.role === 'DISTRICT_DIRECTOR';

    const branch = !isDistrictDirector && data.branchId ? await prisma.branch.findUnique({
      where: { id: data.branchId },
      include: { district: true }
    }) : null;

    const district = isDistrictDirector && data.districtName
      ? await prisma.district.findUnique({
          where: { name: data.districtName }
        })
      : null;

    if (isDistrictDirector && !district) {
      return {
        success: false,
        error: 'District Director must be assigned to a valid district.',
      };
    }

    const result = await prisma.$transaction(async (tx: any) => {
      let user;
      const existingUser = isUpdate ? await (tx as any).user.findUnique({
        where: { id: data.id },
        select: { id: true, email: true, firstName: true, lastName: true }
      }) : null;

      if (isUpdate && !existingUser) {
        throw new Error('Personnel record not found.');
      }

      const duplicateNameUsers = await (tx as any).$queryRaw(Prisma.sql`
        SELECT "id"
        FROM "User"
        WHERE LOWER(REGEXP_REPLACE(BTRIM("firstName"), '\\s+', ' ', 'g')) = ${normalizePersonNameKey(normalizedFirstName)}
          AND LOWER(REGEXP_REPLACE(BTRIM("lastName"), '\\s+', ' ', 'g')) = ${normalizePersonNameKey(normalizedLastName)}
          ${isUpdate ? Prisma.sql`AND "id" <> ${data.id}` : Prisma.empty}
        LIMIT 1
      `);

      if (duplicateNameUsers.length > 0) {
        throw new Error('Personnel record with the same first name and surname already exists.');
      }

      if (normalizedPhoneNumber) {
        const duplicatePhoneUser = await (tx as any).user.findFirst({
          where: {
            phoneNumber: normalizedPhoneNumber,
            NOT: isUpdate ? { id: data.id } : undefined
          },
          select: { id: true }
        });

        if (duplicatePhoneUser) {
          throw new Error('Phone number is already assigned to another personnel record.');
        }
      }

      const generatedEmail = await resolveInstitutionalEmail({
        tx,
        firstName: normalizedFirstName,
        lastName: normalizedLastName,
        currentUserId: existingUser?.id,
        currentEmail: existingUser?.email,
        preserveExisting: Boolean(
          existingUser
          && normalizePersonName(existingUser.firstName) === normalizedFirstName
          && normalizePersonName(existingUser.lastName) === normalizedLastName
        )
      });

      const finalEmail = requestedEmail
        ? await reserveRequestedInstitutionalEmail({
            tx,
            requestedEmail,
            currentUserId: existingUser?.id
          })
        : generatedEmail;

      const resolvedBranchId = isDistrictDirector ? null : (data.branchId || null);
      const resolvedBranchName = isDistrictDirector ? null : (branch?.name || null);
      const resolvedDistrictName = isDistrictDirector
        ? district?.name || null
        : (branch?.district?.name || null);

      if (isUpdate) {
        let updateData: any = {
          firstName: normalizedFirstName,
          lastName: normalizedLastName,
          email: finalEmail,
          phoneNumber: normalizedPhoneNumber,
          branchId: resolvedBranchId,
          branchName: resolvedBranchName,
          districtName: resolvedDistrictName,
          status: finalStatus,
          updatedAt: new Date()
        };

        if (tempPass) {
          updateData.password = await bcrypt.hash(tempPass, 10);
          updateData.needsPasswordChange = true;
        }

        user = await (tx as any).user.update({
          where: { id: data.id },
          data: updateData
        });
      } else {
        const createPassword = tempPass as string;
        const hashedPassword = await bcrypt.hash(createPassword, 10);

        user = await (tx as any).user.create({
          data: {
            firstName: normalizedFirstName,
            lastName: normalizedLastName,
            email: finalEmail,
            password: hashedPassword,
            phoneNumber: normalizedPhoneNumber,
            branchId: resolvedBranchId,
            branchName: resolvedBranchName,
            districtName: resolvedDistrictName,
            status: finalStatus,
            needsPasswordChange: true
          }
        });
      }

      const role = await tx.role.findUnique({ where: { name: validated.role } });
      if (role) {
        await (tx as any).userRole.deleteMany({ where: { userId: user.id } });
        await (tx as any).userRole.create({ data: { userId: user.id, roleId: role.id } });
      }

      return user;
    });

    await createAuditLog({
      userId: null,
      userEmail: result.email,
      action: isUpdate ? 'USER_PROFILE_UPDATE' : 'USER_PROVISION_SUCCESS',
      details: isUpdate 
        ? `Profile modified for ${result.firstName} ${result.lastName}. Role: ${data.role}` 
        : `New personnel provisioned: ${result.firstName} ${result.lastName}. Role: ${data.role}`,
      severity: 'MEDIUM'
    });

    revalidatePath('/admin/users');
    
    // Return user without password hash
    return { 
      success: true, 
      user: {
        id: result.id,
        firstName: result.firstName,
        lastName: result.lastName,
        email: result.email,
        phoneNumber: result.phoneNumber,
        status: result.status,
        branchId: result.branchId,
        branchName: result.branchName,
        districtName: result.districtName,
        needsPasswordChange: result.needsPasswordChange
      }, 
      tempPassword: tempPass || null
    };
  } catch (error: any) {
    if (error instanceof ZodError) {
      const firstIssue = error.issues?.[0];
      const message = firstIssue?.message || 'Validation failed.';
      return { success: false, error: message };
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const target = Array.isArray(error.meta?.target)
        ? error.meta.target.join(',')
        : String(error.meta?.target || '');

      if (target.includes('User_first_last_name_normalized_key') || error.message.includes('User_first_last_name_normalized_key')) {
        return { success: false, error: 'Personnel record with the same first name and surname already exists.' };
      }

      if (target.includes('phoneNumber')) {
        return { success: false, error: 'Phone number is already assigned to another personnel record.' };
      }
    }

    const { message } = logInstitutionalError(error, 'DB_PROVISION_USER');
    return { success: false, error: message };
  }
}

export async function resetUserPassword(email: string, authorizerId: string) {
  if (!(await verifyAdminClearance())) {
    return { success: false, error: 'Unauthorized.' };
  }

  // NOTE: Password reset does not require a fresh session, only admin clearance
  // The 5-minute session limit is intentionally bypassed here to allow
  // long-running admin sessions to perform maintenance actions

  try {
    const normalizedEmail = email.toLowerCase().trim();
    const user = await prisma.user.findUnique({ 
      where: { email: normalizedEmail },
      select: { id: true, firstName: true, lastName: true }
    });
    if (!user) throw new Error("Personnel record not found.");

    const tempPass = generateSecurePassword(10);
    const hashedPassword = await bcrypt.hash(tempPass, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword, needsPasswordChange: true, updatedAt: new Date() }
    });

    // Audit log for credential reset
    await createAuditLog({
      userId: authorizerId,
      userEmail: `admin:${authorizerId}`,
      action: 'CREDENTIAL_RESET',
      details: `Password reset initiated by admin ${authorizerId}`,
      metadata: {
        email: normalizedEmail,
        resource: 'USER',
        resourceId: user.id,
      }
    }).catch(() => {});

    return { success: true, tempPassword: tempPass, userName: `${user.firstName} ${user.lastName}` };
  } catch (error: any) {
    const { message } = logInstitutionalError(error, 'DB_RESET_PASSWORD');
    return { success: false, error: message };
  }
}

export async function updateUserStatus(userId: string, status: UserStatus) {
  if (!(await verifyAdminClearance())) throw new Error('Unauthorized');
  if (!(await verifySensitiveSession())) throw new Error('Security Protocol Violation: Session too old.');
  
  try {
    // SECURITY SAFEGUARD: Check if this user is SUPER_ADMIN
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        roles: { include: { role: { select: { name: true } } } }
      }
    });

    if (!user) throw new Error('User not found.');

    const isSuperAdmin = user.roles.some((ur: any) => ur.role.name === 'SUPER_ADMIN');
    
    // Prevent SUPER_ADMIN users from being set to INACTIVE
    if (isSuperAdmin && status === 'INACTIVE') {
      throw new Error('Security Policy: SUPER_ADMIN accounts cannot be set to INACTIVE status.');
    }

    const result = await prisma.user.update({
      where: { id: userId },
      data: { status, updatedAt: new Date() },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        status: true,
        branchId: true,
        branchName: true,
        districtName: true,
        needsPasswordChange: true
      }
    });
    return result;
  } catch (error) {
    logInstitutionalError(error, 'DB_UPDATE_STATUS');
    throw new Error('Institutional database fault.');
  }
}

export async function updateUserPortfolio(userId: string, branches: string[]) {
  if (!(await verifyAdminClearance())) throw new Error('Unauthorized');
  if (!(await verifySensitiveSession())) throw new Error('Security Protocol Violation: Session too old.');

  try {
    const result = await prisma.user.update({
      where: { id: userId },
      data: { assignedBranches: branches.join(','), updatedAt: new Date() },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        assignedBranches: true,
        branchId: true,
        branchName: true,
        districtName: true,
        needsPasswordChange: true
      }
    });
    return result;
  } catch (error) {
    logInstitutionalError(error, 'DB_UPDATE_PORTFOLIO');
    throw new Error('Institutional database fault.');
  }
}
