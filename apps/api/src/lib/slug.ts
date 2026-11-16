import { randomBytes } from 'node:crypto';

export function slugify(value: string): string {
  const base = value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
    .replace(/-+$/g, '');
  return base.length >= 2 ? base : 'event';
}

export function uniqueSlug(value: string): string {
  return slugify(value) + '-' + randomBytes(3).toString('hex');
}
