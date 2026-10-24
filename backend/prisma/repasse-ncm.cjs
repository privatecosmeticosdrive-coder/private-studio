/**
 * Repasse do NCM das formulas "de acordo com o historico e o padrao" (pedido do dono, 24/10/2026).
 *   node prisma/repasse-ncm.cjs            # plano: classifica e grava prisma/repasse-ncm-plano.json (nao toca o banco)
 *   node prisma/repasse-ncm.cjs --commit   # grava CONFIRMADO/TROCADO/ATRIBUIDO (ncm_revisado=true) + audit_log + repasse-ncm-decisoes.json
 *
 * Universo: formulas nao arquivadas, sem versao mais nova ativa, que estao na fila de revisao
 * (ncm_revisado=false com NCM sugerido) OU validadas sem NCM. Recalculado na hora.
 * Classes: CONFIRMADO (sugestao bate), TROCADO (historico/padrao aponta outro), ATRIBUIDO (estava sem
 * NCM), INDEFINIDO (nao da para distinguir com seguranca: fica na fila, com a duvida registrada).
 *
 * HISTORICO = NFs de saida da Private (Faturamento Private, dados/nfs.json: 759 itens dos capitulos
 * 33/34, CFOP 5/6/7.xxx) — citados em `evid`. PADRAO = texto da TIPI + tabela ncm do Studio.
 * A primeira regra que casar decide. Nada aqui muda aliquota: so a associacao formula -> linha ncm.
 */
const fs = require('node:fs');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const COMMIT = process.argv.includes('--commit');

// ---------- evidencias do historico (NF de saida da Private) ----------
const H = {
  shampoo: "NF de saida: 'Shampoo Hidratante Camuflage Noue 140ml', 'Shampoo Nutritivo Regener 250ml' em 3305.10.00 IPI 4,55% (CFOP 5101, 18 itens)",
  cond: "NF de saida: 'Mascara Camuflage 150g', 'Tonalizante Camuflage Light 140ml', 'Mask Moisturizing 300g' em 3305.90.00 Ex 01 IPI 4,55% (CFOP 5101/5124, 42 itens)",
  capOutras: "NF de saida: 'Locao Nova Mulher 120ml', 'Oleo de Argan 45ml - Dioh', 'Perfume Capilar 50ml' em 3305.90.00 IPI 14,3% (CFOP 5101/6124)",
  alisa: "NF de saida: 'Brasilian Protein Caviar e Charcoal Anti Frizz 1L' e 'Protein Antifrizz 140ml' em 3305.20.00 (19 itens)",
  sabLiq: "NF de saida: 'Pomander Sabonete Liquido Reiki 250ml', 'Agua Micelar Pure Detox Agradal 200ml' em 3401.30.00 IPI 6,5% (CFOP 5101/5124)",
  pele: "NF de saida: 'Serum Booster Antioleosidade Agradal 30ml', 'Hidratante Facial Pepino Agradal 60g', 'Balsamo Hidratante Facial - Casa da Alma' em 3304.99.90 IPI 14,3%",
  deo: "NF de saida: 'Body Splash Zahria 200ml', 'Pomander Folhas Deo Parfum 75ml', 'Pomander Perfume Flor Spray 75ml' em 3307.20.10 IPI 4,55% (CFOP 5124/6107)",
  amb: "NF de saida: 'Pomander Yoga Meditacao Spray 100ml', 'Refil Difusor de Ambiente Buddha' em 3307.49.00 IPI 22% (CFOP 5124, 46 itens)",
  dioh: "NF de saida: 'Oleo de Esqualeno - 45ml - Dioh' e 'Oleo de Argan - 45ml - Dioh' em 3305.90.00 IPI 14,3% (CFOP 6124)",
  regener: "NF de saida: 'Oleo Nutritivo Reparador Regener 30ml' e 'Finalizador Protetor Termico Spray Regener 200ml' em 3305.90.00 Ex 01 IPI 4,55%",
};
const T = { // padrao (TIPI) quando nao ha historico
  antissolar: 'TIPI 3304.99.90 Ex 02 — preparacoes antissolares (filtro UV na formula)',
  barra: 'TIPI 3401.11.90 — sabonete em barra (base de sabao, sem agua livre)',
  labios: 'TIPI 3304.10.00 — produtos de maquiagem/cuidado para os labios',
  olhos: 'TIPI 3304.20 — produtos para os olhos (cilios/sobrancelhas)',
  unhas: 'TIPI 3304.30.00 — preparacoes para manicuros e pedicuros',
  talco: 'TIPI 3304.91.00 Ex 01 — talco',
  barbear: 'TIPI 3307.10.00 — preparacoes para barbear (antes, durante ou apos)',
  banho: 'TIPI 3307.30.00 — sais e preparacoes para banho',
  depil: 'TIPI 3307.90.00 — preparacoes depilatorias',
  desoSolido: 'TIPI 3307.20.90 — desodorante que nao e liquido (bastao/solido/creme)',
};

