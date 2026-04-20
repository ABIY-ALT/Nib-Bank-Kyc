/**
 * Authentication API Route Handler
 * 
 * File: src/app/api/auth/[...route]/route.ts
 * 
 * Routes implemented:
 * - POST /api/auth/login - Create session
 * - POST /api/auth/refresh - Rotate tokens
 * - POST /api/auth/logout - Revoke session
 * - GET /api/auth/sessions - List sessions
 * - DELETE /api/auth/sessions/:id - Revoke session
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
 * Helper: Extract user ID from Authorization header
 */
async function getUserIdFromRequest(request: NextRequest): Promise<string | null> {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return null;
    }

    const token = authHeader.slice(7);
    const payload = await verifyAccessToken(token);
    if (!payload) {
      return null;
    }
    return payload.sub;
  } catch (error) {
    return null;
  }
}

/**
 * Router logic: Route to appropriate handler
 */
function getRoute(pathname: string): string {
  // Extract route after /api/auth/
  const route = pathname.replace(/^.*\/api\/auth/, '').replace(/^\//, '');

  if (route.startsWith('sessions/')) {
    return 'revoke-session';
  }

  return route || 'login';
}

/**
 * POST Handler - Route to correct endpoint
 */
export async function POST(request: NextRequest) {
  try {
    const route = getRoute(request.nextUrl.pathname);

    switch (route) {
      case 'login':
        return postLogin(request);

      case 'refresh':
        return postRefresh(request);

      case 'logout':
        return postLogout(request);

      default:
        return NextResponse.json(
          { error: 'Not found' },
          { status: 404 }
        );
    }
  } catch (error) {
    safeLog.error('Auth POST handler error', {
      error: String(error).substring(0, 100),
    });

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET Handler
 */
export async function GET(request: NextRequest) {
  try {
    const route = getRoute(request.nextUrl.pathname);

    // Verify authentication
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    if (route === 'sessions') {
      return getSessions(request, userId);
    }

    return NextResponse.json(
      { error: 'Not found' },
      { status: 404 }
    );
  } catch (error) {
    safeLog.error('Auth GET handler error', {
      error: String(error).substring(0, 100),
    });

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE Handler
 */
export async function DELETE(request: NextRequest) {
  try {
    // Verify authentication
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Extract session ID from URL
    const pathname = request.nextUrl.pathname;
    const match = pathname.match(/\/api\/auth\/sessions\/([^/?]+)/);

    if (!match || !match[1]) {
      return NextResponse.json(
        { error: 'Invalid request' },
        { status: 400 }
      );
    }

    const sessionId = match[1];
    return postRevokeSession(request, sessionId);
  } catch (error) {
    safeLog.error('Auth DELETE handler error', {
      error: String(error).substring(0, 100),
    });

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
