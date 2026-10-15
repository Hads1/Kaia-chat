# Kaia Chat

Overlay de leitura para **Twitch, Kick e Starvios**, feito para Windows. Configure cada canal e seu áudio independentemente e reúna as mensagens em um painel transparente sobre o jogo.

## Usar

**[Baixar o aplicativo pronto para Windows 10/11 (64 bits)](https://github.com/Hads1/Kaia-chat/releases/latest)**

Baixe o ZIP de uma versão em **Releases**, extraia a pasta inteira e abra `KaiaChat.exe`. Não é necessário instalar Node.js nem fazer login nas plataformas. Informe o nome ou link dos canais desejados, escolha os sons e clique em **Salvar e conectar**. Não execute o programa de dentro do ZIP.

O aplicativo não envia mensagens. A leitura pública depende da disponibilidade das plataformas.

## Recursos

- Twitch, Kick e Starvios com ativação, canal, áudio e volume próprios.
- Sons incluídos e seleção de arquivos WAV, MP3, OGG ou M4A.
- Fontes instaladas, tamanho, peso, cor, sombra e prévia ao vivo.
- Emotes nativos e conjuntos públicos disponíveis de 7TV, BetterTTV, FrankerFaceZ e Starvios.
- Modo totalmente transparente: apenas mensagens, sem fundo, bordas ou botões; os cliques passam para o jogo.
- Reconexão automática, controle de duplicatas e limite de 300 mensagens.
- **Chats bloqueados**: listas globais ou por plataforma, sem exibir mensagens nem tocar áudio dos nicks bloqueados.

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

Preferências e log de estado das conexões ficam em `%APPDATA%\Kaia Chat`. Tokens temporários Kick ficam somente na memória. O log não registra conteúdo do chat nem tokens. O pacote começa com canais vazios; configurações de cada pessoa não são incluídas na distribuição.

## Licença

GPLv3; veja [LICENSE](LICENSE) e [CREDITOS.md](CREDITOS.md). Os áudios reaproveitados mantêm seus créditos. Electron, Chromium, ws e emotes têm seus respectivos autores e licenças.
