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
- **Qualidade configurável:** mínima (160p), 360p, 480p ou automática. A Twitch abre pela página do canal, exibe só o vídeo, aceita o aviso de conteúdo e tenta resgatar o bônus de pontos. A qualidade inicial é 160p; os modos econômicos têm comportamento próprio, descrito abaixo.
- **Twitch econômica (Swift e Electron, experimental):** substitui os vídeos e chats individuais por um único chat compartilhado, sem renderizar as mensagens. Voltado a testar os bônus do Pokeidle com menos consumo; não garante Pontos do Canal da Twitch.
- **Kick econômica (Swift e Electron):** usa a qualidade mínima e reduz mensagens e animações dos chats recolhidos, mantendo os vídeos, a faixa de pontos e os eventos de saldo e resgate.
- **Abas Lives / Pokeidle / Alertas:** trocar de aba não para nada.
- **Várias contas do Pokeidle:** o botão **+** cria uma aba nova do jogo, com login separado. Dê um nome para cada conta na barra da aba; todas ficam rodando ao mesmo tempo, mesmo as que não estão na tela.
- **Alertas do mercado do Pokeidle:** regras por nome, preço máximo (coins/gemas), % abaixo da média e "só shiny", com notificação do sistema. Só avisa, nunca compra.
- **Rodar 24h:** o computador não dorme com o app aberto, inclusive com a tela bloqueada; live parada é recarregada; página travada é recarregada; sem internet, tenta de novo a cada 30 s.
- **Skeleton de carregamento** no lugar da tela branca.
- **Aviso de atualização (Swift e Electron):** consulta releases estáveis do GitHub ao abrir e a cada hora, mostra um modal central e notifica uma vez por versão. **Ver release / baixar** abre a página da release no navegador; **Agora não** ou Esc fecha o aviso. O usuário escolhe e instala o download.
- **Sessões salvas:** o login da Twitch ou Kick vale para todos os blocos e janelas daquele site. O login do Pokeidle é feito no próprio jogo. Os canais e o jogo também podem ser abertos no Microsoft Edge, que usa sua própria sessão.

## Duas versões

| | Swift (raiz do repositório) | Electron (`PokeFarm/`) |
|---|---|---|
| Sistemas | macOS 13+ | macOS e Windows |
| Motor das páginas | WebKit (Safari) | Chromium (Chrome/Edge) |
| Tamanho | ~1 MB | ~100 MB |
| Para compilar/executar pelo código | Xcode Command Line Tools no Mac | Node.js 22+ e npm |

A automação de lives, os modos econômicos e o aviso de atualização estão implementados nas duas versões. Os logins, canais e preferências de uma versão não passam para a outra. Os aplicativos já empacotados não exigem instalar Node.js nem Xcode Command Line Tools.

## Baixar e abrir

