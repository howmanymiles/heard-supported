import fs from 'node:fs';
import path from 'node:path';
import { pool } from './db.ts';

function migrationsDir(): string {
  const candidates = [path.join(process.cwd(), 'db/migrations'), path.join(process.cwd(), 'app/db/migrations')];
  const found = candidates.find(d => fs.existsSync(d));
  if (!found) throw new Error('Migrations folder not found.');
  return found;
}

/** Apply any new SQL migrations, once, under an advisory lock. */
export async function migrate(): Promise<void> {
  const c = await pool().connect();
  try {
    await c.query('select pg_advisory_lock(424242)');
    await c.query('create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())');
    const done = new Set((await c.query<{ name: string }>('select name from schema_migrations')).rows.map(r => r.name));
    const dir = migrationsDir();
    for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
      if (done.has(file)) continue;
      await c.query('begin');
      try {
        await c.query(fs.readFileSync(path.join(dir, file), 'utf8'));
        await c.query('insert into schema_migrations (name) values ($1)', [file]);
        await c.query('commit');
        console.log(`Applied migration ${file}`);
      } catch (e) {
        await c.query('rollback');
        throw e;
      }
    }
  } finally {
    await c.query('select pg_advisory_unlock(424242)').catch(() => {});
    c.release();
  }
}
