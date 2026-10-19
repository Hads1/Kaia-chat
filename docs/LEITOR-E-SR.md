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

## Correção 0.9.6 — continuidade e atraso
- O player não trata mais toda saída do decoder como fim natural: se a faixa terminar antes da duração esperada ou com erro, preserva o pedido, renova a URL e retoma da posição tocada até três vezes. Esgotado o limite, pausa com erro visível, sem descartar a faixa.
- A saída PCM selecionada usa reconexão HTTP/rede e timeout de leitura. O progresso conta amostras entregues à saída, sem avançar pelo tempo gasto esperando rede. Referência: https://ffmpeg.org/ffmpeg-protocols.html#http
- Leitor: fila padrão de 10, validade de 15 segundos e texto falado de até 300 caracteres, configuráveis na aba. Prioridades e bloqueios continuam valendo; a validade também se aplica a prioritários. No limite da fila, remove a mensagem mais antiga da pior prioridade elegível. Texto integral permanece no chat/TXT.
- Intervalo mínimo contado desde o início da preparação, sem pausa extra depois de cada áudio. Síntese interrompida por timeout total de 8 segundos; mensagens vencidas não começam a tocar.
- Testes: 19 JavaScript; 12 regressões do áudio; integração FFmpeg com queda HTTP no meio de uma faixa de 12 s, recebida inteira após reconexão; abertura/interface Electron. Em teste externo, Lalala (Official Video), duração informada 178 s, decodificou 177,284 s com saída 0 (diferença inferior a 1 s). Esse teste usou saída PCM de teste, sem reproduzir a faixa nos alto-falantes nem salvar o áudio. Voz real: primeiro bloco 1,016 s; síntese completa 1,636 s, apenas memória.
- A release 0.9.5 permanece em rascunho enquanto o reparo 0.9.6 é validado localmente. A branch pública já recebeu 0.9.5 antes do relato de interrupção; 0.9.6 ainda não foi enviada.

## 0.10.0 — teste local
Atalhos globais SR: seis ações independentes (alternar play/pausa, play, pausa, próxima, anterior, parar), aceleradores editáveis, conflitos informados e restauração do conjunto anterior em falha. Recuperação Ctrl+Shift+F9/F10 protegida.
Filas: identidade estável por faixa, pedidos separados da playlist, limites independentes de 1 a 500 entradas aguardando, exclusão individual/por lista e movimento por posição. Ordenação manual desliga e salva o aleatório. Músicas já aceitas são preservadas ao reduzir limites. !sr entra antes da próxima faixa de fundo; a atual termina normalmente.
Privacidade/áudio: sons do chat agora usam worker separado (kaia_tts.exe), voz usa kaia_leitura.exe e música permanece no motor SR. Chat e voz compartilham a saída privada selecionada no Leitor, com volumes próprios; configurar captura OBS para não incluir essa saída. Avisos de pedidos são enfileirados após o título ter sido resolvido e aceito, sem duplicar anúncio em retry. Solicitante visível nos dois players do aplicativo, removido do HUD por URL.
Alertas: fontes múltiplas com nome/plataforma, URL privado, seletor CSS e ativação. Presets Streamlabs e StreamElements e opção personalizada. BrowserWindows sem som, sandbox/contextIsolation, sem Node no conteúdo, sem janelas externas ou permissões de dispositivo e partição de memória. Observador lê mudanças futuras em texto HTML selecionado, não executa instruções recebidas e ignora texto inicial/duplicatas curtas. Não é OCR; canvas/imagem/vídeo ou iframe de outro domínio podem exigir adaptador específico. O seletor pode precisar de ajuste conforme o tema/serviço. Eventos só podem ser anunciados se o widget os disponibilizar.
Referências dos serviços: https://support.streamlabs.com/hc/en-us/articles/41706358816667-How-to-Locate-and-Use-Streamlabs-Widget-URLs e https://docs.streamelements.com/overlays/events . No Streamlabs, use o URL do widget Alert Box do painel; não compartilhe o link. No StreamElements, use o URL da sua sobreposição/AlertBox. Escolha o serviço, confira o seletor e dispare follow/sub de teste no painel do serviço. Apenas configurar um URL não comprova recebimento dos eventos.
Janela: faixa adicional de arraste, abertura limitada à área útil, mínimo menor e rolagem para janelas curtas; mantém maximização e encaixe nativos.
Responsividade do motor: importação de playlist assíncrona e consulta de estado com snapshot quando o lock estiver ocupado; configuração inicial serializada; som de chat assíncrono não prende o IPC. Timeout informa a ação e fechamento limpa os temporários.
Validação: 24 testes JavaScript, 17 de áudio/filas, 1 integração HTTP e 2 de responsividade da ponte. Teste Electron estendido verifica registro real de atalho no Windows, duas filas, solicitante local, anonimização do HUD, mudanças reais de DOM em widget HTTP local sem som, último alerta e layouts 320×300, 340×500, 510×860 e 960×650. Não houve acesso aos URLs privados reais Streamlabs/StreamElements do usuário nem teste dos atalhos com seu jogo aberto; validar localmente antes da publicação.

