const voices = require('./voices.json');
const prefixes = { 'pt-BR': 'pt', 'zh-CN': 'zh' };
const regional = {
  'pt-BR': 'pt-BR',
  en: 'en-US',
  es: 'es-ES',
  fr: 'fr-FR',
  de: 'de-DE',
  it: 'it-IT',
  ru: 'ru-RU',
  ar: 'ar-EG',
  hi: 'hi-IN',
  bn: 'bn-BD',
  id: 'id-ID',
  ja: 'ja-JP',
  ko: 'ko-KR',
  'zh-CN': 'zh-CN',
};
function voiceForLanguage(language, current) {
  const prefix = prefixes[language] || language;
  const matches = voices.filter((v) => v.locale.split('-')[0] === prefix);
  if (matches.some((v) => v.id === current)) return current;
  const gender = voices.find((v) => v.id === current)?.gender || 'Female';
  const found =
    matches.find(
      (v) => v.gender === gender && v.locale === regional[language],
    ) ||
    matches.find((v) => v.gender === gender) ||
    matches[0];
  return found?.id || 'pt-BR-FranciscaNeural';
}
module.exports = { voiceForLanguage };
