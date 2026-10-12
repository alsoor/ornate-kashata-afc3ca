import React, { useMemo, useState } from 'react';

/**
 * AiTableView.tsx — standalone table viewer for Stooorna Ai replies.
 * No dependencies besides React. Nothing else in the project has to change except the one
 * place that prints `m.content` (see the integration note at the bottom of this file).
 *
 * What it does:
 *  - finds Markdown tables inside a reply ( | a | b | + | --- | --- | rows )
 *  - shows them as real tables: sticky header, zebra rows, horizontal scroll on small screens,
 *    column alignment from the separator row (:---, :---:, ---:), RTL for Arabic
 *  - **bold** and `code` inside cells; a "Copy" button (tab-separated, pastes straight into Sheets/Excel)
 *  - the text before / after / between tables is kept exactly as is (pre-wrap, like today)
 *  - if a reply has no table it renders exactly the plain text, so it is safe for every reply
 */

export type Align = 'left' | 'center' | 'right';

export interface ParsedTable {
  headers: string[];
  aligns: Align[];
  rows: string[][];
}

export type Segment =
  | { type: 'text'; text: string }
  | { type: 'table'; table: ParsedTable };

const SEP_CELL = /^:?-{2,}:?$/; // --- , :--- , ---: , :---:

function splitRow(line: string): string[] {
  let t = line.trim();
  if (t.startsWith('|')) t = t.slice(1);
  if (t.endsWith('|') && !t.endsWith('\\|')) t = t.slice(0, -1);
  const cells: string[] = [];
  let cur = '';
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (ch === '\\' && t[i + 1] === '|') { cur += '|'; i++; continue; } // escaped pipe
    if (ch === '|') { cells.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

const looksLikeRow = (line: string) => line.includes('|') && line.trim().length > 1;

function isSeparator(line: string): boolean {
  if (!line.includes('-')) return false;
  const cells = splitRow(line);
  return cells.length >= 1 && cells.every(c => SEP_CELL.test(c.replace(/\s+/g, '')));
}

/** Splits a reply into text and table segments. Never throws. */
export function parseReplySegments(content: string): Segment[] {
  const lines = String(content ?? '').replace(/\r\n?/g, '\n').split('\n');
  const out: Segment[] = [];
  let buf: string[] = [];
  const flush = () => {
    if (buf.length) { out.push({ type: 'text', text: buf.join('\n') }); buf = []; }
  };

  let i = 0;
  while (i < lines.length) {
    const head = lines[i];
    const sep = lines[i + 1];
    if (looksLikeRow(head) && sep !== undefined && isSeparator(sep)) {
      const headers = splitRow(head);
      const sepCells = splitRow(sep).map(c => c.replace(/\s+/g, ''));
      if (headers.length === sepCells.length || Math.abs(headers.length - sepCells.length) <= 1) {
        const cols = headers.length;
        const aligns: Align[] = Array.from({ length: cols }, (_, k) => {
          const c = sepCells[k] || '';
          if (c.startsWith(':') && c.endsWith(':')) return 'center';
          if (c.endsWith(':')) return 'right';
          return 'left';
        });
        const rows: string[][] = [];
        let j = i + 2;
        while (j < lines.length && looksLikeRow(lines[j]) && !isSeparator(lines[j])) {
          const r = splitRow(lines[j]);
          while (r.length < cols) r.push(''); // short row -> pad
          rows.push(r.slice(0, cols)); // long row -> cut
          j++;
        }
        flush();
        out.push({ type: 'table', table: { headers, aligns, rows } });
        i = j;
        continue;
      }
    }
    buf.push(head);
    i++;
  }
  flush();
  return out;
}

export const hasTable = (content: string) => parseReplySegments(content).some(s => s.type === 'table');

/** **bold** and `code` inside a cell — nothing else, so cell text can never inject HTML. */
function renderCell(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**') && p.length > 4) return <strong key={i}>{p.slice(2, -2)}</strong>;
    if (p.startsWith('`') && p.endsWith('`') && p.length > 2) {
      return <code key={i} style={{ background: 'rgba(0,0,0,0.07)', borderRadius: 4, padding: '0 4px', fontSize: '0.92em' }}>{p.slice(1, -1)}</code>;
    }
    return <React.Fragment key={i}>{p}</React.Fragment>;
  });
}

