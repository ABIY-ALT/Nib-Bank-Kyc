/**
 * Password validation utility with real-time feedback
 * Validates against institutional security requirements
 */

export interface PasswordValidation {
  isValid: boolean;
  requirements: {
    minLength: boolean;
    hasLowercase: boolean;
    hasUppercase: boolean;
    hasNumber: boolean;
    hasSpecialChar: boolean;
  };
}

const REQUIREMENTS = {
  minLength: 8,
  specialChars: '@$!%*?&',
};

export function validatePassword(password: string): PasswordValidation {
  const requirements = {
    minLength: password.length >= REQUIREMENTS.minLength,
    hasLowercase: /[a-z]/.test(password),
    hasUppercase: /[A-Z]/.test(password),
    hasNumber: /\d/.test(password),
    hasSpecialChar: new RegExp(`[${REQUIREMENTS.specialChars.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}]`).test(password),
  };

  const isValid = Object.values(requirements).every(Boolean);

  return {
    isValid,
    requirements,
  };
}

export function getPasswordStrength(validation: PasswordValidation): {
  score: number;
  label: string;
  color: string;
} {
  const metRequirements = Object.values(validation.requirements).filter(Boolean).length;
  
  if (metRequirements <= 2) {
    return { score: 1, label: 'Weak', color: 'text-red-600' };
  }
  if (metRequirements <= 3) {
    return { score: 2, label: 'Fair', color: 'text-yellow-600' };
  }
  if (metRequirements <= 4) {
    return { score: 3, label: 'Good', color: 'text-blue-600' };
  }
  return { score: 4, label: 'Strong', color: 'text-green-600' };
}
