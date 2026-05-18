import { jwtVerify, type JWTVerifyOptions } from 'jose';

const BASE64URL_SEGMENT_PATTERN = /^[A-Za-z0-9_-]+$/;

export class StrictJwtFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StrictJwtFormatError';
  }
}

function decodeStrictBase64Url(segment: string): Buffer {
  if (!segment) {
    throw new StrictJwtFormatError('JWT segment is empty');
  }
  if (segment.includes('=')) {
    throw new StrictJwtFormatError('JWT segment contains padding');
  }
  if (!BASE64URL_SEGMENT_PATTERN.test(segment)) {
    throw new StrictJwtFormatError('JWT segment contains invalid characters');
  }
  if (segment.length % 4 === 1) {
    throw new StrictJwtFormatError('JWT segment length is invalid');
  }

  let decoded: Buffer;
  try {
    decoded = Buffer.from(segment, 'base64url');
  } catch {
    throw new StrictJwtFormatError('JWT segment is not valid base64url');
  }

  if (decoded.length === 0) {
    throw new StrictJwtFormatError('JWT segment decodes to empty bytes');
  }

  const canonical = decoded.toString('base64url');
  if (canonical !== segment) {
    throw new StrictJwtFormatError('JWT segment is non-canonical base64url');
  }

  return decoded;
}

export function assertStrictJwtCompact(token: string): void {
  if (typeof token !== 'string' || token.length === 0) {
    throw new StrictJwtFormatError('JWT must be a non-empty string');
  }
  if (/\s/.test(token)) {
    throw new StrictJwtFormatError('JWT must not contain whitespace');
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new StrictJwtFormatError('JWT must contain exactly 3 segments');
  }

  decodeStrictBase64Url(parts[0]);
  decodeStrictBase64Url(parts[1]);
  decodeStrictBase64Url(parts[2]);
}

export async function jwtVerifyStrict(
  token: string,
  key: Uint8Array,
  options?: JWTVerifyOptions
) {
  assertStrictJwtCompact(token);
  return jwtVerify(token, key, options);
}
