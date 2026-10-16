function readTiming() {
  return KaiaTiming.normalizeTiming({
    enabled: document.getElementById('expiry-enabled').checked,
    seconds: Number(document.getElementById('expiry-seconds').value),
    fadeSeconds: Number(document.getElementById('expiry-fade').value),
  });
}
function timingSummary() {
  const s = readTiming();
  document.getElementById('expiry-summary').textContent = s.enabled
    ? `Cada mensagem fica visível por ${s.seconds} segundo(s), depois desaparece em ${s.fadeSeconds} segundo(s).`
    : 'As mensagens permanecem até limpar o painel ou atingir o limite de 300.';
  for (const id of ['expiry-seconds', 'expiry-fade'])
    document.getElementById(id).disabled = !s.enabled;
}
function setTiming(value) {
  const s = KaiaTiming.normalizeTiming(value);
  document.getElementById('expiry-enabled').checked = s.enabled;
  document.getElementById('expiry-seconds').value = s.seconds;
  document.getElementById('expiry-fade').value = s.fadeSeconds;
  timingSummary();
}
for (const id of ['expiry-enabled', 'expiry-seconds', 'expiry-fade'])
  document.getElementById(id).addEventListener('input', timingSummary);
for (const button of document.querySelectorAll('[data-expiry]'))
  button.onclick = () => {
    document.getElementById('expiry-seconds').value = button.dataset.expiry;
    document.getElementById('expiry-enabled').checked = true;
    timingSummary();
  };
document.getElementById('save-timing').onclick = async () => {
  const status = document.getElementById('expiry-status');
  try {
    const saved = await window.kaia.saveTiming(readTiming());
    settings.timing = saved.timing;
    setTiming(saved.timing);
    messageExpiry.configure(saved.timing);
    status.textContent =
      'Temporizador salvo. As mensagens atuais também foram ajustadas.';
  } catch (e) {
    status.textContent = e.message;
  }
};
