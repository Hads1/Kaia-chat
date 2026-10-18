# Kaia Chat

**Versão 0.9.6:** SR com reconexão e retomada de faixas, leitor com limite de atraso e fila, áudio independente, limpeza de temporários e modo jogo transparente. Veja [Leitor e SR](docs/LEITOR-E-SR.md) e o [tutorial Spotify](docs/SPOTIFY.md).

Overlay de leitura para **Twitch, Kick, Starvios e uma plataforma personalizada por API JSON**, feito para Windows. Configure cada canal e seu áudio independentemente e reúna as mensagens em um painel transparente sobre o jogo.

## Usar

**[Baixar o aplicativo pronto para Windows 10/11 (64 bits)](https://github.com/Hads1/Kaia-chat/releases/latest)**

Baixe o ZIP de uma versão em **Releases**, extraia a pasta inteira e abra `KaiaChat.exe`. Não é necessário instalar Node.js nem fazer login nas plataformas de leitura pública. Escolha onde salvar o **backup TXT**, informe o nome ou link dos canais desejados, escolha os sons e clique em **Salvar e conectar**. Se o TXT ainda não tiver sido escolhido, o aplicativo pede o local antes de conectar. Não execute o programa de dentro do ZIP.

O aplicativo não envia mensagens. A leitura pública depende da disponibilidade das plataformas.

## Recursos

- Twitch, Kick e Starvios com ativação, canal, áudio e volume próprios.
- Botões nativos de minimizar, maximizar/restaurar e fechar, redimensionamento pelas bordas e encaixe de janelas do Windows; interface adaptável ao tamanho disponível.
- Sons incluídos e seleção de arquivos WAV, MP3, OGG ou M4A.
- Fontes instaladas, tamanho, peso, cor, sombra e prévia ao vivo.
- Emotes nativos e conjuntos públicos disponíveis de 7TV, BetterTTV, FrankerFaceZ e Starvios.
- Aba **Widget**: URL local para OBS, pop-up, layouts Clássico/Cartões/Compacto e CSS personalizado.
- Engrenagem recolhe somente as configurações; o último botão ativa o chat transparente com passagem de cliques para o jogo. Ctrl+Shift+F9 restaura a janela e os controles.
- Reconexão automática, controle de duplicatas e limite de 300 mensagens.
- **Chats bloqueados**: listas globais ou por plataforma, sem exibir mensagens nem tocar áudio dos nicks bloqueados.
- **Tempo das mensagens (chat fade time)**: duração individual e fade configuráveis, com padrão de 2 minutos mais 2 segundos de fade.
- **Backup TXT**: transcrição automática em UTF-8 no arquivo escolhido, preservada mesmo depois do fade.
- **Plataforma personalizada**: endpoint JSON público, campos configuráveis, canal, nome e áudio próprios.

### Maximizar e ajustar a janela — versão 0.8.0

Use o botão **Maximizar/restaurar** no canto superior direito ou **F11** para ocupar a área disponível da tela. **Esc** restaura o tamanho anterior quando maximizada. Arraste pelo cabeçalho para posicionar e pelas bordas para redimensionar. No Windows 11, os controles nativos permitem usar os layouts de encaixe do sistema ao passar o mouse sobre Maximizar, usar **Win+Z** ou arrastar a janela para as áreas de encaixe (dependendo das opções de Multitarefas do Windows). **Win+setas** também permite encaixar a janela.

O chat, campos, abas e botões acompanham a largura e a altura. Painéis têm rolagem e passam a uma coluna em janelas estreitas. A engrenagem continua recolhendo somente as configurações. Não existe seleção de monitor ou novo painel: mova a janela para a tela desejada e maximize. **Ctrl+Shift+F9** também sai da maximização e recupera os controles. A transparência opcional e o widget continuam disponíveis.

### Widget para OBS — versão 0.7.0

Na aba **Widget**, escolha layout e tamanho da fonte, edite o CSS e clique em **Salvar widget e atualizar prévia**. Copie a URL e adicione uma **Fonte de navegador** no OBS, com tamanho sugerido de 500 × 800. O fundo é transparente. **Abrir pop-up** mostra o widget em outra janela. Os seletores disponíveis são `#feed`, `.message`, `.user`, `.message-text`, `.platform` e `[data-platform="kick"]` (também twitch, starvios e custom).

```css
.message {
  background: #151525dd;
  padding: 12px;
  border-radius: 14px;
}
.user {
  color: #fef08a !important;
}
[data-platform='kick'] {
  border-left: 4px solid #53fc18;
}
```

Fonte, cor e sombra seguem a aparência do Chat; layout, tamanho e CSS pertencem ao Widget. O widget respeita bloqueios, exclusões, limpeza e temporizador, sem duplicar áudio. As mudanças salvas atualizam OBS e prévia. O Kaia Chat precisa continuar aberto; ativar o modo jogo mantém as conexões, o TXT e o widget ativos. Mensagens vencidas não reaparecem ao recarregar a fonte.

A URL funciona no mesmo computador, sem hospedagem nem login, em servidor ligado somente a 127.0.0.1. O endereço contém um identificador aleatório persistente neste computador. A porta padrão é 19347; se estiver ocupada, o aplicativo escolhe outra e será preciso copiar a URL atualizada para o OBS. Configurações privadas e caminhos de arquivos não são servidos pelo widget. O CSS é de sua autoria; apenas CSS é aceito, sem editor de JavaScript ou HTML.

A engrenagem preserva o fundo e os botões e apenas recolhe os painéis. O botão final ativa o **Modo jogo**: somente as mensagens permanecem visíveis, sem fundo, controles ou captura de cliques e teclado. **Ctrl+Shift+F9** recupera a aba Chat, suas configurações e os cliques; a bandeja do Windows oferece a mesma recuperação. Ctrl+Shift+F10 mantém o modo opcional de passagem de cliques e transparência.

### Backup TXT

Escolha o arquivo no painel **Backup do chat em TXT**. O conteúdo é acrescentado, sem apagar transcrições anteriores. São registrados horário UTC, plataforma, usuário e texto completo das mensagens recebidas. Mensagens anteriores recuperadas do servidor são identificadas como histórico. Duplicatas de IDs são ignoradas durante a sessão. O backup inclui os nicks ocultos por **Chats bloqueados**; o bloqueio afeta a tela e os sons. O fade não apaga o TXT. Se a gravação falhar, os chats são interrompidos e é necessário escolher outro arquivo e reconectar.

O TXT registra aquilo que o aplicativo recebe enquanto está conectado, incluindo o histórico público que os serviços entregarem. Não recupera mensagens que uma plataforma não disponibilizou, nem garante recuperar todas as mensagens de um período desconectado.

### Plataforma personalizada

Ative **Personalizado** e abra **Configurar plataforma / API pública**. Informe nome, canal e a URL de uma API JSON pública. `{channel}` na URL será substituído pelo canal informado. Os campos da lista, do nick, do texto e do ID único podem ser configurados; use pontos para campos aninhados, por exemplo `data.messages`. Um exemplo compatível com os padrões:

```json
{ "messages": [{ "id": "mensagem-1", "username": "pessoa", "text": "Olá" }] }
```

Para um array na raiz, deixe o campo da lista vazio. A consulta é periódica (2 a 60 segundos), com deduplicação por ID. O primeiro lote é histórico e não toca som. O tempo de exibição e o backup TXT funcionam também nessa plataforma. São aceitas APIs HTTPS e APIs HTTP locais em localhost/127.0.0.1; não é executado código do endpoint.

**Não existe compatibilidade automática com qualquer site:** um link de live ou um widget HTML não substitui uma API de mensagens. Serviços que exigem login, chave privada ou protocolo próprio precisam de um adaptador específico. Emotes da integração personalizada são exibidos como texto quando não existe um adaptador do provedor.

### Tempo das mensagens

Abra **Tempo das mensagens**. Defina quantos segundos cada mensagem fica visível e a duração do fade, ou use os atalhos de 30 segundos, 1, 2 e 5 minutos. Clique em **Salvar temporizador** para aplicar sem desconectar. Cada mensagem é contada a partir de sua exibição; o histórico anterior recebido ao conectar também começa a contar quando aparece no painel. Alterar o tempo recalcula as mensagens atuais pela idade; mensagens antigas podem ser removidas imediatamente. Desative a remoção automática para manter o histórico, ainda limitado a 300 mensagens.

### Chats bloqueados

Abra **Chats bloqueados** nas configurações e informe um nick por linha, ou separe por vírgulas. Use a lista **Todas as plataformas** para bloquear em qualquer chat, ou as listas individuais para Twitch, Kick e Starvios. Aceita `@` e ignora diferenças entre maiúsculas/minúsculas; o nome precisa corresponder ao nick completo. O filtro usa o login do usuário quando ele é informado pela plataforma, mesmo que o nome de exibição seja diferente.

Clique em **Salvar bloqueios**. As mensagens desses usuários já presentes no painel são removidas, novas mensagens são descartadas antes de chegar à interface e não disparam sons. As conexões continuam ativas e as listas são preservadas ao reabrir o aplicativo. Remova o nick e salve para voltar a ver as próximas mensagens. Este filtro é local: não bane usuários nem modifica o chat original das plataformas. Suas listas ficam apenas nas configurações deste computador e não acompanham o ZIP compartilhado.

**Ctrl+Shift+F9** retorna às configurações e libera cliques. **Ctrl+Shift+F10** alterna a passagem de cliques. O ícone na bandeja também recupera a janela. Use jogos em janela ou janela sem borda; tela cheia exclusiva pode cobrir o overlay.

## Desenvolver

Windows 10/11 de 64 bits, Node.js 24 e npm:

```powershell
npm ci
npm test
npm run smoke
npm start
```

`npm test` usa fixtures locais. `npm run smoke` abre o aplicativo em um perfil temporário isolado, verifica renderização, aparência, persistência e transparência, e grava os resultados locais ignorados pelo Git. `npm run live` verifica as conexões públicas de exemplo e requer internet; não faz parte do CI e não grava o conteúdo das mensagens.

```powershell
npm run format
npm run format:check
npm run package
```

O empacotamento gera `dist/KaiaChat-VERSAO-Windows-x64.zip` e SHA-256. O runtime Electron e as dependências vão no pacote. Para compartilhar no GitHub, coloque os ZIPs em Releases; não adicione binários grandes ao Git. O pacote não possui assinatura digital comercial.

## Arquitetura e integrações

- `main.js` gerencia janela, preferências, fontes e IPC. `preload.js` expõe apenas operações delimitadas ao renderer; Node.js não fica disponível na interface.
- `services.js` lê Twitch por IRC anônimo e Kick pelo provedor descoberto no site (Centrifugo/Pusher), com renovação de conexão e reconexão.
- `starvios.js` descobre a configuração pública usada pelo site, resolve o canal e a live, recebe broadcasts públicos `stream:ID` e mantém leitura periódica de recuperação. Monitora mudanças de sala e oferece leitura offline quando a plataforma disponibiliza chat.
- `renderer.js` renderiza texto seguro e emotes sem inserir HTML vindo das mensagens. `appearance.js` valida as preferências. `typography.js` aplica os controles visuais.

Os serviços dos sites podem mudar. Este projeto não é afiliado às plataformas. Emotes privados, conjuntos sem acesso público, cosméticos pessoais e efeitos especiais não são garantidos. Não tenta contornar autenticação ou restrições de acesso.

## Dados locais

Preferências e log de estado das conexões ficam em `%APPDATA%\Kaia Chat`. Tokens temporários Kick ficam somente na memória. O log de conexão não registra conteúdo do chat nem tokens; o conteúdo é gravado no **TXT escolhido pelo usuário**. O pacote começa com canais e listas vazios, sem caminho de backup; configurações de cada pessoa não são incluídas na distribuição.

## Recompensas por pontos e TTS

Ainda não estão implementados. A viabilidade e os requisitos de autorização estão documentados em [docs/RECOMPENSAS.md](docs/RECOMPENSAS.md). O leitor público atual não comprova resgates de pontos nem executa TTS por recompensas.

## Licença

GPLv3; veja [LICENSE](LICENSE) e [CREDITOS.md](CREDITOS.md). Os áudios reaproveitados mantêm seus créditos. Electron, Chromium, ws e emotes têm seus respectivos autores e licenças.
