
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

/**
 * Institutional Authentication Gateway.
 * Authenticates @nibbank.com.et credentials and issues a secure JWT.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json({ message: "Identity and credential required." }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();

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
      return NextResponse.json({ message: "Institutional account not discovered." }, { status: 401 });
    }

    if (user.status !== 'ACTIVE') {
      return NextResponse.json({ message: `Access restricted: Account is ${user.status}.` }, { status: 401 });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return NextResponse.json({ message: "Invalid institutional credentials." }, { status: 401 });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      console.error("[CRITICAL] JWT_SECRET is missing from .env");
      return NextResponse.json({ message: "System security fault: JWT_SECRET not configured." }, { status: 500 });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email },
      secret,
      { expiresIn: "1d" }
    );

    return NextResponse.json({
      token,
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
        roles: user.roles || [],
        needsPasswordChange: false // Hardcoded to false until schema is updated
      }
    });
  } catch (error: any) {
    console.error("[Auth API] Login Error:", error);
    return NextResponse.json({ message: "Internal security service error." }, { status: 500 });
  }
}
