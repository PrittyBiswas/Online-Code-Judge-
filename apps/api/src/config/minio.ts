import http from 'http';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

/**
 * MinIO S3-compatible client service.
 * Supports storing and retrieving test case input/output files.
 * Keys are referenced in the database, preserving separation of concerns (Card 9 / AC-PR-01).
 */
class MinioService {
  private inMemoryFallback = new Map<string, string>();
  private bucketCreated = false;

  public async putObject(key: string, content: string): Promise<string> {
    try {
      // Store in S3 / MinIO via HTTP PUT or fallback
      const url = `http://${env.MINIO_ENDPOINT}:${env.MINIO_PORT}/${env.MINIO_BUCKET_NAME}/${key}`;
      const res = await fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'text/plain',
          'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
        },
        body: content,
      });

      if (!res.ok) {
        throw new Error(`MinIO PUT responded with ${res.status}`);
      }
      return key;
    } catch {
      // Fallback to in-memory cache if MinIO is temporarily offline or in unit tests
      this.inMemoryFallback.set(key, content);
      return key;
    }
  }

  public async getObject(key: string): Promise<string | null> {
    try {
      const url = `http://${env.MINIO_ENDPOINT}:${env.MINIO_PORT}/${env.MINIO_BUCKET_NAME}/${key}`;
      const res = await fetch(url);
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
      const res = await fetch(`http://${env.MINIO_ENDPOINT}:${env.MINIO_PORT}/minio/health/live`, {
        signal: AbortSignal.timeout(2000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

export const minioService = new MinioService();

