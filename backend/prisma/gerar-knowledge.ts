/**
 * Gera o pacote de knowledge do "Mestre Treinado" externo (Doc 2d §E).
 * Produz 5 arquivos .md em knowledge-out/ a partir do banco Private:
 *   formulas-master.md, mps-master.md, regras-private.md,
 *   template-output.md, INSTRUCOES.md
 * Depois compacte knowledge-out/ em mestre-treinado-knowledge.zip.
 *
 * Uso: npm run knowledge
 */
import { PrismaClient } from '@prisma/client';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const prisma = new PrismaClient();
const OUT = join(__dirname, '..', 'knowledge-out');

const n2 = (v: any) => (v == null ? null : Number(v));
const fmt = (v: number | null) => (v == null ? '-' : v.toFixed(2));

async function gerarFormulas(): Promise<number> {
  const maes = await prisma.formula.findMany({
    where: { formula_mae_id: null },
    orderBy: [{ categoria: 'asc' }, { nome_produto: 'asc' }],
    include: {
      cliente: { select: { nome: true } },
      _count: { select: { versoes: true, orcamentos: true } },
      composicao: {
        orderBy: [{ ordem: 'asc' }, { id: 'asc' }],
        include: { mp: { select: { codigo: true, nome: true, preco_kg_brl: true } } },
      },
    },
  });

  const linhas: string[] = [
    '# Fórmulas-mãe validadas — Private Cosméticos',
    '',
    `Total: ${maes.length} fórmulas-mãe (raízes de família). Custo MP calculado com preços atuais do banco.`,
    '',
  ];

  for (const f of maes) {
    let custoKg = 0;
    for (const c of f.composicao) {
      const conc = n2(c.concentracao_pct) ?? 0;
      const preco = n2(c.mp?.preco_kg_brl);
      if (preco != null) custoKg += (conc / 100) * preco;
    }
    linhas.push(`## ${f.nome_produto} (mae_id: ${f.id})`);
    linhas.push(`- Categoria: ${f.categoria ?? '-'}`);
    linhas.push(`- Versões na família: ${f._count.versoes + 1} (incl. a mãe)`);
    linhas.push(`- Custo MP atual: R$ ${custoKg.toFixed(2)}/kg`);
    linhas.push(`- Cliente: ${f.cliente?.nome ?? f.cliente_original ?? '—'}`);
    linhas.push(`- Usada em: ${f._count.orcamentos} orçamento(s)`);
    linhas.push(`- Status: ${f.status} | Origem: ${f.origem}`);
    linhas.push(`- Composição (${f.composicao.length} itens):`);
    for (const c of f.composicao) {
      const conc = n2(c.concentracao_pct);
      const preco = n2(c.mp?.preco_kg_brl);
      const nome = c.mp?.nome ?? c.mp_nome_original ?? '(sem MP)';
      const fase = c.fase ? `[${c.fase}] ` : '';
      const func = c.funcao ? ` — ${c.funcao}` : '';
      const cod = c.mp?.codigo != null ? ` (cod ${c.mp.codigo})` : '';
      linhas.push(`  - ${fase}${nome}${cod}: ${conc != null ? conc + '%' : '-'}${preco != null ? ` (R$ ${fmt(preco)}/kg)` : ''}${func}`);
    }
    linhas.push('');
  }

  writeFileSync(join(OUT, 'formulas-master.md'), linhas.join('\n'), 'utf8');
  return maes.length;
}

async function gerarMps(): Promise<number> {
  const mps = await prisma.materiaPrima.findMany({
    orderBy: { nome: 'asc' },
    include: { fornecedores_alt: true },
  });

  const linhas: string[] = [
    '# Matérias-primas — Private Cosméticos',
    '',
    `Total: ${mps.length} MPs com preço atual (R$/kg). Use estes preços REAIS ao propor.`,
    '',
  ];

  for (const m of mps) {
    linhas.push(`## ${m.nome} (cod: ${m.codigo})`);
    linhas.push(`- Preço atual: R$ ${fmt(n2(m.preco_kg_brl))}/kg`);
    linhas.push(`- Fornecedor principal: ${m.fornecedor ?? '—'}`);
    if (m.fornecedores_alt.length) {
      const alts = m.fornecedores_alt
        .map((a) => `${a.fornecedor}${a.preco_kg_brl != null ? ` (R$ ${fmt(n2(a.preco_kg_brl))}/kg)` : ''}`)
        .join('; ');
      linhas.push(`- Alternativos: ${alts}`);
    } else {
      linhas.push(`- Alternativos: —`);
    }
    linhas.push(`- Usada em: ${m.n_formulas_uso} fórmula(s)`);
    if (m.embalagem_minima) linhas.push(`- Embalagem mínima: ${m.embalagem_minima}`);
    if (m.observacoes) linhas.push(`- Observações: ${m.observacoes}`);
    linhas.push('');
  }

  writeFileSync(join(OUT, 'mps-master.md'), linhas.join('\n'), 'utf8');
  return mps.length;
}

