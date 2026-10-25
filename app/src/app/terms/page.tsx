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
        <h2>How the AI works, and its limits</h2>
        <p>The AI doesn’t bring in outside knowledge. It works only from two sources: your client’s papers, and our library of the descriptors, regulations and case law. Every passage it points to is checked word for word against the document it came from, and the descriptors and rules are applied by our code, not by the AI.</p>
        <p>It can still miss something, point to a passage that doesn’t help, or work from a scan it misread. So its suggestions, the scores and estimated awards, the deadlines and the drafted wording are there to support the adviser’s judgement. The adviser checks them against the papers before relying on them or sending anything.</p>
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
        <h2>Who can use it</h2>
        <p>Heard &amp; Supported is for organisations that give their help free to claimants: advice charities, Citizens Advice, law centres, and council and health board welfare rights teams. It isn’t for organisations that charge claimants, or take a share of any award or back payment, however the fee is described. An agency confirms this when it signs up. If an agency starts charging claimants, its access ends.</p>
      </section>

      <section className="stack">
        <h2>Fair use</h2>
        <p>Your licence covers as many cases as your advisers take on. There is no case limit, and we would rather you took on the marginal case than rationed it. In return:</p>
        <ul>
          <li><b>One person, one account.</b> Each adviser signs in as themselves. Sharing a sign-in defeats the second sign-in step and the record of who did what, and isn’t allowed. Your licence is priced on the people with access, so add people rather than share.</li>
          <li><b>Your own clients.</b> Use it for your agency’s own clients. Don’t run cases for other organisations, or resell or pass on access.</li>
          <li><b>Only what the case needs.</b> Upload the client’s papers and evidence for their claim, reconsideration or appeal, and nothing else.</li>
          <li><b>No automation.</b> Don’t use scripts, bots or bulk downloads, or try to get round the limits on AI use. If you need data out in bulk, ask us.</li>
          <li><b>No testing our security without permission.</b> If you find a weakness, tell us privately and don’t share it.</li>
        </ul>
        <p>To keep the service fair for everyone, the AI steps have a daily ceiling for each agency, set by how many advisers it has, and a lower hourly one for each adviser. Normal casework stays well within both. If your use is far beyond normal, we’ll talk to you first. We don’t cut off an agency without warning, except to stop misuse or protect clients’ information.</p>
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
