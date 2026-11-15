import { app, session, shell } from 'electron';

/**
 * Process-wide security hardening (docs/architecture-plan.md §1.1).
 * Call before any window is created.
 */
export function applySecurityPolicy(): void {
  // Deny every permission request (camera, mic, geolocation, notifications from web content, …).
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);

  app.on('web-contents-created', (_event, contents) => {
    // No new windows from renderer content. External http(s) links open in the OS browser.
    contents.setWindowOpenHandler(({ url }) => {
      if (/^https:\/\//.test(url)) void shell.openExternal(url);
      return { action: 'deny' };
    });

    // Block navigation away from the app's own origin.
    contents.on('will-navigate', (event, url) => {
      if (!isAppUrl(url, contents.getURL())) event.preventDefault();
    });

    // No <webview> tags.
    contents.on('will-attach-webview', (event) => event.preventDefault());
  });
}

function isAppUrl(target: string, current: string): boolean {
  try {
    const t = new URL(target);
    const c = new URL(current);
    if (t.protocol === 'file:' && c.protocol === 'file:') return true;
    return t.origin === c.origin && (t.hostname === 'localhost' || t.hostname === '127.0.0.1');
  } catch {
    return false;
  }
}
