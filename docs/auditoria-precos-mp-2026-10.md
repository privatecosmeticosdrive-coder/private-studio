# Auditoria dos preços de matéria-prima — Private Studio × Omie (22/10/2026)

**Base:** retrato das 1255 MPs do Studio feito em 22/10/2026 22:30 (antes do incidente do banco) × catálogo de MP do Omie (1057 códigos, 416 com compra; última NF de entrada 21/10/2026).
**Regra do preço:** última NF de COMPRA (mercadoria + IPI + ST) ÷ quantidade recebida, convertida para R$/kg. Pareamento: `backend/prisma/omie-mp-mapa.json` + nome normalizado + semelhança ≥ 0.85.
**Este relatório é uma simulação (dry-run offline):** nada foi gravado. Vale como plano para a sincronização assim que o banco for restaurado.

## 1. Pareamento Omie → Studio

| Ação | Códigos do Omie |
|---|---|
| vincular | 593 |
| sem_vinculo | 309 |
| criar | 152 |
| ignorar | 3 |

| Origem do vínculo | Códigos |
|---|---|
| auto_similar | 214 |
| auto_exato | 245 |
| manual | 134 |

- MPs do Studio que recebem pelo menos um código do Omie: **435** de 1255.
- MPs novas a criar no Studio (catálogo próprio PRD* sem par, ou compra sem par): **148**.
- Códigos do Omie que ficam só registrados (material de cliente sem compra): **309**.
- Compras que NÃO viram R$/kg: UN sem peso: 12; volume sem densidade: 1.

## 2. Preços que mudam com a última compra

- MPs existentes que recebem preço da última compra: **262** (1 hoje sem preço).
- Aumentos ≥ 20% (geram alerta): **42**; quedas ≤ −20%: **43**.
- Suspeitos (variação acima de ×5 ou abaixo de ÷5, **não aplicados** sem revisão): **17**.
- MPs novas com preço de compra: **68**.

### 2.1 Maiores variações (|Δ| ≥ 30%) — 64 MPs

