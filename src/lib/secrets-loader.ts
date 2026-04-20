import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';

/**
 * Secure Secrets Loader
 * 
 * FLOW:
 * 1. In DEVELOPMENT: Load from .env.local (gitignored dummy values)
 * 2. In PRODUCTION: Load from AWS Secrets Manager OR environment variables
 * 3. Cache secrets in memory (with automatic refresh)
 * 4. NEVER fallback to hardcoded values
 * 5. NEVER log or expose secrets
 */

interface SecretValue {
  data: Record<string, string>;
  timestamp: number;
  ttl: number; // milliseconds
}

class SecretsLoader {
  private cache: SecretValue | null = null;
  private client: SecretsManagerClient | null = null;
  private readonly defaultTTL = 3600000; // 1 hour

  /**
   * Initialize AWS Secrets Manager client (only in production)
   */
  private initializeClient(): SecretsManagerClient {
    if (this.client) {
      return this.client;
    }

    const region = process.env.AWS_REGION || 'us-east-1';
    this.client = new SecretsManagerClient({ region });
    return this.client;
  }

  /**
   * Load secrets from AWS Secrets Manager
   * Used in PRODUCTION when SECRET_NAME is set
   */
  private async loadFromAwsSecretsManager(): Promise<Record<string, string>> {
    try {
      const secretName = process.env.SECRET_NAME;
      if (!secretName) {
        throw new Error('SECRET_NAME not set');
      }

      const client = this.initializeClient();
      const command = new GetSecretValueCommand({ SecretId: secretName });
      const response = await client.send(command);

      if (!response.SecretString) {
        throw new Error('No secret string found in AWS Secrets Manager');
      }

      try {
        return JSON.parse(response.SecretString);
      } catch {
        // If not JSON, return as single secret
        return { value: response.SecretString };
      }
    } catch (error) {
      console.error('Failed to load secrets from AWS:', error);
      throw error;
    }
  }

  /**
   * Load secrets from environment variables
   * Used as fallback or in development
   */
  private loadFromEnvironment(): Record<string, string> {
    return {
      DATABASE_URL: process.env.DATABASE_URL || '',
      JWT_SECRET: process.env.JWT_SECRET || '',
      NODE_ENV: process.env.NODE_ENV || 'development',
    };
  }

  /**
   * Check if cache is still valid
   */
  private isCacheValid(): boolean {
    if (!this.cache) return false;
    const age = Date.now() - this.cache.timestamp;
    return age < this.cache.ttl;
  }

  /**
   * Get secrets from appropriate source
   * SECURITY: Returns cached value if valid, prevents excessive API calls
   */
  async getSecrets(): Promise<Record<string, string>> {
    // Return cached if still valid
    if (this.isCacheValid()) {
      return this.cache!.data;
    }

    let secrets: Record<string, string>;

    // Production: Try AWS Secrets Manager first
    if (
      process.env.NODE_ENV === 'production' &&
      process.env.SECRET_NAME
    ) {
      try {
        secrets = await this.loadFromAwsSecretsManager();
      } catch (error) {
        console.error(
          'AWS Secrets Manager unavailable, falling back to environment variables'
        );
        secrets = this.loadFromEnvironment();
      }
    } else {
      // Development: Load from environment
      secrets = this.loadFromEnvironment();
    }

    // Cache the loaded secrets
    this.cache = {
      data: secrets,
      timestamp: Date.now(),
      ttl: this.defaultTTL,
    };

    return secrets;
  }

  /**
   * Get a single secret value
   * SECURITY: Validates the secret exists before returning
   */
  async getSecret(key: string): Promise<string> {
    const secrets = await this.getSecrets();
    const value = secrets[key];

    if (!value) {
      throw new Error(`Secret "${key}" not found. Ensure it's defined in environment or AWS Secrets Manager.`);
    }

    return value;
  }

  /**
   * Clear the cache (call after updating secrets)
   */
  clearCache(): void {
    this.cache = null;
    console.log('✓ Secrets cache cleared');
  }

  /**
   * Disconnect AWS client
   */
  disconnect(): void {
    if (this.client) {
      this.client.destroy();
      this.client = null;
    }
  }
}

// Singleton instance
let instance: SecretsLoader | null = null;

/**
 * Get or create the secrets loader instance
 */
export function getSecretsLoader(): SecretsLoader {
  if (!instance) {
    instance = new SecretsLoader();
  }
  return instance;
}

/**
 * Get a secret value
 */
export async function getSecret(key: string): Promise<string> {
  return getSecretsLoader().getSecret(key);
}

/**
 * Get all secrets
 */
export async function getSecrets(): Promise<Record<string, string>> {
  return getSecretsLoader().getSecrets();
}

/**
 * Clear secrets cache
 */
export function clearSecretsCache(): void {
  getSecretsLoader().clearCache();
}

/**
 * Disconnect from AWS
 */
export function disconnectSecretsLoader(): void {
  getSecretsLoader().disconnect();
}

export default getSecretsLoader;
