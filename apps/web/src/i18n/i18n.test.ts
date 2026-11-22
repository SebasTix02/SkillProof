import { pickLocale } from '@skillproof/shared';
import { describe, expect, it } from 'vitest';
import { en } from './en';
import { es } from './es';
import { applyLocale, getLocale, I18nProvider, t, tn, translateMessage } from './index';

/** Every leaf path of a dictionary, without the free-form maps (apiErrors, messages). */
function leaves(d: object, prefix = ''): string[] {
  return Object.entries(d).flatMap(([k, v]) => {
    if (['apiErrors', 'messages'].includes(k) && !prefix) return [];
    if (typeof v === 'string' || (v && 'one' in v && 'other' in v)) return [`${prefix}${k}`];
    return leaves(v as object, `${prefix}${k}.`);
  });
}

describe('English and Spanish', () => {
  it('Spanish has every English text and nothing else', () => {
    expect(leaves(es).sort()).toEqual(leaves(en).sort());
  });

  it('picks the closest language from the browser, English otherwise', () => {
    expect(pickLocale('es-EC')).toBe('es');
    expect(pickLocale('es')).toBe('es');
    expect(pickLocale('fr-FR')).toBe('en');
    expect(pickLocale(undefined)).toBe('en');
  });

  it('fills variables and falls back to the key when a text is missing', () => {
    expect(['en', 'es']).toContain(getLocale());
    expect(t('theme.switchTo', { current: 'A', next: 'B' })).toMatch(/A.*B/);
    expect(t('nope.missing' as never)).toBe('nope.missing');
  });

  it('keeps API messages as they are in English', () => {
    if (getLocale() === 'en') expect(translateMessage('Event not found')).toBe('Event not found');
    expect(typeof I18nProvider).toBe('function');
  });

  it('speaks Spanish: texts, API errors by code or by their English text, plurals', () => {
    applyLocale('es');
    try {
      expect(t('common.save')).toBe('Guardar');
      expect(translateMessage('This group is already full.', 'group_full')).toBe('Este grupo ya está completo.');
      expect(translateMessage('Event not found')).toBe('No se encontró el evento.');
      expect(translateMessage('Something new from the API')).toBe('Something new from the API');
      expect(typeof tn).toBe('function');
    } finally {
      applyLocale('en');
    }
    expect(t('common.save')).toBe('Save');
  });
});