Os pedidos têm uma via de resolução separada da importação de fundo: não aguardam todas as músicas da playlist para pesquisar o próximo !sr. Itens removidos enquanto aguardam resolução são ignorados.

Parar interrompe a música e segura as duas filas até Play, preservando seus itens; Próxima avança normalmente.

## Correção 0.10.1 — alertas animados
O observador antigo reiniciava um debounce de 500 ms em toda mudança de class/style. Uma animação contínua podia adiar a leitura até o texto sumir. Substituído por throttle de 120 ms e amostragem a cada 400 ms. Texto também é buscado em iframes acessíveis e shadow roots abertos, sem contornar isolamento de origens. Seleções sobrepostas de contêiner/filho não repetem o texto.
Preset Streamlabs ampliado com #alert-text e .alert-message. Apenas o preset padrão antigo é migrado; seletores personalizados são preservados. Diagnóstico informa quantidade de elementos correspondentes e presença de iframes inacessíveis. A prévia abre a própria janela monitorada, sem som; fechar a prévia apenas a oculta e mantém o monitor.
Repetir último alerta fica desativado até haver evento; chamada sem evento retorna instrução legível em vez de erro técnico de IPC. URLs e tokens privados não são incluídos no pacote.
Verificação: 24 testes JavaScript e teste do executável com widget local que altera estilos continuamente enquanto mostra um follow e depois um sub em iframe do mesmo domínio. Ambos foram recebidos. Nenhum evento de teste foi enviado para o serviço real do usuário; a validação final usa o botão Teste do painel Streamlabs e a prévia no Kaia Chat.

## Avisos privados — 0.10.2
Avisos de pedidos e alertas passam pela fila prioritária do Leitor, com até 120 segundos de validade, sem aplicar o limite curto das mensagens comuns. Uma falha de voz recebe uma nova tentativa. Os botões Testar voz de pedido musical e Testar voz de um alerta usam esse mesmo caminho e exibem o resultado. A saída é a do Leitor, separada do SR. Receber um alerta real ainda depende do texto acessível no widget configurado.
O worker de voz usa FFmpeg sem stdin e fecha os recursos antes de sair, evitando travamento da fila após a reprodução. O teste de ciclo de vida mantém o canal de controle aberto e exige que o processo termine sozinho.

## Sincronização do fim do alerta — 0.10.3
Cada fonte possui `durationSeconds` de 0 a 300. Zero exige desaparecimento do texto por pelo menos 350 ms e ausência de mídia HTML em reprodução. Um valor positivo permite widgets que retêm texto: aguarda esse prazo desde a identificação, além do fim da mídia HTML. A janela de monitoramento fica muda; o relógio da mídia continua avançando. Web Audio/canvas/iframes sem acesso não têm término observável; configure o prazo do serviço nesses casos. Alterações de texto em sequência são guardadas para leitura após a mídia terminar.
O monitor adicional percorre até 20 frames de outra origem com a API WebFrameMain do Electron. O código executado nesses frames só observa DOM/mídia e devolve eventos de texto limitados; não expõe IPC ou Node à página. A janela e os timers são encerrados ao remover/reconfigurar fontes. Validado com iframe de outra origem em duas portas HTTP locais.
