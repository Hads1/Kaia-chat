# Kaia Chat

Implementação nova para leitura dos chats públicos Twitch e Kick.

Os seis arquivos Alert*.wav foram copiados da instalação do Transparent Twitch Chat Overlay, a pedido do usuário. Projeto de referência: https://github.com/baffler/Transparent-Twitch-Chat-Overlay e integração estudada: https://github.com/DrSaeedHub/Transparent-Stream-Chat-Overlay . O projeto de referência utiliza GPLv3; esta distribuição inclui a licença e seu código-fonte sob GPLv3. Autoria original dos áudios preservada; não são apresentados como criação nossa.

Electron e ws têm suas próprias licenças incluídas em node_modules. Emotes pertencem aos respectivos autores/plataformas e são carregados dos provedores, sem incorporação ao pacote.

Na integração 0.9.0, `vendor/reader` e `vendor/sr` derivam dos ZIPs LEITOR_CHAT_SEM_IA e SR_HUD_COMPLETO fornecidos pelo usuário. Os componentes foram adaptados para a interface Electron, mantendo os arquivos de referência e o layout recebido. Veja docs/LEITOR-E-SR.md para as alterações.

O pacote local inclui Python 3.14.7 (licença em `.runtime/python/LICENSE.txt`), dependências Python com seus metadados/licenças em `.runtime/python/Lib/site-packages`, FFmpeg/FFplay da distribuição Gyan 9.0.1 (licença em `.runtime/ffmpeg/LICENSE`) e Node 24.19.0 (`.runtime/ffmpeg/LICENSE-Node`). Fontes FFmpeg e informações da distribuição: https://ffmpeg.org/releases/ e https://www.gyan.dev/ffmpeg/builds/ . As versões Python estão fixadas em backend/requirements.txt. Os binários não são incorporados ao Git; acompanham apenas o ZIP de distribuição.
