# Conectar seu Spotify no Kaia Chat

Cada pessoa usa sua própria aplicação Spotify. O ZIP e o código público não contêm Client ID pessoal, Client Secret, tokens ou sessão do YouTube. Não copie arquivos de `%APPDATA%\Kaia Chat` para o GitHub.

## Obter os dados

1. Abra o [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) e entre com sua conta.
2. Crie uma aplicação. Informe nome e descrição, selecione **Web API** e conclua as etapas que o Spotify apresentar.
3. Em **Redirect URIs**, adicione exatamente `http://127.0.0.1:19348/spotify/callback`. O protocolo HTTP é aceito para esse endereço de retorno local; não substitua por `localhost`. Salve.
4. Nas configurações da aplicação, copie o **Client ID**.
5. Abra **SR / Spotify** no Kaia Chat. O painel **Spotify: minhas credenciais** fica visível na aba. Cole o ID no campo **Client ID**.
6. Deixe **Client Secret** vazio para usar o fluxo **PKCE**, recomendado pelo Spotify para aplicativos desktop. Esse fluxo não precisa guardar um segredo no programa. O campo opcional está disponível caso você utilize seu Client Secret; nunca compartilhe esse valor.
7. Clique **Salvar minhas credenciais** e depois **Conectar Spotify**. O navegador oficial abrirá a autorização. Faça login e autorize sua própria aplicação. Após a confirmação, volte ao Kaia Chat.
8. Abra o Spotify, toque uma música e confira a faixa na aba e nos HUDs.

O Kaia Chat monitora o que está tocando e mostra os dados nos HUDs. Ele não baixa áudio do Spotify nem transforma músicas Spotify em arquivos do SR. Os pedidos `!sr` são resolvidos pelo player YouTube do pacote original.

## Requisitos e erros comuns

As regras atuais do Spotify exigem **Premium do proprietário** para aplicações em **Development Mode** e limitam os usuários que podem utilizar sua aplicação. Cadastre os usuários permitidos no painel quando necessário. A disponibilidade da criação e uso de aplicações depende das regras da sua conta. Consulte as [regras oficiais de quota](https://developer.spotify.com/documentation/web-api/concepts/quota-modes).

- **Redirect URI inválido:** o endereço do painel deve coincidir exatamente com o mostrado na aba, inclusive porta e caminho.
- **HTTP 403:** confira Premium, acesso do usuário e permissões concedidas. Não é resolvido importando cache.
- **Porta 19348 ocupada:** feche outra autorização Spotify em andamento e tente novamente.
- **Sem música:** mantenha uma faixa reproduzindo no Spotify. Alguns conteúdos não fornecem todos os metadados.
- **Autorização revogada:** clique Conectar Spotify e autorize novamente.

O programa consulta automaticamente o estado, renova os tokens antes de expirarem e respeita o intervalo informado pelo Spotify quando houver limite de chamadas. Não existe campo para importar cache. Client Secret e tokens ficam protegidos pelo armazenamento do Windows, em arquivo privado da sua instalação; não são enviados ao widget, ao HUD ou incluídos no ZIP.

## Vídeos complementares

O material educacional [Making with Code](https://cs.fablearn.org/courses/cs9/unit01/project/data_collection/spotify/) referencia estes vídeos em inglês:

- [Obter Client ID e Client Secret](https://www.youtube.com/watch?v=or6GSvjmyyE).
- [Configurar Redirect URI](https://www.youtube.com/watch?v=B_NYjslAGfw).

Eles podem mostrar uma interface antiga. Use **o endereço deste tutorial**, não uma porta mostrada no vídeo, e prefira PKCE sem segredo no Kaia Chat. O roteiro acima é a referência para os campos desta versão.

Referências oficiais: [Aplicações](https://developer.spotify.com/documentation/web-api/concepts/apps), [autorização desktop/PKCE](https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow) e [segurança dos retornos locais](https://developer.spotify.com/blog/2025-02-12-increasing-the-security-requirements-for-integrating-with-spotify).
