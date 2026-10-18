# Kaia Chat

TESTE LOCAL 0.9.6 — CONTINUIDADE DO SR E LEITURA RECENTE
O SR detecta encerramento antes da duração prevista, renova o link e tenta retomar do mesmo ponto até três vezes; se falhar, preserva música e posição e mostra o erro. A saída selecionada reconecta em falhas HTTP/rede. A barra usa amostras efetivamente enviadas à saída.
No Leitor, configure Atraso máximo (padrão 15 segundos), Máximo na fila (10) e Caracteres por fala (300). Mensagens antigas são puladas somente na voz; o chat e o TXT seguem completos. O intervalo é mínimo entre inícios, sem pausa extra após uma fala longa. Geração de voz tem limite de 8 segundos para evitar prender a fila.
Esta correção aguarda seu teste local antes de atualizar a release em rascunho.


CORREÇÃO 0.9.5 — MODO JOGO
O último botão deixa somente os textos do chat na tela, com fundo transparente e passagem de cliques para o jogo, sem esconder a janela. Ctrl+Shift+F9 restaura os controles. Posicione e redimensione antes de ativar. SR, leitor e conexões continuam ativos.


CORREÇÃO 0.9.2 — PLAYER E LEITOR
O Chat tem controles com ícones e barra de tempo arrastável; a aba SR também tem barra de posição. Falhas de áudio ficam visíveis na fila, sem simular reprodução. Se o YouTube pedir login, clique Conectar YouTube, entre no perfil dedicado do Chrome/Edge, teste o acesso e use Tentar pedido novamente. Não importe cache ou cookies manualmente. No leitor, escolha a saída antes de ativar; alterações são salvas automaticamente e Testar voz usa a saída atualmente selecionada. A versão continua em teste local, aguardando seu OK antes de publicar.

VERSÃO 0.9.0 — TESTE LOCAL, AINDA NÃO PUBLICADA
Novas abas Leitor e SR/Spotify. Configure a leitura a cada N mensagens, prioridades e saída de áudio. Bloqueados vêm da aba Chat. Ative o SR para aceitar !sr nos chats conectados. A sessão YouTube é própria e sincronizada automaticamente após login; não importa cookies de outro navegador. Spotify tem campos visíveis e tutorial dentro da aba; cada usuário informa os próprios dados. O fluxo PKCE dispensa segredo e renova tokens automaticamente. Veja docs/SPOTIFY.md e docs/LEITOR-E-SR.md.
Este ZIP deve ser testado no Windows antes de enviar a integração ao GitHub. A publicação aguarda seu OK no chat.

JANELA MAXIMIZADA E ENCAIXE — VERSÃO 0.8.0
Use o botão padrão de maximizar/restaurar no canto superior direito. F11 também alterna; Esc restaura quando maximizada. Arraste o cabeçalho para posicionar e as bordas para redimensionar. No Windows 11, use os layouts de encaixe do próprio sistema (mouse sobre Maximizar, Win+Z ou arraste para o topo, conforme as opções do Windows). Campos e botões acompanham o tamanho, com rolagem nos painéis. Ctrl+Shift+F9 restaura a janela e os controles. Sem configuração de monitores.

Abra KaiaChat.exe na pasta extraída do ZIP (ou ABRIR.cmd na pasta de desenvolvimento). Configure Twitch, Kick e Starvios separadamente com nome ou URL. Ative os canais desejados, selecione áudio e volume para cada um e clique em Salvar e conectar. Arquivo permite escolher WAV, MP3, OGG ou M4A. Testar toca somente o áudio local.

Engrenagem esconde somente as configurações, preservando a janela normal e seus botões. O último botão ativa o chat transparente com passagem de cliques para o jogo. Ctrl+Shift+F9 sempre recupera a janela, as configurações e os cliques. Arraste pelo cabeçalho e redimensione pelas bordas. Ctrl+Shift+F10 alterna passagem de cliques no modo transparente opcional. O ícone na bandeja também permite recuperar a janela.

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
O modo transparente com passagem de cliques permanece disponível por Ctrl+Shift+F10. Desde a versão 0.7.0, a engrenagem apenas recolhe os painéis, sem mudar a transparência. Use Ctrl+Shift+F9 ou a bandeja para recuperar todos os controles.

