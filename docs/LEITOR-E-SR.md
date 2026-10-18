# Integração dos pacotes recebidos — 0.9.0 para teste local

## Correções 0.9.2 — leitura, reprodução e controles no Chat

A aba Chat ganhou um player compacto com ícones de anterior, reproduzir/pausar, próxima e repetição, além da barra arrastável e do tempo atual/total. A aba SR também tem barra de posição. Um pedido cujo áudio não foi obtido fica com erro na fila: o programa não trata mais um link de página do YouTube como se fosse um stream tocando. Depois de conectar a sessão, use **Tentar pedido novamente** ou o botão de reproduzir. O nome encontrado, sozinho, não confirma reprodução.

No leitor, a ativação e as alterações passam a ser salvas ao mudar os campos. Sem saída escolhida, a caixa de ativação é revertida e o aviso pede a seleção. **Testar voz** usa e salva a saída atualmente escolhida, sem exigir uma etapa de salvar separada. A síntese foi testada com voz Francisca e produziu áudio; a reprodução no headset escolhido precisa ser confirmada no computador do usuário.

**Conectar YouTube** agora abre um perfil dedicado do Chrome ou Edge instalado, em vez do navegador incorporado. Faça login nesse perfil e mantenha a janela aberta até **Testar acesso sem tocar** confirmar o acesso. A sessão é sincronizada automaticamente e reutilizada, sem importar arquivos de cookies. Esse perfil é próprio do SR: o perfil pessoal padrão do navegador não é acessado. O YouTube continua podendo exigir autenticação, limitar acesso ou impedir uma faixa; o erro é exibido, sem simular reprodução. Consulte as [orientações oficiais do Chrome sobre perfis dedicados](https://developer.chrome.com/blog/remote-debugging-port).

Os arquivos fornecidos `LEITOR_CHAT_SEM_IA.zip` e `SR_HUD_COMPLETO.zip` foram incorporados em `vendor/reader` e `vendor/sr`. O código e o layout personalizado que vieram nos ZIPs foram preservados, com adaptações para integração. As conexões públicas do chat continuam exclusivamente no Electron; os conectores antigos não são iniciados em paralelo.

## Leitor

Na aba **Leitor**, selecione a saída, a voz e o volume. Defina **N** para ler uma mensagem a cada N mensagens normais: 1 lê todas, 2 lê a segunda de cada par, 3 lê a terceira de cada trio. A lista de baixa prioridade tem sua própria contagem. Os usuários de alta prioridade não passam pela amostragem: todas as suas mensagens admitidas entram à frente das outras, preservando a ordem entre mensagens da mesma prioridade. A fala em andamento termina antes da próxima prioridade. A mesma pessoa nas duas listas recebe alta prioridade.

Os nicks são completos, sem diferença entre maiúsculas/minúsculas; `@` é opcional. As listas valem para todos os chats conectados. **Chats bloqueados**, na aba Chat, prevalece sobre qualquer prioridade e impede fila e áudio, inclusive de mensagens aguardando leitura. A exclusão de uma mensagem pela plataforma remove a leitura pendente. Limpar o chat também limpa a fila de voz. Histórico anterior entregue ao conectar não é falado.

O intervalo em segundos conta a partir do término da fala anterior. A fila tem limite de 100 mensagens; ao encher, as prioridades maiores podem substituir itens de prioridade menor. O teste de voz usa somente o dispositivo escolhido. Se o dispositivo privado sumir, o leitor informa erro e não usa silenciosamente a saída padrão. A voz Edge exige acesso à internet; ela recebe o texto selecionado para síntese. O leitor não interpreta com IA nem publica respostas na live.

## Song Request

Ative **Aceitar pedidos !sr das lives** e salve. Twitch, Kick, Starvios e a plataforma JSON configurada usam a mesma recepção do Kaia Chat. `!sr nome da música` e `!sr URL do YouTube` entram no player. Mensagens bloqueadas, históricas e duplicadas são descartadas; há intervalo mínimo de 5 segundos por usuário/plataforma. O SR mantém o limite de 80 pedidos e playlist de 60 do pacote original.

Na aba estão pedidos manuais, playlist, fila removível, histórico/estatísticas, pausar, continuar, anterior, próxima, parar, volume, saída, mudo, posição, repetição e aleatório. Os arquivos de cache e de histórico são criados automaticamente na pasta de dados do usuário. As músicas dependem da disponibilidade do YouTube e de seu acesso ao conteúdo; falhas são exibidas na aba.

**Áudio independente:** volume, mudo e saída da música pertencem somente ao SR. Os alertas de novas mensagens continuam no Electron, com os controles por plataforma da aba Chat; desligar os alertas não interrompe a música. A saída SR também é respeitada em streams do YouTube. Se uma saída explicitamente escolhida falhar, o player informa erro e não troca para a padrão do Windows. Se você deixar ambos na mesma saída física, os sons serão ouvidos juntos nela; escolha outra saída para a música quando quiser separação por dispositivo.

## Sessão YouTube automática

Use **Conectar YouTube**, na aba SR, para abrir o Chrome/Edge com o perfil dedicado do SR. Faça login ali, caso o conteúdo exija autenticação, e mantenha a janela aberta até **Testar acesso sem tocar** confirmar. O Kaia Chat sincroniza essa sessão automaticamente a cada cinco segundos enquanto o SR está ativo ou o navegador está conectado, sem pedir arquivo Netscape ou uma pasta de cache. A sessão é persistente neste computador. **Desconectar YouTube** desconecta esse perfil dedicado.

Isso não importa o perfil pessoal do Chrome/Edge que você já usa e não lê cookies de outros perfis. É necessário ter Chrome ou Edge instalado para a conexão dedicada. O YouTube/Google pode exigir nova autenticação; a sincronização automática não elimina as regras do serviço e não garante acesso a todos os vídeos. Se o acesso for recusado, informe o erro no teste local antes de aprovar a distribuição.

## HUDs e soundbar

As URLs da aba SR podem ser usadas como Fonte de navegador no OBS, no mesmo computador e com o Kaia Chat aberto. HUD padrão e personalizado permanecem separados. O editor mantém temas, CSS, RGB, dimensões, importação/exportação de layout e barras de frequência. Alterações salvas atualizam o layout personalizado. O servidor publica apenas uma lista permitida de arquivos do HUD e seus estados; não serve chaves, cookies ou caminhos privados.

A soundbar mede a saída escolhida, não o microfone; outros sons nesse dispositivo podem aparecer. Selecione a saída e aplique a opção. A faixa SR em reprodução tem prioridade no HUD; na ausência de SR, o HUD usa a música atual do Spotify. Spotify continua reproduzindo no próprio aplicativo.

## Dados, adaptações e portabilidade

Preferências ficam em `%APPDATA%\Kaia Chat\settings.json`. Layouts, histórico SR, cache e sessão ficam em `%APPDATA%\Kaia Chat\media`. O Spotify usa `spotify.enc`, protegido pelo Windows; os cookies dedicados também pertencem somente a essa instalação. O pacote de distribuição é montado com lista explícita de arquivos e não copia essa pasta de dados.

O motor Python usa os componentes dos ZIPs, com caminhos redirecionados para a pasta de dados. Foi acrescentado o worker de saída privada que era referenciado mas não estava no ZIP. O encerramento de áudio foi limitado aos processos da própria instância, preservando a instalação original da Kaia. A autorização/monitoramento Spotify do legado foi substituída por PKCE, armazenamento protegido e renovação automática no Electron. O servidor antigo de porta 8765 foi substituído por rotas no servidor local do Kaia Chat, evitando conflito com a instalação original.

Os manifestos e relatórios em `vendor` descrevem os pacotes originais recebidos, não validam esta adaptação. Os testes desta integração ficam no projeto raiz. Os ZIPs originais permanecem intactos em seu local de origem.

O ZIP de teste inclui Python, dependências, FFmpeg/FFplay e Node para resolução de áudio. Não é necessário instalar essas dependências no computador que vai testar. Para preparar o ambiente de desenvolvimento, veja `scripts/prepare-media.ps1`. Binários ficam em `.runtime`, ignorada pelo Git; licenças e versões acompanham a distribuição.

**Publicação pendente:** esta versão deve ser testada pelo usuário no Windows. Nenhuma alteração desta integração deve ser enviada ao GitHub antes de seu OK explícito no chat.

## Correção local 0.9.3
- Bibliotecas nativas NumPy/PortAudio carregadas antes da espera por comandos: evita travamento do SR no Windows ao iniciar o áudio em uma thread.
- Botão de mudo mostra o estado real e permite reativar apenas o SR; mini player avisa quando está mudo.
- Testar som do SR reproduz um tom local pela saída selecionada, sem YouTube ou alertas. Salva a configuração atual e recusa teste durante reprodução.
- Interface mostra título do pedido pendente e informa ausência de sessão YouTube. Após Testar acesso bem-sucedido, um pedido com erro volta à fila automaticamente.
- Pedidos recebidos do chat configuram saída/volume antes de encaminhar ao motor.

Validação: teste real de tom de 1 segundo a 15% concluiu usando a saída PRO X 2 LIGHTSPEED. Isso confirma execução do áudio, não comprova que o usuário o ouviu. Reprodução da música pelo YouTube permanece dependente do login solicitado pelo serviço. Não foi publicada no GitHub; aguarda teste e OK do usuário.

## Limpeza de áudio — 0.9.4
Os áudios de fala são temporários e removidos no bloco finally após cada uso. Ao fechar, o motor é encerrado antes da limpeza dos arquivos de áudio nas pastas privadas tmp_sr, tmp_audio e tmp_leitura. A limpeza é repetida na inicialização do motor para recuperar restos de travamentos. Não segue links simbólicos, não apaga arquivos externos de alertas, TXT, histórico de títulos ou credenciais. SR transmite áudio sem download permanente; o medidor de loopback usa amostras em memória e não grava a transmissão.
