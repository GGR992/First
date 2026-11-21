// Tiny SVG charts (no libraries, works offline).
import { esc, money, monthShort, pct } from './util.js';

const PALETTE = [
  '#0e9f8e', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6',
  '#ef4444', '#14b8a6', '#84cc16', '#f97316', '#06b6d4',
  '#a855f7', '#64748b',
];

export function catColor(category, categories = []) {
  let i = categories.indexOf(category);
  if (i < 0) {
    i = 0;
    for (const c of String(category)) i = (i * 31 + c.charCodeAt(0)) >>> 0;
  }
  return PALETTE[i % PALETTE.length];
}

/** Donut chart. segments: [{label, value, color}] */
export function donut(segments, { center = '', sub = '' } = {}) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  let offset = 0;
  const arcs = total
    ? segments.map((s) => {
        const p = (s.value / total) * 100;
        const gap = segments.length > 1 ? Math.min(0.8, p / 2) : 0;
        const arc = `<circle r="15.915" cx="21" cy="21" fill="none" stroke="${s.color}" stroke-width="5.2"
          stroke-dasharray="${Math.max(p - gap, 0)} ${100 - Math.max(p - gap, 0)}" stroke-dashoffset="${-offset}"><title>${esc(s.label)}: ${money(s.value)}</title></circle>`;
        offset += p;
        return arc;
      }).join('')
    : `<circle r="15.915" cx="21" cy="21" fill="none" stroke="var(--line)" stroke-width="5.2"/>`;
  return `<svg class="donut" viewBox="0 0 42 42" role="img" aria-label="${esc(center)} ${esc(sub)}">
    <g transform="rotate(-90 21 21)">${arcs}</g>
    <text x="21" y="20.5" class="donut-center">${esc(center)}</text>
    <text x="21" y="26" class="donut-sub">${esc(sub)}</text>
  </svg>`;
}

/**
 * Vertical bars per month. data: [{month, expenses, income?}]
 * Income (optional) is drawn as a thin marker line over each bar.
 */
export function monthBars(data, { selected, showIncome = true, action = 'pick-month' } = {}) {
  const W = 340, H = 150, top = 14, bottom = 22;
  const max = Math.max(1, ...data.map((d) => Math.max(d.expenses, showIncome ? d.income || 0 : 0)));
  const slot = W / data.length;
  const bw = Math.min(22, slot * 0.6);
  const y = (v) => top + (H - top - bottom) * (1 - v / max);
  const bars = data.map((d, i) => {
    const x = i * slot + (slot - bw) / 2;
    const yy = y(d.expenses);
    const sel = d.month === selected;
    const income = showIncome && d.income
      ? `<line x1="${x - 3}" x2="${x + bw + 3}" y1="${y(d.income)}" y2="${y(d.income)}" class="bar-income"/>`
      : '';
    return `<g class="bar-g${sel ? ' sel' : ''}" data-action="${action}" data-month="${d.month}">
      <rect x="${i * slot}" y="0" width="${slot}" height="${H}" fill="transparent"/>
      <rect x="${x}" y="${yy}" width="${bw}" height="${Math.max(H - bottom - yy, d.expenses ? 1.5 : 0)}" rx="3" class="bar"/>
      ${income}
      <text x="${x + bw / 2}" y="${H - 7}" class="bar-label">${esc(d.label || monthShort(d.month))}</text>
      <title>${esc(d.label || monthShort(d.month))}: spent ${money(d.expenses)}${showIncome ? ', income ' + money(d.income || 0) : ''}</title>
    </g>`;
  }).join('');
  return `<svg class="bars" viewBox="0 0 ${W} ${H}" role="img" aria-label="Monthly totals">${bars}</svg>`;
}

/** Horizontal bar list as HTML. rows: [{label, value, color, extra}] */
export function hbars(rows, { total, action, attr = 'category' } = {}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return `<ul class="hbars">${rows.map((r) => `
    <li ${action ? `data-action="${action}" data-${attr}="${esc(r.label)}"` : ''}>
      <div class="hbar-top">
        <span class="hbar-label"><i class="dot" style="background:${r.color}"></i>${esc(r.label)}</span>
        <span class="hbar-val">${money(r.value)}${total ? ` <small>${pct(r.value, total).toFixed(0)}%</small>` : ''}</span>
      </div>
      <div class="hbar-track"><div class="hbar-fill" style="width:${(r.value / max) * 100}%;background:${r.color}"></div></div>
      ${r.extra ? `<div class="hbar-extra">${r.extra}</div>` : ''}
    </li>`).join('')}</ul>`;
}
