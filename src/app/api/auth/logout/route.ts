import { NextResponse } from "next/server";

/**
 * Institutional Logout Gateway.
 * Clears the secure session cookie.
 */
export async function POST() {
  const response = NextResponse.json({ success: true });
  
  response.cookies.set('nib-auth-token', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires: new Date(0),
    path: '/',
  });

  return response;
}