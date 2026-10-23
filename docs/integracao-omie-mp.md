# Integração Omie → Private Studio: matérias-primas e preço da última compra (10/26)

## O que é

Toda matéria-prima cadastrada no Omie (família "Matéria Prima" / tipo 01: 1.057 códigos em 22/10/2026) passa a existir no Studio
ligada a uma MP (`mp_omie_vinculos`), e o **preço/kg da MP é o da última NF de COMPRA** registrada no Omie — a mesma regra que o
robô de entrada usa no MRP (`entrada/mrp.mjs`): valor pago (mercadoria + IPI + ST) ÷ quantidade recebida, convertido para kg.
Esse é o "preço da última compra" que o Motor 2 10/26 multiplica por (1 + perda) × (1 − crédito 21,21%).

## Peças

| Onde | Arquivo | Papel |
|---|---|---|
| Robô (Faturamento Private) | `studio/exportar-mp-omie.mjs` | Lê os caches do Omie (`dados/produtos-omie.json`, `dados/receb/*.json`) e gera `dados/studio-mp-omie.json` (catálogo + última compra por código). Só leitura. |
| Robô | `studio/sincronizar-studio.mjs` + passo `studio` em `rotina-diaria.mjs` | Exporta e chama o sincronizador do Studio. **Dry-run** até `dados/config-studio.json` ter `"aplicar": true`. |
| Studio | `backend/prisma/omie-mp-mapa.json` | Decisões humanas de pareamento (overrides vincular/criar/ignorar, alvos genéricos bloqueados, `forcar_preco`). Fonte de verdade — editar aqui, nunca no banco. |
| Studio | `backend/prisma/sync-omie-mp.cjs` | Pareia, converte, aplica preços (histórico `integracao_omie` + audit_log + alerta de aumento), grava os vínculos. Dry-run por padrão; `--commit` gera backup JSON. |
| Studio | `backend/prisma/rollback-sync-omie-mp.cjs` | Desfaz uma sincronização a partir do backup. |
| Studio | migration `20261023100000_omie_vinculo_viabilidade` | Tabelas `mp_omie_vinculos` e `projetos_viabilidade` (aditiva). Rollback untracked `prisma/rollback-omie-vinculo-viabilidade-2026-10.sql`. |
| Studio (API) | `GET /api/mps?semOmie=1`, `GET /api/mps/omie/resumo`, `GET /api/mps/:codigo` (inclui `omie_vinculos`) | Lista/filtra por código do Omie e mostra a última compra. |
| Studio (tela) | Matérias-primas: cartões da integração, coluna "Omie", filtro "Sem Omie", seção "Omie — códigos e última compra" no detalhe, origem "Omie (última compra)" no histórico. |

## Regras de pareamento (nesta ordem)

1. Vínculo já gravado no banco é mantido (a não ser que o mapa mande outra coisa).
2. `overrides` do mapa (revisão humana de 22/10/2026: ~130 vínculos manuais, ~85 "criar", 3 "ignorar").
3. Nome normalizado igual (sem acentos, sem "- Private"/"- Nova"/"-MC", sinônimos químicos: oil→óleo, sodium→sódio…).
4. Semelhança ≥ 0,85 (bigramas + tokens), **exceto** para os alvos genéricos bloqueados (Óleo Essencial 1, Essencia, Branco, Blends).
5. Sem par: **cria** a MP no Studio se o código é PRD* (catálogo próprio) ou se tem compra; senão fica registrado como `sem_vinculo`
   (material de cliente sem compra não polui o catálogo).

Vários códigos do Omie podem apontar para a mesma MP (ex.: ácido cítrico com código próprio e com código de cliente): o código
com a **compra mais recente** (PRD* desempata) vira `principal` e alimenta o preço.

## Regras de preço

- Unidade da NF: KG direto; G × 1.000; UN com peso na descrição ("1KG", "500g") pelo peso; **L/mL ou UN sem peso: sem preço** (motivo gravado, visível na tela).
- **Regra de 23/10/2026 (decisão do dono): a compra só substitui o preço quando a NF é MAIS RECENTE que a cotação gravada no Studio.** Cotação de mesma data ou mais nova prevalece (situação `cotacao_mais_recente_mantida` no relatório). A primeira sincronização (23/10, regra antiga) aplicou 142 preços de compras mais antigas; `prisma/reverter-compra-antiga.cjs --backup=<backup da sincronização>` os devolve à cotação anterior.
- Quando a compra é mais recente, a MP recebe o preço e a data da NF (histórico `origem = integracao_omie`, `fonte_info = ultima_compra`, observação com NF/quantidade/fornecedor).
- **Guarda de outlier:** variação acima de ×5 ou abaixo de ÷5 em relação ao preço atual NÃO é aplicada automaticamente — fica como
  "suspeito" no relatório (regra 7: número estranho aparece, não entra em silêncio). Para aplicar, `forcar_preco: true` no mapa.
- Alerta de aumento (≥ `alerta_aumento_mp_pct`, hoje 20%) igual ao da atualização manual.

## Resultado da simulação (retrato de 22/10/2026, antes do incidente — ver `docs/auditoria-precos-mp-2026-10.md`)

591 códigos vinculados a MPs existentes · 150 MPs novas · 332 preços pela última compra · 16 suspeitos retidos · 42 aumentos ≥ 20%.

## Rotina

Diária (passo `studio` da rotina do robô): exporta sempre; grava no Studio só com `"aplicar": true`. Idempotente: sem compra nova, nada muda.
