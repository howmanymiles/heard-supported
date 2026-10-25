export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.DATABASE_URL) {
    const { migrate } = await import('./lib/migrate');
    await migrate();
    // Retention: remove content from cases past their agency's period, now and every 12 hours.
    const { sweepRetention } = await import('./lib/retention');
    const sweep = () => sweepRetention().then(r => { if (r.length) console.log(`Retention: content removed from ${r.reduce((n, x) => n + x.cases, 0)} records`); })
      .catch(e => console.error('Retention sweep failed:', e instanceof Error ? e.message : e));
    void sweep();
    setInterval(sweep, 12 * 60 * 60 * 1000).unref();
  }
}
