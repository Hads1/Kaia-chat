const defaults = {
  fontFamily: 'Segoe UI',
  fontWeight: 600,
  textColor: '#f0f1f7',
  preserveNames: true,
  shadowEnabled: true,
  shadowColor: '#000000',
  shadowOpacity: 85,
  shadowBlur: 3,
  shadowX: 0,
  shadowY: 1,
};
function normalizeAppearance(input = {}) {
  const s = { ...defaults, ...input };
  const number = (key, min, max) =>
    Number.isFinite(Number(s[key]))
      ? Math.min(max, Math.max(min, Number(s[key])))
      : defaults[key];
  const color = (k) =>
    /^#[a-f0-9]{6}$/i.test(String(s[k])) ? s[k] : defaults[k];
  return {
    fontFamily:
      typeof s.fontFamily === 'string' && s.fontFamily.trim()
        ? s.fontFamily.trim().slice(0, 100)
        : defaults.fontFamily,
    fontWeight: [400, 500, 600, 700, 800].includes(Number(s.fontWeight))
      ? Number(s.fontWeight)
      : defaults.fontWeight,
    textColor: color('textColor'),
    preserveNames: !!s.preserveNames,
    shadowEnabled: !!s.shadowEnabled,
    shadowColor: color('shadowColor'),
    shadowOpacity: number('shadowOpacity', 0, 100),
    shadowBlur: number('shadowBlur', 0, 24),
    shadowX: number('shadowX', -12, 12),
    shadowY: number('shadowY', -12, 12),
  };
}
module.exports = { defaults, normalizeAppearance };
