"""Valida em lote as leituras de OCR (ocr/*.json) -> out/extracao.json

Conferências INDEPENDENTES (o OCR não "acha" que leu certo; as contas da própria folha provam):
  A. soma dos % = 100 (tolerância = meia-unidade da última casa impressa × nº de linhas)
  B. QTDE(kg) de cada linha = % × batelada  (na precisão impressa)
  B2. QTDE(g) = QTDE(kg) exata × 1000       (modelo B)
  C. CUSTO/Valor(un) = QTDE × Valor(kg)     (centavos/milésimos impressos)
  D. código existe no cadastro e o nome lido bate (similaridade ≥ 0.85) — cadastro = backend/prisma/kb-source.json
Status 'confirmada' só se A passa, B passa em todas as linhas, D passa em todas e nenhum código/% ilegível.
Divergência NUNCA é corrigida aqui: vira motivo de revisão (revisão humana/visual decide).
"""
import json, os, re, sys, glob, unicodedata
from decimal import Decimal
from difflib import SequenceMatcher
from collections import Counter

S = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO = os.path.dirname(os.path.dirname(S))  # raiz do repositório private-studio
sys.path.insert(0, f"{S}/bin")
from parse_v2 import parse, num, ndec  # noqa: E402

KB = json.load(open(f"{REPO}/backend/prisma/kb-source.json"))
MP = {m["codigo"]: m for m in KB["materias_primas"]}
INV = json.load(open(f"{S}/dados/inventario_drive.json"))
META = {f"{f['id']}__{f['title']}": f for f in INV["files"]}


