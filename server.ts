import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { db, DEFAULT_WORKSPACE_ID } from './server/db';
import { SyncService } from './server/syncService';
import { createExpressApp } from './server/app';

export { createExpressApp };

export async function startServer() {
  const app = createExpressApp();
  const PORT = Number(process.env.PORT) || 3000;

  // Background Auto-Sync Timer (PRD Section 17)
  let lastSyncTime = Date.now();
  setInterval(async () => {
    try {
      const settings = db.getSettings(DEFAULT_WORKSPACE_ID);
      const interval = settings.auto_sync_interval;
      if (interval === 'manual') return;

      let intervalMs = 15 * 60 * 1000; // default 15m
      if (interval === '30m') intervalMs = 30 * 60 * 1000;
      else if (interval === '1h') intervalMs = 60 * 60 * 1000;
      else if (interval === '4h') intervalMs = 4 * 60 * 60 * 1000;

      if (Date.now() - lastSyncTime >= intervalMs) {
        lastSyncTime = Date.now();
        console.log(`[Auto-Sync] Triggering scheduled sync (${interval})...`);
        await SyncService.runSync({ workspaceId: DEFAULT_WORKSPACE_ID });
      }
    } catch (e) {
      console.error('[Auto-Sync Error]', e);
    }
  }, 60 * 1000);

  // Initial Hydration from Supabase (PRD Section 85)
  setTimeout(async () => {
    try {
      console.log('[Startup] Hydrating backend quotations and follow-ups from Supabase...');
      const hydrated = await db.hydrateFromSupabase(DEFAULT_WORKSPACE_ID);
      if (hydrated) {
        console.log('[Startup] Supabase hydration successful. Data synchronized with Supabase.');
      } else {
        const existing = db.getQuotations(DEFAULT_WORKSPACE_ID);
        if (existing.length === 0) {
          console.log('[Initial Sync] Zero quotations found in store, performing initial sync from Google Sheet...');
          await SyncService.runSync({ workspaceId: DEFAULT_WORKSPACE_ID });
          console.log('[Initial Sync] Completed successfully.');
        }
      }
    } catch (e) {
      console.warn('[Startup] Supabase hydration / initial sync warning:', e);
    }
  }, 500);

  // Serve static public assets (icons, manifest, favicon)
  const publicPath = path.join(process.cwd(), 'public');
  app.use(express.static(publicPath));

  // Vite middleware for development / SPA static fallback for production
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Quotation Follow-Up Manager server running on http://0.0.0.0:${PORT}`);
  });
}

// Only start standalone server if not running in Vercel serverless function
if (!process.env.VERCEL && !process.env.AWS_LAMBDA_FUNCTION_NAME) {
  startServer().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}
