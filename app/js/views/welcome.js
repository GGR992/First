// Welcome: shown once on a new device — who shares this budget, and the currency.
import { peopleEditorHTML, bindPeopleEditor } from '../people-editor.js';
import { parseInvite } from '../sync.js';

export function render() {
  return `<section class="stack">
    <div class="card">
      <h2>Welcome 👋</h2>
      <p class="muted">Who shares this budget? Add one person or up to six. You can change this later in Settings.</p>
      ${peopleEditorHTML(['', ''], { currency: '', submit: 'Start budgeting' })}
    </div>
    <div class="card">
      <h2>Already have a shared budget?</h2>
      <p class="muted">If someone sent you a link or a code to join their Google Sheet, paste it here.</p>
      <form id="join-form" class="form" autocomplete="off">
        <label class="field"><span>Link or code</span><input name="invite" placeholder="Paste the link or BUDGET-… code" autocapitalize="off" spellcheck="false" required></label>
        <p class="form-error" role="alert"></p>
        <button class="btn">Join</button>
      </form>
      <p class="hint left">Want your own Google Sheet instead? Open <a href="#/settings">Settings</a> after you start — it has a step-by-step guide.</p>
    </div>
  </section>`;
}

export function mount(root, ctx) {
  const { store } = ctx;
  bindPeopleEditor(root.querySelector('.people-form'), async ({ people, currency }) => {
    await store.saveSettings({ people, currency: currency || '', configured: true });
    ctx.toast('All set — add your first income to begin');
    ctx.go('add?income');
  });
  const join = root.querySelector('#join-form');
  join.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = join.querySelector('.form-error');
    const inv = parseInvite(join.elements.invite.value);
    if (!inv) { err.textContent = 'That does not look like a link or code from the app.'; return; }
    err.textContent = '';
    const ok = await ctx.connectTo(inv.url, inv.key, { confirmFirst: false });
    if (ok && !store.settings.configured) ctx.go('settings');
  });
}
