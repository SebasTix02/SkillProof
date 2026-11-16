import { useParams } from 'react-router-dom';
import { Report, one, type ReportView } from '../components/Report';
import { Card, PageState, formatDate } from '../components/ui';
import { useLoad } from '../lib/useLoad';

interface ProfileResponse {
  profile: { slug: string; headline: string; display_name: string; github_login: string | null; avatar_url: string | null };
  interviews: {
    id: string;
    created_at: string;
    duration_s: number | null;
    submission_id: string | null;
    repos: { owner: string; name: string; url: string } | null;
    repo_analyses: { commit_sha: string } | { commit_sha: string }[] | null;
    interview_reports: ReportView | ReportView[] | null;
  }[];
}

export function PublicProfile() {
  const { slug } = useParams();
  const { data, error, loading } = useLoad<ProfileResponse>(`/api/profiles/${slug}`);
  if (!data) return <PageState loading={loading} error={error} />;
  const { profile } = data;
  const verified = data.interviews.filter((i) => one(i.interview_reports));
  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-medium text-accent">Verified by SkillProof</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">{profile.display_name}</h1>
        {profile.headline && <p className="mt-1 text-muted">{profile.headline}</p>}
        <p className="mt-3 max-w-2xl text-sm text-muted">
          Each report below comes from a three-minute voice interview about the author's own repository, at the commit shown.
          The quotes are the candidate's own words.
        </p>
      </header>
      {verified.length === 0 && <p className="text-sm text-muted">No verified interviews yet.</p>}
      {verified.map((i) => {
        const sha = one(i.repo_analyses)?.commit_sha;
        return (
          <Card key={i.id}>
            <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              {i.repos && (
                <a href={i.repos.url} target="_blank" rel="noreferrer" className="text-lg font-semibold hover:underline">
                  {i.repos.owner}/{i.repos.name}
                </a>
              )}
              {sha && <code className="text-xs text-muted">{sha.slice(0, 7)}</code>}
              <span className="text-sm text-muted">{formatDate(i.created_at)}</span>
            </div>
            <Report report={one(i.interview_reports)!} />
          </Card>
        );
      })}
    </div>
  );
}
