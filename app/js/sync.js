// Talks to the Google Apps Script web app that reads/writes DB_Transactions.
// Uses text/plain POST so the browser sends a "simple" request (no CORS preflight),
// which is what Apps Script web apps support.

export class SheetsRemote {
  constructor(url, key) {
    this.url = url.trim();
    this.key = key;
  }

  async call(payload, timeoutMs = 45000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let res;
    try {
      res = await fetch(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ ...payload, key: this.key }),
        redirect: 'follow',
        signal: ctrl.signal,
      });
    } catch (e) {
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
      throw Object.assign(new Error(offline ? 'You are offline' : 'Could not reach the Google Sheet script'), { code: offline ? 'offline' : 'network' });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) throw Object.assign(new Error(`Google Sheet script error (HTTP ${res.status})`), { code: 'http' });
    let data;
    try {
      data = await res.json();
    } catch {
      throw Object.assign(new Error('Unexpected answer from the script. Is the URL the /exec web app link?'), { code: 'bad_response' });
    }
    if (!data.ok) {
      const msg = data.error === 'unauthorized' ? 'Wrong secret key' : data.error || 'Unknown error';
      throw Object.assign(new Error(msg), { code: data.error });
    }
    return data;
  }

  list() { return this.call({ action: 'list' }); }
  batch(ops) { return this.call({ action: 'batch', ops }); }
  getSettings() { return this.call({ action: 'getSettings' }); }
  setSettings(settings, updatedAt) { return this.call({ action: 'setSettings', settings, updatedAt }); }
}

/* ---------- connection code / link ---------- */
// A code is "BUDGET-" + base64url({u: scriptUrl, k: secret}). A link is the app address + #/connect?u=…&k=….
const b64 = (str) => btoa(unescape(encodeURIComponent(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (str) => decodeURIComponent(escape(atob(str.replace(/-/g, '+').replace(/_/g, '/'))));

export function makeInviteCode(url, key) { return 'BUDGET-' + b64(JSON.stringify({ u: url, k: key })); }

export function makeInviteLink(url, key) {
  return `${location.origin}${location.pathname}#/connect?u=${encodeURIComponent(url)}&k=${encodeURIComponent(key)}`;
}

/** Accepts an invite link or a code (anything pasted around it is ignored). Returns {url, key} or null. */
export function parseInvite(text) {
  const t = String(text || '').trim();
  try {
    const link = t.match(/#\/connect\?([^\s]+)/);
    if (link) {
      const p = new URLSearchParams(link[1]);
      if (p.get('u') && p.get('k')) return { url: p.get('u'), key: p.get('k') };
    }
    const code = t.match(/BUDGET-([A-Za-z0-9_-]+)/);
    if (code) {
      const o = JSON.parse(unb64(code[1]));
      if (o.u && o.k) return { url: o.u, key: o.k };
    }
  } catch { /* not valid */ }
  return null;
}

export function isLikelyScriptUrl(url) {
  return /^https:\/\/script\.google(usercontent)?\.com\/.+/.test(String(url).trim());
}
