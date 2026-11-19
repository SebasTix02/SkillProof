import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ConfirmDialogView, questionToOptions } from './ConfirmDialog';

const html = (tone: 'danger' | 'primary', undoable?: boolean) =>
  renderToStaticMarkup(
    <ConfirmDialogView
      options={{ title: 'Revoke the invitation for ana@example.com?', body: 'Its link stops working at once.', confirmLabel: 'Revoke invitation', tone, undoable }}
      onAnswer={() => {}}
    />,
  );

describe('confirmation dialog', () => {
  it('is an accessible alert dialog that says what will happen', () => {
    const out = html('danger', false);
    expect(out).toContain('role="alertdialog"');
    expect(out).toContain('aria-modal="true"');
    expect(out).toContain('aria-labelledby="confirm-title"');
    expect(out).toContain('aria-describedby="confirm-body"');
    expect(out).toContain('Revoke the invitation for ana@example.com?');
    expect(out).toContain('Its link stops working at once.');
    expect(out).toContain('This cannot be undone.');
  });

  it('starts on Cancel and styles destructive actions as danger', () => {
    const out = html('danger');
    expect(out.indexOf('data-autofocus')).toBeLessThan(out.indexOf('Revoke invitation</button>'));
    expect(out).toMatch(/bg-bad text-on-bad[^"]*">Revoke invitation/);
    expect(html('primary')).toMatch(/bg-accent text-on-accent[^"]*">Revoke invitation/);
  });

  it('turns a question sentence into a title and a body', () => {
    expect(questionToOptions('Cancel the report? Your answers stay saved.')).toEqual({
      title: 'Cancel the report?',
      body: 'Your answers stay saved.',
    });
    expect(questionToOptions('Publish results?', { confirmLabel: 'Publish' })).toEqual({ title: 'Publish results?', body: undefined, confirmLabel: 'Publish' });
  });
});
