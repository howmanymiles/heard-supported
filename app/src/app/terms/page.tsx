import { TERMS_VERSION } from '@/lib/access';

// Terms of use for agencies and their advisers. Draft: to be reviewed by a solicitor
// before a pilot. Change TERMS_VERSION when the wording changes.

export const metadata = { title: 'Terms of use · Heard & Supported' };

export default function Terms() {
  return (
    <article className="stack-lg prose" style={{ maxWidth: 760 }}>
      <div className="head"><h1>Terms of use</h1><p className="soft">Version {TERMS_VERSION}. Draft for the pilot.</p></div>

      <section className="stack">
        <h2>What Heard &amp; Supported is</h2>
        <p>A tool for welfare rights advisers working on Personal Independence Payment, Adult Disability Payment and the Universal Credit Work Capability Assessment. It helps an adviser find evidence in a client’s papers, compare it with the descriptors and the law, keep track of deadlines, and draft letters and submissions.</p>
        <p>It is used by advisers, not by claimants. Your agency gives the advice and is responsible for it, under its own terms with its clients.</p>
      </section>

      <section className="stack">
        <h2>The AI can be wrong</h2>
        <p>Parts of Heard &amp; Supported use an AI model. It can miss evidence, choose the wrong passage, misread a scan or handwriting, or suggest something that doesn’t fit the client’s case. We check that every quote it suggests appears word for word in the document, but we can’t check that it is relevant or rightly understood. That is the adviser’s job.</p>
        <p>Scores, descriptors, estimated award values, deadlines and drafted wording are aids to the adviser’s judgement, not conclusions. Before relying on anything, or sending anything, the adviser must check it against the papers and the law.</p>
      </section>

      <section className="stack">
        <h2>Nothing here is a decision</h2>
        <p>Heard &amp; Supported makes no decisions about anyone’s entitlement and agrees nothing on anyone’s behalf. Decisions are made by the Department for Work and Pensions, Social Security Scotland and the tribunals. We don’t promise any outcome. Estimated amounts are illustrations at published rates, not what a client will receive.</p>
        <p>Deadlines are calculated from the dates entered. The adviser remains responsible for meeting every time limit.</p>
      </section>

      <section className="stack">
        <h2>What we ask of advisers</h2>
        <ul>
          <li>Record the client’s consent before creating their record, and respect what they agreed to.</li>
          <li>Only enter what is needed for the client’s claim, reconsideration or appeal.</li>
          <li>While the service is in its fictional-data stage, never upload a real client’s information.</li>
          <li>Keep your sign-in to yourself, and sign out on shared computers.</li>
          <li>Tell us straight away if you think something has gone wrong with your client’s information or your account.</li>
        </ul>
      </section>

      <section className="stack">
        <h2>Your clients’ information</h2>
        <p>Your agency is the controller of its clients’ information and we process it on your agency’s behalf, under the data processing terms your agency accepted when it signed up. We don’t use it for anything else, we don’t sell it, and we don’t use it to train AI models.</p>
      </section>

      <section className="stack">
        <h2>The law</h2>
        <p>We keep the descriptors, rules and wording up to date with changes to the law as they are announced, but there may be a short gap after a change. If something looks out of date, tell us.</p>
      </section>

      <section className="stack">
        <h2>Availability and liability</h2>
        <p>During the pilot the service may change, be interrupted, or have faults. We’ll tell you about planned changes where we can.</p>
        <p>To the extent the law allows, we aren’t liable for loss caused by relying on the tool’s suggestions without the checks described above. Nothing in these terms limits liability that can’t lawfully be limited.</p>
        <p>These terms are governed by the law of Scotland.</p>
      </section>

      <section className="stack">
        <h2>Contact</h2>
        <p>{process.env.SUPPORT_EMAIL ? <>Email <a href={`mailto:${process.env.SUPPORT_EMAIL}`}>{process.env.SUPPORT_EMAIL}</a>.</> : <>Use the contact form at heardsupported.co.uk.</>}</p>
      </section>
    </article>
  );
}
