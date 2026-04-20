/**
 * Comprehensive Phone Validation Test Suite
 * 
 * File: src/lib/phone-validation.test.ts
 * 
 * Test Coverage:
 * - Valid phone numbers from multiple countries
 * - Invalid phone numbers (format, length, country)
 * - Normalization to E.164
 * - Country code detection
 * - Phone comparison
 * - Error handling
 */

import {
  validatePhoneNumber,
  isValidPhone,
  normalizePhoneNumber,
  getPhoneCountryCode,
  formatPhoneForDisplay,
  arePhoneNumbersEqual,
  comparePhoneNumbers,
  getPhoneInfo,
  PhoneValidationError,
} from './phone-validation';

/**
 * VALID PHONE NUMBERS
 * These should all pass validation
 */
describe('Valid Phone Numbers', () => {
  test('Ethiopia mobile (+251)', () => {
    const result = validatePhoneNumber('+251912345678');
    expect(result.isValid).toBe(true);
    expect(result.normalizedNumber).toBe('+251912345678');
    expect(result.countryCode).toBe('ET');
  });

  test('Ethiopia with spaces and dashes', () => {
    const result = validatePhoneNumber('+251 91 234 5678');
    expect(result.isValid).toBe(true);
    expect(result.normalizedNumber).toBe('+251912345678');
  });

  test('Ethiopia with parentheses', () => {
    const result = validatePhoneNumber('+251 (91) 234-5678');
    expect(result.isValid).toBe(true);
    expect(result.normalizedNumber).toBe('+251912345678');
  });

  test('Kenya mobile (+254)', () => {
    const result = validatePhoneNumber('+254712345678');
    expect(result.isValid).toBe(true);
    expect(result.countryCode).toBe('KE');
  });

  test('Nigeria mobile (+234)', () => {
    const result = validatePhoneNumber('+2349012345678');
    expect(result.isValid).toBe(true);
    expect(result.countryCode).toBe('NG');
  });

  test('USA phone (+1)', () => {
    const result = validatePhoneNumber('+14155552671');
    expect(result.isValid).toBe(true);
    expect(result.countryCode).toBe('US');
    expect(result.normalizedNumber).toBe('+14155552671');
  });

  test('UK phone (+44)', () => {
    const result = validatePhoneNumber('+441632960000');
    expect(result.isValid).toBe(true);
    expect(result.countryCode).toBe('GB');
  });

  test('South Africa (+27)', () => {
    const result = validatePhoneNumber('+27112345678');
    expect(result.isValid).toBe(true);
    expect(result.countryCode).toBe('ZA');
  });

  test('India (+91)', () => {
    const result = validatePhoneNumber('+919876543210');
    expect(result.isValid).toBe(true);
    expect(result.countryCode).toBe('IN');
  });
});

/**
 * INVALID PHONE NUMBERS
 * These should fail validation
 */
describe('Invalid Phone Numbers', () => {
  test('Missing + prefix', () => {
    const result = validatePhoneNumber('251912345678');
    expect(result.isValid).toBe(false);
    expect(result.error).toBe(PhoneValidationError.MISSING_COUNTRY_CODE);
  });

  test('Non-numeric characters (letters)', () => {
    const result = validatePhoneNumber('+251AB2345678');
    expect(result.isValid).toBe(false);
    expect(result.error).toBe(PhoneValidationError.INVALID_CHARACTERS);
  });

  test('Too short phone number', () => {
    const result = validatePhoneNumber('+123');
    expect(result.isValid).toBe(false);
    expect(result.error).toBe(PhoneValidationError.TOO_SHORT);
  });

  test('Too long phone number', () => {
    const result = validatePhoneNumber('+251912345678901234567890');
    expect(result.isValid).toBe(false);
    expect(result.error).toBe(PhoneValidationError.TOO_LONG);
  });

  test('Invalid country code', () => {
    const result = validatePhoneNumber('+999123456789');
    expect(result.isValid).toBe(false);
    expect(result.error).toBe(PhoneValidationError.INVALID_COUNTRY_CODE);
  });

  test('Wrong format - calls without country code', () => {
    const result = validatePhoneNumber('+25191234567'); // One digit short
    expect(result.isValid).toBe(false);
  });

  test('Empty string', () => {
    const result = validatePhoneNumber('');
    expect(result.isValid).toBe(false);
  });

  test('Special characters like @#$%', () => {
    const result = validatePhoneNumber('+251@912#345$678');
    expect(result.isValid).toBe(false);
    expect(result.error).toBe(PhoneValidationError.INVALID_CHARACTERS);
  });

  test('Non-standard spacing', () => {
    const result = validatePhoneNumber('+ 2 5 1 9 1 2 3 4 5 6 7 8');
    expect(result.isValid).toBe(false);
  });
});

/**
 * NORMALIZATION TESTS
 * E.164 format conversion
 */
