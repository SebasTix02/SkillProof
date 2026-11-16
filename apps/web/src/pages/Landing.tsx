import { Link } from 'react-router-dom';
import { Card, linkButton, linkButtonSecondary } from '../components/ui';
import { useAuth } from '../lib/auth';

export function Landing() {
  const { session, org } = useAuth();
  return (
    <div className="space-y-10">
      <section className="pt-6">
        <p className="mb-3 text-sm font-medium text-accent">Powered by Google Gemini</p>
        <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
          Anyone can generate code. SkillProof shows who understands it.
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-muted">
          Hackathon judging that reads every repository and explains each score. Then a three-minute voice interview
          about the author's own code, with follow-up questions that a copy-paste cannot answer.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          {session ? (
            <>
              <Link to={org ? '/org/events' : '/events'} className={linkButton}>{org ? 'Go to my events' : 'Browse events'}</Link>
              <Link to="/interview/new" className={linkButtonSecondary}>Take an interview</Link>
            </>
          ) : (
            <>
              <Link to="/signup?as=organizer" className={linkButton}>Run a hackathon</Link>
              <Link to="/signup" className={linkButtonSecondary}>Prove my skills</Link>
            </>
          )}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="text-lg font-semibold">For organizers</h2>
          <ol className="mt-3 space-y-2 text-sm text-muted">
            <li><strong className="text-ink">1. Create an event</strong> with your rubric. Open it to everyone, protect it with a code, or invite by email.</li>
            <li><strong className="text-ink">2. Teams submit</strong> their repository and demo video until the deadline.</li>
            <li><strong className="text-ink">3. At the deadline</strong> every repository is frozen at its last commit and scored against the rubric, with the files behind each score.</li>
            <li><strong className="text-ink">4. You decide.</strong> Review, override any score, then publish.</li>
          </ol>
        </Card>
        <Card>
          <h2 className="text-lg font-semibold">For students</h2>
          <ol className="mt-3 space-y-2 text-sm text-muted">
            <li><strong className="text-ink">1. Paste a repository</strong> you wrote, or use the one you submitted to an event.</li>
            <li><strong className="text-ink">2. Talk for three minutes.</strong> The interviewer asks about your actual code and follows up on vague answers.</li>
            <li><strong className="text-ink">3. Get a verified profile</strong> with the skills you showed and the quotes that prove them. Share the link with recruiters.</li>
          </ol>
        </Card>
      </section>
    </div>
  );
}
