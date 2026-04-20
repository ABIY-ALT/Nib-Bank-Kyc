/**
 * Authentication API Routes Handler
 * 
 * Endpoint implementations:
 * - POST /api/auth/login
 * - POST /api/auth/refresh
 * - POST /api/auth/logout
 * - GET /api/auth/sessions
 * - POST /api/auth/sessions/:sessionId/revoke
 * 
 * These are the actual route handlers for Next.js
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  postLogin,
  postRefresh,
  postLogout,
  getSessions,
  postRevokeSession,
} from '@/lib/auth-endpoints';
import { verifyAccessToken } from '@/lib/jwt-secure';
import { safeLog } from '@/lib/logging-redaction';

/**
 * Utility: Extract user ID from access token
 */
async function getUserFromToken(request: NextRequest): Promise<string | null> {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return null;
    }

    const token = authHeader.slice(7);
    const payload = await verifyAccessToken(token);
    return payload?.sub ?? null;
  } catch (error) {
    safeLog.debug('Token verification failed');
    return null;
  }
}

/**
 * POST /api/auth/login
 * 
 * Request body:
 * {
 *   "email": "user@example.com",
 *   "password": "password123"
 * }
 * 
 * Response (200):
 * {
 *   "accessToken": "eyJ0eXAiOiJKV1QiLCJhbGc...",
 *   "user": { "id": "...", "email": "...", "role": "USER" },
 *   "sessionId": "..."
 * }
 * 
 * Cookies set:
 * - refreshToken (HTTP-only, Secure, SameSite=Strict)
 * - sessionId (HTTP-only, Secure, SameSite=Strict)
 */
export async function POST(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (pathname.endsWith('/api/auth/login')) {
    return postLogin(request);
  }

  if (pathname.endsWith('/api/auth/refresh')) {
    return postRefresh(request);
  }

  if (pathname.endsWith('/api/auth/logout')) {
    return postLogout(request);
  }

  return NextResponse.json(
    { error: 'Not found' },
    { status: 404 }
  );
}

/**
 * GET /api/auth/sessions
 * 
 * List all active sessions for authenticated user
 * 
 * Headers required:
 * Authorization: Bearer <access_token>
 * 
 * Response (200):
 * {
 *   "sessions": [
 *     {
 *       "id": "session_id_1",
 *       "device": "Web Browser",
 *       "ip": "192.168.1.1",
 *       "createdAt": "2024-01-15T10:30:00Z",
 *       "lastActivity": "2024-01-15T11:45:00Z"
 *     }
 *   ]
 * }
 */
export async function GET(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (pathname.endsWith('/api/auth/sessions')) {
    // Verify token
    const userId = await getUserFromToken(request);
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    return getSessions(request, userId);
  }

  return NextResponse.json(
    { error: 'Not found' },
    { status: 404 }
  );
}

/**
 * DELETE /api/auth/sessions/:sessionId
 * 
 * Revoke a specific session (log out other devices)
 * 
 * Headers required:
 * Authorization: Bearer <access_token>
 * 
 * Response (200):
 * {
 *   "message": "Session revoked"
 * }
 */
export async function DELETE(request: NextRequest) {
  // Verify token
  const userId = await getUserFromToken(request);
  if (!userId) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const pathname = request.nextUrl.pathname;
  const sessionIdMatch = pathname.match(/\/api\/auth\/sessions\/([^/]+)/);

  if (!sessionIdMatch) {
    return NextResponse.json(
      { error: 'Invalid request' },
      { status: 400 }
    );
  }

  const sessionId = sessionIdMatch[1];
  return postRevokeSession(request, sessionId);
}

/**
 * Export handler for Edge Runtime compatibility
 * 
 * Usage in src/app/api/auth/[...route]/route.ts:
 * 
 * export async function POST(request: NextRequest) {
 *   return authRoutes.POST(request);
 * }
 * 
 * export async function GET(request: NextRequest) {
 *   return authRoutes.GET(request);
 * }
 * 
 * export async function DELETE(request: NextRequest) {
 *   return authRoutes.DELETE(request);
 * }
 */
export const authRoutes = { POST, GET, DELETE };
