# Áudio separado — 0.11.8

Os três caminhos usam processos irmãos no Windows:

| Som | Processo |
| --- | --- |
| Música do SR | kaia_musica.exe |
| Voz do leitor, anúncios de pedido e agradecimentos falados | kaia_leitura.exe |
| Som de chegada de mensagem | kaia_tts.exe |

Escolha seu headset na saída da música e na saída do leitor. Os sons de mensagem usam o mesmo dispositivo escolhido para o leitor, mas são reproduzidos pelo processo próprio indicado acima. Todas as mensagens das plataformas usam esse caminho de som de mensagem.

No OBS, use fontes de captura de áudio por aplicativo/processo para separar os três caminhos. Capturar o áudio geral do headset junta tudo novamente. Evite capturar o processo pai Kaia Chat incluindo todos os filhos. Verifique se sua versão/configuração do OBS permite selecionar esses processos auxiliares; a lista de janelas nem sempre oferece processos sem janela. Se isso não estiver disponível, será necessário usar uma captura por processo compatível ou dispositivos virtuais separados.

Nas Propriedades avançadas de áudio, escolha quais fontes entram na transmissão e em cada faixa de gravação. Se o som já sai no headset, não ative monitoramento adicional do mesmo som no OBS, evitando duplicação. A documentação oficial recomenda desativar Áudio do desktop ao capturar os aplicativos separadamente: https://obsproject.com/kb/application-audio-capture-guide.

## Verificação realizada

Um teste silencioso abriu simultaneamente os três caminhos na saída configurada do headset, confirmou os três executáveis distintos e verificou que o SR continuou avançando após alterar o volume no mesmo processo. Os medidores e a configuração das fontes no OBS não foram alterados nem validados por esse teste.

A inspeção das distribuições locais 0.10.1 a 0.11.7 encontrou workers próprios de leitor e som de mensagem. Até 0.11.6, o SR podia usar ffplay na saída padrão e PCM no processo principal ao escolher um dispositivo. Na 0.11.7, ambas as saídas SR usavam PCM no processo principal. Capturar esse pai incluindo seus filhos poderia misturar os áudios. A 0.11.8 coloca o SR num worker irmão e resolve essa diferença. Não é correto afirmar que todas as versões antigas tinham a mesma separação para captura por árvore de processos.
