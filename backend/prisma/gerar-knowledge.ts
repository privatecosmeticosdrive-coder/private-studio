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
  // MOTOR 2 10/26 — o texto do knowledge le as MESMAS tabelas versionadas que o
  // engine (parametro_producao / parametro_fiscal). Os 3 flats antigos (37,5% MP,
  // 9,25% MO, IPI 4,55%) NAO existem mais no calculo e nao sao mais ensinados.
  const hoje = new Date();
  const vigentes = async (rows: { chave: string; valor: unknown; vigencia_inicio: Date }[]) => {
    const m = new Map<string, number>();
    for (const r of rows) if (!m.has(r.chave)) m.set(r.chave, Number(r.valor));
    return m;
  };
  const prod = await vigentes(
    await prisma.parametroProducao.findMany({
      where: { vigencia_inicio: { lte: hoje }, OR: [{ vigencia_fim: null }, { vigencia_fim: { gte: hoje } }] },
      orderBy: { vigencia_inicio: 'desc' },
    }),
  );
  const fisc = await vigentes(
    await prisma.parametroFiscal.findMany({
      where: { vigencia_inicio: { lte: hoje }, OR: [{ vigencia_fim: null }, { vigencia_fim: { gte: hoje } }] },
      orderBy: { vigencia_inicio: 'desc' },
    }),
  );
  const v = (m: Map<string, number>, k: string) => (m.has(k) ? String(m.get(k)) : 'NAO CADASTRADO (falha visivel)');
  const motor = prod.get('motor_precificacao') === 2 ? 'Motor 2 10/26' : 'Motor 1 (fiscal granular 3.1)';
  const texto = `# Regras de cálculo e operação — Private Cosméticos

Base: ${nMaes} fórmulas-mãe + ${nMps} matérias-primas validadas.

## Motor de precificação vigente: ${motor}
Documento completo: docs/precificacao/MOTOR-2-10-26.md. Todos os parâmetros abaixo são
VERSIONADOS (vigência + fonte) nas tabelas parametro_producao e parametro_fiscal — nunca
literais no código. Não existe mais "imposto sobre MP de 37,5%" nem "imposto sobre MO de 9,25%".

### Material (por unidade)
- MP líquida = preço da ÚLTIMA COMPRA (R$/kg × kg/un) × (1 + perda ${c ? Number(c.desvio_mp_pct) : 10}%) × (1 − crédito MP ${v(fisc, 'credito_mp_pct')}%).
- Embalagem líquida = preço da embalagem × (1 − crédito embalagem ${v(fisc, 'credito_emb_pct')}%).
- Frete por unidade: R$ ${c ? Number(c.frete_un_brl).toFixed(2) : '0.10'} (sempre somado).
- Densidade 1,0 g/mL (volume_un em mL tratado como g).
- MP sem preço entra valendo R$ 0 e gera ALERTA (custo subestimado); composição ≠ 100% é normalizada COM alerta.

### Fábrica (modelo de 3 componentes)
- custo_fixo_producao_mensal = R$ ${v(prod, 'custo_fixo_producao_mensal')} (pagamentos reais; sem encargos simulados, ociosidade ou SG&A).
- capacidade_normal_min_mes = linhas ${v(prod, 'linhas_paralelas')} × dias ${v(prod, 'dias_uteis_mes')} × horas ${v(prod, 'horas_dia')} × 60 × eficiência ${v(prod, 'eficiencia_producao')}.
- taxa_minuto = custo_fixo ÷ capacidade; setup/ordem = taxa_minuto × ${v(prod, 'setup_minutos')} min.
- fábrica/un = setup/ordem ÷ quantidade + taxa_minuto ÷ un_min. un_min padrão (quando não informado, COM alerta): ${v(prod, 'un_min_padrao')}.

### Preço (tributos "por dentro" pela matriz fiscal: modo × perfil do cliente × NCM)
- preço_produto = (MP líquida + frete + fábrica) ÷ (1 − tributos − margem).
- preço_embalagem = embalagem líquida ÷ (1 − tributos − taxa de gestão ${v(prod, 'taxa_gestao_embalagem_pct')}%). A embalagem NÃO leva a margem do produto.
- preço sem IPI = produto + embalagem; IPI por fora, pelo NCM.
- Escada de margem (automática; override manual é registrado): lote < ${v(prod, 'lote_medio_min_un')} → ${v(prod, 'margem_lote_pequeno_pct')}%; até ${v(prod, 'lote_grande_min_un')} → ${v(prod, 'margem_lote_medio_pct')}%; acima → ${v(prod, 'margem_lote_grande_pct')}%.
- Lote mínimo aceito: ${v(prod, 'lote_minimo_un')} un (abaixo: alerta bloqueante).
- Tributos por dentro: ICMS ${v(fisc, 'icms_carga_art34_pct')}% (art. 34, RPA revenda SP) ou ${v(fisc, 'icms_nominal_padrao_pct')}% (Simples/consumidor final); PIS/COFINS monofásico ${v(fisc, 'pis_monofasico_pct')}+${v(fisc, 'cofins_monofasico_pct')}%, comum ${v(fisc, 'pis_comum_pct')}+${v(fisc, 'cofins_comum_pct')}%.

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