| Studio | Nome | Fórmulas | Preço hoje | Data | Última compra | NF / data | Δ% |
|---|---|---|---|---|---|---|---|
| 114 | Óleo essencial Gerânio | 0 | 1.580,80 | 02/06/2021 | 6.949,00 | 67469 / 18/04/2026 | +339,6 |
| 57 | Vitamina C Nano Vit CLQ ( capsula ) | 1 | 170,00 | 15/06/2026 | 718,77 | 5259 / 08/12/2025 | +322,8 |
| 239 | Conservante Spectrast | 3 | 426,40 | 04/08/2025 | 1.787,60 | 60141 / 04/09/2025 | +319,2 |
| 588 | Tinogard TL | 8 | 260,00 | 15/10/2021 | 1.023,08 | 73659 / 13/10/2026 | +293,5 |
| 10 | Ácido Salicílico | 21 | 210,00 | 04/08/2026 | 825,92 | 8974 / 29/06/2026 | +293,3 |
| 46 | Dioxido de Titanio Anatase - CI 77891 | 31 | 52,00 | 03/09/2026 | 175,19 | 27912 / 11/03/2024 | +236,9 |
| 602 | Essencia Velvet Rose ( BF08494) | 5 | 208,00 | 15/10/2021 | 690,00 | 10893 / 04/09/2025 | +231,7 |
| 700 | Sorbitol | 7 | 23,74 | 11/04/2025 | 63,51 | 455 / 07/10/2026 | +167,5 |
| 757 | Extrato Glicerinado de Camomila | 13 | 60,00 | 17/09/2026 | 138,00 | 67469 / 18/04/2026 | +130,0 |
| 311 | Óleo de Jojoba | 41 | 556,40 | 23/09/2026 | 1.159,00 | 52907 / 07/02/2025 | +108,3 |
| 1347 | Kaolim 325 | 1 | 22,00 | 13/04/2026 | 44,80 | 25743 / 30/10/2025 | +103,6 |
| 755 | Manteiga de Ucuúba | 2 | 110,00 | 21/10/2022 | 218,43 | 6626 / 15/09/2025 | +98,6 |
| 1238 | Corante Amarelo Tartrazina | 1 | 350,00 | 17/11/2025 | 9,93 | 15562 / 28/10/2024 | -97,2 |
| 78 | Lauril Eter Sulfato de Sodio 27% | 38 | 9,68 | 19/09/2026 | 19,02 | 22310 / 20/10/2026 | +96,5 |
| 143 | D´Pantenol | 150 | 522,60 | 23/09/2026 | 49,00 | 9455 / 12/07/2024 | -90,6 |
| 326 | Extrato de chá verde | 10 | 15,00 | 17/07/2026 | 28,50 | 23603 / 31/07/2026 | +90,0 |
| 110 | Óleo essencial hortelã | 7 | 416,00 | 03/09/2026 | 89,86 | 13747 / 17/09/2026 | -78,4 |
| 149 | Extrato Glicolico de Bambu | 5 | 66,56 | 05/07/2024 | 14,40 | 21559 / 08/09/2026 | -78,4 |
| 151 | Extrato Glicolico de Gengibre | 26 | 61,36 | 13/11/2023 | 14,40 | 20981 / 05/08/2026 | -76,5 |
| 182 | Complexo Bio Restore | 11 | 670,00 | 05/08/2024 | 185,00 | 13994 / 29/11/2024 | -72,4 |
| 147 | Triglicérdes Cáprico Caprílico | 37 | 104,00 | 23/09/2026 | 178,78 | 60142 / 04/09/2025 | +71,9 |
| 240 | Gluconate de Sódio | 35 | 90,00 | 23/09/2026 | 25,51 | 25743 / 30/10/2025 | -71,7 |
| 425 | Essencia M2 | 1 | 182,00 | 14/03/2024 | 51,98 | 757 / 27/02/2024 | -71,4 |
| 303 | Hidroxido de Potassio | 0 | 41,78 | 02/06/2021 | 14,12 | 256544 / 06/05/2025 | -66,2 |
| 191 | Jaguar C 13S | 48 | 200,00 | 04/08/2026 | 70,22 | 12309 / 21/09/2026 | -64,9 |
| 1387 | Cetiol OE | 1 | 120,00 | 27/04/2026 | 195,01 | 25738 / 29/10/2025 | +62,5 |
| 96 | Óleo Essencial de Melaleuca | 20 | 485,90 | 03/09/2026 | 778,78 | 73289 / 08/12/2025 | +60,3 |
| 703 | Uvinul T150 (PARSOL EHT) | 12 | 494,00 | 18/09/2026 | 787,88 | 25881 / 11/11/2025 | +59,5 |
| 766 | Extrato Glicolico de  Barbatimão | 1 | 140,00 | 12/09/2025 | 56,88 | 6532 / 09/09/2025 | -59,4 |
| 1002 | Ajidew ZN-100 ( Zinco PCA) | 4 | 1.250,00 | 23/06/2026 | 511,74 | 25738 / 29/10/2025 | -59,1 |
| 862 | Dry Flow | 0 | 140,00 | 24/10/2025 | 63,07 | 25738 / 29/10/2025 | -55,0 |
| 160 | Extrato de flor de Calendula | 17 | 60,00 | 02/06/2021 | 27,20 | 8974 / 29/06/2026 | -54,7 |
| 152 | Extrato Glicolico Café Verde | 15 | 30,45 | 13/01/2026 | 14,40 | 20981 / 05/08/2026 | -52,7 |
| 72 | Argila Verde | 0 | 28,00 | 23/09/2025 | 42,74 | 60619 / 18/09/2025 | +52,6 |
| 36 | Plantaren 2000 - Deci Glucosideo | 35 | 40,00 | 15/07/2026 | 19,45 | 15684 / 02/07/2026 | -51,4 |
| 803 | Açafrão em Pó | 0 | 50,00 | 20/09/2023 | 24,38 | 368542 / 08/04/2024 | -51,3 |
| 91 | Óleo Essencial de Semente  de Uva | 21 | 52,00 | 27/08/2026 | 78,25 | 6532 / 09/09/2025 | +50,5 |
| 95 | Óleo de Abacate | 150 | 67,60 | 15/07/2026 | 34,00 | 21754 / 18/09/2026 | -49,7 |
| 314 | Extrato Glicolico de Aloe Vera | 80 | 97,80 | 23/09/2026 | 49,73 | 48348 / 14/02/2025 | -49,2 |
| 598 | Cristais de Quartzo Facial | 5 | 300,00 | 15/10/2021 | 159,60 | 56055 / 12/05/2025 | -46,8 |
| 872 | Aloe Vera em Pó | 37 | 500,00 | 31/07/2026 | 280,06 | 1894 / 11/12/2025 | -44,0 |
| 1439 | DUB Estoline (FQ00142) | 1 | 145,60 | 07/04/2026 | 207,70 | 9025 / 30/06/2026 | +42,7 |
| 830 | Geogard ECT | 22 | 589,00 | 08/10/2025 | 343,00 | 66364 / 18/03/2026 | -41,8 |
| 1471 | Purabeetp(BETAINE) | 2 | 139,17 | 21/07/2026 | 81,84 | 87062 / 29/09/2026 | -41,2 |
| 49 | Sodium PCA ( Ajidew NL 50) | 60 | 208,00 | 15/07/2026 | 125,15 | 25881 / 11/11/2025 | -39,8 |
| 45 | Cocoamidopropil Betaina (anfotero) | 179 | 12,00 | 23/09/2026 | 7,36 | 22310 / 20/10/2026 | -38,6 |
| 488 | Cetiol CC - Dicaprylyl Carbonate | 7 | 300,00 | 04/08/2026 | 184,47 | 25738 / 29/10/2025 | -38,5 |
| 539 | Óleo de Neem | 25 | 90,00 | 03/09/2026 | 123,66 | 13747 / 17/09/2026 | +37,4 |
| 1006 | Amphisol K  ( Potassium Cetyl Phosphate) | 8 | 255,00 | 03/09/2026 | 349,49 | 25738 / 29/10/2025 | +37,1 |
| 199 | Olivem 1000 | 14 | 348,00 | 17/09/2026 | 475,60 | 60142 / 04/09/2025 | +36,7 |
| 962 | Alcool Etilico Refinado | 23 | 9,80 | 03/09/2026 | 6,32 | 362857 / 08/10/2026 | -35,5 |
| 11 | Acido Citrico | 243 | 21,80 | 23/09/2026 | 14,17 | 21777 / 18/09/2026 | -35,0 |
| 741 | Cera de Candelilla | 12 | 70,00 | 31/07/2026 | 93,86 | 59672 / 21/08/2025 | +34,1 |
| 223 | Silicone  CM 50 | 1 | 39,74 | 02/06/2021 | 26,32 | 12309 / 21/09/2026 | -33,8 |
| 1328 | Deoplex Clear | 1 | 990,00 | 08/04/2026 | 657,00 | 171610 / 16/09/2026 | -33,6 |
| 896 | Foamysense 308 Polymer PL354 ( Peg180) | 3 | 534,29 | 11/03/2026 | 711,80 | 553444 / 17/07/2026 | +33,2 |
| 192 | Conserve HI | 233 | 72,80 | 19/09/2026 | 96,87 | 570 / 23/09/2026 | +33,1 |
| 1289 | Citrato de Sódio | 1 | 46,00 | 19/03/2026 | 30,88 | 25738 / 29/10/2025 | -32,9 |
| 1029 | Dipropilenoglicol | 6 | 21,15 | 23/10/2025 | 28,03 | 469506 / 14/10/2026 | +32,5 |
| 94 | Óleo de Amendoas Doce | 36 | 80,00 | 31/07/2026 | 105,94 | 68330 / 13/05/2026 | +32,4 |

