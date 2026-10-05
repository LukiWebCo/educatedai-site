// i18n runtime (contracts: BUILD-PLAN A.a). t(key, vars); data-i18n / data-i18n-attr in HTML.
const dicts = {};
let lang = 'en';

export const LANGS = ['en', 'es'];

export function currentLang() { return lang; }

export function guessLang() {
  try {
    const saved = localStorage.getItem('eai.lang');
    if (saved === 'en' || saved === 'es') return saved;
  } catch { /* private mode */ }
  return (navigator.language || 'en').toLowerCase().startsWith('es') ? 'es' : 'en';
}

export async function setLang(l) {
  if (!LANGS.includes(l)) l = 'en';
  if (!dicts[l]) {
    const r = await fetch(`/i18n/family.${l}.json`, { cache: 'no-cache' });
    dicts[l] = await r.json();
  }
  lang = l;
  document.documentElement.lang = l === 'es' ? 'es-MX' : 'en';
  try { localStorage.setItem('eai.lang', l); } catch { /* ignore */ }
  apply(document);
}

export function t(key, vars) {
  let s = (dicts[lang] && dicts[lang][key]) ?? (dicts.en && dicts.en[key]) ?? key;
  if (vars) s = s.replace(/\{([a-z0-9_]+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  return s;
}

// Plurals: sibling keys ...count.one / ...count.other; callers pick one with literal t('...') calls.

export function apply(root) {
  root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-attr]').forEach((el) => {
    for (const part of el.dataset.i18nAttr.split(';')) {
      const [attr, key] = part.split(':');
      if (attr && key) el.setAttribute(attr.trim(), t(key.trim()));
    }
  });
}
