let activeBlockedUsers = KaiaBlocking.normalizeBlockedUsers();
for (const [platform, label] of Object.entries({
  all: 'Todas as plataformas',
  twitch: 'Somente Twitch',
  kick: 'Somente Kick',
  starvios: 'Somente Starvios',
})) {
  const field = document.createElement('label');
  field.textContent = label;
  const input = document.createElement('textarea');
  input.id = platform + '-blocked';
  input.rows = 3;
  input.placeholder = 'nick1\nnick2';
  input.spellcheck = false;
  input.autocapitalize = 'none';
  input.setAttribute('aria-label', 'Nicks bloqueados — ' + label);
  field.append(input);
  document.getElementById('blocked-fields').append(field);
}
function readBlockedUsers() {
  return KaiaBlocking.normalizeBlockedUsers(
    Object.fromEntries(
      ['all', 'twitch', 'kick', 'starvios'].map((p) => [
        p,
        document.getElementById(p + '-blocked').value,
      ]),
    ),
  );
}
function setBlockedUsers(lists) {
  activeBlockedUsers = KaiaBlocking.normalizeBlockedUsers(lists);
  for (const p of ['all', 'twitch', 'kick', 'starvios'])
    document.getElementById(p + '-blocked').value =
      activeBlockedUsers[p].join('\n');
  let removed = 0;
  for (const row of document.querySelectorAll('.message'))
    if (
      KaiaBlocking.isBlocked(
        activeBlockedUsers,
        row.dataset.platform,
        row.dataset.login,
      )
    ) {
      row.remove();
      removed++;
    }
  return removed;
}
document.getElementById('save-blocked').onclick = async () => {
  const status = document.getElementById('blocked-status');
  try {
    const saved = await window.kaia.saveBlocked(readBlockedUsers());
    const removed = setBlockedUsers(saved.blockedUsers);
    settings.blockedUsers = saved.blockedUsers;
    const count = Object.values(activeBlockedUsers).reduce(
      (n, list) => n + list.length,
      0,
    );
    status.textContent = `Bloqueios salvos: ${count} entrada(s). ${removed ? removed + ' mensagem(ns) removida(s) do painel.' : 'Chats continuam conectados.'}`;
  } catch (e) {
    status.textContent = e.message;
  }
};
