import { describe, expect, it } from 'vitest';
import { pendingRequests, startRequest } from './loading';

describe('requests in flight (progress bar)', () => {
  it('counts each request until it ends, once even if ended twice', () => {
    const a = startRequest();
    const b = startRequest();
    expect(pendingRequests()).toBe(2);
    a();
    a();
    expect(pendingRequests()).toBe(1);
    b();
    expect(pendingRequests()).toBe(0);
  });
});
