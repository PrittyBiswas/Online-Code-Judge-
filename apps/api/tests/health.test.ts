import { describe, it, expect } from 'vitest';
import { IncomingMessage, ServerResponse } from 'http';
import { Duplex } from 'stream';
import type { Socket } from 'net';
import { APP_INFO } from '@judge/shared';
import { app } from '../src/app.js';

function dispatchRequest(method: string, url: string): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const outputChunks: Buffer[] = [];
    const fakeSocket = new Duplex({
      read() {
        this.push(null);
      },
      write(chunk, _encoding, callback) {
        outputChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        callback();
      },
    }) as unknown as Socket;
    (fakeSocket as unknown as { remoteAddress: string }).remoteAddress = '127.0.0.1';

    const req = new IncomingMessage(fakeSocket);
    req.method = method;
    req.url = url;
    req.headers = { host: 'localhost' };

    const res = new ServerResponse(req);
    res.assignSocket(fakeSocket);

    res.on('finish', () => {
      const raw = Buffer.concat(outputChunks).toString('utf8');
      const headerEnd = raw.indexOf('\r\n\r\n');
      const bodyStr = headerEnd >= 0 ? raw.slice(headerEnd + 4) : raw;
      try {
        resolve({ status: res.statusCode, body: JSON.parse(bodyStr) });
      } catch (err) {
        reject(err);
      }
    });

    res.on('error', reject);
    app(req, res);
  });
}

describe('API Root & Health Endpoints + Shared Import (Day 2)', () => {
  it('imports constants cleanly from @judge/shared', () => {
    expect(APP_INFO.NAME).toBe('Online Code Judge');
    expect(APP_INFO.VERSION).toBe('1.0.0');
  });

  it('responds on GET / and GET /health/live', async () => {
    const rootRes = await dispatchRequest('GET', '/');
    expect(rootRes.status).toBe(200);
    expect(rootRes.body.name).toBe('Online Code Judge API');
    expect(rootRes.body.healthEndpoint).toBe('/health/live');

    const healthRes = await dispatchRequest('GET', '/health/live');
    expect(healthRes.status).toBe(200);
    expect(healthRes.body.status).toBe('ok');
    expect(healthRes.body.service).toBe('@judge/api');
    expect(typeof healthRes.body.uptime).toBe('number');
  });
});
