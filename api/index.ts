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