### 2.2 Suspeitos (revisar antes de aplicar — override `forcar_preco` no mapa)

| Studio | Nome | Preço hoje | Última compra | Qtde | Omie | Δ% |
|---|---|---|---|---|---|---|
| 1429 | VERSAGEL M 1600 P | 335,00 | 182.881,88 | 32 GR | 16224286 | +54.491,6 |
| 1078 | Óleo Vegetal de Rosa Mosqueta | 286,00 | 55,00 | 150 KG | MC015570 | -80,8 |
| 171 | Cyclopentasiloxane (BRB CM 50- SF 1202) | 171,60 | 28,82 | 4 KG | MT000025 | -83,2 |
| 1290 | Tiossulfato de Sódio | 290,00 | 11,40 | 25 KG | MT000035 | -96,1 |
| 44 | Enxofre em Pó | 8,10 | 14.230,00 | 0.025 KG | MT000043 | +175.579,0 |
| 12 | Acido Hialuronico | 190,00 | 8.997,50 | 0.5 KG | MT000759 | +4.635,5 |
| 545 | Microcare PHG | 738,40 | 79,35 | 5 KG | MT001666 | -89,3 |
| 1058 | Silicone 200/350 | 181,00 | 33,54 | 3.38 KG | MT001680 | -81,5 |
| 260 | Carvão Ativado | 160,00 | 24,87 | 7 KG | PRD00223 | -84,5 |
| 204 | Óleo de Ojon | 390,00 | 42,80 | 12 KG | PRD00025 | -89,0 |
| 242 | Óleo de silicone | 250,00 | 36,27 | 50 KG | PRD00096 | -85,5 |
| 75 | EDTA Tetrasodico ( Sol 40%) | 11,44 | 125,60 | 1 KG | PRD00722 | +997,9 |
| 56 | Vitamina E Oleosa | 624,00 | 44,74 | 1 KG | PRD00725 | -92,8 |
| 978 | Pigmento Marrom (Código 329 Nouê) | 207,00 | 25,53 | 0.75 KG | PRD01628 | -87,7 |
| 1412 | Steareth-21 | 350,00 | 58,91 | 10 KG | PRD57040 | -83,2 |
| 1525 | Germall 115 | 450,00 | 4,00 | 170 KG | PRD90227 | -99,1 |
| 312 | Óleo de Andiroba | 301,60 | 44,02 | 1 KG | SH1504 | -85,4 |

