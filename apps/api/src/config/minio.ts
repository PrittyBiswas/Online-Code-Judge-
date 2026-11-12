import crypto from 'crypto';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function hmacSha256(key: Buffer | string, value: string): Buffer {
  return crypto.createHmac('sha256', key).update(value, 'utf8').digest();
}

function buildSignedHeaders(method: 'PUT' | 'GET' | 'DELETE', key: string, body: string) {
  const protocol = env.MINIO_USE_SSL ? 'https' : 'http';
  const host = `${env.MINIO_ENDPOINT}:${env.MINIO_PORT}`;
  const cleanKey = key.replace(/^\/+/, '');
  const encodedPath = cleanKey.split('/').map(encodeURIComponent).join('/');
  const canonicalUri = `/${env.MINIO_BUCKET_NAME}/${encodedPath}`;
  const url = `${protocol}://${host}${canonicalUri}`;

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const region = 'us-east-1';
  const payloadHash = sha256Hex(body);
  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = `${method}\n${canonicalUri}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
  const scope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${sha256Hex(canonicalRequest)}`;

  const kDate = hmacSha256(`AWS4${env.MINIO_ROOT_PASSWORD}`, dateStamp);
  const kRegion = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, 's3');
  const kSigning = hmacSha256(kService, 'aws4_request');
  const signature = crypto
    .createHmac('sha256', kSigning)
    .update(stringToSign, 'utf8')
    .digest('hex');

  return {
    url,
    headers: {
      'x-amz-date': amzDate,
      'x-amz-content-sha256': payloadHash,
      Authorization: `AWS4-HMAC-SHA256 Credential=${env.MINIO_ROOT_USER}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
  };
}

/**
 * MinIO / Silo S3-compatible client service.
 * Signs S3 requests with AWS Signature V4 using configured credentials.
 */
class MinioService {
  private inMemoryFallback = new Map<string, string>();

  public async putObject(key: string, content: string): Promise<string> {
    try {
      const { url, headers } = buildSignedHeaders('PUT', key, content);
      const res = await fetch(url, {
        method: 'PUT',
        headers: {
          ...headers,
          'Content-Type': 'text/plain; charset=utf-8',
        },
        body: content,
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) {
        throw new Error(`MinIO PUT responded with ${res.status}`);
      }
      return key;
    } catch (err) {
      if (env.NODE_ENV === 'test') {
        // Fallback to in-memory cache only in offline unit tests
        this.inMemoryFallback.set(key, content);
        return key;
      }
      logger.error(
        { key, status: err instanceof Error ? err.message : 'unknown' },
        'MinIO PUT failed'
      );
      throw new Error('Failed to store test-case object in object storage');
    }
  }

  public async deleteObject(key: string): Promise<void> {
    this.inMemoryFallback.delete(key);
    try {
      const { url, headers } = buildSignedHeaders('DELETE', key, '');
      const res = await fetch(url, {
        method: 'DELETE',
        headers,
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok && res.status !== 404) {
        throw new Error(`MinIO DELETE responded with ${res.status}`);
      }
    } catch (err) {
      if (env.NODE_ENV === 'test') {
        return;
      }
      logger.warn(
        { key, err: err instanceof Error ? err.message : 'unknown' },
        'MinIO DELETE failed'
      );
      throw new Error('Failed to delete test-case object from object storage');
    }
  }

  public async deleteObjects(keys: string[]): Promise<void> {
    for (const key of keys) {
      try {
        await this.deleteObject(key);
      } catch (err) {
        logger.warn(
          { key, err: err instanceof Error ? err.message : 'unknown' },
          'MinIO cleanup skipped object after failure'
        );
      }
    }
  }

  public async getObject(key: string): Promise<string | null> {
    try {
      const { url, headers } = buildSignedHeaders('GET', key, '');
      const res = await fetch(url, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) {
        if (this.inMemoryFallback.has(key)) {
          return this.inMemoryFallback.get(key)!;
        }
        return null;
      }
      return await res.text();
    } catch {
      return this.inMemoryFallback.get(key) || null;
    }
  }

  public async isHealthy(): Promise<boolean> {
    try {
      const protocol = env.MINIO_USE_SSL ? 'https' : 'http';
      const res = await fetch(
        `${protocol}://${env.MINIO_ENDPOINT}:${env.MINIO_PORT}/minio/health/live`,
        {
          signal: AbortSignal.timeout(2000),
        }
      );
      return res.ok;
    } catch {
      return false;
    }
  }
}

export const minioService = new MinioService();
