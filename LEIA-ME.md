# Kaia Chat

Abra KaiaChat.exe na pasta extraída do ZIP (ou ABRIR.cmd na pasta de desenvolvimento). Configure Twitch, Kick e Starvios separadamente com nome ou URL. Ative os canais desejados, selecione áudio e volume para cada um e clique em Salvar e conectar. Arquivo permite escolher WAV, MP3, OGG ou M4A. Testar toca somente o áudio local.

Engrenagem alterna o modo overlay. Arraste pelo cabeçalho e redimensione pelas bordas. Diamante permite que cliques atravessem a janela. Ctrl+Shift+F9 sempre retorna às configurações e libera cliques. Ctrl+Shift+F10 alterna passagem de cliques. O ícone na bandeja também permite recuperar a janela. Use jogos em janela sem borda; tela cheia exclusiva pode cobrir overlays.

Somente leitura: não pede contas e não envia mensagens. Twitch usa leitura IRC anônima, sujeita à disponibilidade do serviço. Kick descobre o provedor atual, suporta Centrifugo e Pusher e renova a conexão antes do token temporário expirar. Tokens ficam somente na memória. Endpoints do site Kick podem mudar.

Emotes nativos Twitch pelas tags da mensagem, Kick pelos identificadores presentes no texto; 7TV globais/canal para ambas, BetterTTV globais/canal e FFZ globais/canal Twitch. Nem todo provedor oferece emotes para todo canal. Conjuntos privados, cosméticos pessoais e efeitos de sobreposição não são garantidos. Emotes animados são imagens no Chromium. Limite de 300 mensagens; som limitado a um disparo por 500ms por plataforma para evitar sobreposição excessiva.

Configurações e connections.log em %APPDATA%\Kaia Chat. O log registra estado das conexões, sem conteúdo do chat nem tokens. Instalação original permanece intacta.

Desenvolvimento: npm install, npm test, npm run smoke, npm start. Distribuição inicial em pasta com Electron e código; veja LICENSE e CREDITOS.md antes de redistribuir.

APARÊNCIA DO CHAT — VERSÃO 0.2.0
Abra Fonte, cor e sombra nas configurações. Escolha uma fonte instalada no seu Windows, peso e cor do texto. A opção Preservar as cores dos nomes mantém as cores de cada usuário; desative para aplicar sua cor a todo o texto.
A sombra pode ser ligada/desligada, com cor, intensidade, desfoque e deslocamento horizontal/vertical próprios. Veja o resultado imediatamente na prévia e no chat. Clássico, Alto contraste e Neon suave são pontos de partida que podem ser ajustados.
Salvar aparência guarda o visual sem interromper as conexões. Salvar e conectar também guarda o visual, além dos canais e áudios. Uma fonte ausente em outro computador usa Segoe UI como alternativa.

STARVIOS E TRANSPARÊNCIA — VERSÃO 0.3.0
Starvios tem canal, som e volume independentes. Digite o nome (por exemplo hads) ou o link completo. A conexão pública é acompanhada por leitura periódica de recuperação, com nova sala selecionada quando a live muda. Mensagens anteriores podem aparecer ao conectar, sem disparar som.
Ao clicar na engrenagem, o programa fica totalmente transparente: sem fundo, bordas, cabeçalho ou botões. Somente o conteúdo do chat permanece visível e os cliques passam para o jogo. Use Ctrl+Shift+F9 ou a bandeja do Windows para retornar às configurações.

CHATS BLOQUEADOS — VERSÃO 0.4.0
Abra Chats bloqueados e informe os nicks: um por linha, ou separados por vírgula. A lista Todas as plataformas vale para Twitch, Kick e Starvios; as outras listas valem somente para a plataforma indicada. Pode usar @ e qualquer combinação de maiúsculas/minúsculas. A correspondência é pelo nick completo.
Salvar bloqueios remove as mensagens já visíveis desses nicks, impede novas mensagens e seus sons, sem reconectar os chats. As listas ficam salvas neste computador. Retire o nick e salve para permitir as próximas mensagens novamente. Este é um filtro local: não bane ninguém na Twitch, Kick ou Starvios, nem altera o chat que as outras pessoas veem.
