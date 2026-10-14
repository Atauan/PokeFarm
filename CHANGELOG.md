# Changelog

Todas as alterações notáveis neste projeto serão documentadas neste arquivo.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/).

## [Não publicado]

### Adicionado
- Filtro de plataforma de lives ("Ambas", "Apenas Twitch", "Apenas Kick") que destrói os processos das webviews desativadas para economizar CPU e RAM. Referência: [registro](docs/changes/2026-10-14-1430--fase-2-otimizacoes-filtro-plataforma-auto-follow.md).
- Opção de auto-follow configurável para Twitch e Kick, seguindo o canal ao abrir a live para garantir contabilização dos pontos. Referência: [registro](docs/changes/2026-10-14-1430--fase-2-otimizacoes-filtro-plataforma-auto-follow.md).
- Seletor de conta para o monitor de mercado Pokeidle (Desativado ou conta específica), evitando varreduras redundantes em múltiplas contas. Referência: [registro](docs/changes/2026-10-14-1430--fase-2-otimizacoes-filtro-plataforma-auto-follow.md).
- Suporte a multi-contas Twitch e Kick vinculadas por perfil de jogo Pokeidle com sessões isoladas (`accountPartition`), permitindo conexões independentes por aba e resgate de pontos. Referência: [registro](docs/changes/2026-10-14-1235--multi-contas-twitch-kick-e-limites-lives.md).
- Otimização de visualização e decodificação de vídeo: modo de exibição compacta (ocultando contêineres de vídeo e reduzindo blocos para tiras de chat) e tetos configuráveis de slots de vídeo ativos por perfil e globalmente. Referência: [registro](docs/changes/2026-10-14-1235--multi-contas-twitch-kick-e-limites-lives.md).
- Multi-instância para o modo Twitch econômico: cada perfil ativo com canais online opera em sua própria sessão de chat compartilhado.
- Evidência pontual de execução com uma conta, três chats Twitch e duas lives Kick: valores observados e plano de diagnóstico por processo, sem otimizações aplicadas. Referência: [registro](docs/changes/2026-10-14-1136--evidencia-consumo-uma-conta-cinco-canais.md).
- Auditoria completa com 22 achados sobre RAM, CPU, lives, GPU, `/hunt`, segurança e distribuição, incluindo prioridades e critérios de validação. Melhorias propostas, sem alterações funcionais. Referências: [relatório](docs/auditoria-completa-2026-10-14.md) e [registro da auditoria](docs/changes/2026-10-14-1116--auditoria-completa-ram-cpu-lives-gpu.md).
- Integração da extensão `/hunt for PokeIdle` (análise de rotas de caça por XP/h e Gold/h) com controle liga/desliga na interface do jogo. Referência: [docs/changes/2026-10-14-1045--adicao-extensao-hunt-pokeidle.md](docs/changes/2026-10-14-1045--adicao-extensao-hunt-pokeidle.md).
- Criação da pasta `docs/` e documentação de análise de desempenho e recomendações técnicas do projeto (`docs/analise-desempenho-e-melhorias.md`).
- Registro detalhado da análise em [docs/changes/2026-10-14-1030--analise-de-desempenho-e-leitura-readme.md](docs/changes/2026-10-14-1030--analise-de-desempenho-e-leitura-readme.md).

### Corrigido
- Restaurada abertura imediata de todas as lives cadastradas sob a opção "Todas as contas", impedindo bloqueio indevido por flags de perfil inativo. Referência: [docs/changes/2026-10-14-1627--restaurar-abertura-lives-e-clique-jogo.md](docs/changes/2026-10-14-1627--restaurar-abertura-lives-e-clique-jogo.md).
- Corrigida a captura de cliques em links de streamers oficiais dentro da modal de Bônus Twitch do Pokeidle, abrindo a live na grade imediatamente com confirmação em toast.
- Corrigido o início da interface com classe ativa estática em `panel-lives`, prevenindo abertura de tela preta e garantindo renderização instantânea.

### Alterado
- Otimização no Kick (Achado A01): cache do player e cancelamento do loop de busca do React Fiber assim que a qualidade 160p for ajustada, eliminando picos cíclicos de CPU a cada 3 segundos. Referência: [registro](docs/changes/2026-10-14-1430--fase-2-otimizacoes-filtro-plataforma-auto-follow.md).
- Destruição real de elementos `<webview>` para canais excedentes do teto de vídeo (fila de espera), cessando a decodificação Chromium de vídeo e liberando processamento de GPU. Referência: [registro](docs/changes/2026-10-14-1430--fase-2-otimizacoes-filtro-plataforma-auto-follow.md).
- Adicionada trava de limite de até 100 deltas na fila em memória do `/hunt` (Achado A02) durante carregamento assíncrono. Referência: [registro](docs/changes/2026-10-14-1430--fase-2-otimizacoes-filtro-plataforma-auto-follow.md).
- Auditoria ampliada para 23 achados com limitação de sessões Twitch/Kick globais para múltiplas contas Pokeidle; plano de perfis isolados documentado, sem implementação ou alteração de logins. Referência: [registro](docs/changes/2026-10-14-1155--multiplos-perfis-de-login.md).
- Diagnóstico da auditoria direcionado à página compartilhada Twitch após queda de CPU relatada ao reconectar, distinguindo 16% informados e 17,8% na captura; sem causa comprovada ou correção funcional. Referência: [registro](docs/changes/2026-10-14-1145--queda-cpu-apos-reconectar-twitch.md).
- Auditoria atualizada com o cálculo do `/hunt` condicionado ao painel aberto e nova evidência de uso de GPU Video Decode; sem atribuir causa ao addon ou aplicar otimizações. Referência: [registro](docs/changes/2026-10-14-1139--esclarecimento-hunt-e-gpu-video-decode.md).
- Análise inicial de desempenho sinalizada como histórico: a auditoria atual distingue estimativas não medidas, otimizações já existentes e correções ainda pendentes, preservando o documento anterior.
