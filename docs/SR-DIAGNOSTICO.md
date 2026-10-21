# SR: diagnóstico e desempenho — 0.11.5

Abra **SR / Spotify → Diagnóstico do SR**. O painel mostra os últimos 50 eventos com faixa, posição, motivo e tentativas. **Exportar log do SR** salva o arquivo JSONL no local escolhido. O registro interno gira em dois arquivos de até aproximadamente 2 MB cada e não contém áudio, cookies nem URLs assinados de mídia.

Links vencidos aguardando na fila são renovados. Preparações de áudio que excedem o prazo deixam de bloquear os próximos pedidos. Vídeos privados, removidos ou indisponíveis são registrados e pulados. A mensagem genérica “Video unavailable” não prova que o vídeo foi removido da playlist. O serviço pode negar acesso temporariamente.

Se o áudio terminar antes da duração prevista, o SR tenta renovar o link e retomar do ponto atual até três vezes. Após falha persistente, registra a música e avança. Falhas gerais de acesso (login/limitação de requisições) e dispositivo de saída exigem atenção; trocar o dispositivo selecionado pela saída padrão automaticamente poderia enviar áudio privado para a transmissão, por isso a escolha é preservada.

## Redução de consumo

- A fila completa é transmitida à interface somente quando muda; as listas têm páginas de 100 músicas.
- O estado é gravado no máximo uma vez por segundo durante reprodução e a cada três segundos em espera.
- O tradutor atualiza os elementos alterados e o medidor de áudio trabalha quando o HUD solicita seus dados.
- Fontes instaladas são consultadas de forma assíncrona e guardadas em cache.
- A aceleração de hardware do Electron está desativada. Isso não significa consumo zero de GPU pelo Windows.
- O ZIP usa DEFLATE nível 9 e exclui testes das dependências de execução e dados temporários. A compressão reduz a distribuição; não determina a memória de execução.

Em comparação local controlada com 559 itens, a interface passou de aproximadamente 0,62% para 0,30% de CPU e de 299 MB para 207 MB de memória privada. O cenário usou uma janela oculta, seis amostras e não incluiu Python, reprodução de áudio, OBS ou jogo. No teste separado do worker, houve 58 → 7 gravações e 2.269.940 → 86.208 bytes de estado em cerca de 21 segundos. São medições pontuais, não garantia para qualquer computador ou transmissão.

Os testes automatizados cobrem capacidade de 10.050 faixas, ordem e prioridade, persistência, falhas, retomada, isolamento das saídas e decodificação real de 120 segundos de PCM, incluindo busca até os últimos três segundos. O teste silencioso do decoder não confirma a configuração física de caixas de som ou captura do OBS.
