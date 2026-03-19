import { NextResponse } from 'next/server';

type ApiResponseInit = ResponseInit;

/**
 * Institutional API Response Builder.
 * Ensures all API responses have proper Content-Type and security headers.
 */
export class ApiResponse {
  /**
   * JSON response with proper Content-Type header.
   */
  static json(
    body: any,
    init?: ApiResponseInit & { status?: number }
  ): NextResponse {
    const status = init?.status || 200;
    const response = NextResponse.json(body, { ...init, status });
    
    // Ensure Content-Type is explicitly set
    response.headers.set('Content-Type', 'application/json; charset=utf-8');
    
    // Apply security headers
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'DENY');
    
    return response;
  }

  /**
   * Error response with proper Content-Type header.
   */
  static error(
    message: string,
    status: number = 400,
    details?: any
  ): NextResponse {
    const body = {
      success: false,
      message,
      ...(details && { details }),
    };

    return this.json(body, { status });
  }

  /**
   * Success response with proper Content-Type header.
   */
  static success(
    data: any,
    message: string = 'Success',
    status: number = 200
  ): NextResponse {
    const body = {
      success: true,
      message,
      data,
    };

    return this.json(body, { status });
  }
}