## 3. Data de atualização × score (regra do termômetro: ≤3 meses 98 · 3–6 88 · 6–12 74 · >12 60 · sem data 50)

Hoje (todas as MPs):

| Faixa | MPs |
|---|---|
| 3-6 meses (88) | 162 |
| 6-12 meses (74) | 194 |
| <= 3 meses (98) | 270 |
| > 12 meses (60) | 609 |
| sem data (50) | 20 |

Hoje (só MPs usadas em fórmulas: 952):

| Faixa | MPs |
|---|---|
| 3-6 meses (88) | 154 |
| 6-12 meses (74) | 154 |
| <= 3 meses (98) | 242 |
| > 12 meses (60) | 383 |
| sem data (50) | 19 |

Depois da sincronização (a última compra vira a data da cotação):

| Faixa | MPs |
|---|---|
| 3-6 meses (88) | 166 |
| 6-12 meses (74) | 195 |
| <= 3 meses (98) | 249 |
| > 12 meses (60) | 626 |
| sem data (50) | 19 |

- MPs usadas em fórmulas com cotação vencida (> 12 meses ou sem data): **402** — são as que derrubam o score dos orçamentos.
- MPs sem preço: **13** (12 usadas em fórmulas — entram a R$ 0 no custo, com alerta). MPs sem data: **20**.
- **Achado da regra:** o score mede só a IDADE da data gravada, não a origem. Preço digitado "por foto" com data de hoje pontua 98 como se fosse NF. Com a integração, o histórico passa a ter origem `integracao_omie` + NF: proposta é pesar a origem (compra = 100% da régua; cotação manual = régua −10; estimativa = −25) — decisão de produto, não aplicada.

## 4. Score das fórmulas (aproximação pelo KB de jun/2026: 546 fórmulas pareadas, 268 sem pareamento completo)

| Faixa | Antes | Depois da sincronização |
|---|---|---|
| verde (>=90) | 243 | 168 |
| amarelo (75-89) | 218 | 233 |
| laranja (60-74) | 85 | 145 |
| vermelho (<60) | 0 | 0 |

## 5. Inconsistências de cadastro encontradas no Studio

- D-Pantenol (143) a R$ 522,60/kg × NFs a ~R$ 49/kg; Tartrazina (1238) R$ 350 × NF R$ 9,93; Enxofre (44) NF a R$ 14.230/kg (quantidade provavelmente errada na NF 25743) — tratados no mapa (`forcar_preco` / revisão).
- Duplicidades internas do Studio (mesmo material com dois cadastros): Gluconato de sódio (26 e 240), Tween 80 × Polisorbato 80 (1257 e 1052), Glicerina (77 e 48), caulim (209 e 1347), Óleo de semente de uva cadastrado como "essencial" (91). Unificar é decisão do P&D.
- Nomes genéricos que atraem vínculo errado foram bloqueados: Óleo Essencial 1 (281), Essencia (261), Branco (572), Blend Isa Santini (621), Bland Lavanda (490), Blend Rosa (132).

## 6. Como aplicar (depois da restauração do banco)

1. `node studio/exportar-mp-omie.mjs` (robô) → `dados/studio-mp-omie.json`.
2. `node prisma/sync-omie-mp.cjs` (dry-run) → conferir `prisma/relatorio-sync-omie-mp.json`.
3. `node prisma/sync-omie-mp.cjs --commit` (gera backup em `prisma/backup-sync-omie-mp-*.json`; rollback por `prisma/rollback-sync-omie-mp.cjs`).