CHATS BLOQUEADOS — VERSÃO 0.4.0
Abra Chats bloqueados e informe os nicks: um por linha, ou separados por vírgula. A lista Todas as plataformas vale para Twitch, Kick e Starvios; as outras listas valem somente para a plataforma indicada. Pode usar @ e qualquer combinação de maiúsculas/minúsculas. A correspondência é pelo nick completo.
Salvar bloqueios remove as mensagens já visíveis desses nicks, impede novas mensagens e seus sons, sem reconectar os chats. As listas ficam salvas neste computador. Retire o nick e salve para permitir as próximas mensagens novamente. Este é um filtro local: não bane ninguém na Twitch, Kick ou Starvios, nem altera o chat que as outras pessoas veem.

TEMPO DAS MENSAGENS — VERSÃO 0.5.0
Em Tempo das mensagens, defina o tempo em segundos até começar a sumir e a duração do fade. Padrão: 120 segundos visível e mais 2 segundos de fade. Há atalhos de 30s, 1min, 2min e 5min. Cada mensagem tem seu próprio relógio, começando quando aparece no painel. Salvar temporizador aplica a mudança sem reconectar, inclusive às mensagens atuais, respeitando sua idade. Desative a opção para manter o histórico (limite de 300 mensagens).

PLATAFORMA PERSONALIZADA E TXT — VERSÃO 0.6.0
Antes de conectar, escolha um arquivo no painel Backup do chat em TXT. Sem um arquivo válido, o programa pede o local antes de iniciar a leitura. O conteúdo é acrescentado ao TXT escolhido, inclusive mensagens de nicks ocultos pelo filtro local. Desaparecer da tela não apaga a transcrição. O TXT registra mensagens que o aplicativo efetivamente recebe, não um histórico que o serviço não disponibilizou.
Personalizado permite configurar nome, canal e endpoint JSON público, com campos da lista, usuário, texto e ID único. Pode usar {channel} na URL. Exemplo: {"messages":[{"id":"1","username":"pessoa","text":"Olá"}]}. Deixe a lista vazia para array na raiz. Um simples link de live ou widget HTML não permite ler qualquer plataforma automaticamente: serviços fechados precisam de adaptador e autorização próprios.
Pontos de canal e TTS por resgates ainda não estão implementados; o estudo está em docs/RECOMPENSAS.md no código-fonte.

WIDGET PARA OBS — VERSÃO 0.7.0
Abra a aba Widget, escolha Clássico, Cartões ou Compacto, ajuste o tamanho e edite o CSS. Salvar widget atualiza a prévia e a transmissão. Copiar URL fornece o endereço para uma Fonte de navegador do OBS, com fundo transparente (sugestão: 500 × 800). Abrir pop-up mostra outra janela do widget. Veja exemplos de CSS no README.
O aplicativo precisa continuar aberto no mesmo computador do OBS. Ativar o modo jogo mantém widget, conexões e TXT funcionando. Bloqueios, exclusões, limpeza e tempo das mensagens são compartilhados, sem duplicar os áudios. A URL fica salva neste computador; se a porta estiver ocupada, copie a nova URL mostrada no aplicativo.

TESTE 0.9.4 — SR E LIMPEZA DE ÁUDIO
Corrige travamento no carregamento nativo do áudio. Na aba SR, selecione saída e volume e use Testar som do SR. O botão de mudo informa o estado real. Se o YouTube exigir login, Conectar YouTube > entrar na janela dedicada > Testar acesso. Os áudios temporários de fala são apagados após uso e no fechamento, com nova limpeza na inicialização do motor após interrupção. Músicas são transmitidas sem download permanente. Publicação aguarda teste e OK.
