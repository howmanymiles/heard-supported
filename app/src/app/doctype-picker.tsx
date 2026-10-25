'use client';

import { useId, useMemo, useRef, useState } from 'react';
import { matchDocTypes, type DocType } from '@/lib/doctypes';

/**
 * Type a form number or name ("PA4", "UC50", "GP letter") and pick from the matches.
 * Keyboard: arrows to move, Enter to choose, Escape to close. The choice goes in a
 * hidden `docType` field.
 */
export function DocTypePicker({ types, label = 'What is it?' }: { types: DocType[]; label?: string }) {
  const id = useId();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [chosen, setChosen] = useState<DocType | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const hits = useMemo(() => matchDocTypes(types, chosen && q === chosen.label ? '' : q), [types, q, chosen]);

  const choose = (t: DocType) => { setChosen(t); setQ(t.label); setOpen(false); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive(a => Math.min(a + 1, hits.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter' && open && hits.length) { e.preventDefault(); choose(hits[Math.max(active, 0)]); }
    else if (e.key === 'Escape') setOpen(false);
  };

  let lastGroup = '';
  return (
    <div className="field combo">
      <label htmlFor={`${id}-in`}>{label}</label>
      <input id={`${id}-in`} ref={input} role="combobox" aria-expanded={open} aria-controls={`${id}-list`} aria-autocomplete="list"
        aria-activedescendant={open && hits[active] ? `${id}-${hits[active].id}` : undefined}
        value={q} placeholder="Type a form number or name, e.g. PA4, UC50, GP letter" autoComplete="off" required
        onChange={e => { setQ(e.target.value); setChosen(null); setOpen(true); setActive(-1); }}
        onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} onKeyDown={onKey} />
      <input type="hidden" name="docType" value={chosen?.id ?? ''} />
      {open && (
        <ul id={`${id}-list`} role="listbox" className="combo-list">
          {hits.length ? hits.map((t, i) => {
            const head = t.group !== lastGroup && !q ? (lastGroup = t.group) : null;
            return (
              <li key={t.id} role="presentation">
                {head && <div className="combo-group" aria-hidden="true">{head}</div>}
                <div id={`${id}-${t.id}`} role="option" aria-selected={i === active} className={i === active ? 'combo-opt active' : 'combo-opt'}
                  onMouseDown={e => { e.preventDefault(); choose(t); }} onMouseEnter={() => setActive(i)}>
                  {t.label}
                </div>
              </li>
            );
          }) : <li className="combo-none soft small">Nothing matches. Try another word, or choose “Something else”.</li>}
        </ul>
      )}
    </div>
  );
}
