// Small server-rendered charts: one series each, one axis, a hover title on every column,
// and always alongside a table of the same numbers.

type Point = { label: string; value: number | null; tip: string };
const W = 640, H = 180, L = 44, R = 8, T = 12, B = 28;

function ticks(max: number) {
  if (max <= 0) return [0, 1];
  const step = Math.pow(10, Math.floor(Math.log10(max)));
  const nice = [1, 2, 5, 10].map(m => m * step).find(s => max / s <= 4) ?? step * 10;
  const out: number[] = []; for (let v = 0; v <= max + 1e-9; v += nice) out.push(v);
  if (out[out.length - 1] < max) out.push(out[out.length - 1] + nice);
  return out;
}

function Frame({ title, ys, fmt, labels, children }: { title: string; ys: number[]; fmt: (n: number) => string; labels: string[]; children: React.ReactNode }) {
  const max = ys[ys.length - 1] || 1, y = (v: number) => T + (H - T - B) * (1 - v / max);
  const step = (W - L - R) / Math.max(labels.length, 1);
  const every = Math.ceil(labels.length / 12);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title} className="chart" preserveAspectRatio="xMidYMid meet">
      {ys.map(v => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="chart-grid" /><text x={L - 6} y={y(v) + 4} textAnchor="end" className="chart-tick">{fmt(v)}</text></g>)}
      {labels.map((l, i) => i % every === 0 && <text key={l} x={L + step * (i + 0.5)} y={H - 8} textAnchor="middle" className="chart-tick">{l}</text>)}
      {children}
    </svg>
  );
}

const monthLabel = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' });

export function Bars({ title, points, fmt = n => String(n) }: { title: string; points: Point[]; fmt?: (n: number) => string }) {
  const ys = ticks(Math.max(0, ...points.map(p => p.value ?? 0)));
  const max = ys[ys.length - 1] || 1, y = (v: number) => T + (H - T - B) * (1 - v / max);
  const step = (W - L - R) / Math.max(points.length, 1), bw = Math.min(28, step * 0.6);
  return (
    <Frame title={title} ys={ys} fmt={fmt} labels={points.map(p => monthLabel(p.label))}>
      {points.map((p, i) => {
        const x = L + step * i, v = p.value ?? 0, top = y(v), h = y(0) - top;
        return (
          <g key={p.label} className="chart-col">
            <title>{p.tip}</title>
            <rect x={x} y={T} width={step} height={H - T - B} className="chart-hit" />
            {h > 0 && <path className="chart-bar" d={`M${x + (step - bw) / 2},${y(0)} V${top + Math.min(4, h)} q0,-${Math.min(4, h)} ${Math.min(4, bw / 2)},-${Math.min(4, h)} H${x + (step + bw) / 2 - Math.min(4, bw / 2)} q${Math.min(4, bw / 2)},0 ${Math.min(4, bw / 2)},${Math.min(4, h)} V${y(0)} Z`} />}
          </g>
        );
      })}
    </Frame>
  );
}

/** A rate over time; months with no results leave a gap rather than drawing zero. */
export function Line({ title, points }: { title: string; points: Point[] }) {
  const ys = [0, 25, 50, 75, 100], y = (v: number) => T + (H - T - B) * (1 - v / 100);
  const step = (W - L - R) / Math.max(points.length, 1), cx = (i: number) => L + step * (i + 0.5);
  const runs: string[] = []; let cur = '';
  points.forEach((p, i) => { if (p.value === null) { if (cur) runs.push(cur); cur = ''; } else cur += `${cur ? 'L' : 'M'}${cx(i)},${y(p.value)} `; });
  if (cur) runs.push(cur);
  return (
    <Frame title={title} ys={ys} fmt={n => `${n}%`} labels={points.map(p => monthLabel(p.label))}>
      {runs.map((d, i) => <path key={i} d={d} className="chart-line" />)}
      {points.map((p, i) => (
        <g key={p.label} className="chart-col">
          <title>{p.tip}</title>
          <rect x={L + step * i} y={T} width={step} height={H - T - B} className="chart-hit" />
          {p.value !== null && <circle cx={cx(i)} cy={y(p.value)} r={4} className="chart-dot" />}
        </g>
      ))}
    </Frame>
  );
}