const plain = (s: string) => s.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1');

function tableToTsv(t: ParsedTable): string {
  const clean = (c: string) => plain(c).replace(/[\t\n\r]+/g, ' ');
  return [t.headers, ...t.rows].map(r => r.map(clean).join('\t')).join('\n');
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* fall through */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch { return false; }
}

const isArabic = (s: string) => /[\u0600-\u06FF]/.test(s);

export function AiTable({ table, rtl }: { table: ParsedTable; rtl?: boolean }) {
  const [copied, setCopied] = useState(false);
  const isRtl = rtl ?? isArabic(table.headers.join(' ') + table.rows.map(r => r.join(' ')).join(' '));
  const dir = isRtl ? 'rtl' : 'ltr';
  const labelCopy = dir === 'rtl' ? 'نسخ الجدول' : 'Copy table';
  const labelDone = dir === 'rtl' ? 'تم النسخ ✓' : 'Copied ✓';

  return (
    <div dir={dir} style={{ margin: '8px 0', border: '1px solid rgba(0,0,0,0.1)', borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', maxHeight: 420 }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 13, lineHeight: 1.45 }}>
          <thead>
            <tr>
              {table.headers.map((h, i) => (
                <th
                  key={i}
                  style={{
                    position: 'sticky', top: 0, zIndex: 1,
                    background: '#0a1f1a', color: '#fff', fontWeight: 700,
                    padding: '8px 10px', whiteSpace: 'nowrap',
                    textAlign: table.aligns[i] === 'left' && dir === 'rtl' ? 'right' : table.aligns[i],
                  }}
                >
                  {renderCell(h)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, r) => (
              <tr key={r} style={{ background: r % 2 ? 'rgba(0,0,0,0.035)' : 'transparent' }}>
                {row.map((cell, c) => (
                  <td
                    key={c}
                    style={{
                      padding: '7px 10px', minWidth: 70, verticalAlign: 'top',
                      borderTop: '1px solid rgba(0,0,0,0.07)',
                      textAlign: table.aligns[c] === 'left' && dir === 'rtl' ? 'right' : table.aligns[c],
                      wordBreak: 'break-word',
                    }}
                  >
                    {renderCell(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', justifyContent: dir === 'rtl' ? 'flex-start' : 'flex-end', padding: '4px 8px', borderTop: '1px solid rgba(0,0,0,0.07)', background: 'rgba(0,0,0,0.02)' }}>
        <button
          type="button"
          onClick={async () => {
            if (await copyText(tableToTsv(table))) { setCopied(true); window.setTimeout(() => setCopied(false), 1800); }
          }}
          style={{ border: 'none', background: 'transparent', color: '#0a1f1a', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: '4px 6px' }}
        >
          {copied ? labelDone : labelCopy}
        </button>
      </div>
    </div>
  );
}

/** Drop-in replacement for printing a reply: text stays text, tables become tables. */
export default function AiReplyWithTables({ content }: { content: string }) {
  const segments = useMemo(() => parseReplySegments(content), [content]);
  return (
    <>
      {segments.map((s, i) =>
        s.type === 'table'
          ? <AiTable key={i} table={s.table} />
          : <span key={i} style={{ whiteSpace: 'pre-wrap' }}>{s.text.replace(/^\n+|\n+$/g, '')}</span>,
      )}
    </>
  );
}

/*
 * INTEGRATION (StooornaAiSheet.tsx, around line 1575) — replace only this line:
 *
 *     {m.content}
 *
 * with:
 *
 *     {m.role === 'assistant' && m.type !== 'table' ? <AiReplyWithTables content={m.content} /> : m.content}
 *
 * and add one import at the top:
 *
 *     import AiReplyWithTables from './AiTableView'; // TABLE-VIEW
 *
 * Voice (speak(m.content)) and copy keep using the raw text, so nothing else changes.
 */
