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
- **Lives automáticas (Swift e Electron):** abre vídeo e chat quando o canal entra ao vivo e fecha ambos quando fica offline, sem apagar o canal ou sua posição. Uma chave liga/desliga o monitoramento, com intervalo configurável e botão de verificação avulsa.
- **Canais oficiais do jogo:** importa automaticamente as listas de **Bônus Twitch** e **Bônus na Kick** do Pokeidle, incluindo os canais offline. Basta entrar no jogo; não precisa abrir os painéis nem clicar em cada canal.
- **Carregamento gradual:** inicia as páginas das lives com intervalo de 1,5 segundo para distribuir o trabalho na abertura. O Pokeidle carrega imediatamente.
- **Sem som por padrão:** cada bloco tem botão de som; "Silenciar todos" na barra.
- **Faixa de pontos do chat:** cada bloco mostra só o rodapé do chat, com os pontos. Clicando nela, o chat abre inteiro para resgatar.
- **Twitch:** abre pela página do canal (é a que conta pontos), mostra só o vídeo, em 160p, aceita sozinho o aviso de conteúdo e resgata sozinho o bônus de pontos.
- **Twitch econômica (Swift e Electron, experimental):** substitui os vídeos e chats individuais por um único chat compartilhado, sem renderizar as mensagens. Voltado a testar os bônus do Pokeidle com menos consumo; não garante Pontos do Canal da Twitch.
- **Kick econômica (Swift e Electron):** usa a qualidade mínima e reduz mensagens e animações dos chats recolhidos, mantendo os vídeos, a faixa de pontos e os eventos de saldo e resgate.
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

A automação de lives online/offline está disponível nas duas versões. Os logins, canais e preferências de uma versão não passam para a outra.

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
2. **Lives:** entre no Pokeidle para o app reconhecer os canais oficiais. **Gerenciar lives automaticamente** liga ou desliga as verificações periódicas; **Verificar agora** traz os canais online à tela com o automático ligado ou desligado. Para adicionar outros canais, escolha Kick ou Twitch, digite o nome ou cole links separados por vírgula e dê Enter.
3. **Organizar:** use **Colunas** (Auto escolhe o tamanho que deixa os vídeos maiores) ou arraste e redimensione cada bloco. **▦** volta tudo para a grade.
4. **Resgatar pontos:** clique na faixa do chat do bloco; o chat abre inteiro. Feche a janela (Swift) ou clique fora / Esc (Electron) para voltar à faixa.
5. **Alertas:** abra o Community Market no jogo uma vez, para o app aprender de onde vêm os anúncios. Depois cadastre as regras na aba **Alertas** e clique em **Testar notificação** para conferir se o sistema deixa o app notificar.

### Dicas para 24h

Nas duas versões, a aba **Lives** tem três controles: **Gerenciar lives automaticamente**, **Verificar a cada** e **Verificar agora**. O automático vem ligado. O intervalo inicial é de 1 minuto e pode ser alterado para 30 segundos, 2 ou 5 minutos, inclusive antes de ligar o automático. O app precisa continuar aberto para monitorar.

O reconhecimento dos canais do jogo acontece em segundo plano, sem uma configuração separada. O app lê somente os nomes dos canais oficiais nas atualizações que o Pokeidle já recebe, mesmo com os painéis de bônus fechados. Se o transporte do jogo mudar, as listas dos painéis abertos também servem como fonte. Canais repetidos são ignorados. Com o automático desligado, descobrir novos canais não abre novas lives.

Uma live abre assim que uma consulta confirma que está online. Se já estiver aberta, fecha após **duas verificações offline consecutivas**. Falhas de rede ou respostas inesperadas não fecham lives abertas. Vídeo e chat são descarregados quando a live fecha, mas o canal, o som e a posição continuam salvos para a próxima transmissão.

Desligar **Gerenciar lives automaticamente** interrompe as verificações periódicas e preserva as lives que já estão na tela. **Verificar agora** atualiza a lista conhecida do jogo e consulta os canais uma vez, abrindo todos os online, mesmo com o automático desligado. A verificação avulsa não liga o monitoramento. Se o jogo ainda não tiver fornecido canais, o app pede para abrir o Pokeidle e conclui essa busca quando os canais chegarem.

O **✕** e **Limpar** retiram canais da tela e das próximas descobertas automáticas. Clicar em **Verificar agora** inclui novamente todos os canais conhecidos do jogo, inclusive os removidos antes; também é possível adicionar um canal manualmente. Ao reiniciar com o automático desligado, use **Verificar agora** para preencher a tela.

As consultas usam os endpoints dos próprios sites, sem novas credenciais. Falhas aparecem no resumo como canais **sem confirmação** e preservam as lives abertas. Com o automático ligado, uma nova consulta ocorre no próximo ciclo; também é possível usar **Verificar agora**.

