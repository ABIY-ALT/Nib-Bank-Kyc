'use server';

import { prisma } from '@/lib/prisma';
import { UserStatus } from '@prisma/client';
import { revalidatePath } from 'next/cache';

export async function getAllUsers() {
  try {
    return await prisma.user.findMany({
      include: { 
        branch: {
          include: { district: true }
        },
        roles: { 
          include: { 
            role: {
              include: {
                permissions: {
                  include: {
                    permission: true
                  }
                }
              }
            }
          } 
        }
      },
      orderBy: { firstName: 'asc' }
    });
  } catch (error) {
    console.error('[SQL] getAllUsers Error:', error);
    return [];
  }
}

export async function updateUserRole(userId: string, roleName: string) {
  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId } });
      const role = await tx.role.findUnique({ where: { name: roleName } });
      if (role) {
        return await tx.userRole.create({
          data: { userId, roleId: role.id }
        });
      }
      return null;
    });
    revalidatePath('/admin/users');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function updateUserStatus(userId: string, status: UserStatus) {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { status }
  });
  revalidatePath('/admin/users');
  return user;
}

export async function provisionUser(data: {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber?: string;
  role: string;
  branchId?: string;
  status: UserStatus;
}) {
  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Upsert the User record
      const user = await tx.user.upsert({
        where: { firebaseUid: data.id },
        update: { 
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email,
          phoneNumber: data.phoneNumber,
          branchId: data.branchId || null,
          status: data.status
        },
        create: { 
          id: data.id,
          firebaseUid: data.id,
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email,
          phoneNumber: data.phoneNumber,
          branchId: data.branchId || null,
          status: data.status
        }
      });

      // 2. Link the role via UserRole relational table
      if (data.role) {
        const role = await tx.role.findUnique({ where: { name: data.role } });
        if (role) {
          // Clear existing and link new role
          await tx.userRole.deleteMany({ where: { userId: user.id } });
          await tx.userRole.create({
            data: { userId: user.id, roleId: role.id }
          });
        }
      }
      return user;
    });

    revalidatePath('/admin/users');
    return result;
  } catch (error: any) {
    console.error('[SQL Provisioning] Error:', error);
    throw new Error(error.message || 'Institutional database fault.');
  }
}

export async function updateUserPortfolio(userId: string, branches: string[]) {
  // Production portfolio logic can be implemented here
  return { success: true };
}
