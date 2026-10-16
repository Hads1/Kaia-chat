function installCustomControls(card) {
  const box = document.createElement('details');
  box.className = 'custom-config';
  box.innerHTML =
    '<summary>Configurar plataforma / API pública</summary><p class="type-hint">Use um endpoint JSON público. Links de live e widgets HTML não são lidos automaticamente; cada serviço precisa permitir acesso às mensagens.</p><label>Nome da plataforma<input id="custom-name" type="text" value="Personalizado" maxlength="40"></label><label>URL da API JSON<input id="custom-url" type="text" placeholder="https://exemplo.com/chat/{channel}"></label><p class="type-hint">{channel} será trocado pelo canal acima. Não coloque senhas. APIs privadas exigem uma integração específica.</p><div class="type-grid"><label>Lista de mensagens<input id="custom-itemsPath" type="text" value="messages" placeholder="vazio = array na raiz"></label><label>Campo do nick<input id="custom-userPath" type="text" value="username"></label><label>Campo do texto<input id="custom-textPath" type="text" value="text"></label><label>Campo do ID único<input id="custom-idPath" type="text" value="id"></label><label>Consultar a cada (segundos)<input id="custom-pollSeconds" type="number" min="2" max="60" value="3"></label></div><p class="type-hint">Exemplo: {"messages":[{"id":"1","username":"pessoa","text":"Olá"}]}. Use pontos para campos aninhados, por exemplo data.messages.</p>';
  card.append(box);
}
function readCustomFields() {
  return Object.fromEntries(
    [
      'name',
      'url',
      'itemsPath',
      'userPath',
      'textPath',
      'idPath',
      'pollSeconds',
    ].map((k) => [
      k,
      k === 'pollSeconds'
        ? Number(document.getElementById('custom-' + k).value)
        : document.getElementById('custom-' + k).value,
    ]),
  );
}
function setCustomFields(config) {
  for (const k of [
    'name',
    'url',
    'itemsPath',
    'userPath',
    'textPath',
    'idPath',
    'pollSeconds',
  ])
    document.getElementById('custom-' + k).value = config?.[k] ?? '';
}
document.getElementById('choose-transcript').onclick = async () => {
  const status = document.getElementById('transcript-status');
  try {
    const saved = await window.kaia.chooseTranscript();
    if (saved) {
      settings.transcriptPath = saved.transcriptPath;
      document.getElementById('transcript-path').value = saved.transcriptPath;
      status.textContent =
        'Backup TXT ativo. O conteúdo será acrescentado ao arquivo.';
      status.className = 'ok';
    }
  } catch (e) {
    status.textContent = e.message;
    status.className = 'error';
  }
};
window.kaia.on('transcript-status', (state) => {
  const node = document.getElementById('transcript-status');
  node.textContent = state.text;
  node.className = state.state;
});