async function gerarRegras(nMaes: number, nMps: number) {
  const c = await prisma.systemConfig.findUnique({ where: { id: 1 } });
  const moDia = c ? Number(c.mo_folha_mensal) / c.mo_dias_uteis : 3750;
  const texto = `# Regras de cálculo e operação — Private Cosméticos

Base: ${nMaes} fórmulas-mãe + ${nMps} matérias-primas validadas.

## Modelo de custo (determinístico, Doc 1 §6 + Doc 2d §A)
- Folha mensal (MO): R$ ${c ? Number(c.mo_folha_mensal).toFixed(2) : '75000.00'} / ${c?.mo_dias_uteis ?? 20} dias úteis = R$ ${moDia.toFixed(2)}/dia.
- Imposto sobre MP: ${c ? Number(c.imposto_mp_pct) : 37.5}%.
- Imposto sobre MO: ${c ? Number(c.imposto_mo_pct) : 9.25}%.
- IPI: ${c ? Number(c.ipi_pct) : 4.55}%.
- Desvio de MP: ${c ? Number(c.desvio_mp_pct) : 10}%.
- Frete por unidade: R$ ${c ? Number(c.frete_un_brl).toFixed(2) : '0.10'}.

Fórmula do custo por unidade:
- volume_kg = volume_un / 1000 (densidade ~1).
- CMP s/ imposto = (MP_base + fragrância + desvio + embalagem + frete).
- CMP c/ imposto = CMP s/ imposto × (1 + imposto_mp).
- MO: produção_diária = un_min × 480 (un/min × 60 × 8h).
  dias = ceil(quantidade / produção_diária); MO_lote = dias × R$/dia; MO_un = MO_lote / quantidade.
  CMO c/ imposto = MO_un × (1 + imposto_mo).
- Custo total = CMP_cimp + CMO_cimp.
- Preço s/ IPI = custo_total / (1 - margem). IPI_un = preço_sipi × ipi. Preço c/ IPI = preço_sipi + IPI_un.

## Produtividade (un/min direto — Doc 2d §A)
Presets: 8 (envase simples) · 6 (+rótulo) · 4 (pump/cartucho) · 2 (stick FPS/gloss) · 1 (manual/premium). Ou valor livre.

## Categorias e níveis
- Níveis: basic | inter | premium.
- Categorias: conforme catálogo de fórmulas (ver formulas-master.md).

## Validações de estabilidade e regras críticas
- Soma das concentrações = 100%.
- Respeitar compatibilidades técnicas entre ativos.
- Considerar o budget do cliente (custo MP/un).
- Considerar pH, conservantes e incompatibilidades.
- Usar preços REAIS de mps-master.md sempre que possível.
`;
  writeFileSync(join(OUT, 'regras-private.md'), texto, 'utf8');
}

function gerarTemplate() {
  const texto = `# Template de output — Mestre Formulador

O Mestre deve SEMPRE responder com um JSON estruturado neste formato:

\`\`\`json
{
  "nome_sugerido": "...",
  "categoria": "serum_facial",
  "nivel": "premium",
  "composicao": [
    { "fase": "A", "mp_nome": "...", "concentracao_pct": 65.2, "funcao": "veiculo" }
  ],
  "justificativa": "...",
  "alertas": ["..."],
  "custo_estimado_kg": 152.30
}
\`\`\`

Regras do output:
- A soma de concentracao_pct deve ser 100.
- Use nomes de MP existentes em mps-master.md quando possível.
- custo_estimado_kg deve ser coerente com os preços de mps-master.md.
- alertas lista riscos de estabilidade, custo ou disponibilidade.
`;
  writeFileSync(join(OUT, 'template-output.md'), texto, 'utf8');
}

function gerarInstrucoes(nMaes: number, nMps: number) {
  const texto = `# INSTRUÇÕES — Mestre Formulador Private (colar nas configurações do Projeto Claude.ai)

Você é o Mestre Formulador da Private Cosméticos, indústria de terceirização
cosmética em Valinhos/SP.

Sua base de conhecimento contém ${nMaes} fórmulas-mãe validadas (formulas-master.md)
e ${nMps} matérias-primas com preços atuais (mps-master.md). Use SEMPRE essas
referências antes de propor. As regras de cálculo e estabilidade estão em
regras-private.md.

Regras críticas:
- Soma de concentração = 100%.
- Considere compatibilidades técnicas entre ativos.
- Considere o custo (o cliente sempre tem um budget).
- Considere estabilidade (pH, conservantes, incompatibilidades).
- Use preços REAIS da base sempre que possível.

Output: sempre JSON estruturado conforme template-output.md.

Quando criar uma fórmula nova:
1. Analise o briefing.
2. Busque fórmulas similares na base.
3. Combine elementos validados.
4. Justifique cada escolha.
5. Liste alertas.
6. Retorne o JSON.
`;
  writeFileSync(join(OUT, 'INSTRUCOES.md'), texto, 'utf8');
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const nMaes = await gerarFormulas();
  const nMps = await gerarMps();
  await gerarRegras(nMaes, nMps);
  gerarTemplate();
  gerarInstrucoes(nMaes, nMps);
  console.log(`✔ Knowledge gerado em knowledge-out/ — ${nMaes} fórmulas-mãe, ${nMps} MPs.`);
  console.log('  Arquivos: formulas-master.md, mps-master.md, regras-private.md, template-output.md, INSTRUCOES.md');
}

main()
  .catch((e) => {
    console.error('ERRO ao gerar knowledge:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