// ---------- normalizacao do nome e leitura da composicao ----------
function norm(nome) {
  let n = nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  n = ' ' + n.replace(/[.\-\/()_,+&%]/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
  const troca = [[/ sab /g, ' sabonete '], [/ sanobete /g, ' sabonete '], [/ shp /g, ' shampoo '], [/ xampu /g, ' shampoo '], [/ cond /g, ' condicionador '],
    [/ condicionadpr /g, ' condicionador '], [/ masc /g, ' mascara '], [/ liq(ui)? /g, ' liquido '], [/ leav in /g, ' leave in '], [/ leave in /g, ' leavein '],
    [/ desodrante /g, ' desodorante '], [/ desod /g, ' desodorante '], [/ des perf /g, ' desodorante perfume '], [/ des spray /g, ' desodorante spray '],
    [/ baton /g, ' batom '], [/ ptotein /g, ' protein '], [/ btox /g, ' botox '], [/exfoli/g, 'esfoli'], [/esfoliente/g, 'esfoliante'], [/ caiplar /g, ' capilar '],
    [/ serun /g, ' serum '], [/ bory /g, ' body '], [/ hidta /g, ' hidratante '], [/ hidrat /g, ' hidratante '], [/ hid /g, ' hidratante '], [/ cab /g, ' cabelo '],
    [/ limp /g, ' limpeza '], [/ cap /g, ' capilar ']];
  for (const [a, b] of troca) n = n.replace(a, b);
  return n;
}
const soma = (comp, re) => comp.filter((c) => re.test(c.nome)).reduce((a, c) => a + c.pct, 0);
function perfil(comp) {
  return {
    agua: soma(comp, /agua (desmin|deion)|^agua$/i),
    surf: soma(comp, /lauril|laureth|betaina|glucosid|glocosid|plantaren|amisof|sarcosin|isetion|sulfossucc|cocoil|decil|lauroil|tensoativ/i),
    frag: soma(comp, /essencia|fragranc|perfume|parfum|flashback|page one|timeless|scent|mpa \d|sce\d/i),
    alcool: soma(comp, /alcool (etilico|refinado|de cer|cereais)|alcool\s+refinado/i),
    quat: soma(comp, /cetac|quaternario|behentrimonium|polymine|stearamidopropyl|cetrimonium|incroquat|varisoft|polyquaternium|poliquaternio/i),
    uv: soma(comp, /metoxicinamato|octocrileno|avobenzona|tinosorb|uvinul|dioxido de titanio|oxido de zinco|homosalato|octisalato|benzofenona-3|parsol|ensulizol|bisoctrizol|bemotrizinol/i),
    primeiro: comp[0]?.pct ?? 0,
  };
}

// ---------- regras (a primeira que casa decide) ----------
// para: [ncm, ex_tipi] ; indef: motivo (INDEFINIDO) ; evid: historico/padrao
const has = (f, re) => re.test(f.n);
const LEAVE_ON = 'Leave-on capilar (finalizador, leave-in, oleo/serum capilar, creme de pentear, protetor termico): a Ex 01 da TIPI (4,55%) cobre so condicionador; o historico da Private tem os dois — Regener em Ex 01 4,55% e Dioh/Nova (oleo, locao) em 3305.90.00 14,3%. Uma decisao da contadora resolve o grupo.';
const PERFUME = 'Perfume (alcool + fragrancia >= 10%): 3303.00.10 (IPI 27,3%) x deo colonia 3307.20.10 (4,55%). O historico vende "Pomander Perfume Flor Spray" e "Deo Parfum" como 3307.20.10, mas a escolha depende da concentracao/registro — confirmar com a contadora.';
const REGRAS = [
  // 1) historico do mesmo produto
  { id: 'hist-dioh-oleos', t: (f) => has(f, / oleo de (esqualeno|argan) /) && has(f, /dpro|dioh/), para: ['3305.90.00', ''], evid: H.dioh },
  { id: 'hist-regener-oleo', t: (f) => has(f, / regener /) && has(f, / oleo /), para: ['3305.90.00', 'Ex01'], evid: H.regener },
  { id: 'hist-camuflage', t: (f) => has(f, /camufla/) && !has(f, / shampoo /), para: ['3305.90.00', 'Ex01'], evid: H.cond },
  // 2) fora de cosmeticos / ambiguos -> INDEFINIDO
  { id: 'indef-pet', t: (f) => f.cat === 'pet' || has(f, / pet /), indef: 'Produto para animais: sem venda no historico; 3305 e 3401 sao para uso humano — confirmar com a contadora (3307.90.00 x 3305/3401).' },
  { id: 'indef-repelente', t: (f) => has(f, /repelente| contra mosca/), indef: 'Repelente de insetos: 3808.91 (saneante/inseticida) x 3304.99.90 (cosmetico) — depende do registro na Anvisa; nao esta na tabela do Studio.' },
  { id: 'indef-alcool', t: (f) => has(f, / alcool (70|gel) | alcool em gel|vinagre| carro /), indef: 'Fora dos cosmeticos (alcool 70%/gel 2207/3808.94, vinagre, automotivo 3405) — NCM nao existe na tabela do Studio.' },
  { id: 'indef-lubrificante', t: (f) => has(f, /lubrificante|intimulo|intimate (gel|clean|moisturizing )|fresh ready/), indef: 'Gel lubrificante / higiene intima: 3307.90.00 x 3304.99.90 (ou produto para saude) — sem historico.' },
  { id: 'indef-medicinal', t: (f) => has(f, /cicatriz|cecatriz|secativo para foliculite|minoxidil|bactericida/) && !has(f, / sabonete |sem minoxidil/), indef: 'Apelo terapeutico (cicatrizante, minoxidil, antisseptico): pode ser medicamento (3004) e nao cosmetico — confirmar.' },
  { id: 'indef-autobronze', t: (f) => has(f, /auto ?bronze/), indef: 'Autobronzeador: Ex 01 bronzeador (7,8%) x 3304.99.90 sem Ex (14,3%).' },
  { id: 'indef-fps-misto', t: (f) => has(f, /fps/) && !has(f, /sem fps/) && has(f, /labial|lip|hidratante|beige|cor /) && !has(f, /sem cor/), indef: 'Produto com FPS e outra funcao principal (labial/hidratante/cor): antissolar Ex 02 (0%) so se a protecao solar for a funcao principal.' },
  { id: 'indef-barba-leave', t: (f) => (has(f, / barba /) || has(f, /barber| levi /)) && has(f, / (balm|oleo|preenchedor|serum) /), indef: 'Balm/oleo de barba: hoje Ex 01 (condicionador, 4,55%); pelo texto da TIPI seria 3305.90.00 sem Ex (14,3%).' },
  { id: 'indef-limpeza-facial', t: (f) => !has(f, / sabonete /) && has(f, /(espuma|gel|gel creme) (de )?limpeza|cleansing| gel de limpeza /), indef: 'Limpeza facial: a Private vendeu "Espuma Facial 150ml - MC" como 3304.99.90 (14,3%); com tensoativo como base o padrao seria 3401.30.00 (6,5%).' },
  { id: 'indef-esfoliante-tensoativo', t: (f) => has(f, /esfoliante/) && !has(f, / sabonete /) && f.p.surf >= 10, indef: 'Esfoliante com base de tensoativo (lava a pele): 3401.30.00 (6,5%) x 3304.99.90 (14,3%).' },
  { id: 'indef-sabao-oleo', t: (f) => has(f, /sab(ao|onete) em oleo/), indef: 'Sabonete/sabao em oleo: 3401.30.00 (liquido) x 3304.99.90 (oleo de limpeza).' },
  { id: 'indef-perfume-creme', t: (f) => has(f, /perfume (em )?creme| creme aisha/), indef: 'Perfume em creme: 1 NF de amostra em 3307.20.90 ("Perfume em creme Aisha"); como creme para a pele o padrao seria 3304.99.90.' },
  { id: 'indef-luvas', t: (f) => has(f, / luvas? /), indef: "Creme 'luva de silicone' para maos: a Private vendeu 'Creme Maos Luvas de Silicone Agradal' como 3307.20.90 (4,55%), mas o padrao (creme para a pele) e 3304.99.90 (14,3%)." },
  { id: 'indef-blend', t: (f) => has(f, /roll ?on|rollon| bland \d| concentrado \d| oleo essencia /) && !has(f, /desodorante/), indef: 'Blend de oleos essenciais / roll-on: o historico usa 3301.90.10 (Pomander Rollon), NCM que nao existe na tabela do Studio — cadastrar antes.' },
  { id: 'indef-talco-creme', t: (f) => has(f, /talco creme/), indef: 'Talco em creme: a Ex 01 (7,8%) e para talco (po); como creme o padrao seria 3304.99.90 (14,3%).' },
  { id: 'indef-generico', t: (f) => /^ (creme|creme reparador|andrographis creme|tonico|pre tonico|tonico andrographis|balsamo|balm stick|mascara liquida) $/.test(f.n), indef: 'Nome generico (creme/tonico/balsamo sem indicacao de pele ou cabelo): nao da para escolher o NCM sem saber o uso.' },
  { id: 'indef-leave-on', t: (f) => has(f, /ampola|finalizador| leavein |creme de pentear|creme p cabelo|desembaracador|protetor termico|termo protetor|reparador de pontas|fluido reconstrutor|balm capilar|musse|mousse|spray capilar|spray para cabelo|spray termo|stick anti frizz/) || (f.cat === 'cabelos' && has(f, / (serum|oleo) /)) || has(f, / oleo (capilar|bifasico|reparador) /), indef: LEAVE_ON },
  { id: 'indef-perfume', t: (f) => f.cat !== 'ambiente' && !has(f, /capilar|cabelo|difusor|ambiente|aromatizador|odorizador/) && (f.p.frag >= 15 || (f.p.frag >= 10 && !has(f, /body splash|colonia|desodorante|deo /))) && f.p.alcool + (f.comp[0]?.nome === '0x2a' ? f.p.primeiro : 0) >= 40, indef: PERFUME },
  { id: 'indef-perfume-nome', t: (f) => has(f, / perfume /) && !has(f, /capilar|cabelo|body splash|desodorante|deo /), indef: PERFUME },
  // 3) regras por tipo (historico + padrao)
  { id: 'antissolar', t: (f) => (has(f, /fps|protetor solar|filtro solar|antissolar/) && !has(f, /sem fps/)) || (f.cat === 'solar' && f.p.uv >= 3 && !has(f, /capilar|termico/)), para: ['3304.99.90', 'Ex02'], evid: T.antissolar },
  { id: 'bronzeador', t: (f) => has(f, /bronzeador/), para: ['3304.99.90', 'Ex01'], evid: 'TIPI 3304.99.90 Ex 01 — bronzeadores' },
  { id: 'shampoo', t: (f) => has(f, / shampoo /), para: ['3305.10.00', ''], evid: H.shampoo },
  { id: 'alisamento', t: (f) => has(f, /progressiva|botox|alisa| liso |liss |protein|formol|neutralizante|selagem/) && f.cat !== 'skincare', para: ['3305.20.00', ''], evid: H.alisa + '; padrao TIPI 3305.20.00 (alisamento/ondulacao e neutralizantes)' },
  { id: 'condicionador', t: (f) => has(f, /condicionador|tonalizante/), para: ['3305.90.00', 'Ex01'], evid: H.cond },
  { id: 'mascara-facial', t: (f) => has(f, /mascara|mask/) && (has(f, /rosto|facial|pele|colageno/) || ['skincare', 'corporal'].includes(f.cat)), para: ['3304.99.90', ''], evid: H.pele },
  { id: 'mascara-cilios', t: (f) => has(f, /mascara de cilios|rimel/), para: ['3304.20.10', ''], evid: T.olhos },
  { id: 'mascara-capilar', t: (f) => has(f, /mascara|mask/) && (['cabelos', 'barba'].includes(f.cat) || f.p.quat >= 0.3 || has(f, /capilar|cabelo|cachos|keratin|reconst|cond |regener|noue|capellux/)), para: ['3305.90.00', 'Ex01'], evid: H.cond },
  { id: 'capilar-outras', t: (f) => has(f, /ativador de cachos|pomada (capilar|modeladora|efeito)|cera modeladora|gel fixar|reconstrutor| plex|tonico (capilar|anti queda)|tonico capilar|scalp|perfume (capilar|para cabelo|p cabelo|bifasico capilar)|perf protetor capilar|tratamento antifrizz|matizadora/), para: ['3305.90.00', ''], evid: H.capOutras },
  { id: 'barbear', t: (f) => has(f, /pos barba|po barba|apos barba|after shave|barbear/), para: ['3307.10.00', ''], evid: T.barbear },
  { id: 'sabonete-liquido', t: (f) => has(f, / sabonete /) && (has(f, /liquido|espuma|gel|intimo|facial|esfoliante|maos/) || (f.p.surf >= 5 && f.p.agua >= 40)), para: ['3401.30.00', ''], evid: H.sabLiq },
  { id: 'sabonete-barra', t: (f) => has(f, / sabonete /) && (has(f, /barra|vegetal|82 18/) || (f.p.primeiro >= 80 && f.p.agua < 10)), para: ['3401.11.90', ''], evid: T.barra },
  { id: 'agua-micelar', t: (f) => has(f, /micelar/), para: ['3401.30.00', ''], evid: H.sabLiq },
  { id: 'desodorante-solido', t: (f) => has(f, /desodorante|antiperspirante|antitranspirante/) && has(f, /stick|solido|bastao|creme/), para: ['3307.20.90', ''], evid: T.desoSolido },
  { id: 'desodorante', t: (f) => has(f, /desodorante|antiperspirante|antitranspirante|deo colonia|deo perfume|deo parfum|body splash|perfumer| colonia /), para: ['3307.20.10', ''], evid: H.deo },
  { id: 'ambiente', t: (f) => f.cat === 'ambiente' || has(f, /difusor|aromatizador|odorizador|spray (de )?ambiente|ambiente|pillow spray|lencol|shower mist|spray (calma|astral|bem estar|bons sonhos|anciedade|ansiedade|protecao|noite kids|com oleos essenciais)/), para: ['3307.49.00', ''], evid: H.amb },
  { id: 'labios', t: (f) => has(f, /gloss|labial|batom|lip /), para: ['3304.10.00', ''], evid: T.labios },
  { id: 'sobrancelha-make', t: (f) => has(f, /gel sobrancelha/), para: ['3304.20.90', ''], evid: T.olhos },
  { id: 'unhas', t: (f) => has(f, /unha|cuticula/), para: ['3304.30.00', ''], evid: T.unhas },
  { id: 'talco', t: (f) => has(f, /talco em po/), para: ['3304.91.00', 'Ex01'], evid: T.talco },
  { id: 'sais-banho', t: (f) => has(f, /sais de banho|sal de banho|po de banho/), para: ['3307.30.00', ''], evid: T.banho },
  { id: 'depilatorio', t: (f) => has(f, /depilatorio/), para: ['3307.90.00', ''], evid: T.depil },
  { id: 'pele', t: (f) => has(f, /creme|hidratante|serum|locao|gel (facial|creme|massageador|redutor|efeito|levanta)|oleo (facial|corporal|de massagem|clareador|de pernas)| stick (sem fps|facial)|body oil|esfoliante|scrub|tonico facial|balsamo hidratante|pads|stick facial|facial stick|clareador|firming|massagem|redutor|lifting|primer|bruma|antiatrito|agua hidratante|cilio|sobrancelha|assadura/), para: ['3304.99.90', ''], evid: H.pele },
];

// plano -> repasse-ncm-plano.json (revisao); commit -> repasse-ncm-decisoes.json (o que foi gravado + indefinidos)
const DECISOES = path.join(__dirname, COMMIT ? 'repasse-ncm-decisoes.json' : 'repasse-ncm-plano.json');

(async () => {
  const ncms = await prisma.ncm.findMany({ where: { ativo: true }, select: { id: true, ncm: true, ex_tipi: true, descricao: true, ipi_pct: true } });
  const rotulo = (r) => (r ? `${r.ncm}${r.ex_tipi ? ' ' + r.ex_tipi : ''} ${r.descricao} (IPI ${Number(r.ipi_pct).toLocaleString('pt-BR')}%)` : 'sem NCM');
  const acharNcm = (ncm, ex) => ncms.find((r) => r.ncm === ncm && (r.ex_tipi ?? '') === ex);

  const formulas = await prisma.$queryRawUnsafe(`select f.id, f.nome_produto, f.versao_codigo, f.categoria, f.status, f.ncm_id
    from formulas f
    where f.status <> 'arquivada'
      and not exists (select 1 from formulas g where g.derivada_de_id = f.id and g.status <> 'arquivada')
      and ((f.ncm_revisado = false and f.ncm_id is not null) or (f.ncm_id is null and f.status = 'validada'))
    order by f.id`);
  const comps = await prisma.$queryRawUnsafe(`select fc.formula_id, coalesce(m.nome, fc.mp_nome_original, '') nome, coalesce(fc.concentracao_pct, 0)::float pct
    from formula_composicao fc left join materias_primas m on m.id = fc.mp_id
    where fc.formula_id = any($1::int[]) order by fc.formula_id, fc.concentracao_pct desc nulls last`, formulas.map((f) => f.id));
  const porFormula = new Map();
  for (const c of comps) { if (!porFormula.has(c.formula_id)) porFormula.set(c.formula_id, []); porFormula.get(c.formula_id).push({ nome: c.nome.trim(), pct: Number(c.pct) }); }

  const decisoes = [];
  for (const f of formulas) {
    const comp = porFormula.get(f.id) ?? [];
    const ctx = { n: norm(f.nome_produto), cat: f.categoria, comp, p: perfil(comp) };
    const de = ncms.find((r) => r.id === f.ncm_id) ?? (f.ncm_id ? { id: f.ncm_id, ncm: '?', ex_tipi: '', descricao: 'inativo', ipi_pct: 0 } : null);
    const regra = REGRAS.find((r) => r.t(ctx));
    let classe, para = null, motivo;
    if (!regra) { classe = 'INDEFINIDO'; motivo = 'O nome nao identifica o tipo de produto e a categoria/composicao nao bastam para escolher o NCM.'; }
    else if (regra.indef) { classe = 'INDEFINIDO'; motivo = regra.indef; }
    else {
      para = acharNcm(regra.para[0], regra.para[1]);
      if (!para) { classe = 'INDEFINIDO'; motivo = `NCM ${regra.para.join(' ')} nao esta cadastrado/ativo na tabela do Studio.`; }
      else classe = !de ? 'ATRIBUIDO' : de.id === para.id ? 'CONFIRMADO' : 'TROCADO';
    }
    decisoes.push({
      id: f.id, nome: f.nome_produto.trim(), versao: f.versao_codigo, categoria: f.categoria, status: f.status, classe,
      de: rotulo(de), de_id: de?.id ?? null, para: para ? rotulo(para) : null, para_id: para?.id ?? null,
      regra: regra?.id ?? null, evidencia: regra?.evid ?? null, duvida: motivo ?? null,
    });
  }

  const cont = {};
  for (const d of decisoes) cont[d.classe] = (cont[d.classe] ?? 0) + 1;
  console.log(`Formulas avaliadas: ${decisoes.length}`, cont);
  const grupo = {};
  for (const d of decisoes.filter((x) => x.classe !== 'INDEFINIDO')) { const k = `${d.classe.padEnd(10)} ${d.classe === 'CONFIRMADO' ? d.para : `${d.de} -> ${d.para}`}`; grupo[k] = (grupo[k] ?? 0) + 1; }
  for (const [k, v] of Object.entries(grupo).sort()) console.log(String(v).padStart(4), k);
  const duv = {};
  for (const d of decisoes.filter((x) => x.classe === 'INDEFINIDO')) { (duv[d.duvida] ??= []).push(d.nome); }
  console.log('\nINDEFINIDOS (ficam na fila):');
  for (const [k, v] of Object.entries(duv).sort((a, b) => b[1].length - a[1].length)) console.log(`  ${String(v.length).padStart(3)} — ${k}\n        ${v.slice(0, 12).join(' | ')}${v.length > 12 ? ` | +${v.length - 12}` : ''}`);

  fs.writeFileSync(DECISOES, JSON.stringify({ gerado_em: new Date().toISOString(), modo: COMMIT ? 'commit' : 'plano', resumo: cont, decisoes }, null, 1));
  console.log(`\nDecisoes completas em ${DECISOES}`);
  if (!COMMIT) { console.log('PLANO — nada gravado no banco. Use --commit.'); await prisma.$disconnect(); return; }

  const admin = await prisma.user.findFirst({ where: { email: 'privatecosmeticosdrive@gmail.com', ativo: true }, select: { id: true } })
    ?? await prisma.user.findFirst({ where: { role: 'admin', ativo: true }, select: { id: true } });
  if (!admin) throw new Error('Sem usuario admin ativo para carimbar a revisao.');
  const gravar = decisoes.filter((d) => d.classe !== 'INDEFINIDO');
  const agora = new Date();
  const n = await prisma.$transaction(async (tx) => {
    let n = 0;
    const porPara = new Map();
    for (const d of gravar) { if (!porPara.has(d.para_id)) porPara.set(d.para_id, []); porPara.get(d.para_id).push(d.id); }
    for (const [paraId, ids] of porPara) {
      const r = await tx.formula.updateMany({ where: { id: { in: ids }, status: { not: 'arquivada' } }, data: { ncm_id: paraId, ncm_revisado: true, ncm_revisado_em: agora, ncm_revisado_por: admin.id } });
      n += r.count;
    }
    await tx.auditLog.createMany({ data: gravar.map((d) => ({ user_id: admin.id, acao: 'repasse_ncm', entidade: 'formula', entidade_id: String(d.id), detalhes: { classe: d.classe, de: d.de, para: d.para, regra: d.regra, evidencia: d.evidencia } })) });
    return n;
  }, { timeout: 120000 });
  console.log(`\nAPLICADO: ${n} formulas com NCM revisado (${gravar.length} decisoes).`);
  await prisma.$disconnect();
})().catch(async (e) => { console.error(e.message); await prisma.$disconnect(); process.exit(1); });
