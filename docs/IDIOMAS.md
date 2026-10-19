# Idiomas e vozes

O Kaia Chat 0.11.0 oferece 14 idiomas de interface, com bandeiras locais e nomes nativos. A seleção é salva em `settings.json` do usuário e troca os textos sem reiniciar conexões ou apagar configurações. Árabe usa `dir=rtl`. As telas e os controles mantêm suas funções.

A bandeira também seleciona uma voz no idioma correspondente. Uma voz já pertencente ao idioma é mantida; ao mudar de idioma, o aplicativo procura o mesmo gênero, priorizando a região padrão. O catálogo inclui todas as 322 vozes retornadas pelo Microsoft Edge TTS em 19/10/2026. Os filtros de idioma/gênero na aba Leitor permitem selecionar qualquer voz do catálogo, incluindo idiomas adicionais aos 14 da interface. A fala exige internet. O conteúdo das mensagens não é traduzido.

As traduções estão no catálogo local `i18n-data.js`, com português como fonte e fallback. Nenhuma chamada de tradução é feita pelo aplicativo. A primeira versão usa tradução automática com revisão de termos comuns; revisões linguísticas adicionais são bem-vindas. Marcas, variáveis de texto e atalhos são preservados. Ao acrescentar textos de interface, acrescente a entrada em todos os catálogos e mantenha os marcadores `{0}`, `{1}` etc.

O observador de interface não altera valores de campos, opções técnicas, mensagens, títulos de músicas ou elementos com `data-i18n-ignore`. Novos elementos e mensagens de estado são localizados dinamicamente. Diálogos nativos e menu da bandeja usam a mesma tradução. O editor do HUD recebe o idioma pela rota local protegida pelo token do widget.

Testes verificam integridade dos catálogos e marcadores, gênero feminino/masculino em todos os idiomas da interface, troca pelas 14 bandeiras, seleção automática da voz, persistência e preservação de canais/mensagens. Os testes de síntese japonês/alemão masculino/feminino receberam áudio do serviço sem salvar arquivos. Os testes não equivalem a revisão humana de cada tradução nem à reprodução individual de todas as 322 vozes.