As consultas da Twitch agrupam até 30 canais por requisição. Até quatro requisições são executadas em paralelo, mantendo o tratamento de falhas e o intervalo escolhido. Não há um limite fixo de 20 lives abertas; páginas removidas ou substituídas antes de carregar são descartadas da fila.

### Twitch econômica

Ative **Twitch econômica (experimental)** na aba **Lives**, depois de entrar na Twitch pelo menu **Entrar**. O modo vem desligado e a preferência fica salva. Os canais abertos pelo monitor ou por **Verificar agora** usam o chat compartilhado; quando todos ficam offline, essa página também é descarregada. Desligar a automação preserva os canais que já estavam abertos; novos canais entram por uma verificação avulsa ou adição manual.

O indicador **X/Y chats conectados** conta confirmações de entrada recebidas da Twitch em uma sessão autenticada; não confirma recebimento de bônus no jogo. Se aparecer **Sem login**, entre na Twitch e use **Reconectar Twitch** (ou **Recarregar tudo**). Confira a evolução dos bônus na aba Pokeidle. Desmarcar a opção restaura os vídeos, chats individuais e posições salvas. A opção da Twitch não altera a Kick.

O app entra em lotes de até 20 canais a cada 10,5 segundos, até 100 canais simultâneos, seguindo os [limites documentados do chat da Twitch](https://dev.twitch.tv/docs/chat/#rate-limits). Esse limite é por conta e também considera outros clientes conectados. O script reutiliza a autenticação da própria página; não lê nem armazena tokens. A compatibilidade com os bônus do Pokeidle depende das regras do jogo. Os [Pontos do Canal da Twitch](https://help.twitch.tv/s/article/viewer-channel-point-guide) têm critérios próprios relacionados a assistir às transmissões.

Ideia inspirada no [Twitch Low Resource Mode de MOTHblank](https://github.com/MOTHblank/pokeidle-addons/blob/master/addons/twitch-low-resource.user.js), com implementação própria compartilhada entre Electron e Swift. Confira o recebimento de bônus com a conta conectada. A interface SwiftUI/WebKit requer validação em um Mac.

### Kick econômica

Ative **Kick econômica** na aba **Lives**. A opção vem desligada, fica salva e prioriza a menor qualidade disponível da Kick mesmo se o seletor geral estiver em uma qualidade maior. Mantém os players e as sessões dos chats, pois os bônus da Kick no Pokeidle dependem de resgates com Pontos do Canal. A [Kick associa o ganho desses pontos à reprodução da live com a conta conectada](https://help.kick.com/en/articles/10709188-guide-to-channel-points).

Na faixa de pontos, a lista de mensagens não é desenhada e as animações do chat são desativadas. No transporte WebSocket reconhecido, mensagens comuns também deixam de ser processadas pela interface; mensagens de sistema, atualizações de pontos, resgates e manutenção da conexão continuam passando. Transportes e formatos desconhecidos passam intactos.

Ao clicar na faixa para abrir o chat, as novas mensagens voltam a aparecer e os controles de resgate continuam disponíveis. As mensagens comuns descartadas enquanto ele estava recolhido não são recuperadas. Desmarcar a opção restaura o chat e a qualidade escolhida no seletor geral. A economia é mais limitada que a da Twitch, porque os vídeos continuam em reprodução; não há uma redução percentual medida nem garantia de pontuação. Confira a evolução dos pontos na sua conta.

O embed atual da Kick não oferece o antigo menu de qualidade. O app encontra a API do player associada ao vídeo e seleciona a melhor opção até o limite configurado (ou a menor disponível). Se essa estrutura mudar, a reprodução continua, mas a seleção pode deixar de funcionar.

- Deixe o notebook na tomada. Fechar a tampa sem monitor externo faz o computador dormir, e aí nada roda.
- Bloquear a tela pode: as lives e o jogo continuam.
- Se algo travar depois de muitas horas, o botão **⟳** do bloco (ou "Recarregar jogo") resolve sem fechar o app.

## Estrutura

```
.
├── KickMulti.swift        # interface e integração do app Swift (SwiftUI + WebKit)
├── LiveAutomation.swift   # consultas e monitoramento online/offline nativos
├── Info.plist             # dados do app Swift
├── make_icon.swift        # gera o ícone do app Swift
├── build.sh               # compila e abre o PokeFarm.app
├── PokeFarm/              # app Electron (Mac e Windows)
│   ├── main.js            # janela, sessão compartilhada, energia, notificações
│   ├── live-status.js     # consultas de estado online/offline da Kick e Twitch
│   ├── game-channels.js   # leitor das listas oficiais, compartilhado com o app Swift
│   ├── twitch-economy.js  # chat Twitch compartilhado, usado nas duas versões
│   ├── kick-economy.js    # chat Kick leve, preservando pontos e reprodução
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
