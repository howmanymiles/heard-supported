'use client';

// Shown when something goes wrong on a page. No details, so nothing about a case leaks into the screen.
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="stack-lg">
      <div className="head"><h1>Something went wrong</h1></div>
      <p>Your work up to the last save is kept. Try again, and if it keeps happening, tell us the time it happened.</p>
      <p><button className="btn" type="button" onClick={reset}>Try again</button></p>
    </div>
  );
}
