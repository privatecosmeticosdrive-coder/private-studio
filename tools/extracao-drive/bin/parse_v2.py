"""Leitor v2 da folha de fórmula Private (modelos A e B) a partir do JSON do PaddleOCR.

Modelo A: CÓDIGO | DESCRIÇÃO | QTDE.(KG) | % | CUSTO | Valor (Kg) | Fornecedor | Embal.
Modelo B: CÓDIGO | DESCRIÇÃO | FASE | QTDE.(Kg) | % | QTDE.(g) | Valor (un) | Valor (Kg) | EMBL.MINIMA

Princípios:
  * colunas mapeadas pelo TEXTO do cabeçalho, nunca por posição fixa;
  * linhas montadas pela ORDEM dentro de cada coluna (robusto a folha curvada/torta), usando a coluna %
    como âncora; quando uma coluna tem nº de células diferente, alinhamento monotônico por programação
    dinâmica sobre a posição vertical;
  * nada abaixo da linha de TOTAL (anotações manuscritas de embalagem) entra na fórmula;
  * não corrige nada: só lê. Quem decide se a leitura é confiável é o validador (contas fecham ou não).
"""
import json, re, statistics, unicodedata
from decimal import Decimal, InvalidOperation

HDR = [
    ("codigo", r"^([^A-Z]?C?[ÓO]DIGO|LOTE)$"),
    ("descricao", r"^DESCRI"),
    ("fase", r"^FASE$"),
    ("qtde_kg", r"^QTDE\.?\(?KG\)?$"),
    ("qtde_g", r"^(QTDE\.?\(?G\)?|GR)$"),
    ("pct", r"^0?%$"),
    ("custo", r"^(CUSTO|VALOR\(UN\))$"),
    ("valor_kg", r"^VALOR\(KG\)$"),
    ("fornecedor", r"^(FORNECEDOR|EMBL\.?MINIMA|EMBAL\.?MIN/?FORNECEDOR)$"),
    ("embal", r"^EMBAL\.?$"),
]
NUM_COLS = {"qtde_kg", "qtde_g", "pct", "custo", "valor_kg", "fase"}


def num(s):
    if s is None:
        return None
    t = s.strip().replace("R$", "").replace("%", "").replace(" ", "")
    if not re.fullmatch(r"-?(\d{1,3}(\.\d{3})+|\d+)(,\d+)?", t):
        return None
    t = t.replace(".", "").replace(",", ".")
    try:
        return Decimal(t)
    except InvalidOperation:
        return None


def ndec(s):
    m = re.search(r",(\d+)", s or "")
    return len(m.group(1)) if m else 0


def hnorm(t):
    t = unicodedata.normalize("NFC", t).upper().replace(" ", "")
    return t


def load(path_or_rec):
    j = path_or_rec if isinstance(path_or_rec, dict) else json.load(open(path_or_rec))
    j = j.get("res", j)
    out = []
    for t, s, b in zip(j["rec_texts"], j["rec_scores"], j["rec_boxes"]):
        x0, y0, x1, y1 = b
        out.append(dict(t=t.strip(), s=float(s), x0=x0, y0=y0, x1=x1, y1=y1, xc=(x0 + x1) / 2, yc=(y0 + y1) / 2, h=y1 - y0))
    return out


def align(anchor_y, cells, rowh):
    """Alinha células (ordenadas por y) às âncoras (ordenadas por y). Retorna lista len(anchor) com célula ou None."""
    n, m = len(anchor_y), len(cells)
    if m == n:
        return list(cells)
    if m == 0:
        return [None] * n
    # deslocamento típico entre a coluna e a âncora (folha torta): mediana das diferenças ao vizinho mais próximo
    diffs = [min((c["yc"] - a for a in anchor_y), key=abs) for c in cells]
    off = statistics.median(diffs)
    G = 0.6 * rowh
    INF = float("inf")
    D = [[INF] * (m + 1) for _ in range(n + 1)]
    P = [[None] * (m + 1) for _ in range(n + 1)]
    D[0][0] = 0
    for i in range(n + 1):
        for j in range(m + 1):
            if D[i][j] == INF:
                continue
            if i < n and j < m:
                c = D[i][j] + abs(cells[j]["yc"] - off - anchor_y[i])
                if c < D[i + 1][j + 1]:
                    D[i + 1][j + 1], P[i + 1][j + 1] = c, (i, j, "M")
            if i < n and D[i][j] + G < D[i + 1][j]:
                D[i + 1][j], P[i + 1][j] = D[i][j] + G, (i, j, "A")  # âncora sem célula
            if j < m and D[i][j] + G < D[i][j + 1]:
                D[i][j + 1], P[i][j + 1] = D[i][j] + G, (i, j, "C")  # célula sobrando
    res = [None] * n
    i, j = n, m
    while (i, j) != (0, 0):
        pi, pj, k = P[i][j]
        if k == "M":
            res[pi] = cells[pj]
        i, j = pi, pj
    return res


