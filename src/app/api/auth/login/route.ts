
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ message: "Identity and credential required." }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: {
        branch: {
          include: { district: true }
        },
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
        }
      }
    });

    if (!user || user.status !== 'ACTIVE') {
      return NextResponse.json({ message: "Institutional access denied or account inactive." }, { status: 401 });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return NextResponse.json({ message: "Invalid institutional credentials." }, { status: 401 });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error("System security fault: Missing JWT Secret.");
    }

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        branchId: user.branchId,
      },
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
        needsPasswordChange: user.needsPasswordChange || false
      }
    });
  } catch (error: any) {
    console.error("[Auth API] Login Error:", error);
    return NextResponse.json({ message: "Internal security service error." }, { status: 500 });
  }
}