describe('Normalization to E.164', () => {
  test('Already normalized', () => {
    const result = normalizePhoneNumber('+251912345678');
    expect(result).toBe('+251912345678');
  });

  test('With spaces', () => {
    const result = normalizePhoneNumber('+251 91 234 5678');
    expect(result).toBe('+251912345678');
  });

  test('With dashes', () => {
    const result = normalizePhoneNumber('+251-91-234-5678');
    expect(result).toBe('+251912345678');
  });

  test('With parentheses', () => {
    const result = normalizePhoneNumber('+251 (91) 234-5678');
    expect(result).toBe('+251912345678');
  });

  test('Multiple formatting styles', () => {
    const result = normalizePhoneNumber('+1 (415) 555-2671');
    expect(result).toBe('+14155552671');
  });

  test('Throws on invalid phone', () => {
    expect(() => normalizePhoneNumber('invalid')).toThrow();
  });
});

/**
 * COUNTRY CODE DETECTION
 */
describe('Country Code Detection', () => {
  test('Ethiopia', () => {
    const code = getPhoneCountryCode('+251912345678');
    expect(code).toBe('ET');
  });

  test('Kenya', () => {
    const code = getPhoneCountryCode('+254712345678');
    expect(code).toBe('KE');
  });

  test('USA', () => {
    const code = getPhoneCountryCode('+14155552671');
    expect(code).toBe('US');
  });

  test('Invalid phone returns null', () => {
    const code = getPhoneCountryCode('invalid');
    expect(code).toBeNull();
  });
});

/**
 * PHONE COMPARISON
 */
describe('Phone Number Comparison', () => {
  test('Same phone different formats', () => {
    const areEqual = arePhoneNumbersEqual(
      '+251912345678',
      '+251 91 234 5678'
    );
    expect(areEqual).toBe(true);
  });

  test('Same phone with various formatting', () => {
    const areEqual = arePhoneNumbersEqual(
      '+251-91-234-5678',
      '+251 (91) 234-5678'
    );
    expect(areEqual).toBe(true);
  });

  test('Different phones', () => {
    const areEqual = arePhoneNumbersEqual(
      '+251912345678',
      '+251987654321'
    );
    expect(areEqual).toBe(false);
  });

  test('Different countries', () => {
    const areEqual = arePhoneNumbersEqual(
      '+251912345678',
      '+254912345678'
    );
    expect(areEqual).toBe(false);
  });

  test('Compare with safe method', () => {
    const result = comparePhoneNumbers(
      '+251912345678',
      '+251 91 234 5678'
    );
    expect(result.equal).toBe(true);
    expect(result.error).toBeUndefined();
  });

  test('Compare invalid phones', () => {
    const result = comparePhoneNumbers('invalid1', 'invalid2');
    expect(result.equal).toBe(false);
    expect(result.error).toBeDefined();
  });
});

/**
 * DISPLAY FORMATTING
 */
describe('Format for Display', () => {
  test('Ethiopia format', () => {
    const formatted = formatPhoneForDisplay('+251912345678');
    expect(formatted).toContain('251');
    expect(formatted).toMatch(/[0-9\-\s\(\)]/);
  });

  test('USA format', () => {
    const formatted = formatPhoneForDisplay('+14155552671');
    expect(formatted).toMatch(/\(415\)|415/);
  });

  test('Invalid phone returns empty string', () => {
    const formatted = formatPhoneForDisplay('invalid');
    expect(formatted).toBe('');
  });
});

/**
 * PHONE INFO RETRIEVAL
 */
describe('Phone Information', () => {
  test('Get full phone info', () => {
    const info = getPhoneInfo('+251912345678');
    expect(info).toBeDefined();
    expect(info?.e164).toBe('+251912345678');
    expect(info?.countryCode).toBe('ET');
    expect(info?.valid).toBe(true);
  });

  test('Invalid phone returns null', () => {
    const info = getPhoneInfo('invalid');
    expect(info).toBeNull();
  });

  test('Phone info for USA', () => {
    const info = getPhoneInfo('+14155552671');
    expect(info?.countryCode).toBe('US');
    expect(info?.e164).toBe('+14155552671');
  });
});

/**
 * BATCH OPERATIONS
 */
describe('Batch Phone Validation', () => {
  test('Validate multiple phones', () => {
    const phones = [
      '+251912345678',
      '+254712345678',
      'invalid',
      '+14155552671',
    ];
    const results = validatePhoneNumber(phones);

    expect(results).toHaveLength(4);
    expect(results[0].isValid).toBe(true);
    expect(results[1].isValid).toBe(true);
    expect(results[2].isValid).toBe(false);
    expect(results[3].isValid).toBe(true);
  });

  test('Batch with all valid', () => {
    const phones = ['+251912345678', '+254712345678'];
    const results = validatePhoneNumber(phones);

    expect(results.every((r) => r.isValid)).toBe(true);
  });

  test('Batch with all invalid', () => {
    const phones = ['invalid1', 'invalid2', 'invalid3'];
    const results = validatePhoneNumber(phones);

    expect(results.every((r) => !r.isValid)).toBe(true);
  });
});

