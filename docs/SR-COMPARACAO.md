# Análise do SR e mudanças 0.11.6

Foi inspecionada uma cópia local do executável fornecido pelo usuário, sem executar o Chatbot ou importar suas configurações, sessões e dados pessoais. Os binários e ferramentas de inspeção permanecem fora da distribuição e do Git.

## O que foi confirmado

A inspeção dos metadados .NET identificou os componentes SongRequestSystem, CefSongComManager e YoutubeVideo. O gerenciador de músicas tem referências a Browser, estado de reprodução/pausa, tempo atual, próximo item reproduzível e controle por JavaScript. A distribuição contém CefSharp/Chromium. Isso evidencia uma arquitetura de reprodução controlada por navegador, diferente do extrator e decoder de áudio do Kaia.

O ILSpy inicialmente não conseguiu ler os metadados. Ajustar somente a cópia de análise permitiu enumerar tipos, campos e métodos. A descompilação completa dos corpos dos métodos continuou falhando com cabeçalhos inválidos. Portanto, esta análise não recuperou o algoritmo completo, os buffers ou a política de repetição do Chatbot; não se pode atribuir sua estabilidade a uma configuração específica.

A documentação oficial também descreve falhas possíveis no SR do Chatbot: https://github.com/StreamlabsSupport/Streamlabs-Chatbot. A presença de seleção da próxima faixa reproduzível não significa que qualquer vídeo será sempre acessível.

## Implementação própria no Kaia

- Monitor de progresso: no caminho PCM com saída selecionada, um worker vivo sem entregar áudio por 25 segundos é encerrado e entra na recuperação já existente, usando a posição efetivamente reproduzida.
- A fila de fundo mantém a ordem manual enquanto a primeira faixa ainda está sendo preparada. Pedidos do chat continuam prioritários e o modo aleatório continua disponível.
- O player padrão também recebe a opção explícita de desativar vídeo. Não há incorporação do player Chromium do Chatbot, nem cópia de código ou binários proprietários.
- Mantidas as correções 0.11.5: links vencidos, limite de espera do preparo, retomadas, log exportável e avanço após falhas persistentes.

O monitor PCM não mede progresso do ffplay padrão, que continua usando timeout/reconexão de rede e verificação de término do processo. Nenhum destes mecanismos garante disponibilidade de todos os vídeos ou ausência total de interrupções.

Na 0.11.7, o SR passou a usar PCM também no dispositivo padrão para permitir ajuste de ganho em tempo real sem reiniciar a faixa. Com isso, o monitor de progresso cobre ambas as escolhas de saída SR. O controle de volume usa os blocos de áudio já decodificados, sem um novo pedido ao YouTube. O processo capturado no OBS pode mudar para quem capturava o executável antigo da saída padrão; confirme a captura ou use um dispositivo dedicado ao SR. Leitor e alertas mantêm suas saídas próprias.

## Validação

Na 0.11.8, o PCM do SR foi transferido para kaia_musica.exe. Ele é irmão dos workers de leitor e som de mensagem, evitando que uma captura da árvore do SR inclua esses outros áudios. O progresso e o volume são enviados por um canal de controle; não há arquivo de música intermediário.

Testes cobrem ordem, prioridade, detecção de falta de progresso, ausência de falso positivo em pausa, retomada no ponto anterior e parâmetros sem vídeo. Há também teste com FFmpeg real de 120 segundos completos, busca aos últimos três segundos e áudio inválido. Não foi realizado teste comparativo simultâneo ouvindo a playlist inteira no Chatbot e no Kaia.