def norm(s):
    s = unicodedata.normalize("NFD", s or "").encode("ascii", "ignore").decode().lower()
    s = re.sub(r"[^a-z0-9%]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


STOP = {"de", "do", "da", "e", "and", "com", "c"}


def sim(a, b):
    """Similaridade de nomes. Se as palavras de um nome estão todas contidas no outro (ex.: 'Amido de Milho'
    ⊂ 'Amido de Milho (Zea Mays Starch)'), considera 1.0 — sinal de nome complementado, não de outra MP."""
    na, nb = norm(a), norm(b)
    ta, tb = set(na.split()) - STOP, set(nb.split()) - STOP
    if ta and tb and (ta <= tb or tb <= ta) and min(len(ta), len(tb)) >= 1:
        return 1.0
    return SequenceMatcher(None, na, nb).ratio()


FORA = re.compile(r"abaixo da tabela|fora da f[óo]rmula|^total |2a linha de total|padr[ãa]o de c[ée]lula|realce amarelo impresso|lista impressa", re.I)
TOPO = re.compile(r"topo|t[íi]tulo|nome (impresso )?do produto|campo produto|linha produto|ao lado do logo", re.I)
MUDA = re.compile(r"(^|[^a-z])x([^a-z]|$)|'x'|dobrar|vaselina|riscad|rabiscad|substitu|trocad|sobrescrit|escrito (à mão )?(na|dentro)|\b\d{3,}\b.*escrito|2256", re.I)


def classe_anotacao(t):
    """'muda' (pode alterar composição/valor) | 'nome' (nome do produto alterado à mão) | 'info' (visto, tique, círculo, contas fora da fórmula)."""
    if FORA.search(t):
        return "info"
    if TOPO.search(t):
        return "nome" if re.search(r"riscad|rabiscad|sobrescrit", t, re.I) else "info"
    return "muda" if MUDA.search(t) else "info"


def classificar(texts):
    up = " ".join(texts).upper()
    if "MATÉRIA PRIMA PARA UMA" in up or "MATERIA PRIMA PARA UMA" in up or "FOLHA DE FORMULA" in up or ("DESCRI" in up and "QTDE" in up):
        return "formula"
    if "CUSTO MO" in up or "TRIBUTOS" in up or "MARGEM REAL" in up or "ANO DE PROD" in up:
        return "custo"
    return "outro"


IGN_TOPO = re.compile(r"^(PRIVATE|COSM[ÉE]TICOS|BATELADA:?|COTA[ÇC][ÃA]O.*|PRODUTO:?|QUANTIDADE DE MAT.*|ELAB.*|LAB|SEM TESTES|FOLHA DE FORMULA[ÇC][ÃA]O|\(?\d+\)?)$", re.I)


def topo_info(topo):
    """batelada (número à direita de 'BATELADA'), data dd/mm/aa, nome do produto (maior fonte do topo)."""
    bat = data = None
    lab = [t for t in topo if re.match(r"BATELADA", t["t"], re.I)]
    for t in topo:
        if re.fullmatch(r"\d+,\d{3,4}", t["t"]):
            if lab and abs(t["y"] - lab[0]["y"]) < 2 * lab[0]["h"] and t["x"] > lab[0]["x"]:
                bat = num(t["t"])
            elif not lab and bat is None:
                bat = num(t["t"])
        m = re.search(r"\b(\d{2}/\d{2}/\d{2,4})\b", t["t"])
        if m and not data:
            data = m.group(1)
    m = [t for t in topo if re.match(r"PRODUTO\s*:\s*\S", t["t"], re.I)]
    if m:
        produto = re.sub(r"^PRODUTO\s*:\s*", "", m[0]["t"], flags=re.I)
    else:
        cands = [t for t in topo if not IGN_TOPO.match(t["t"].strip()) and len(t["t"]) >= 4 and not re.search(r"\d+,\d|\d{2}/\d{2}", t["t"])
                 and t["t"].upper().replace(" ", "") not in "PRIVATE" and t["t"].upper() not in "COSMÉTICOS"]
        produto = max(cands, key=lambda t: t["h"])["t"] if cands else None
    return bat, data, produto


def validar(rec):
    texts = rec["rec_texts"]
    tipo = classificar(texts)
    meta = META.get(rec["arquivo"], {})
    base = dict(arquivo=rec["arquivo"], drive_id=meta.get("id"), drive=meta.get("path"), sha256=rec["sha256"], tipo=tipo,
                conf_media=round(sum(rec["rec_scores"]) / max(1, len(rec["rec_scores"])), 4))
    rv_path = f"{S}/dados/revisao/{rec['arquivo']}.json"
    rv = json.load(open(rv_path)) if os.path.exists(rv_path) else None
    if rv and rv.get("tipo") == "formula" and tipo != "formula":
        tipo = "formula"  # leitura visual achou fórmula onde o classificador do OCR não achou
        base["tipo"] = tipo
    if tipo != "formula":
        if rv and rv.get("tipo"):
            base["tipo"] = rv["tipo"]  # leitura visual reclassificou (custo/outro)
        return base
    p = parse(dict(rec_texts=texts, rec_scores=rec["rec_scores"], rec_boxes=rec["rec_boxes"]))
    if rv and rv.get("tipo") and rv["tipo"] != "formula":
        return dict(base, tipo=rv["tipo"], revisao=rv.get("observacoes"))
    if "erro" in p and not rv:
        return dict(base, status="revisar", motivos=[p["erro"]])
    fonte = "ocr"
    concord = None
    if rv:
        # transcrição visual independente substitui a tabela; as MESMAS contas decidem se vale.
        ocr_lin = p.get("linhas", []) if "erro" not in p else []
        vis = [dict(txt={k: l.get(k) for k in ("codigo", "descricao", "fase", "pct", "qtde_kg", "qtde_g", "custo", "valor_kg", "fornecedor", "embal") if l.get(k) not in (None, "")}, conf={},
                    manuscrito=[l["manuscrito"]] if l.get("manuscrito") else [], codigo_parcial=bool(l.get("codigo_parcial")))
               for l in rv["linhas"]]
        # concordância célula a célula (numéricas + código) entre OCR e transcrição visual, na mesma ordem
        tot = eq = 0
        for a, b in zip(ocr_lin, vis):
            for k in ("codigo", "pct", "qtde_kg", "valor_kg", "custo"):
                if k in b["txt"]:
                    tot += 1
                    eq += (num(a["txt"].get(k)) is not None and num(a["txt"].get(k)) == num(b["txt"][k])) or (k == "codigo" and (a["txt"].get(k) or "").strip() == b["txt"][k].strip())
        concord = dict(celulas=tot, iguais=eq, linhas_ocr=len(ocr_lin), linhas_visual=len(vis))
        p = dict(linhas=vis, totais={"pct": rv.get("total_pct"), "qtde_kg": rv.get("total_qtde_kg")}, topo=p.get("topo", []), contagens={},
                 n_ancoras=len(vis), modelo=p.get("modelo"), manuscrito_abaixo=p.get("manuscrito_abaixo", []))
        fonte = "transcricao_visual"
    bat_topo, data, produto = topo_info(p["topo"])
    if rv:
        bat_topo = num(rv["batelada_kg"]) if rv.get("batelada_kg") else bat_topo
        data = rv.get("data_folha") or data
        produto = rv.get("produto") or produto
    bat_tot = num(p["totais"].get("qtde_kg"))
    motivos = []
    info = []
    bat = bat_topo if bat_topo is not None else bat_tot
    bat_diverge = bat_tot is not None and bat_topo is not None and bat_tot != bat_topo
    if bat is None:
        motivos.append("batelada não lida")
    cnt = p["contagens"]
    for k in ("codigo", "descricao"):
        if fonte == "ocr" and cnt.get(k, 0) != p["n_ancoras"]:
            motivos.append(f"coluna {k}: {cnt.get(k, 0)} células para {p['n_ancoras']} linhas de %")

    itens, soma, tol = [], Decimal(0), Decimal(0)
    for i, l in enumerate(p["linhas"], 1):
        t = l["txt"]
        cs = (t.get("codigo") or "").strip()
        cod = int(cs) if cs.isdigit() else None
        desc = (t.get("descricao") or "").strip()
        pct, q, qg, c, v = (num(t.get(k)) for k in ("pct", "qtde_kg", "qtde_g", "custo", "valor_kg"))
        f = []
        inferido = None
        if l.get("codigo_parcial"):
            vis_dig = cs
            cands = [m for m in KB["materias_primas"] if norm(m["nome"]) == norm(desc)]  # nome idêntico (normalizado)
            cands_suf = [m for m in cands if str(m["codigo"]).endswith(vis_dig)]
            if len(cands) == 1 and len(cands_suf) == 1:
                inferido = cands_suf[0]["codigo"]
                f.append(f"CÓDIGO INFERIDO {inferido}: impresso cortado/coberto na foto (visível '{vis_dig}'); nome idêntico e único no cadastro" + (f" e código termina em '{vis_dig}'" if vis_dig else "") + " — confirmar")
                cod = inferido
            else:
                f.append(f"código cortado na foto (visível '{vis_dig}') e não inferível com segurança")
                cod = None
        elif cod is None:
            f.append("código ilegível")
        if pct is None:
            f.append(f"% ilegível ({t.get('pct')!r})")
        else:
            soma += pct
            tol += Decimal(5) / (Decimal(10) ** (ndec(t.get("pct")) + 1))
        exata = (pct / 100 * bat) if (bat is not None and pct is not None) else None
        # incerteza da QTDE "exata": o % impresso já é arredondado (meia-unidade da última casa) × batelada
        d_pct = (Decimal(5) / (Decimal(10) ** (ndec(t.get("pct")) + 1)) / 100 * bat) if exata is not None else Decimal(0)
        if exata is not None and q is not None:
            if abs(exata - q) > Decimal(5) / (Decimal(10) ** (ndec(t.get("qtde_kg")) + 1)) + d_pct + Decimal("1e-9"):
                f.append(f"QTDE {q} ≠ %×batelada {exata.normalize()}")
        if exata is not None and qg is not None:
            if abs(exata * 1000 - qg) > Decimal(5) / (Decimal(10) ** (ndec(t.get("qtde_g")) + 1)) + d_pct * 1000 + Decimal("1e-9"):
                f.append(f"QTDE(g) {qg} ≠ %×batelada×1000 {(exata * 1000).normalize()}")
        if v is not None and c is not None and (exata is not None or q is not None):
            base_q = exata if exata is not None else q
            tolc = Decimal(5) / (Decimal(10) ** (ndec(t.get("custo")) + 1)) + Decimal("0.0001") + d_pct * v
            if abs(base_q * v - c) > tolc and (q is None or abs(q * v - c) > tolc):
                f.append(f"CUSTO {c} ≠ QTDE×R$/kg {(base_q * v).quantize(Decimal('0.0001'))}")
        if l.get("manuscrito"):
            mt = " ".join(l["manuscrito"])
            if classe_anotacao(mt) == "muda":
                f.append("ANOTAÇÃO MANUSCRITA na linha: " + mt + " (possível troca/ajuste — conferir na foto)")
            else:
                info.append(f"marca manuscrita na linha {cs} {desc[:30]}: {mt}")
        kb = MP.get(cod) if cod is not None else None
        s = sim(desc, kb["nome"]) if kb else 0.0
        if cod is not None and not kb and not inferido:
            f.append("código não existe no cadastro (kb-source)")
        elif kb and s < 0.85:
            dica = [m["codigo"] for m in KB["materias_primas"] if norm(m["nome"]) == norm(desc) and str(m["codigo"]).endswith(str(cod)) and m["codigo"] != cod]
            f.append(f"nome não bate com o cadastro (sim {s:.2f}; cadastro='{kb['nome']}')"
                     + (f" — PROVÁVEL CÓDIGO CORTADO NA FOTO: {dica[0]} ('{MP[dica[0]]['nome']}')" if len(dica) == 1 else ""))
        itens.append(dict(ordem=i, codigo=cod, descricao_lida=desc, nome_cadastro=kb["nome"] if kb else None, sim_nome=round(s, 3),
                          fase=t.get("fase"), pct=str(pct) if pct is not None else None, pct_txt=t.get("pct"),
                          qtde_kg=str(q) if q is not None else None, qtde_g=str(qg) if qg is not None else None,
                          custo=str(c) if c is not None else None, valor_kg=str(v) if v is not None else None, valor_kg_txt=t.get("valor_kg"),
                          fornecedor=t.get("fornecedor"), embal=t.get("embal"),
                          preco_kb=MP[cod]["preco_kg_brl"] if kb else None, data_cotacao_kb=MP[cod]["data_cotacao"] if kb else None,
                          fornecedor_kb=MP[cod]["fornecedor"] if kb else None,
                          conf_min=round(min(l["conf"].values()), 4) if l["conf"] else None, problemas=f))
    an_path = f"{S}/dados/anotacoes/{rec['arquivo']}.json"
    an = json.load(open(an_path)) if os.path.exists(an_path) else None
    anot = []
    if an:
        for m in an.get("manuscrito_na_tabela") or []:
            txt = f"({m.get('tipo')}) na linha {m.get('codigo')} {m.get('descricao') or ''}: {m.get('texto')}"
            c = "muda" if m.get("tipo") in ("riscado", "valor_substituido") else classe_anotacao(txt)
            (anot if c == "muda" else info).append(("ANOTAÇÃO MANUSCRITA " if c == "muda" else "marca manuscrita ") + txt)
        if an.get("topo_manuscrito"):
            t = an["topo_manuscrito"]
            (anot if classe_anotacao("topo " + t) == "nome" else info).append(("NOME DO PRODUTO ALTERADO À MÃO: " if classe_anotacao("topo " + t) == "nome" else "topo (manuscrito): ") + t)
    if rv:
        for m in rv.get("anotacoes_tabela") or []:
            m = m if isinstance(m, str) else json.dumps(m, ensure_ascii=False)
            c = classe_anotacao(m)
            if c == "muda":
                anot.append(f"ANOTAÇÃO MANUSCRITA na tabela: {m}")
            elif c == "nome":
                anot.append(f"NOME DO PRODUTO ALTERADO À MÃO: {m}")
            else:
                info.append(f"nota: {m}")
        if rv.get("continua_em_outra_foto"):
            motivos.append("tabela continua em outra foto (sem TOTAL nesta)")
    tot_pct = num(p["totais"].get("pct"))
    # batelada do topo ≠ QTDE total impressa só é problema se as linhas NÃO fecham com a do topo
    # (o total em kg da folha é soma de valores arredondados, ou batelada × TOTAL% quando a origem não fecha)
    if bat_diverge and any(any(pb.startswith(("QTDE", "QTDE(g)")) for pb in it["problemas"]) for it in itens):
        motivos.append(f"batelada topo {bat_topo} ≠ total {bat_tot}")
    origem_nao_fecha = False
    if abs(soma - 100) > tol + Decimal("0.0001"):
        if tot_pct is not None and abs(soma - tot_pct) <= tol + Decimal("0.0001"):
            # a leitura bate com o TOTAL impresso: quem não fecha é a fórmula de origem, não o OCR
            origem_nao_fecha = True
        else:
            motivos.append(f"soma dos % = {soma.normalize()} (≠ 100; tolerância ±{tol.normalize()})")
    if tot_pct is None:
        motivos.append("linha de TOTAL (100%) não encontrada — fórmula pode continuar em outra foto")
    if itens and all(it["qtde_g"] is not None and it["pct"] is not None and Decimal(it["qtde_g"]) == Decimal(it["pct"]) for it in itens) \
            and any(any(pb.startswith("QTDE(g)") for pb in it["problemas"]) for it in itens):
        for it in itens:
            it["problemas"] = [pb for pb in it["problemas"] if not pb.startswith("QTDE(g)")]
        info.append("coluna QTDE(g) impressa calculada p/ 100 g (= %), não p/ a batelada — ignorada; QTDE(kg) e % conferem")
    CAD = ("código não existe", "nome não bate", "ANOTAÇÃO MANUSCRITA", "CÓDIGO INFERIDO", "NOME DO PRODUTO")
    leit = [it for it in itens if any(not pb.startswith(CAD) for pb in it["problemas"])]
    cad = [it for it in itens if any(pb.startswith(CAD) for pb in it["problemas"])]
    if leit:
        motivos.append(f"{len(leit)} linha(s) com erro de leitura/conta")
    pend_cad = [f"{it['codigo']} {it['descricao_lida']}: " + "; ".join(pb for pb in it["problemas"] if pb.startswith(CAD)) for it in cad]
    pend_cad += anot
    status = "revisar" if motivos else ("origem_nao_fecha_100" if origem_nao_fecha else ("pendente_conferencia" if (cad or anot) else "confirmada"))
    if origem_nao_fecha:
        motivos_origem = [f"a própria folha imprime TOTAL = {p['totais'].get('pct')} e a soma das linhas lidas = {soma:f}%: a FÓRMULA DE ORIGEM não fecha 100% (decisão do laboratório; nada foi ajustado)"]
    else:
        motivos_origem = []
    return dict(base, status=status, motivos=motivos + motivos_origem, pendencias_cadastro=pend_cad, fonte_tabela=fonte, concordancia_ocr_visual=concord,
                revisao_obs=(rv or {}).get("observacoes"), anotacoes_visuais=(an or {}).get("observacoes"), varredura_manuscrito=bool(an or rv), notas_informativas=info, modelo=p["modelo"], produto=produto, data_folha=data,
                batelada_kg=str(bat) if bat is not None else None, soma_pct=str(soma), n_itens=len(itens), totais=p["totais"],
                topo=[t["t"] for t in p["topo"]], manuscrito_abaixo=p["manuscrito_abaixo"], itens=itens)


def forn_ok(a, b):
    """Fornecedor da folha × fornecedor do cadastro: igual, contido, ou palavra (≥4 letras) em comum."""
    na, nb = norm(a), norm(b)
    if not na or not nb:
        return None
    if na in nb or nb in na or SequenceMatcher(None, na, nb).ratio() >= 0.75:
        return True
    ta = {w for w in re.split(r"[ /]", na) if len(w) >= 4}
    tb = {w for w in re.split(r"[ /]", nb) if len(w) >= 4}
    return bool(ta & tb) or any(SequenceMatcher(None, x, y).ratio() >= 0.8 for x in ta for y in tb)


def plausibilidade(res):
    """5ª conferência (cruzada entre folhas): o par (código à esquerda) × (preço/fornecedor à direita) é coerente?
    Suspeito = fornecedor diverge do cadastro E preço fora de 0,5×–2× do cadastro E preço não aparece p/ esse código
    em nenhuma outra folha. Pega erro da folha de origem (preço copiado da linha errada) e desalinhamento de leitura."""
    vistos = {}
    for r in res:
        for it in r.get("itens", []):
            if it["codigo"] is not None and it["valor_kg"]:
                vistos.setdefault(it["codigo"], []).append((Decimal(it["valor_kg"]), r["arquivo"]))
    for r in res:
        sus = []
        for it in r.get("itens", []):
            cod, v = it["codigo"], it["valor_kg"]
            kb = MP.get(cod) if cod is not None else None
            if v is not None and Decimal(v) == 0:
                # típico de MP fornecida pelo cliente (mel, própolis...): composição vale, preço não existe
                it["preco_zero"] = True
                r.setdefault("notas_informativas", []).append(f"preço R$ 0,00 na folha p/ {cod} {it['descricao_lida'][:30]} (provável MP fornecida pelo cliente) — fora da lista de preços")
                continue
            if not kb or not v or kb.get("preco_kg_brl") in (None, 0):
                continue
            v = Decimal(v)
            ratio = v / Decimal(str(kb["preco_kg_brl"]))
            f_ok = forn_ok(it["fornecedor"], kb["fornecedor"])
            outro = [x for x, a in vistos.get(cod, []) if a != r["arquivo"] and x == v]
            if f_ok is False and not (Decimal("0.5") <= ratio <= 2) and not outro:
                it["problemas"].append(f"PREÇO/FORNECEDOR SUSPEITO: folha R$ {v} {it['fornecedor']} × cadastro R$ {kb['preco_kg_brl']} {kb['fornecedor']} "
                                       f"(preço não visto p/ este código em outra folha) — linha não serve como fonte de preço; conferir se a folha de origem copiou preço de outra linha")
                it["preco_suspeito"] = True
                sus.append(f"{cod} {it['descricao_lida'][:30]}")
            elif not (Decimal(1) / 3 <= ratio <= 3) and not outro:
                it["problemas"].append(f"PREÇO ATÍPICO: folha R$ {v} × cadastro R$ {kb['preco_kg_brl']} ({kb['data_cotacao']}), {ratio:.2f}×, e não visto em outra folha — não usar como fonte de preço sem conferir")
                it["preco_suspeito"] = True
                sus.append(f"{cod} {it['descricao_lida'][:30]} (atípico)")
        if sus and r.get("status") in ("confirmada", "pendente_conferencia", "origem_nao_fecha_100"):
            r["pendencias_cadastro"] = r.get("pendencias_cadastro", []) + [f"PREÇO/FORNECEDOR SUSPEITO na folha: {', '.join(sus)}"]
            if r["status"] == "confirmada":
                r["status"] = "pendente_conferencia"
    return res


if __name__ == "__main__":
    os.makedirs(f"{S}/out", exist_ok=True)
    res = plausibilidade([validar(json.load(open(jp))) for jp in sorted(glob.glob(f"{S}/dados/ocr/*.json"))])
    json.dump(res, open(f"{S}/out/extracao.json", "w"), ensure_ascii=False, indent=1)
    print(Counter((r["tipo"], r.get("status")) for r in res))
    if "-v" in sys.argv:
        for r in res:
            if r.get("status") == "revisar":
                print("REVISAR", r["drive"], r.get("produto"), r["motivos"])
