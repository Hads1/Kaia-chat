# Recompensas por pontos, áudios e TTS — estudo de viabilidade

Esta função **ainda não foi implementada**. A análise abaixo foi realizada em 15/10/2026.

## É possível?

Sim. O usuário resgata uma recompensa na plataforma, o serviço envia o evento autenticado, o Kaia verifica plataforma/canal/recompensa/identificador do resgate e executa a ação configurada (arquivo de áudio ou leitura do texto por TTS). O Kaia não deve tratar uma mensagem comum alegando gasto de pontos como comprovante de resgate.

## Twitch

Há evento oficial `channel.channel_points_custom_reward_redemption.add` no EventSub, com dados da recompensa, resgate, usuário e `user_input`. Exige autorização do broadcaster com `channel:read:redemptions` ou `channel:manage:redemptions`. O desktop pode receber eventos por EventSub WebSocket. Esta autorização é independente da leitura pública de chat.

- [Assinaturas EventSub](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/#channelchannel_points_custom_reward_redemptionadd)
- [Referência dos eventos](https://dev.twitch.tv/docs/eventsub/eventsub-reference/#channel-points-custom-reward-redemption-add-event)

## Kick

A API oficial possui Channel Rewards e o webhook `channel.reward.redemption.updated`, contendo recompensa, custo, usuário, texto e estado `pending`, `accepted` ou `rejected`. O recebimento oficial usa webhooks: o projeto precisará de um endpoint HTTPS acessível e validado, ou de uma ponte autorizada entre esse endpoint e o desktop. Um app apenas local, usando o leitor público atual, não atende sozinho esse requisito.

- [API Channel Rewards](https://github.com/KickEngineering/KickDevDocs/blob/main/apis/channel-rewards.md)
- [Payload do evento](https://github.com/KickEngineering/KickDevDocs/blob/main/events/event-types.md#channel-reward-redemption-updated)
- [Validação de webhooks](https://github.com/KickEngineering/KickDevDocs/blob/main/events/webhook-security.md)

## Etapa futura proposta

1. Registrar a aplicação e autorizar cada canal sem coletar senha no Kaia.
2. Guardar credenciais com armazenamento seguro do sistema, fora do código e das transcrições.
3. Associar o ID de cada recompensa a um áudio ou TTS e obter o texto do evento oficial.
4. Processar cada ID de resgate uma única vez, distinguindo mudanças de estado e resgates rejeitados.
5. Usar fila de reprodução, limites de duração/texto e controles de volume, teste, pausa e interrupção.
6. Encaminhar o áudio ao dispositivo que o software de transmissão captura.

TTS pode usar vozes instaladas no Windows; vozes de serviços externos precisariam de integração e configuração próprias. Os pontos continuam pertencendo às respectivas plataformas, sem criar ou combinar saldos no Kaia.
