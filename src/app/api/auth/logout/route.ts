import { NextResponse } from "next/server";

/**
 * Institutional Logout Gateway.
 * Clears the secure __Secure- session cookie.
 */
export async function POST() {
  const response = NextResponse.json({ success: true });
  
  response.cookies.set('__Secure-auth-token', '', {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    expires: new Date(0),
    path: '/',
  });

  return response;
}