def parse(src):
    boxes = load(src)
    desc = [b for b in boxes if re.match(r"^DESCRI", hnorm(b["t"]))]
    if not desc:
        return {"erro": "cabeçalho DESCRIÇÃO não encontrado"}
    d = min(desc, key=lambda b: b["yc"])
    hh = d["h"]
    cols = {}
    for k, pat in HDR:
        c = [b for b in boxes if re.match(pat, hnorm(b["t"])) and abs(b["yc"] - d["yc"]) < 2.5 * hh]
        if c:
            cols[k] = min(c, key=lambda b: abs(b["yc"] - d["yc"]))
    if "pct" not in cols:
        return {"erro": "cabeçalho % não encontrado", "cols": list(cols)}
    # inclinação pela linha de cabeçalho (só corrige rotação global; curvatura é tratada pelo alinhamento por ordem)
    hb = list(cols.values())
    if len(hb) >= 3:
        mx = statistics.mean(b["xc"] for b in hb)
        my = statistics.mean(b["yc"] for b in hb)
        den = sum((b["xc"] - mx) ** 2 for b in hb) or 1
        slope = sum((b["xc"] - mx) * (b["yc"] - my) for b in hb) / den
    else:
        mx, my, slope = d["xc"], d["yc"], 0.0
    for b in boxes:
        b["yc"] = b["yc"] - slope * (b["xc"] - mx)
    hy = max(c["yc"] for c in cols.values())  # base do cabeçalho
    order = sorted(cols.items(), key=lambda kv: kv[1]["xc"])
    names = [k for k, _ in order]
    xs = [c["xc"] for _, c in order]
    bounds = [(xs[i] + xs[i + 1]) / 2 for i in range(len(xs) - 1)]
    idesc = names.index("descricao")
    desc_right = bounds[idesc] if idesc < len(bounds) else float("inf")
    cod_x = cols["codigo"]["xc"] if "codigo" in cols else None

    def col_of(b):
        x = b["xc"]
        if x < desc_right:
            if re.fullmatch(r"\d{1,5}", b["t"]) and (b["x1"] < cols["descricao"]["x0"] or (cod_x and abs(x - cod_x) < 120)) \
                    and b["x1"] < cols["descricao"]["x0"] + 0.25 * (desc_right - cols["descricao"]["x0"]):
                return "codigo"
            m = re.match(r"(\d{1,5})\s+(\D.*)", b["t"])
            if m and b["x0"] < cols["descricao"]["x0"]:
                return "codigo+descricao"
            return "descricao"
        for i, bd in enumerate(bounds):
            if x < bd:
                return names[i]
        return names[-1]

    body = [b for b in boxes if b["yc"] > hy + 0.45 * hh]
    for b in body:
        b["col"] = col_of(b)
    # separa "123 Nome" colados
    extra = []
    for b in body:
        if b["col"] == "codigo+descricao":
            m = re.match(r"(\d{1,5})\s+(.*)", b["t"])
            b["col"], b["t"] = "descricao", m.group(2)
            extra.append(dict(b, t=m.group(1), col="codigo"))
    body += extra

    # âncoras = células % numéricas; TOTAL = célula % ≈ 100 mais baixa
    pcts = sorted([b for b in body if b["col"] == "pct" and num(b["t"]) is not None and "%" in b["t"]], key=lambda b: b["yc"])
    if not pcts:
        return {"erro": "nenhum valor % lido"}
    tot = [b for b in pcts if Decimal(99) <= num(b["t"]) <= Decimal(101)]
    if not tot and len(pcts) >= 3:
        # TOTAL fora de 99–101% (fórmula de origem que não fecha): a última célula % é a soma das anteriores
        prev = sum(num(b["t"]) for b in pcts[:-1])
        if abs(prev - num(pcts[-1]["t"])) <= Decimal("0.0006") * len(pcts) and num(pcts[-1]["t"]) > 50:
            tot = [pcts[-1]]
    if tot:
        total_y = tot[0]["yc"]  # 1ª linha de 100% = TOTAL da batelada (pode haver 2ª linha p/ outro lote)
        anchors = [b for b in pcts if b["yc"] < total_y - 0.4 * hh]
    else:
        total_y = None
        anchors = pcts
    if not anchors:
        return {"erro": "nenhuma linha de ingrediente"}
    rowh = statistics.median([anchors[i + 1]["yc"] - anchors[i]["yc"] for i in range(len(anchors) - 1)]) if len(anchors) > 1 else 2 * hh
    lim_inf = (total_y - 0.4 * rowh) if total_y else anchors[-1]["yc"] + 0.6 * rowh
    ay = [a["yc"] for a in anchors]

    def cells_of(k):
        cs = sorted([b for b in body if b["col"] == k and b["yc"] < lim_inf + (0.0 if total_y else 0) and b["yc"] > ay[0] - 0.8 * rowh], key=lambda b: b["yc"])
        if k == "codigo":
            cs = [c for c in cs if re.fullmatch(r"\d{1,5}", c["t"])]
        if k in NUM_COLS and k != "fase":
            cs = [c for c in cs if num(c["t"]) is not None]
        # junta fragmentos na mesma linha (ex.: descrição quebrada em 2 caixas)
        merged = []
        for c in cs:
            if merged and abs(c["yc"] - merged[-1]["yc"]) < 0.45 * rowh:
                prev = merged[-1]
                parts = sorted([prev, c], key=lambda z: z["x0"])
                merged[-1] = dict(prev, t=" ".join(p["t"] for p in parts), s=min(prev["s"], c["s"]), yc=(prev["yc"] + c["yc"]) / 2,
                                  x0=min(prev["x0"], c["x0"]), x1=max(prev["x1"], c["x1"]))
            else:
                merged.append(c)
        return merged

    colcells = {k: cells_of(k) for k in names if k not in ("pct", "codigo", "descricao")}
    aligned = {k: align(ay, v, rowh) for k, v in colcells.items()}
    # BLOCO ESQUERDO: código + descrição montados juntos (mesma inclinação local). Cada caixa de descrição
    # vai para o código mais próximo na vertical (descrição quebrada em 2 linhas abraça o código);
    # descrição sem código perto vira linha com código None (OCR perdeu o código -> validador acusa).
    lo, hi = ay[0] - 0.8 * rowh, lim_inf
    codes = sorted([b for b in body if b["col"] == "codigo" and re.fullmatch(r"\d{1,5}", b["t"]) and lo < b["yc"] < hi], key=lambda b: b["yc"])
    xmin_cod = min((c["x0"] for c in codes), default=0)
    descs = sorted([b for b in body if b["col"] == "descricao" and lo < b["yc"] < hi and b["x1"] > xmin_cod + 5], key=lambda b: b["yc"])
    left = [dict(yc=c["yc"], cod=c, ds=[]) for c in codes]
    orphans = []
    for dbx in descs:
        near = min(left, key=lambda r: abs(r["yc"] - dbx["yc"])) if left else None
        if near and abs(near["yc"] - dbx["yc"]) < 0.75 * rowh:
            near["ds"].append(dbx)
        else:
            orphans.append(dbx)
    for o in orphans:
        if left and any(abs(r["yc"] - o["yc"]) < 0.45 * rowh and r["cod"] is None for r in left):
            r = min((r for r in left if r["cod"] is None), key=lambda r: abs(r["yc"] - o["yc"]))
            r["ds"].append(o)
        else:
            left.append(dict(yc=o["yc"], cod=None, ds=[o]))
    left.sort(key=lambda r: r["yc"])
    lrows = []
    for r in left:
        ds = sorted(r["ds"], key=lambda z: (round(z["yc"] / (0.45 * rowh)), z["x0"]))
        lrows.append(dict(yc=r["yc"], cod=r["cod"], t=" ".join(z["t"] for z in ds if z["s"] >= 0.85) or " ".join(z["t"] for z in ds),
                          manus=[z["t"] for z in ds if z["s"] < 0.85],
                          s=min([z["s"] for z in ds] + ([r["cod"]["s"]] if r["cod"] else [1.0]))))
    al = align(ay, lrows, rowh)
    aligned["codigo"] = [(dict(r["cod"]) if r and r["cod"] else None) for r in al]
    aligned["descricao"] = [(dict(t=r["t"], s=r["s"]) if r and r["t"] else None) for r in al]
    manus = [(r["manus"] if r else []) for r in al]
    colcells["codigo"] = [r for r in lrows if r["cod"]]
    colcells["descricao"] = lrows
    aligned["pct"] = anchors
    counts = {k: len(v) for k, v in colcells.items()}
    linhas = []
    for i in range(len(anchors)):
        txt, conf = {}, {}
        for k in names:
            c = aligned[k][i]
            if c is not None:
                txt[k], conf[k] = c["t"], c["s"]
        # fornecedor + embalagem mínima podem vir na mesma coluna (modelo B)
        f = txt.get("fornecedor")
        if f and "embal" not in txt:
            m = re.match(r"(.*?)\s+(\d+[.,]?\d*\s*(kg|g|l|ml|un)|Private|-)$", f, re.I)
            if m:
                txt["fornecedor"], txt["embal"] = m.group(1), m.group(2)
        linhas.append(dict(txt=txt, conf=conf, manuscrito=manus[i]))
    totais = {}
    if total_y:
        for k in names:
            near = [b for b in boxes if b.get("col") == k and abs(b["yc"] - total_y) < 0.6 * rowh]
            if near:
                totais[k] = " ".join(b["t"] for b in sorted(near, key=lambda z: z["x0"]))
    topo = [b for b in boxes if b["yc"] < min(c["yc"] for c in cols.values()) - 0.6 * hh]
    return dict(modelo="B" if "qtde_g" in cols or "fase" in cols else "A", colunas=names, contagens=counts, n_ancoras=len(anchors),
                linhas=linhas, totais=totais, topo=[dict(t=b["t"], h=b["h"], x=b["xc"], y=b["yc"]) for b in sorted(topo, key=lambda z: (z["yc"], z["xc"]))],
                manuscrito_abaixo=[b["t"] for b in boxes if total_y and b["yc"] > total_y + 0.6 * rowh])
