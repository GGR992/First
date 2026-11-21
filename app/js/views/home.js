// Home: the "at a glance" dashboard (top-right part of the sheet).
// The person selector in the header (All / one person) narrows the big number,
// the stat tiles, the category donut and "Still to pay". "Spent vs income" always shows both people.
import { money, esc, addMonths, monthName, pct, loadHue } from '../util.js';
import { summarize } from '../stats.js';
import { donut, catColor } from '../charts.js';
import { statStrip, deltaBadge, txRow, emptyState, personIndex } from '../ui.js';

const ZERO = { spent: 0, income: 0, unpaid: 0 };

/** Left ←— ▲ —→ Right. The triangle sits toward whoever paid more than their fair share. */
function balanceLine(store, cur) {
  const people = store.settings.people;
  if (people.length !== 2) return '';
  const [a, b] = people;
  const sa = (cur.byPerson[a] || ZERO).spent;
  const sb = (cur.byPerson[b] || ZERO).spent;
  const total = sa + sb;
  if (!total) return '';
  const diff = sa - sb;
  const even = Math.abs(diff) < 0.5;
  const more = diff > 0 ? a : b;
  const pos = even ? 50 : Math.min(96, Math.max(4, 50 - (diff / total) * 50)); // toward the left name when `a` paid more
  const over = Math.abs((diff > 0 ? sa : sb) - cur.fairShare);
  return `<div class="balance">
    <div class="bal-names"><span class="p0">${esc(a)}</span><span class="p1">${esc(b)}</span></div>
    <div class="bal-track" role="img" aria-label="${even ? 'Even' : `${esc(more)} paid more`}">
      <span class="bal-mid"></span>
      ${even ? '' : `<span class="bal-tri p${personIndex(store, more)}" style="left:${pos}%"></span>`}
    </div>
    <div class="bal-text">${even ? 'Even this month 🎉' : `<b class="p${personIndex(store, more)}">${esc(more)}</b> paid more: ${money(over)}`}</div>
  </div>`;
}

function loadRow(store, p, d) {
  const ratio = d.income ? d.spent / d.income : d.spent ? 1.2 : 0;
  const hue = Math.round(loadHue(ratio));
  const over = d.spent - d.income;
  let status;
  if (!d.income) status = d.spent ? '⚠ no income added yet' : 'nothing yet';
  else if (ratio > 1) status = `⚠ ${money(over)} over income`;
  else status = `${money(d.income - d.spent)} left`;
  return `<div class="person-row" style="--h:${hue}">
    <span class="avatar p${personIndex(store, p)}">${esc(p[0] || '?')}</span>
    <div class="person-main">
      <div class="person-top"><b>${esc(p)}</b><span class="load-text">${money(d.spent)} <small>/ ${money(d.income)}</small></span></div>
      <div class="meter" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(ratio * 100)}" aria-label="${esc(p)} spent ${Math.round(ratio * 100)}% of income">
        <div class="meter-fill load" style="width:${Math.min(ratio, 1) * 100}%"></div></div>
      <div class="person-sub"><span class="load-text">${d.income ? Math.round(ratio * 100) + '%' : '—'} · ${status}</span>${d.unpaid ? ` · ${money(d.unpaid)} to pay` : ''}</div>
    </div>
  </div>`;
}

