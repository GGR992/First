// Home: the "at a glance" dashboard (top-right part of the sheet).
import { money, esc, addMonths, monthName, pct } from '../util.js';
import { summarize, settlement } from '../stats.js';
import { donut, catColor } from '../charts.js';
import { statStrip, deltaBadge, txRow, emptyState, personIndex } from '../ui.js';

export function render({ store, state }) {
  const s = store.settings;
  const m = state.month;
  const cur = summarize(store.tx, m, s.people);
  const prevKey = addMonths(m, -1);
  const prev = summarize(store.tx, prevKey, s.people);

  if (!cur.list.length) {
    const hasPrev = prev.exp.length > 0;
    return `<section class="stack">
      ${emptyState(`Nothing in ${monthName(m)} yet`,
        hasPrev ? `Start by adding this month's income, then copy the bills you had in ${monthName(prevKey)}.`
                : 'Add your first income or expense, or import your Google Sheet history from Settings.',
        `<div class="btn-row">
          <a class="btn primary" href="#/add?income">Add income</a>
          ${hasPrev ? `<a class="btn" href="#/add?last">Copy from ${esc(monthName(prevKey))}</a>` : '<a class="btn" href="#/settings">Import data</a>'}
        </div>`)}
    </section>`;
  }

  const spentPct = Math.min(100, pct(cur.expenses, cur.income));
  const settle = settlement(cur);
  const cats = cur.byCategory;
  const top = cats.slice(0, 5);
  const restVal = cats.slice(5).reduce((a, c) => a + c.amount, 0);
  const segments = [
    ...top.map((c) => ({ label: c.category, value: c.amount, color: catColor(c.category, s.expenseCategories) })),
    ...(restVal ? [{ label: 'Other', value: restVal, color: '#94a3b8' }] : []),
  ];

  const people = s.people.map((p) => {
    const d = cur.byPerson[p] || { spent: 0, income: 0, unpaid: 0 };
    return `<div class="person-row">
      <span class="avatar p${personIndex(store, p)}">${esc(p[0] || '?')}</span>
      <div class="person-main">
        <div class="person-top"><b>${esc(p)}</b><span>${money(d.spent)}</span></div>
        <div class="meter"><div class="meter-fill p${personIndex(store, p)}" style="width:${pct(d.spent, Math.max(...Object.values(cur.byPerson).map((x) => x.spent), 1))}%"></div></div>
        <div class="person-sub">Income ${money(d.income)}${d.unpaid ? ` · <span class="warn-text">${money(d.unpaid)} to pay</span>` : ''}</div>
      </div>
    </div>`;
  }).join('');

  const unpaidList = cur.unpaid.slice().sort((a, b) => b.amount - a.amount).slice(0, 4);

  return `<section class="stack">
    <div class="card hero">
      <div class="hero-label">Left this month</div>
      <div class="hero-value ${cur.remaining < 0 ? 'neg' : ''}">${money(cur.remaining)}</div>
      <div class="progress" aria-label="Spent ${spentPct.toFixed(0)}% of income"><div style="width:${spentPct}%"></div></div>
      <div class="hero-sub">Spent ${money(cur.expenses)} of ${money(cur.income)} income</div>
    </div>

    ${statStrip([
      { label: 'Expenses', value: money(cur.expenses), sub: deltaBadge(cur.expenses, prev.expenses, { suffix: ' vs ' + monthName(prevKey).slice(0, 3) }) },
      { label: 'Income', value: money(cur.income), sub: deltaBadge(cur.income, prev.income, { goodWhenDown: false }) },
      { label: 'To pay', value: money(cur.unpaidAmount), sub: `${cur.unpaid.length} item${cur.unpaid.length === 1 ? '' : 's'}`, tone: cur.unpaid.length ? 'warn' : 'good', tab: 'current' },
      { label: 'Fair share', value: money(cur.fairShare, { decimals: 0 }), sub: `each of ${s.people.length}` },
    ])}

    <div class="card">
      <div class="card-head"><h2>Who paid what</h2></div>
      ${people}
      ${settle ? `<div class="callout ${settle.even ? 'good' : ''}">${settle.even
        ? 'You are even this month 🎉'
        : `<b>${esc(settle.to)}</b> paid more: <b>${money(settle.amount)}</b>.<br><small>${esc(settle.from)} → ${esc(settle.to)} ${money(settle.amount)} to even out.</small>`}</div>` : ''}
    </div>

    <div class="card">
      <div class="card-head"><h2>Where it went</h2><a href="#/stats" class="link">Details</a></div>
      <div class="donut-wrap">
        ${donut(segments, { center: money(cur.expenses, { decimals: 0 }), sub: `${cur.exp.length} expenses` })}
        <ul class="legend">${segments.map((g) => `<li><i class="dot" style="background:${g.color}"></i><span>${esc(g.label)}</span><b>${pct(g.value, cur.expenses).toFixed(0)}%</b></li>`).join('')}</ul>
      </div>
    </div>

    ${unpaidList.length ? `<div class="card">
      <div class="card-head"><h2>Still to pay</h2><a href="#/current" class="link">All ${cur.unpaid.length}</a></div>
      <ul class="tx-list">${unpaidList.map((t) => txRow(store, t)).join('')}</ul>
    </div>` : ''}
  </section>`;
}
