# Kaia Chat

CORREÇÃO LOCAL 0.10.1 — MONITOR DE ALERTAS
A leitura não aguarda mais o fim das animações: usa amostragem periódica e observação com espera limitada. Procura texto também em iframes acessíveis do mesmo domínio e shadow roots abertos. O preset Streamlabs inclui #alert-text e migra o seletor padrão antigo automaticamente; seletores personalizados são preservados.
Salve as fontes e clique Abrir prévia desta fonte. Dispare um alerta de teste no painel Streamlabs e compare o que aparece nessa prévia. O status informa se encontrou elementos pelo seletor e se há iframe de outro domínio sem acesso. Sem nenhum alerta recebido, o botão de repetir fica desativado e não aparece mais uma mensagem técnica de IPC.
A correção passou em widget local com animação contínua e alerta em iframe acessível. Recebimento do seu URL privado real ainda precisa ser validado com um alerta novo. Não publique esta versão antes do teste local.


TESTE LOCAL 0.10.0 — ATALHOS, FILAS E ALERTAS
Feche a versão anterior antes de abrir esta. O SR tem atalhos globais editáveis, pedidos e playlist de fundo separados, limites próprios, exclusão e ordem manual. Faixas pedidas por !sr são as próximas após terminar a atual; não interrompem a música em andamento.
Na aba Leitor, selecione e salve a saída privada para voz, sons do chat e avisos de pedidos/alertas. A música usa a saída escolhida no SR. Configure no OBS a captura da saída/processo do SR; capturar o áudio inteiro do Windows também captura os avisos privados.
Na aba Alertas, adicione várias fontes Streamlabs/StreamElements/personalizadas com URLs privados de widget e seletor CSS do texto. Widgets ficam sem som. Apenas mudanças futuras de texto HTML acessível são reconhecidas. Imagens, canvas e iframes de outro domínio não têm leitura garantida; esta versão não faz OCR. Dispare um alerta de teste no serviço para validar sua fonte real. A fonte pode ler com o leitor normal desligado, desde que haja saída salva.
O último alerta aparece no chat e na aba Alertas. O solicitante da música aparece nos players do aplicativo, mas é removido do JSON/visualização do HUD por URL. Spotify só substitui o SR quando não houver faixa atual válida do SR.
Uma faixa inteira no topo serve para arrastar/encaixar a janela. Campos/painéis têm rolagem em janelas pequenas. Ctrl+Shift+F9 continua restaurando os controles.
Atalhos: na aba SR, clique no campo e pressione a combinação, ou cole um acelerador Electron (Ctrl+Alt+P, Ctrl+Alt+Right, MediaPlayPause). Salvar detecta conflitos sem tomar atalhos de outro programa. F9/F10 com Ctrl+Shift são reservados.
Importação de playlist passou para segundo plano, e a consulta de estado não aguarda o bloqueio do player. Os erros de comandos indicam qual operação demorou; os demais controles permanecem disponíveis.


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

CORREÇÃO LOCAL 0.10.2 — VOZ DOS PEDIDOS E ALERTAS
Pedidos resolvidos anunciam solicitante e título na saída privada do Leitor. Alertas reconhecidos anunciam fonte e texto. Esses avisos têm prioridade sobre o chat, prazo próprio de 120 segundos e uma nova tentativa em caso de falha. Funcionam mesmo com a leitura normal desligada, desde que a saída do Leitor esteja salva.
Nas abas SR e Alertas, use os novos botões de teste de voz e acompanhe o estado do aviso. O SR permite repetir o último pedido recebido nesta sessão. A leitura do alerta depende de ele aparecer em Último alerta recebido; o teste de voz não comprova a recepção do widget externo.
O processo de voz não compartilha mais a entrada de controle com o FFmpeg e encerra após reproduzir o arquivo. O teste real de síntese e reprodução concluiu com zero arquivos de áudio temporários restantes. Confirme a audição no seu headset antes de autorizar publicação.

SINCRONIZAÇÃO LOCAL 0.10.3 — AGRADECER APÓS O ALERTA
Na aba Alertas, cada fonte tem Duração do alerta em segundos. Com 0, o Kaia aguarda o texto desaparecer (inclusive por transparência do contêiner) e os elementos de áudio/vídeo terminarem. Se o widget mantém o texto na página ou usa Web Audio não acessível, informe a duração que configurou no serviço (por exemplo, 5 ou 10 segundos). O prazo começa ao identificar o texto do novo alerta; mídia HTML ainda em reprodução adia a fala mesmo após esse prazo.
O conteúdo falado vem do texto acessível do widget, preservando nome e mensagem. Não há reconhecimento de fala do áudio nem OCR nesta versão. O monitor permanece mudo para não duplicar o som do OBS. Alertas em canvas, imagens ou iframe de outro domínio podem exigir outra integração.
Testado em Electron com widget local: texto ocultado em 1,5 segundo e áudio de 2 segundos; aviso liberado apenas após o término do áudio. Casos de 5/10 segundos e prevenção de repetição passaram nos testes automatizados. O teste real do Streamlabs deve ser confirmado separadamente.

A revisão 0.10.3 também monitora frames incorporados por meio da API de frames do Electron, sem habilitar Node no widget nem desativar a segurança do navegador. O teste de iframe de outra origem (servidor local em outra porta) confirmou texto, término do áudio e emissão única. O seletor ainda precisa corresponder ao texto real da fonte.

VERSÃO LOCAL 0.11.0 — IDIOMAS E CATÁLOGO COMPLETO DE VOZES
Use a bandeira no cabeçalho para mudar o idioma. As mesmas abas, campos e funções permanecem disponíveis. Há 14 idiomas de interface: português, inglês, espanhol, francês, alemão, italiano, russo, árabe, hindi, bengali, indonésio, japonês, coreano e chinês simplificado. O árabe usa direção da direita para a esquerda.
A bandeira também seleciona e salva automaticamente uma voz do idioma correspondente, mantendo o gênero anterior quando disponível. Na aba Leitor, os filtros Idioma da voz e Gênero da voz permitem escolher qualquer outra voz. Todos os idiomas mostra as 322 vozes retornadas pelo catálogo Microsoft Edge TTS consultado em 19/10/2026, inclusive idiomas adicionais à interface. As vozes não são arquivos de áudio pré-gravados: o serviço gera a fala pela internet. As traduções da interface são locais e funcionam offline.
Mensagens do chat, nomes de pessoas/músicas, canais, URLs e arquivos da pessoa não são traduzidos. Os áudios temporários continuam sendo apagados após a leitura. O idioma não altera a saída nem o volume do SR/Leitor. Configurações de canal e conexões são preservadas ao trocar a bandeira.
Traduções iniciais usam tradução automática com ajustes de terminologia; melhorias linguísticas podem ser acrescentadas ao catálogo. Antes de publicar, valide o ZIP local. Esta versão não foi enviada ao GitHub.
