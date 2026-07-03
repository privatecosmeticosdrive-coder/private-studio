# Contexto estratégico — Private Studio

## O que é a Private

Private Cosméticos: indústria terceirista (contract manufacturer) de cosméticos, 23 anos, Valinhos/SP. Lucro Real. Opera sob ANVISA RDC 752/2022 — responsabilidade técnica regulatória é INEGOCIÁVEL. Produção sob encomenda, sazonal (meses ociosos), múltiplos SKUs com setup real de ~1h por troca. ERPs: OMIE e IAPP. O ativo central do negócio é PRECIFICAR CERTO sob encomenda: errar custo pra baixo = perder margem em silêncio; errar pra cima = perder o cliente na cotação.

## O que o Studio é DE VERDADE

Não é "um sistema de orçamentos": é a institucionalização do conhecimento de custo da Private — tirar de planilhas/cabeças a inteligência de MP, MO, imposto e NCM e colocar num engine auditável, parametrizado e com fronteiras de segurança provadas. Horizonte: tornar-se apoio às decisões importantes da empresa (pricing, mix, capacidade, fiscal).

## Teses criadas neste projeto (não são detalhes técnicos — são teses de negócio)

1. **MODELO DE MO DE 3 COMPONENTES (futuro engine):** (a) MP direta; (b) SETUP fixo por ordem (~1h/troca de SKU — protege lote pequeno sem o ceil grosseiro de dia inteiro); (c) CORRIDA proporcional ao tempo real sobre CAPACIDADE NORMAL (não plena — embute sazonalidade; ociosidade vai pra resultado, alinhado a CPC16/IAS2). Achado empírico: modelos vigente×Matriz cruzam em ~1 dia de produção; divergência estrutural real ~4,7%; o resto é artefato do ceil.
2. **FRONTEIRA FISCAL×PREÇO (provada empiricamente):** dado fiscal (NCM/IPI) não vaza pra preço congelado. Revisão de NCM hoje é classificação/auditoria; só afetará RECÁLCULOS futuros quando a F4 ligar NCM→IPI no engine (`resolverNcmEfetivo` já existe; falta chamar no consumo).
3. **BRUTO×LÍQUIDO (Lucro Real):** custo bruto (com impostos) para PRICING ao cliente; custo líquido de créditos (ICMS/PIS/COFINS creditáveis) para CMV contábil. A diferença é ativo fiscal, não desconto. O sistema deve carregar OS DOIS valores por tributo (alíquota + parcela creditável) quando o contador responder.
4. **PROVISÓRIO VISÍVEL:** todo número fiscal não validado é nullable + badge provisório. Falha visível > zero silencioso. Achado: IPI flat 4,55% subcalcula a maioria dos NCMs reais (moda 14,3%, até 27,3%) — provável subfaturamento de IPI hoje; só o contador crava.
5. **GATE DE CORTE DO ENGINE (F4 passo 4):** preço novo == preço velho OU divergência explicada e aprovada pelo Gabriel. Nunca trocar o cálculo por baixo dos panos.
6. **ECOSSISTEMA POR OBSERVAÇÃO (CRM×Studio):** sistemas soberanos que se observam sem se fundir. O CRM (em construção paralela, fora deste repo) é dono do pré-venda: leads, funil comercial, relacionamento. O Studio é dono do pós-qualificação: cotação, custo, orçamento. Contrato mínimo de DOIS eventos: (→) lead qualificado vira solicitação de orçamento no Studio (carregando `lead_id` de correlação); (←) o Studio reporta ao CRM a trajetória do orçamento (criado/enviado/aprovado/rejeitado). Nenhum sistema depende do outro pra operar; trocam sinais, não entranhas. Mecanismo (webhook/API/MCP) decidido QUANDO o CRM estiver de pé.

## O FUNIL COMPLETO (a tese que une tudo)

Com o CRM observado, o funil fecha de ponta a ponta: LEAD (CRM) → QUALIFICAÇÃO (CRM) → COTAÇÃO (Studio) → CONVERSÃO (Studio→CRM) → PEDIDO/FATURADO (futuro) → MARGEM REALIZADA vs ORÇADA (auditoria do modelo de MO). Isso transforma o Studio de calculadora de preço em apoio a decisão: qual perfil de cliente converte, qual categoria tem melhor margem real, quanto custa em cotações perdidas um preço 5% acima. É a espinha dorsal do 'organismo vivo'.

## GAPS conhecidos (ainda não resolvidos — oportunidades reais)

- **FUNIL:** a metade CRM está sendo construída (paralelo); a metade Studio→pedido→faturado ainda não é rastreada. PREPARO BARATO JÁ POSSÍVEL: adicionar ao Orcamento dois campos nullable de correlação (`origem_lead_id: string?`, `origem_sistema: string?`) — custo ~zero agora, evita migração dolorosa depois. (Candidata a mini-fatia futura; NÃO fazer sem OK.)
- **SEM TRILHA DE AUDITORIA:** mudanças de preço/parâmetro/config não registram quem/quando/valor-anterior. Para um sistema-fonte-de-verdade de preço, audit log é requisito.
- **SEM TESTES AUTOMATIZADOS/CI:** o engine de cálculo não tem suite de regressão; antes do corte da F4, criar testes de regressão de preço (golden files dos orçamentos atuais).
- **BACKUP/DR NÃO VERIFICADO:** PostgreSQL no KingHost é produção; rotina de backup/restore nunca foi validada.
- **INTEGRAÇÃO ERP:** OMIE/IAPP coexistem com o Studio sem ponte — retrabalho e risco de divergência de cadastros.
- **SEGURANÇA:** rotacionar senha admin (exposta em testes — pendente); avaliar 2FA/expiração de sessão quando houver mais usuários.

## Visão de escala (HORIZONTE — não é o foco agora)

O Studio tem DNA de produto white-label para indústrias de manufatura sob encomenda: o que é 'config da Private' hoje é 'config do tenant' amanhã. O ecossistema CRM×Studio reforça isso — integração por eventos com contrato mínimo é exatamente a arquitetura que produtos multi-tenant usam. Regras para NÃO fechar portas: (a) parametrizar em vez de cravar; (b) evitar 'Private' hardcoded em lógica de domínio; (c) fronteiras limpas entre engine e dados da empresa; (d) documentar teses — o conhecimento codificado É o equity. DECISÃO EXPLÍCITA: nada disso entra no roadmap atual; foco em terminar Matriz (F4 pós-contador), Dashboard e operação da Private.

## Radar (espelho resumido do 04_estado_atual §6 — aquele é a fonte)

F4 passo 3/4 (aguarda contador) · Dashboard (em construção) · F6 limpeza destrutiva · 273 NCMs a revisar SOB DEMANDA · 541 fórmulas sem NCM (fase separada) · rotação senha admin · guard inativo · hardening modal · dívida contagem de amostras · campos de correlação CRM (`origem_lead_id`/`origem_sistema` — mini-fatia futura) · ponte CRM×Studio (QUANDO o CRM estiver de pé) · Projetos paralelos da empresa: CRM personalizado (em construção, fora deste repo), site institucional, agente INCI standalone, export EUA (FDA/MoCRA/CBP), gestão de crise, ATIVOS×CLAIMS.
