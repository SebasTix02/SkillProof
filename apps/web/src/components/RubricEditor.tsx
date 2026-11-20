import { type Rubric } from '@skillproof/shared';
import { Button, Field, Input, ScoreBar, Textarea } from './shared';

export const keyFromName = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^[^a-z]+|_+$/g, '')
    .slice(0, 40);

/** Weighted rubric criteria: name, weight and what each one measures. Shared by events and course assignments. */
export function RubricEditor({ rubric, setRubric }: { rubric: Rubric; setRubric: (update: (r: Rubric) => Rubric) => void }) {
  const totalWeight = rubric.reduce((sum, c) => sum + (Number.isFinite(c.weight) ? c.weight : 0), 0);
  const patch = (i: number, change: Partial<Rubric[number]>) => setRubric((r) => r.map((c, j) => (j === i ? { ...c, ...change } : c)));
  return (
          <div className="space-y-4">
            <ScoreBar value={Math.min(100, totalWeight)} max={100} tone="accent" heightClass="h-1.5" />

            <ul className="space-y-3">
              {rubric.map((c, i) => (
                <li
                  key={i}
                  className="space-y-3 rounded-[4px] border border-line bg-paper/55 p-4 transition-colors hover:border-muted/60"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono-code text-[11px] font-bold text-accent uppercase">
                      Criterion {String(i + 1).padStart(2, '0')} // {c.key || keyFromName(c.name) || 'custom_key'}
                    </span>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={rubric.length === 1}
                      onClick={() => setRubric((r) => r.filter((_, j) => j !== i))}
                      className="px-2.5 py-1 text-[11px]"
                    >
                      Remove
                    </Button>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
                    <Field label="Criterion Name">
                      <Input
                        aria-label="Criterion name"
                        required
                        maxLength={60}
                        placeholder="Architecture & Code Quality"
                        value={c.name}
                        onChange={(e) => patch(i, { name: e.target.value, key: keyFromName(e.target.value) })}
                      />
                    </Field>
                    <Field label="Weight">
                      <Input
                        aria-label="Weight"
                        type="number"
                        min={1}
                        max={100}
                        required
                        className="font-mono-code"
                        value={c.weight}
                        onChange={(e) => patch(i, { weight: Number(e.target.value) })}
                      />
                    </Field>
                  </div>

                  <Field label="What This Criterion Measures">
                    <Textarea
                      aria-label="What this criterion measures"
                      rows={2}
                      maxLength={500}
                      value={c.description}
                      onChange={(e) => patch(i, { description: e.target.value })}
                      placeholder="What the AI evaluator and human judges should look for in the repository..."
                    />
                  </Field>
                </li>
              ))}
            </ul>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <Button
                type="button"
                variant="secondary"
                disabled={rubric.length >= 12}
                onClick={() =>
                  setRubric((r) => [
                    ...r,
                    {
                      key: '',
                      name: '',
                      description: '',
                      weight: 15,
                      anchors: { low: 'Weak.', mid: 'Acceptable.', high: 'Excellent.' },
                    },
                  ])
                }
              >
                <span className="material-symbols-outlined text-[16px]">add</span>
                <span>Add Rubric Criterion ({rubric.length}/12)</span>
              </Button>
              <span className="font-mono-code text-[11px] text-muted">
                Up to 12 weighted criteria per assessment
              </span>
            </div>
          </div>
  );
}
