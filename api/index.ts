import type { IncomingMessage, ServerResponse } from 'http';
import { createExpressApp } from '../server/app';

let appInstance: any = null;

function getApp() {
  if (!appInstance) {
    appInstance = createExpressApp();
  }
  return appInstance;
}

export default function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const customReq = req as any;
    // If Vercel or a proxy rewrote the request to /api, recover original path
    if (customReq.url === '/api' || customReq.url === '/' || customReq.url?.startsWith('/api?')) {
      const originalPath = customReq.headers?.['x-matched-path'] || customReq.headers?.['x-now-route-matches'];
      if (typeof originalPath === 'string' && originalPath.startsWith('/api/')) {
        customReq.url = originalPath;
      }
    }
    const app = getApp();
    return app(req, res);
  } catch (err: any) {
    console.error('[Vercel Serverless Function Crash]', err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: err?.message || 'Internal Server Error' }));
    }
  }
}
