import { useState } from 'react';
import { useConfirm } from '../../../components/shared';
import { useToast } from '../../../components/toast';
import { tr } from '../../../i18n';
import { api, errorMessage } from '../../../lib/api';

export const WORKING = new Set(['queued', 'analyzing']);
export const SUB_BASE = '/api/assignment-submissions';

/** Runs one POST with a toast, an optional confirmation, and a reload. */
export function useAction(reload: () => unknown) {
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState<string | null>(null);
  async function act(key: string, path: string, success: string, question?: string, body?: unknown) {
    if (question && !(await confirm({ title: question, confirmLabel: tr('Continue') }))) return;
    setBusy(key);
    try {
      await api(path, body === undefined ? { method: 'POST' } : { body });
      toast.success(success);
      await reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }
  return { busy, act };
}
