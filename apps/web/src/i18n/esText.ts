import { partA } from './es/partA';
import { partB } from './es/partB';
import { partC } from './es/partC';
import { partD } from './es/partD';
import { partE } from './es/partE';
import { partF } from './es/partF';
import { partG } from './es/partG';

/**
 * Spanish catalog for screen texts, keyed by the exact English string in tr() / trn().
 * Split across ./es/partA..partG for maintainability; coverage.test.ts verifies 100% screen coverage.
 */
export const esText: Record<string, string> = {
  ...partA,
  ...partB,
  ...partC,
  ...partD,
  ...partE,
  ...partF,
  ...partG,
};