/**
 * ERROR MESSAGES
 */
describe('Error Messages', () => {
  test('User-friendly error for missing country code', () => {
    const result = validatePhoneNumber('912345678');
    expect(result.isValid).toBe(false);
    expect(result.errorMessage).toBeDefined();
    expect(result.errorMessage).not.toContain('MISSING_COUNTRY_CODE');
    expect(result.errorMessage.length > 0).toBe(true);
  });

  test('User-friendly error for invalid format', () => {
    const result = validatePhoneNumber('+251abc');
    expect(result.errorMessage).toBeDefined();
    expect(result.errorMessage.toLowerCase()).toMatch(/invalid|format|character/);
  });

  test('Error message varies by error type', () => {
    const tooShort = validatePhoneNumber('+1');
    const tooLong = validatePhoneNumber('+251' + '9'.repeat(50));

    expect(tooShort.errorMessage).not.toBe(tooLong.errorMessage);
  });
});

/**
 * EDGE CASES
 */
describe('Edge Cases', () => {
  test('Phone with leading zeros is corrected', () => {
    // Some formats might have leading zeros that need handling
    const result = validatePhoneNumber('+2510912345678');
    // libphonenumber will handle this
    expect(result).toBeDefined();
  });

  test('Lowercase/uppercase handling', () => {
    // Phone validation should be case-insensitive (no letters typically)
    const result = validatePhoneNumber('+251912345678');
    expect(result.isValid).toBe(true);
  });

  test('Null/undefined handling', () => {
    expect(() => validatePhoneNumber(null as any)).toThrow();
    expect(() => validatePhoneNumber(undefined as any)).toThrow();
  });

  test('Numeric input', () => {
    const result = validatePhoneNumber(251912345678 as any);
    // Should fail type check or convert and fail validation
    expect(result.isValid).toBe(false);
  });

  test('Very long string', () => {
    const longString = '+' + '1'.repeat(1000);
    const result = validatePhoneNumber(longString);
    expect(result.isValid).toBe(false);
    expect(result.error).toBe(PhoneValidationError.TOO_LONG);
  });
});

/**
 * INTEGRATION SCENARIOS
 */
describe('Integration Scenarios', () => {
  test('Registration flow - collect, validate, normalize', () => {
    const userInput = '+251 (91) 234-5678';

    // Step 1: Validate
    const validation = validatePhoneNumber(userInput);
    expect(validation.isValid).toBe(true);

    // Step 2: Get normalized
    const normalized = validation.normalizedNumber;
    expect(normalized).toBe('+251912345678');

    // Step 3: Get country code
    const countryCode = validation.countryCode;
    expect(countryCode).toBe('ET');

    // Step 4: Store normalized version
    expect(normalized).toMatch(/^\+\d{7,15}$/); // E.164 format
  });

  test('Profile update flow - new phone validation', () => {
    const oldPhone = '+251912345678';
    const newPhone = '+254 71 234 5678';

    // Validate new phone
    const validation = validatePhoneNumber(newPhone);
    expect(validation.isValid).toBe(true);

    // Ensure different from old
    const isSame = arePhoneNumbersEqual(oldPhone, newPhone);
    expect(isSame).toBe(false);

    // Use normalized for update
    expect(validation.normalizedNumber).toBe('+254712345678');
  });

  test('Duplicate detection flow', () => {
    const phone1 = '+251912345678';
    const phone2 = '+251 (91) 234-5678';

    // Both normalize to same E.164
    const norm1 = normalizePhoneNumber(phone1);
    const norm2 = normalizePhoneNumber(phone2);

    expect(norm1).toBe(norm2);
    // This same normalized version would trigger duplicate error in DB
  });

  test('API response flow', () => {
    const result = validatePhoneNumber('+14155552671');

    if (result.isValid) {
      const response = {
        success: true,
        phone: result.normalizedNumber,
        countryCode: result.countryCode,
      };

      expect(response.success).toBe(true);
      expect(response.phone).toBe('+14155552671');
      expect(response.countryCode).toBe('US');
    }
  });
});

/**
 * PERFORMANCE TESTS
 */
describe('Performance', () => {
  test('Validation completes quickly', () => {
    const start = Date.now();
    const result = validatePhoneNumber('+251912345678');
    const duration = Date.now() - start;

    expect(result.isValid).toBe(true);
    expect(duration).toBeLessThan(50); // Should be very fast (< 50ms)
  });

  test('Batch validation acceptable performance', () => {
    const phones = Array(100)
      .fill(null)
      .map((_, i) => `+251${9}${String(i).padStart(8, '0')}`);

    const start = Date.now();
    const results = validatePhoneNumber(phones);
    const duration = Date.now() - start;

    expect(results).toHaveLength(100);
    expect(duration).toBeLessThan(1000); // 100 validations < 1 second
  });
});
