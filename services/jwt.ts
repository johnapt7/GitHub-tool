import jwt from 'jsonwebtoken';
import { GitHubAppConfig } from '../types/github';
import logger from '../utils/logger';

export class JWTService {
  private readonly appId: number;
  private readonly privateKey: string;

  constructor(config: GitHubAppConfig) {
    this.appId = config.appId;
    this.privateKey = config.privateKey;
  }

  generateAppJWT(expirationTime = 600): string {
    try {
      const now = Math.floor(Date.now() / 1000);
      const payload = {
        iat: now - 60, // Issued at time (60 seconds in the past to allow for clock skew)
        exp: now + expirationTime, // Expiration time (10 minutes from now)
        iss: this.appId, // Issuer (GitHub App ID)
      };

      const token = jwt.sign(payload, this.privateKey, {
        algorithm: 'RS256',
      });

      logger.debug('Generated JWT token for GitHub App', {
        appId: this.appId,
        expiresIn: expirationTime,
      });

      return token;
    } catch (error) {
      logger.error('Failed to generate JWT token', {
        error: error instanceof Error ? error.message : 'Unknown error',
        appId: this.appId,
      });
      throw new Error(`JWT generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  verifyJWT(token: string): jwt.JwtPayload | null {
    try {
      const decoded = jwt.verify(token, this.privateKey, {
        algorithms: ['RS256'],
      }) as jwt.JwtPayload;

      logger.debug('Verified JWT token', {
        appId: decoded.iss,
        expiresAt: new Date(decoded.exp! * 1000),
      });

      return decoded;
    } catch (error) {
      logger.warn('JWT verification failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }

  isJWTExpired(token: string): boolean {
    try {
      const decoded = jwt.decode(token) as jwt.JwtPayload;
      if (!decoded || !decoded.exp) {
        return true;
      }

      const now = Math.floor(Date.now() / 1000);
      const bufferTime = 60; // 1 minute buffer
      
      return decoded.exp < (now + bufferTime);
    } catch (error) {
      logger.warn('Failed to check JWT expiration', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return true;
    }
  }

  getJWTExpirationTime(token: string): Date | null {
    try {
      const decoded = jwt.decode(token) as jwt.JwtPayload;
      if (!decoded || !decoded.exp) {
        return null;
      }

      return new Date(decoded.exp * 1000);
    } catch (error) {
      logger.warn('Failed to get JWT expiration time', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }

  static validatePrivateKey(privateKey: string): boolean {
    try {
      // Check if the key starts with proper PEM headers
      const pemRegex = /^-----BEGIN (RSA )?PRIVATE KEY-----[\s\S]*-----END (RSA )?PRIVATE KEY-----$/;
      if (!pemRegex.test(privateKey.trim())) {
        return false;
      }

      // Try to create a simple JWT to validate the key
      const testPayload = { test: true, exp: Math.floor(Date.now() / 1000) + 60 };
      jwt.sign(testPayload, privateKey, { algorithm: 'RS256' });
      
      return true;
    } catch (error) {
      logger.warn('Private key validation failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }
}