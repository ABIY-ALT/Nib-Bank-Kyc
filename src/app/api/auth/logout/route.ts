
import { NextResponse } from "next/server";

/**
 * Institutional Logout Gateway.
 * Clears the secure HTTP-Only session cookie.
 */
export async function POST() {
  const response = NextResponse.json({ success: true });
  
  response.cookies.set('token', '', {
    httpOnly: true,
    expires: new Date(0),
    path: '/',
  });

  return response;
}
