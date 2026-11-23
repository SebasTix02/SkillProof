import { Fragment, type ReactNode } from 'react';

/**
 * A translated sentence with elements in it: rich(tr('Groups close {when}'), { when: <strong>…</strong> }).
 * The sentence is translated whole (so each language orders it its own way) and each {name} is replaced by its
 * element. Never build a sentence from translated pieces: "Lasts " + n + " minutes with" leaves words in English.
 */
export function rich(sentence: string, parts: Record<string, ReactNode>): ReactNode[] {
  return sentence.split(/\{(\w+)\}/).map((piece, i) => (i % 2 === 1 ? <Fragment key={i}>{piece in parts ? parts[piece] : `{${piece}}`}</Fragment> : piece));
}
