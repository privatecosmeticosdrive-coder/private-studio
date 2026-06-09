/**
 * Correcao de extracao trocada (nome <-> versao_codigo).
 *
 * O extrator do KB v8 colocou, em algumas fichas, um HEADER generico
 * ("Folha de Formulacao", "Ficha Tecnica", "Formulacao") no campo
 * nome_produto, e o NOME REAL do produto no versao_codigo.
 *   ex.: nome="Folha de Formulação"  versao_codigo="Botox Com Vitamina F (2)"
 *
 * IMPORTANTE: a promocao ja sobrescreveu o versao_codigo no banco ('1.0'...),
 * entao o nome real e lido do kb-source.json ORIGINAL (casando por id).
 *
 * Uso:
 *   npm run fix:extracao            -> PREVIEW (nao escreve nada)
 *   npm run fix:extracao -- --apply -> aplica em transacao + zera mae/versao
 *                                       (depois rode npm run promote:formulas)
 */
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const KB_PATH = path.join(__dirname, 'kb-source.json');

// headers genericos (normalizados) que indicam extracao trocada
const HEADERS = new Set(['folha de formulacao', 'ficha tecnica', 'formulacao']);

// true se o nome (normalizado, sem separadores finais como " -", ":" etc) e um header generico
function ehHeaderGenerico(nome: string | null | undefined): boolean {
  const n = norm(nome).replace(/[\s\-–—:.]+$/g, '').trim();
  return HEADERS.has(n);
}

function norm(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .normalize('NFD')
    .replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// remove sufixos do FIM: " (N)" e gramaturas/volumes (1kg, 500ml, ...)
function limpar(raw: string): { nome: string; descricao: string | null } {
  let s = (raw || '').trim();
  const removidos: string[] = [];
  const patterns = [
    /\s*\(\d+\)\s*$/, // (1) (2) (N)
    /\s+\d+\s?(kg|kgs|g|gr|ml|l|lt|litro|litros|un)\b\.?\s*$/i, // 1kg 500ml 300ml...
  ];
  let mudou = true;
  while (mudou) {
    mudou = false;
    for (const p of patterns) {
      const m = s.match(p);
      if (m) {
        removidos.unshift(m[0].trim());
        s = s.replace(p, '').trim();
        mudou = true;
      }
    }
  }
  return {
    nome: s.replace(/\s+/g, ' ').trim(),
    descricao: removidos.length ? removidos.join(' ') : null,
  };
}

type Plano = {
  id: number;
  nome_atual: string;
  versao_original: string | null;
  nome_novo: string | null;
  versao_descricao: string | null;
  suspeita: boolean;
};

async function main() {
  // mapa id -> versao_codigo ORIGINAL (do kb)
  const kb = JSON.parse(fs.readFileSync(KB_PATH, 'utf8'));
  const vcOriginal = new Map<number, string>();
  for (const f of kb.formulas ?? []) {
    if (typeof f.id === 'number') vcOriginal.set(f.id, f.versao_codigo ?? '');
  }

  // fórmulas do banco com nome generico
  const todas = await prisma.formula.findMany({
    where: { origem: 'banco_original' },
    select: { id: true, nome_produto: true },
  });
  const afetadas = todas.filter((f) => ehHeaderGenerico(f.nome_produto));

  const planos: Plano[] = afetadas.map((f) => {
    const vo = vcOriginal.get(f.id) ?? '';
    if (!vo.trim()) {
      return {
        id: f.id,
        nome_atual: f.nome_produto,
        versao_original: vo || null,
        nome_novo: null,
        versao_descricao: null,
        suspeita: true,
      };
    }
    const { nome, descricao } = limpar(vo);
    const ok = nome.length >= 3;
    return {
      id: f.id,
      nome_atual: f.nome_produto,
      versao_original: vo,
      nome_novo: ok ? nome : null,
      versao_descricao: ok ? descricao : null,
      suspeita: !ok,
    };
  });

  const corrigiveis = planos.filter((p) => !p.suspeita);
  const suspeitas = planos.filter((p) => p.suspeita);

  // agrupa novos nomes p/ prever quantas familias surgem
  const novosNomes = new Set(corrigiveis.map((p) => norm(p.nome_novo)));

  console.log('============ FIX EXTRACAO TROCADA ============');
  console.log(`Modo: ${APPLY ? 'APLICAR (escreve no banco)' : 'PREVIEW (somente leitura)'}`);
  console.log(`Headers genericos detectados: ${afetadas.length} formulas`);
  console.log(`  -> corrigiveis : ${corrigiveis.length}`);
  console.log(`  -> suspeitas   : ${suspeitas.length} (versao_codigo vazio/ilegivel)`);
  console.log(`  -> nomes reais distintos: ${novosNomes.size}`);
  console.log('\n--- PREVIEW (primeiras 15 correcoes) ---');
  for (const p of corrigiveis.slice(0, 15)) {
    console.log(
      `#${p.id}\n   ANTES nome="${p.nome_atual}"  | versao_orig="${p.versao_original}"\n   DEPOIS nome="${p.nome_novo}"  | versao_descricao=${p.versao_descricao ? `"${p.versao_descricao}"` : 'null'}`,
    );
  }
  if (suspeitas.length) {
    console.log('\n--- SUSPEITAS (primeiras 5) — ficarao com observacoes="EXTRAÇÃO SUSPEITA" ---');
    for (const p of suspeitas.slice(0, 5)) {
      console.log(`#${p.id}  nome="${p.nome_atual}"  versao_orig="${p.versao_original ?? '(vazio)'}"`);
    }
  }

  if (!APPLY) {
    console.log('\n>>> PREVIEW apenas. Nada foi escrito no banco.');
    console.log('>>> Para aplicar: npm run fix:extracao -- --apply');
    return;
  }

  // ---- APLICAR ----
  console.log('\nAplicando em transacao...');
  await prisma.$transaction([
    ...corrigiveis.map((p) =>
      prisma.formula.update({
        where: { id: p.id },
        data: {
          nome_produto: p.nome_novo!,
          versao_descricao: p.versao_descricao,
          // libera p/ a re-promocao reagrupar do zero:
          formula_mae_id: null,
          derivada_de_id: null,
          versao_codigo: null,
        },
      }),
    ),
    ...suspeitas.map((p) =>
      prisma.formula.update({
        where: { id: p.id },
        data: { observacoes: 'EXTRAÇÃO SUSPEITA' },
      }),
    ),
  ]);
  console.log(`Aplicado: ${corrigiveis.length} corrigidas, ${suspeitas.length} marcadas suspeitas.`);
  console.log('>>> Agora rode: npm run promote:formulas (para reagrupar as familias).');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('\nFalhou ❌', e);
    await prisma.$disconnect();
    process.exit(1);
  });
