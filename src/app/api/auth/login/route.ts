
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

/**
 * Institutional Authentication Gateway.
 * Authenticates @nibbank.com.et credentials and issues a secure HTTP-Only cookie.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json({ message: "Identity and password required." }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const cleanPassword = password.trim();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: {
        roles: {
          include: {
            role: {
              include: {
                permissions: {
                  include: { permission: true }
                }
              }
            }
          }
        },
        branch: {
          include: { district: true }
        }
      }
    });

    if (!user) {
      return NextResponse.json({ message: "Invalid institutional credentials." }, { status: 401 });
    }

    if (user.status !== 'ACTIVE') {
      return NextResponse.json({ message: `Access restricted: Account is ${user.status}.` }, { status: 401 });
    }

    const isMatch = await bcrypt.compare(cleanPassword, user.password);

    if (!isMatch) {
      return NextResponse.json({ message: "Invalid institutional credentials." }, { status: 401 });
    }

    const secret = process.env.JWT_SECRET || "institutional_default_secret_32_chars_min";
    
    // Map roles to a serializable format to avoid circular references
    const serializableRoles = user.roles.map(ur => ({
      role: {
        id: ur.role.id,
        name: ur.role.name,
        permissions: ur.role.permissions.map(p => ({
          permission: {
            slug: p.permission.slug,
            name: p.permission.name,
            group: p.permission.group
          }
        }))
      }
    }));

    const roleName = user.roles?.[0]?.role?.name || 'VIEWER';

    const token = jwt.sign(
      { 
        id: user.id, 
        email: user.email,
        role: roleName,
        needsPasswordChange: user.needsPasswordChange
      },
      secret,
      { expiresIn: "1d" }
    );

    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        status: user.status,
        branchName: user.branch?.name || null,
        districtName: user.branch?.district?.name || null,
        assignedBranches: user.assignedBranches || [],
        roles: serializableRoles,
        needsPasswordChange: user.needsPasswordChange
      }
    });

    // Set HTTP-Only Cookie with cross-network compatibility
    response.cookies.set('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax', // Lax provides better compatibility across network redirects than Strict
      maxAge: 60 * 60 * 24, // 1 day
      path: '/',
    });

    return response;
  } catch (error: any) {
    console.error("[Auth API] Login Error:", error);
    return NextResponse.json({ message: "Internal security service error." }, { status: 500 });
  }
}