Quando houver uma release publicada, os arquivos ficam em [Releases](https://github.com/RaullPereira/PokeFarm/releases). Escolha o arquivo adequado:

| Arquivo | Uso |
|---|---|
| `PokeFarm-Setup-<versão>.exe` | Instala o Electron no Windows x64 |
| `PokeFarm-Portable-<versão>.exe` | Executa o Electron no Windows x64 sem instalador |
| `PokeFarm-<versão>-arm64.dmg` | Electron para Mac com Apple Silicon |
| `PokeFarm-<versão>-x64.dmg` | Electron para Mac com Intel |
| `PokeFarm-Swift-<versão>-universal.zip` | App nativo Swift para Mac com Apple Silicon ou Intel |
| `SHA256SUMS.txt` | Hashes SHA-256 dos cinco arquivos de distribuição |

O app Swift é uma distribuição separada: extraia o `.zip` e mova o `PokeFarm.app` para Aplicativos. Os arquivos `.dmg` contêm o Electron.

Na primeira abertura do `.exe`, o Windows pode mostrar "O Windows protegeu o computador": clique em **Mais informações → Executar assim mesmo** (o app não tem assinatura digital paga). No macOS, se o app for bloqueado, clique com o botão direito e escolha **Abrir**.

## Executar pelo código

### Swift (só Mac)

```bash
xcode-select --install          # só na primeira vez
git clone https://github.com/RaullPereira/PokeFarm.git
cd PokeFarm
./build.sh
```

O `build.sh` compila, gera o ícone, cria o `PokeFarm.app` e abre. Pode arrastar o app para Aplicativos. Se o macOS bloquear, clique com o botão direito no app e escolha **Abrir**.

Para gerar um app universal (Apple Silicon e Intel) sem abri-lo ao terminar, use `./build.sh --universal --no-open`.

### Electron (Mac e Windows)

Com Node.js 22+ e npm instalados, partindo de uma pasta onde o repositório ainda não foi clonado:

```bash
git clone https://github.com/RaullPereira/PokeFarm.git
cd PokeFarm/PokeFarm
npm install
npm start                       # abre direto, sem gerar instalador
```

Se já estiver na raiz do repositório, basta entrar na subpasta `PokeFarm` antes dos comandos npm.

### Gerar instaladores

Dentro da subpasta `PokeFarm`, execute o comando do sistema correspondente. Os arquivos saem em `PokeFarm/dist/`, relativo à raiz do repositório:

```bash
npm run dist:mac                # .dmg para Apple Silicon e Intel (rodar no Mac)
npm run dist:win                # instalador .exe e versão portátil .exe (rodar no Windows)
```

O workflow **PokeFarm build** roda a cada push na `main`, usa runners Windows e macOS e publica uma release com patch incrementado automaticamente. Ele gera os instaladores Electron para os dois sistemas e o app nativo Swift universal para Mac.

Os instaladores Electron e o pacote Swift ficam anexados à release e também disponíveis nos artifacts **PokeFarm-Windows** e **PokeFarm-macOS**. É possível acionar o mesmo fluxo em **Actions → PokeFarm build → Run workflow**, selecionando a branch `main`; um commit já publicado é ignorado. Veja [como publicar uma atualização](#publicar-uma-atualização).

## Como usar

1. **Login:** menu **Entrar → Entrar na Twitch / Entrar na Kick**. Depois clique em **⟳** (recarregar tudo). O login do Pokeidle é feito na própria aba do jogo.
2. **Lives:** entre no Pokeidle para o app reconhecer os canais oficiais. **Gerenciar lives automaticamente** liga ou desliga as verificações periódicas; **Verificar agora** traz os canais online à tela com o automático ligado ou desligado. Para adicionar outros canais, escolha Kick ou Twitch, digite o nome ou cole links separados por vírgula e dê Enter.
3. **Organizar:** use **Colunas** (Auto escolhe o tamanho que deixa os vídeos maiores) ou arraste e redimensione cada bloco. **▦** volta tudo para a grade.
4. **Resgatar pontos:** clique na faixa do chat do bloco; o chat abre inteiro. Feche a janela (Swift) ou clique fora / Esc (Electron) para voltar à faixa.
5. **Alertas:** abra o Community Market no jogo uma vez, para o app aprender de onde vêm os anúncios. Depois cadastre as regras na aba **Alertas** e clique em **Testar notificação** para conferir se o sistema deixa o app notificar.
6. **Atualizações:** quando surgir o modal central, escolha **Ver release / baixar** ou **Agora não**. Esc também fecha. Para consultar novamente, use **Verificar atualizações** no rodapé. O aviso não instala arquivos nem reinicia o app.

### Automação de lives

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

### Dicas para 24h

- Deixe o notebook na tomada. Fechar a tampa pode suspender o computador, e durante a suspensão o app não roda.
- Bloquear a tela pode: as lives e o jogo continuam.
- Se algo travar depois de muitas horas, o botão **⟳** do bloco (ou "Recarregar jogo") resolve sem fechar o app.

## Atualizações pelo GitHub

As versões Electron (Windows/macOS) e Swift (macOS) consultam as releases públicas de `RaullPereira/PokeFarm` ao abrir e a cada hora enquanto o app estiver aberto. Quando há uma versão mais nova, mostram um modal no centro da janela com a versão atual, a nova versão, **Ver release / baixar** e **Agora não**. Esc também fecha o modal. O modal aparece automaticamente uma vez por versão, inclusive entre reinicializações; as lives e o jogo continuam rodando por trás. Uma notificação do sistema também avisa uma vez por versão, independentemente do modal.

O rodapé mantém a versão instalada e **Verificar atualizações**, que abre novamente o modal e mostra o resultado da consulta mesmo quando não há atualização. O modal funciona mesmo se as notificações do sistema estiverem bloqueadas.

A consulta considera a release marcada como mais recente no GitHub, exclui rascunhos e pré-releases, e compara tags como `v3.1.0` numericamente. Consultas manuais têm intervalo mínimo de um minuto e respeitam os limites de requisições informados pelo GitHub. Sem internet ou com erro de API, tenta novamente no próximo ciclo; uma atualização já encontrada continua acessível. Não baixa, instala nem reinicia automaticamente.

### Publicar uma atualização

Faça o push das alterações para `main`. O workflow cuida das etapas seguintes:

1. Calcula o próximo patch usando a maior versão estável entre a versão-base de `PokeFarm/package.json`, as tags e as releases existentes, incluindo rascunhos que já reservaram uma versão. Por exemplo: `3.0.0 → 3.0.1 → 3.0.2`.
2. Grava a mesma versão no `package.json` e nos campos de versão do `Info.plist` das cópias usadas pelos builds. A versão de distribuição fica registrada na tag da release; os arquivos do repositório continuam como base das compilações locais, sem commits automáticos de incremento.
3. Gera os instaladores Windows/macOS e o app Swift universal. Se um build falhar, a publicação não começa.
4. Cria um rascunho apontando para o commit exato do push, gera as notas da release, anexa os cinco arquivos de distribuição e `SHA256SUMS.txt`, e confere os uploads.
5. Publica a release estável e a marca como mais recente. O verificador do app passa a encontrá-la na próxima consulta.

O workflow usa o `GITHUB_TOKEN` fornecido pelo Actions; não exige cadastrar um token pessoal. Os jobs de preparação e publicação recebem `contents: write`: a preparação precisa enxergar os rascunhos, que a [API restringe a quem tem acesso de escrita](https://docs.github.com/en/rest/releases/releases#list-releases). Os builds usam apenas leitura. As regras do repositório precisam permitir que o workflow crie tags e releases. Pushes são processados um por vez, com [fila de até 100 execuções pendentes](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency).

Se um upload falhar, a release permanece em rascunho. Use **Re-run failed jobs** para tentar novamente: o fluxo reaproveita a versão e substitui os uploads incompletos daquele rascunho. Uma release já publicada não é sobrescrita. Reexecuções de commits já incluídos em uma release posterior são ignoradas; a retomada de uma versão antiga não substitui uma versão mais nova como **Latest**.

O incremento afeta o patch. Para começar outra linha de versões, aumente a versão-base em `PokeFarm/package.json` e alinhe o `Info.plist` para os builds locais; uma base `3.1.0`, acima das versões existentes, gera `3.1.1` no próximo push. Criar artifacts ou tags isoladamente não aciona a notificação: o app consulta releases publicadas.

O recurso só funciona nas instalações que já incluam este verificador. Versões antigas precisam de uma atualização manual inicial. Os downloads são escolhidos pelo usuário na página da release.

## Estrutura

```
.
├── KickMulti.swift        # interface e integração do app Swift (SwiftUI + WebKit)
├── LiveAutomation.swift   # consultas e monitoramento online/offline nativos
├── ReleaseUpdates.swift   # verificador de releases do app Swift
├── Info.plist             # dados do app Swift
├── make_icon.swift        # gera o ícone do app Swift
├── build.sh               # compila e abre o PokeFarm.app
├── PokeFarm/              # app Electron (Mac e Windows)
│   ├── main.js            # janela, sessão compartilhada, energia, notificações
│   ├── live-status.js     # consultas de estado online/offline da Kick e Twitch
│   ├── release-updates.js # consulta releases e evita notificações repetidas
│   ├── game-channels.js   # leitor das listas oficiais, compartilhado com o app Swift
│   ├── twitch-economy.js  # chat Twitch compartilhado, usado nas duas versões
│   ├── kick-economy.js    # chat Kick leve, preservando pontos e reprodução
│   ├── preload.js         # ponte segura entre interface e sistema
│   ├── webview-preload.js # scripts das lives, chats e leitura do mercado
│   ├── renderer/          # interface, incluindo o modal em updates.js
│   └── tools/             # geração do ícone
└── .github/
    ├── scripts/release.cjs # versão automática e publicação com todos os arquivos
    └── workflows/         # builds e release a cada push na main
```

## Privacidade

Logins (cookies), canais, regras, histórico de alertas e versões já notificadas ficam no seu computador. Além de acessar Kick, Twitch e Pokeidle, o app consulta a API pública do GitHub para verificar atualizações, sem enviar cookies, tokens de login, canais ou dados do jogo nessa consulta. Como em qualquer acesso HTTP, o GitHub recebe o IP e os cabeçalhos da requisição. As amostras do mercado ficam numa pasta local, aberta pelo botão **Abrir amostras**.

## Contribuindo

Issues e pull requests são bem-vindos. Os sites mudam o layout com frequência; se a Twitch voltar a mostrar a página do canal no lugar do vídeo, ou o bônus parar de ser resgatado, abra uma issue com um print.

## Licença

Código aberto sob a licença [MIT](LICENSE).
