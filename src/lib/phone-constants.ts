/**
 * Phone Validation Configuration & Constants
 * 
 * Centralized configuration for phone validation across the application
 */

import { PHONE_CONFIG } from '@/lib/phone-validation';

/**
 * OTP Configuration (phone-based OTP)
 */
export const OTP_CONFIG = {
  // OTP length
  LENGTH: 6,
  
  // OTP expiration (10 minutes)
  EXPIRATION_MINUTES: 10,
  
  // Max OTP attempts
  MAX_ATTEMPTS: 5,
  
  // Lockout duration (minutes)
  LOCKOUT_MINUTES: 15,
  
  // Rate limiting: max OTP requests per phone per hour
  MAX_OTP_REQUESTS_PER_HOUR: 5,
};

/**
 * Phone number uniqueness constraints
 */
export const PHONE_UNIQUENESS_CONFIG = {
  // Enforce unique phone numbers per user
  ENFORCE_UNIQUE: true,
  
  // Allow phone number reuse after account deletion (days)
  REUSE_AFTER_DELETION_DAYS: 30,
  
  // Soft delete support (keep phone in history)
  SUPPORT_SOFT_DELETE: true,
};

/**
 * Fraud prevention configuration
 */
export const FRAUD_PREVENTION_CONFIG = {
  // Track registrations per IP
  TRACK_IP_REGISTRATIONS: true,
  
  // Max registrations per IP per day
  MAX_REGISTRATIONS_PER_IP_PER_DAY: 10,
  
  // Max registrations per phone per day
  MAX_REGISTRATIONS_PER_PHONE_PER_DAY: 3,
  
  // Track device fingerprints
  TRACK_DEVICE_FINGERPRINTS: true,
  
  // Flag suspicious patterns
  FLAG_SUSPICIOUS_PATTERNS: true,
};

/**
 * Error messages for phone validation
 */
export const PHONE_ERROR_MESSAGES = {
  INVALID_FORMAT: 'Invalid phone number format. Use international format (e.g., +251912345678).',
  MISSING_COUNTRY_CODE: 'Phone number must include country code (e.g., +251912345678).',
  INVALID_COUNTRY_CODE: 'Invalid country code. Please check and try again.',
  TOO_SHORT: 'Phone number is too short.',
  TOO_LONG: 'Phone number is too long.',
  INVALID_CHARACTERS: 'Phone number contains invalid characters.',
  NOT_POSSIBLE: 'This does not appear to be a valid phone number for the specified country.',
  ALREADY_REGISTERED: 'This phone number is already registered.',
  RECENTLY_DELETED: 'This phone number was recently deleted. Please try again later.',
  TOO_MANY_PHONES: 'Too many phone numbers registered. Please try again later.',
  INVALID_TYPE: 'Phone number must be a string.',
};

/**
 * Supported countries for validation
 * 
 * Add country codes as needed
 */
export const SUPPORTED_COUNTRIES = {
  'US': {
    code: 'US',
    callingCode: '+1',
    minLength: 10,
    maxLength: 11,
    name: 'United States',
  },
  'GB': {
    code: 'GB',
    callingCode: '+44',
    minLength: 10,
    maxLength: 12,
    name: 'United Kingdom',
  },
  'ET': {
    code: 'ET',
    callingCode: '+251',
    minLength: 9,
    maxLength: 11,
    name: 'Ethiopia',
  },
  'KE': {
    code: 'KE',
    callingCode: '+254',
    minLength: 9,
    maxLength: 12,
    name: 'Kenya',
  },
  'NG': {
    code: 'NG',
    callingCode: '+234',
    minLength: 10,
    maxLength: 13,
    name: 'Nigeria',
  },
  'ZA': {
    code: 'ZA',
    callingCode: '+27',
    minLength: 9,
    maxLength: 12,
    name: 'South Africa',
  },
  'IN': {
    code: 'IN',
    callingCode: '+91',
    minLength: 10,
    maxLength: 12,
    name: 'India',
  },
};

/**
 * Common phone number patterns (for reference)
 * 
 * Examples of valid numbers:
 * - Ethiopia: +251912345678, +251211234567
 * - Kenya: +254712345678, +254202345678
 * - Nigeria: +2348012345678
 * - US: +14155552671
 * - UK: +442071838750
 */
export const PHONE_PATTERNS = {
  ETHIOPIA: {
    mobile: /^\+251(7|8|9)\d{8}$/,
    landline: /^\+251(1|2|3|4|5|6)\d{7,8}$/,
  },
  KENYA: {
    mobile: /^\+254(7|1)\d{8}$/,
    landline: /^\+254(2|4|6)\d{7,8}$/,
  },
  NIGERIA: {
    mobile: /^\+234(7|8|9)\d{9}$/,
  },
  US: {
    mobile: /^\+1[2-9]\d{2}[2-9]\d{6}$/,
  },
};

/**
 * Export configuration object for easy access
 */
export const PHONE_VALIDATION_CONFIG = {
  phone: PHONE_CONFIG,
  otp: OTP_CONFIG,
  uniqueness: PHONE_UNIQUENESS_CONFIG,
  fraud: FRAUD_PREVENTION_CONFIG,
  supportedCountries: SUPPORTED_COUNTRIES,
};

/**
 * Get country config
 */
export function getCountryConfig(countryCode: string) {
  return SUPPORTED_COUNTRIES[countryCode as keyof typeof SUPPORTED_COUNTRIES];
}

/**
 * Check if country is supported
 */
export function isCountrySupported(countryCode: string): boolean {
  return countryCode in SUPPORTED_COUNTRIES;
}
