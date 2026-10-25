import { TERMS_VERSION } from '@/lib/access';
import { SignUpForm } from './form';

export default function SignUp() {
  return (
    <div className="stack-lg" style={{ maxWidth: 720 }}>
      <div className="head"><h1>Ask to join</h1><p className="soft">For welfare rights and advice organisations. We check each organisation before it can use the system. Once you’re set up, you invite your own advisers.</p></div>
      <SignUpForm terms={TERMS_VERSION} />
    </div>
  );
}
