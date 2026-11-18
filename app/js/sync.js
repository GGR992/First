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
}

export function isLikelyScriptUrl(url) {
  return /^https:\/\/script\.google(usercontent)?\.com\/.+/.test(String(url).trim());
}
