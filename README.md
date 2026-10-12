# PokeFarm

[![Open Source](https://img.shields.io/badge/open%20source-%E2%9D%A4-brightgreen)](#licença)
[![Licença: MIT](https://img.shields.io/badge/licen%C3%A7a-MIT-blue.svg)](LICENSE)
![Plataformas](https://img.shields.io/badge/plataformas-macOS%20%7C%20Windows-lightgrey)
![Swift](https://img.shields.io/badge/Swift-macOS%2013%2B-orange)
![Electron](https://img.shields.io/badge/Electron-44-47848F)

Várias lives da **Kick** e da **Twitch** numa tela só, sem som, farmando pontos de canal, com o jogo **[Pokeidle](https://pokeidle.io/app)** rodando ao lado 24h e alertas de anúncios baratos ou raros no mercado do jogo.

> Projeto independente, sem ligação com Kick, Twitch ou Pokeidle. Use por sua conta e confira as regras de cada site sobre farm e automação.

## Recursos

- **Lives em blocos livres:** arraste pelo título para mover; borda direita muda a largura, borda de baixo a altura, o canto as duas. Os tamanhos ficam salvos.
- **Sem som por padrão:** cada bloco tem botão de som; "Silenciar todos" na barra.
- **Faixa de pontos do chat:** cada bloco mostra só o rodapé do chat, com os pontos. Clicando nela, o chat abre inteiro para resgatar.
- **Twitch:** abre pela página do canal (é a que conta pontos), mostra só o vídeo, em 160p, aceita sozinho o aviso de conteúdo e resgata sozinho o bônus de pontos.
- **Abas Lives / Pokeidle / Alertas:** trocar de aba não para nada.
- **Alertas do mercado do Pokeidle:** regras por nome, preço máximo (coins/gemas), % abaixo da média e "só shiny", com notificação do sistema. Só avisa, nunca compra.
- **Rodar 24h:** o computador não dorme com o app aberto, inclusive com a tela bloqueada; live parada é recarregada; página travada é recarregada; sem internet, tenta de novo a cada 30 s.
- **Skeleton de carregamento** no lugar da tela branca.
- **Login uma vez só:** vale para todos os blocos e para o jogo. Botão para abrir qualquer canal no Microsoft Edge.

## Duas versões

| | Swift (raiz do repositório) | Electron (`PokeFarm/`) |
|---|---|---|
| Sistemas | macOS 13+ | macOS e Windows |
| Motor das páginas | WebKit (Safari) | Chromium (Chrome/Edge) |
| Tamanho | ~1 MB | ~100 MB |
| Precisa de | Xcode Command Line Tools | Node.js 22+ |

As duas têm os mesmos recursos. Os logins e regras de uma não passam para a outra.

## Versão Swift (só Mac)

```bash
xcode-select --install          # só na primeira vez
git clone https://github.com/RaullPereira/PokeFarm.git
cd PokeFarm
./build.sh
```

O `build.sh` compila, gera o ícone, cria o `PokeFarm.app` e abre. Pode arrastar o app para Aplicativos. Se o macOS bloquear, clique com o botão direito no app e escolha **Abrir**.

## Versão Electron (Mac e Windows)

```bash
cd PokeFarm
npm install
npm start                       # abre direto, sem gerar instalador
```

Gerar instaladores (saem em `PokeFarm/dist/`):

```bash
npm run dist:mac                # .dmg para Apple Silicon e Intel (rodar no Mac)
npm run dist:win                # instalador .exe e versão portátil .exe (rodar no Windows)
```

Para gerar o `.exe` num Mac é preciso ter o Wine (`brew install --cask wine-stable`). Sem Windows por perto, use o GitHub Actions: **Actions → PokeFarm build → Run workflow** gera o `.dmg` e o `.exe` e deixa para baixar em *Artifacts*.

Na primeira abertura do `.exe`, o Windows pode mostrar "O Windows protegeu o computador": clique em **Mais informações → Executar assim mesmo** (o app não tem assinatura digital paga).

## Como usar

1. **Login:** menu **Entrar → Entrar na Twitch / Entrar na Kick**. Depois clique em **⟳** (recarregar tudo). O login do Pokeidle é feito na própria aba do jogo.
2. **Lives:** escolha Kick ou Twitch, digite o canal (ou cole o link, que é detectado sozinho) e dê Enter. Dá para colar vários separados por vírgula.
3. **Organizar:** use **Colunas** (Auto escolhe o tamanho que deixa os vídeos maiores) ou arraste e redimensione cada bloco. **▦** volta tudo para a grade.
4. **Resgatar pontos:** clique na faixa do chat do bloco; o chat abre inteiro. Feche a janela (Swift) ou clique fora / Esc (Electron) para voltar à faixa.
5. **Alertas:** abra o Community Market no jogo uma vez, para o app aprender de onde vêm os anúncios. Depois cadastre as regras na aba **Alertas** e clique em **Testar notificação** para conferir se o sistema deixa o app notificar.

### Dicas para 24h

- Deixe o notebook na tomada. Fechar a tampa sem monitor externo faz o computador dormir, e aí nada roda.
- Bloquear a tela pode: as lives e o jogo continuam.
- Se algo travar depois de muitas horas, o botão **⟳** do bloco (ou "Recarregar jogo") resolve sem fechar o app.

## Estrutura

```
.
├── KickMulti.swift        # app Swift (SwiftUI + WebKit), arquivo único
├── Info.plist             # dados do app Swift
├── make_icon.swift        # gera o ícone do app Swift
├── build.sh               # compila e abre o PokeFarm.app
├── PokeFarm/              # app Electron (Mac e Windows)
│   ├── main.js            # janela, sessão compartilhada, energia, notificações
│   ├── preload.js         # ponte segura entre interface e sistema
│   ├── webview-preload.js # scripts das lives, chats e leitura do mercado
│   ├── renderer/          # interface (HTML, CSS, JS)
│   └── tools/make-icon.js # gera o ícone
└── .github/workflows/     # build automático do Mac e Windows
```

## Privacidade

Tudo fica no seu computador: logins (cookies), canais, regras e histórico de alertas. O app não envia nada para servidores além dos próprios sites (Kick, Twitch e Pokeidle). As amostras do mercado ficam numa pasta local, aberta pelo botão **Abrir amostras**.

## Contribuindo

Issues e pull requests são bem-vindos. Os sites mudam o layout com frequência; se a Twitch voltar a mostrar a página do canal no lugar do vídeo, ou o bônus parar de ser resgatado, abra uma issue com um print.

## Licença

Código aberto sob a licença [MIT](LICENSE).
