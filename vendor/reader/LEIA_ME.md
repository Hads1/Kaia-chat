# Leitor de chat — sem interpretação e sem IA

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

## Comportamento

Abre uma janela própria para ler Kick, Twitch e opcionalmente Starvios. Toda mensagem recebida aparece na janela; as mensagens admitidas vão para uma fila limitada e são faladas com Edge TTS no dispositivo escolhido. Não gera respostas, não pesquisa, não conhece intenção de perguntas, não usa Llama/Groq/OpenJarvis e não escreve nos chats.

Se alguém digitar “Kaia, como está seu dia?”, o pacote apenas lê esse texto. Não existe modo de interpretação nem fila de respostas.

## Usar

1. Escolha os canais e marque as plataformas que deseja conectar.
2. Escolha o dispositivo privado de áudio e a voz (Francisca ou Thalita; a ID é editável para outra voz Edge).
3. Ajuste o intervalo e clique em Iniciar leitura.
4. Parar encerra as conexões e pede a interrupção do áudio.

A configuração é salva em `config_leitor.json`. Por padrão comandos com ! são exibidos, mas não falados. A lista ignorados permite excluir usuários da leitura. A fila comporta 100 mensagens; se lotar, o texto continua aparecendo e o status avisa que não entrou na fila de voz.

A leitura pública de Kick/Twitch não exige credenciais de publicação. Starvios fica desmarcada no exemplo e pode ser habilitada. O histórico inicial Starvios não é tratado como fala nova. Problemas de uma plataforma não devem impedir as outras.

A voz Edge requer internet e pode ficar indisponível. Uma falha transitória repete a mesma voz uma vez e avisa; não troca silenciosamente para outra engine. A saída de áudio não é alterada no OBS. Escolha um headset que não seja enviado à transmissão se quiser leitura só para você.

## Mapa para outro sistema

- `leitor_chat_app.py`, classe `Leitor`: núcleo reutilizável. Métodos iniciar(), receber(user,text,meta), encerrar().
- Callback on_message(user,text,meta): exibir a mensagem em qualquer interface.
- Callback on_status(text): exibir estados e falhas.
- `worker()`: fila, intervalo, síntese e reprodução privada, sem qualquer interpretação.
- `kick_chat.py`, `twitch_chat.py`, `starvios_chat.py`: conectores públicos extraídos do projeto atual.
- `audio_out.py`: saída de áudio e player próprio de leitura. A medição SR foi removida desta cópia.
- `chat_saude.py`, `progresso_voz.py`: diagnóstico limitado e gravação atômica.

Esta entrada foi desacoplada do LeitorChat original para remover as dependências de AppKaia, cérebro, personalidade e interpretação. O original não foi modificado pela exportação. Não há arquivos do SR neste pacote.

Exemplo de integração:

```python
import json
from leitor_chat_app import Leitor
cfg=json.load(open('config_leitor.json',encoding='utf-8'))
leitor=Leitor(cfg,on_message=lambda u,t,m: print(u,t),on_status=print)
leitor.iniciar()
# Mantenha o loop do seu aplicativo ativo.
# Ao fechar: leitor.encerrar()
```

Os callbacks são executados em threads: em Tkinter, Qt ou outro toolkit, encaminhe-os à thread da interface. A janela de exemplo já faz isso por fila de eventos.

Validação: `python -m unittest discover -s tests` cobre exibição, fila, comandos, ignorados e rota exclusiva de leitura. Os testes usam áudio simulado e não escrevem na live.
