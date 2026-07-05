# Regras de classificação NCM — Private (decisão do titular)

**Fundamento:** decisão de classificação do titular (Gabriel), 2026-07-05. Não é
parecer do contador — é a regra de negócio que o titular assume para os produtos
da Private, aplicável até revisão. O contador valida alíquota/tratamento do NCM;
a escolha do NCM por produto é do titular.

## Regras

1. **Sérum / hidratante com termo CAPILAR ou correlato** → `3305.90.00 Ex01`
   (condicionador; IPI 4,55%; monofásico). A função capilar manda, não o formato "sérum".
2. **Sérum / facial / pele** (sem termo capilar) → `3304.99.90` (outros para a
   pele; IPI 14,3%; monofásico).
3. **CAMUFLAGE** (sozinho, com LIGHT, ou variações ortográficas) → `3305.90.00 Ex01`
   (função e alíquota de capilar — decisão do titular).

## Aplicação inicial (10 orçamentos-golden sem NCM, 2026-07-05)

| # | Produto | NCM atribuído |
|---|---|---|
| 11 | shampoo | 3305.10.00 |
| 12 | Sérum Facial | 3304.99.90 |
| 13 | Sérum Facial vitamina C | 3304.99.90 |
| 17 | Sérum Facial | 3304.99.90 |
| 19 | hidratante | 3304.99.90 |
| 21 | camuflage | 3305.90.00 Ex01 |
| 22 | camuflage | 3305.90.00 Ex01 |
| 23 | pomada modeladora | 3305.90.00 |
| 24 | Sérum Facial | 3304.99.90 |
| 25 | Sérum Facial | 3304.99.90 |

> Atribuição via override de NCM do orçamento (F5-D2, `orcamentos.ncm_id`) —
> reversível, não recalcula preço já congelado (fronteira fiscal×preço, tese 2).