export function render({ store, state }) {
  const s = store.settings;
  const m = state.month;
  const txs = store.txFor('all');
  const cur = summarize(txs, m, s.people);
  const prevKey = addMonths(m, -1);
  const prev = summarize(txs, prevKey, s.people);
  const n = s.people.length;

  if (!cur.list.length) {
    const hasPrev = prev.exp.length > 0;
    return `<section class="stack">
      ${emptyState(`Nothing in ${monthName(m)} yet`,
        hasPrev ? `Start by adding this month's income, then copy the bills you had in ${monthName(prevKey)}.`
                : 'Add your first income or expense, or connect your Google Sheet in Settings.',
        `<div class="btn-row">
          <a class="btn primary" href="#/add?income">Add income</a>
          ${hasPrev ? `<a class="btn" href="#/add?last">Copy from ${esc(monthName(prevKey))}</a>` : '<a class="btn" href="#/settings">Settings</a>'}
        </div>`)}
    </section>`;
  }

  const sel = n > 1 && s.people.includes(state.person) ? state.person : 'all';
  const one = sel !== 'all';
  const pick = (sm) => (one
    ? (sm.byPerson[sel] || ZERO)
    : { spent: sm.expenses, income: sm.income, unpaid: sm.unpaidAmount });
  const c = pick(cur);
  const pv = pick(prev);
  const left = c.income - c.spent;
  const spentPct = c.income ? Math.min(100, pct(c.spent, c.income)) : (c.spent ? 100 : 0);

  const myExp = one ? cur.exp.filter((t) => t.payer === sel) : cur.exp;
  const myUnpaid = myExp.filter((t) => !t.paid).sort((a, b) => b.amount - a.amount);

  const catMap = {};
  for (const t of myExp) catMap[t.category] = (catMap[t.category] || 0) + t.amount;
  const cats = Object.entries(catMap).map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount);
  // Up to 6 categories; anything smaller is merged into "+N more" (not the category called "Other").
  const SHOWN = cats.length > 7 ? 6 : cats.length;
  const rest = cats.slice(SHOWN);
  const segments = [
    ...cats.slice(0, SHOWN).map((x) => ({ label: x.category, value: x.amount, color: catColor(x.category, s.expenseCategories) })),
    ...(rest.length ? [{ label: `+${rest.length} smaller`, value: rest.reduce((a, x) => a + x.amount, 0), color: '#94a3b8', note: rest.map((x) => x.category).join(', ') }] : []),
  ];

  const tiles = [
    { label: 'Expenses', value: money(c.spent), sub: deltaBadge(c.spent, pv.spent, { suffix: ' vs ' + monthName(prevKey).slice(0, 3) }) },
    { label: 'Income', value: money(c.income), sub: deltaBadge(c.income, pv.income, { goodWhenDown: false }) },
    { label: 'To pay', value: money(c.unpaid), sub: `${myUnpaid.length} item${myUnpaid.length === 1 ? '' : 's'}`, tone: myUnpaid.length ? 'warn' : 'good', tab: 'current' },
    n === 2 && !one
      ? { label: 'Fair share', value: money(cur.fairShare, { decimals: 0 }), sub: 'each of 2' }
      : { label: 'Of income', value: c.income ? Math.round(pct(c.spent, c.income)) + '%' : '—', sub: 'spent', tone: c.income && c.spent > c.income ? 'bad' : '' },
  ];

  return `<section class="stack">
    <div class="card hero">
      <div class="hero-label">Left this month${one ? ` · ${esc(sel)}` : ''}</div>
      <div class="hero-value ${left < 0 ? 'neg' : ''}">${money(left)}</div>
      <div class="progress" aria-label="Spent ${Math.round(spentPct)}% of income"><div style="width:${spentPct}%"></div></div>
      <div class="hero-sub">Spent ${money(c.spent)} of ${money(c.income)} income</div>
    </div>

    ${statStrip(tiles)}

    <div class="card">
      <div class="card-head"><h2>Spent vs income</h2></div>
      ${s.people.map((p) => loadRow(store, p, cur.byPerson[p] || ZERO)).join('')}
      ${n === 2 ? balanceLine(store, cur) : ''}
    </div>

    <div class="card">
      <div class="card-head"><h2>Where it went${one ? ` · ${esc(sel)}` : ''}</h2><a href="#/stats" class="link">Details</a></div>
      ${segments.length ? `<div class="donut-wrap">
        ${donut(segments, { center: money(c.spent, { decimals: 0 }), sub: `${myExp.length} expenses` })}
        <ul class="legend">${segments.map((g) => `<li${g.note ? ` title="${esc(g.note)}"` : ''}><i class="dot" style="background:${g.color}"></i><span>${esc(g.label)}</span><b>${pct(g.value, c.spent).toFixed(0)}%</b></li>`).join('')}</ul>
      </div>` : `<p class="muted">${esc(sel)} has no expenses this month.</p>`}
    </div>

    <div class="card">
      <div class="card-head"><h2>Still to pay${one ? ` · ${esc(sel)}` : ''}</h2>${myUnpaid.length ? `<a href="#/current" class="link">All ${myUnpaid.length}</a>` : ''}</div>
      ${myUnpaid.length
        ? `<ul class="tx-list">${myUnpaid.slice(0, n === 1 ? 7 : 5).map((t) => txRow(store, t)).join('')}</ul>`
        : `<p class="muted">${one ? `${esc(sel)} has nothing left to pay ✅` : 'Everything is paid ✅'}</p>`}
    </div>
  </section>`;
}
