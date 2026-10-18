# SR + Spotify + HUDs + editor — pacote independente

# Instalação e portabilidade

Este pacote contém código-fonte funcional e entrada independente, não um executável com todas as dependências embutidas. Foi validado no Python 3.14 do ambiente atual. Use Python com Tkinter, os pacotes de requirements.txt e FFmpeg completo com ffmpeg/ffplay no PATH do Windows. Não copie a .venv da Kaia para outra máquina.

1. Extraia o ZIP inteiro para uma pasta própria.
2. Execute INSTALAR.bat. Ele cria uma .venv local e instala as bibliotecas.
3. Instale FFmpeg com ffplay se ainda não estiver no PATH. O pacote não inclui binários FFmpeg.
4. Execute VERIFICAR.bat para conferir as dependências.
5. Execute ABRIR.bat.

Para instalar por terminal: `py -3 -m venv .venv`, depois `.venv\Scripts\python.exe -m pip install -r requirements.txt`.

Não foram incluídos cookies, refresh tokens, senhas, OAuth, histórico pessoal, gravações, caches, modelos nem dependências binárias do projeto original. Autorize suas contas no destino quando necessário. Configurações de dispositivos de áudio devem ser escolhidas na nova máquina.

Os testes foram executados em pastas separadas usando o runtime já instalado, sem importar o app principal da Kaia. A instalação do zero em outra máquina não foi executada. Não foram publicadas mensagens em chats nem iniciada música durante a validação.

## Incluído

- Player e janela próprios (`app_sr.py`, entrada `executar_sr.py`).
- Fila, playlist, histórico local de SR, reprodução/pausa, volume e saída de áudio.
- Recepção de comandos !sr da Kick.
- Controle entre processos e opção de serviço sem janela (`sr_servico.py`).
- HUD padrão, HUD personalizado, editor com temas e CSS, RGB por animação/faixa/áudio e soundbar por bandas.
- Monitor da música do Spotify, priorização SR/Spotify nos HUDs e fluxo de autorização Spotify.
- Sessão YouTube por importação de cookies e loopback da saída do computador para soundbar.
- Painéis de referência para integrar controles SR/Spotify e soundbar em outra aplicação.

O layout personalizado atual foi preservado em `avatar/sr_layout.json`; o layout original continua separado. Estados de música/fila foram inicializados vazios para não transportar dados temporários antigos. A execução cria novos históricos e caches neste pacote.

## URLs para OBS

Com o SR aberto:

- Padrão: http://127.0.0.1:8765/sr.html
- Personalizado: http://127.0.0.1:8765/sr-custom.html
- Editor: http://127.0.0.1:8765/sr-editor.html

Salvar no editor atualiza o layout personalizado, sem alterar o padrão. A janela independente ganhou botões para abrir esses endereços, a sessão YouTube e a escolha da saída da soundbar.

A porta 8765 é compartilhada com a instalação original. Para usar os dois sistemas simultaneamente, o integrador deve alterar a porta e os URLs correspondentes no novo sistema. O servidor escuta apenas em localhost.

## Spotify

Configure client_id/client_secret no campo spotify do config.yaml e a URL de retorno no seu aplicativo Spotify. Execute CONECTAR_SPOTIFY.bat e autorize no site oficial. O monitor usa refresh_token e publica somente o estado de música para os HUDs. Login/sessão de uma instalação não acompanha o ZIP.

O SR mostra metadados do Spotify nos HUDs; isso não transforma o Spotify em áudio baixado pelo SR. A reprodução da conta continua pelo aplicativo/dispositivo Spotify autorizado.

## YouTube e áudio

Abra “Sessão YouTube”, faça login no site oficial e importe cookies Netscape quando o YouTube exigir sessão. Cookies existentes da Kaia não foram copiados. O acesso continua sujeito à disponibilidade do vídeo, sessão e requisitos do yt-dlp/YouTube; o ZIP não elimina essas restrições.

Para soundbar, escolha em “Saída da soundbar” o dispositivo onde a música toca e habilite a medição. A medição usa áudio real da saída, não grava o microfone. Sons de jogo/voz no mesmo dispositivo também podem aparecer. O áudio original não acompanha o pacote.

## Mapa para integrar em outro sistema

- `sr_player.py`: extrair_sr(), get_sr(), SongRequest e estado de reprodução.
- `sr_controle.py`: comandos e estado entre o serviço e a interface.
- `overlay_server.py`: servidor dos HUDs e POST /api/sr-layout.
- `sr_overlay_layout.py`: validação e gravação do layout.
- `avatar/sr.js`: seleção do estado SR/Spotify.
- `avatar/sr-layout.js`, `sr-rgb.js`, `sr-spectrum.js`: aparência e animação.
- `spotify_agora.py` e `spotify_ligar.py`: consulta, cache e autorização.
- `sr_loopback.py` e `sr_audio_visual.py`: medição real e JSON das bandas.
- `painel_sr_integrado.py` e `painel_sr_loopback.py`: exemplos de controles reutilizáveis.

Importar o player como biblioteca não encerra players no exit se nenhuma instância local foi criada. Ao adaptar a reprodução, revise a gestão dos processos: o código legado usa nomes próprios kaia_sr.exe para separar áudio no Windows/OBS.

## Validação incluída

`python -m unittest discover -s tests` verifica editor, endpoint local e RGB. Se Node estiver disponível, `node tests/sr_spotify_hud.js` verifica prioridade SR/Spotify. Nenhuma dessas verificações precisa reproduzir música.
