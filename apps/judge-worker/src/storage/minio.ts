import crypto from 'crypto';
import { workerEnv } from '../config/env.js';

function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function hmacSha256(key: Buffer | string, value: string): Buffer {
  return crypto.createHmac('sha256', key).update(value, 'utf8').digest();
}

export class WorkerObjectStorage {
  private buildSignedRequest(method: 'GET' | 'PUT' | 'DELETE', key: string, body: string = '') {
    const protocol = workerEnv.MINIO_USE_SSL ? 'https' : 'http';
    const host = `${workerEnv.MINIO_ENDPOINT}:${workerEnv.MINIO_PORT}`;
    const cleanKey = key.replace(/^\/+/, '');
    const encodedPath = cleanKey.split('/').map(encodeURIComponent).join('/');
    const canonicalUri = `/${workerEnv.MINIO_BUCKET_NAME}/${encodedPath}`;
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

    const kDate = hmacSha256(`AWS4${workerEnv.MINIO_SECRET_KEY}`, dateStamp);
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
        Authorization: `AWS4-HMAC-SHA256 Credential=${workerEnv.MINIO_ACCESS_KEY}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      },
    };
  }

  /**
   * Fetches a test-case object from MinIO/Silo.
   * Returns null if the object does not exist (404); throws on connectivity or auth errors.
   */
  public async getObject(key: string): Promise<string | null> {
    const { url, headers } = this.buildSignedRequest('GET', key);
    const res = await fetch(url, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(5000),
    });

    if (res.status === 404) {
      return null;
    }

    if (!res.ok) {
      throw new Error(`Object storage GET failed for key "${key}" with HTTP ${res.status}`);
    }

    return res.text();
  }

  public async putObject(key: string, content: string): Promise<void> {
    const { url, headers } = this.buildSignedRequest('PUT', key, content);
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
      throw new Error(`Object storage PUT failed for key "${key}" with HTTP ${res.status}`);
    }
  }

  public async deleteObject(key: string): Promise<void> {
    const { url, headers } = this.buildSignedRequest('DELETE', key);
    const res = await fetch(url, {
      method: 'DELETE',
      headers,
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok && res.status !== 404) {
      throw new Error(`Object storage DELETE failed for key "${key}" with HTTP ${res.status}`);
    }
  }
}

export const workerStorage = new WorkerObjectStorage();
