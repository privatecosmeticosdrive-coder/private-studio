"""Gera a entrega da extração a partir de out/extracao.json (já validado).

Saídas em out/entrega/:
  formulas_extraidas.xlsx   — para conferência humana (abas: LEIA-ME, Fórmulas, Composição, Preços MP, MPs fora do cadastro, Revisar, Outras fotos)
  formulas_staging.json     — formato de máquina, alinhado ao schema (formulas / formula_composicao / materias_primas)
  biblioteca_extraida.md    — uma seção por fórmula (formato da skill private-formula-extractor)
Nada aqui grava em banco. Nada é inventado: campo não lido = vazio.
"""
import json, os, re, sys, hashlib, unicodedata
from decimal import Decimal
from collections import defaultdict, Counter

S = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO = os.path.dirname(os.path.dirname(S))  # raiz do repositório private-studio
OUT = f"{S}/out/entrega"
os.makedirs(OUT, exist_ok=True)
EX = json.load(open(f"{S}/out/extracao.json"))
KB = json.load(open(f"{REPO}/backend/prisma/kb-source.json"))
MP = {m["codigo"]: m for m in KB["materias_primas"]}
GERADO = sys.argv[1] if len(sys.argv) > 1 else "2026-10-04"


def norm(s):
    s = unicodedata.normalize("NFD", s or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9%]+", " ", s)).strip()


def link(fid):
    return f"https://drive.google.com/file/d/{fid}/view" if fid else None


def pasta(drive):
    parts = [p.strip() for p in (drive or "").split(" /")]
    return (parts[0] if parts else None), (parts[1] if len(parts) > 1 else None)


# ---------- fórmulas: deduplicação por assinatura (produto + composição) ----------
formulas = [r for r in EX if r["tipo"] == "formula"]
outras = [r for r in EX if r["tipo"] != "formula"]
grupos = defaultdict(list)
for r in formulas:
    if r.get("itens") and r["status"] != "revisar":  # assinatura só p/ leitura confiável
        sig = (norm(r.get("produto")), r.get("batelada_kg"), tuple((i["codigo"], i["pct"]) for i in r["itens"]))
    else:
        sig = ("__unico__", r["sha256"])
    grupos[sig].append(r)

# fórmulas do sistema (kb) por assinatura de nomes normalizados + % (para dizer "já existe")
kb_sig = {}
for f in KB["formulas"]:
    s = tuple(sorted((norm(c["materia_prima"]), round(float(c["concentracao_pct"] or 0), 3)) for c in f["composicao"]))
    kb_sig.setdefault(s, []).append(f["id"])


def ja_existe(r):
    if not r.get("itens") or any(i["codigo"] not in MP for i in r["itens"]):
        return None
    s = tuple(sorted((norm(MP[i["codigo"]]["nome"]), round(float(i["pct"]), 3)) for i in r["itens"]))
    return kb_sig.get(s)


uni = []
for n, (sig, rs) in enumerate(sorted(grupos.items(), key=lambda kv: (pasta(kv[1][0]["drive"]), kv[1][0]["arquivo"])), 1):
    r = rs[0]
    cat, cli = pasta(r["drive"])
    uni.append(dict(n=n, r=r, fotos=rs, categoria=cat, pasta_cliente=cli, kb_ids=ja_existe(r)))

# ---------- preços observados por MP ----------
obs = defaultdict(list)
for u in uni:
    r = u["r"]
    if r["status"] == "revisar":
        continue  # preço só sai de fórmula cuja leitura fechou nas contas
    for i in r["itens"]:
        if i["codigo"] is not None and i["valor_kg"] is not None and not i.get("preco_suspeito") and not i.get("preco_zero"):
            obs[i["codigo"]].append(dict(valor=Decimal(i["valor_kg"]), fornecedor=i["fornecedor"], embal=i["embal"], nome=i["descricao_lida"],
                                         formula=u["n"], produto=r.get("produto"), pasta=u["pasta_cliente"], data_folha=r.get("data_folha"),
                                         foto=r["drive"], conta_ok=not any(p.startswith(("CUSTO", "QTDE")) for p in i["problemas"])))

# ---------- staging JSON ----------
staging = dict(
    gerado_em=GERADO, fonte="Google Drive: ORÇAMENTOS — MAIO A AGOSTO 2026 (fotos de folhas de formulação)",
    metodo="PaddleOCR PP-OCRv6 + reconstrução de tabela + conferências aritméticas (Σ%=100, QTDE=%×batelada, CUSTO=QTDE×R$/kg) + código↔nome vs kb-source.json",
    aviso="STAGING — não importar sem revisão e decisão do Gabriel/conselheiro. Preços sem data de cotação (a folha não traz).",
    formulas=[], precos_observados=[], mps_fora_do_cadastro=[])
for u in uni:
    r = u["r"]
    staging["formulas"].append(dict(
        n=u["n"], status_extracao=r["status"], motivos=r.get("motivos", []), pendencias_cadastro=r.get("pendencias_cadastro", []),
        nome_produto=r.get("produto"), nome_fonte=r.get("nome_fonte"), nome_confirmado_ocr=r.get("nome_confirmado_ocr"),
        cliente_original=u["pasta_cliente"], categoria_pasta=u["categoria"], data_folha=r.get("data_folha"),
        batelada=(f"{r['batelada_kg']} kg" if r.get("batelada_kg") else None), soma_pct=r.get("soma_pct"), modelo_folha=r.get("modelo"),
        ja_existe_no_kb_ids=u["kb_ids"],
        fontes=[dict(drive_id=x["drive_id"], caminho=x["drive"], sha256=x["sha256"], link=link(x["drive_id"])) for x in u["fotos"]],
        composicao=[dict(ordem=i["ordem"], mp_codigo=i["codigo"], mp_nome_original=i["descricao_lida"], mp_nome_cadastro=i["nome_cadastro"],
                         fase=i.get("fase"), concentracao_pct=i["pct"], concentracao_txt=i["pct_txt"], preco_kg_snapshot=i["valor_kg"],
                         fornecedor_pref=i["fornecedor"], embalagem_minima=i["embal"], problemas=i["problemas"]) for i in r.get("itens", [])]))
for cod, os_ in sorted(obs.items()):
    vals = sorted({o["valor"] for o in os_})
    kb = MP.get(cod)
    staging["precos_observados"].append(dict(
        mp_codigo=cod, nome_cadastro=kb["nome"] if kb else None, nomes_lidos=sorted({o["nome"] for o in os_}),
        precos_distintos=[str(v) for v in vals], n_observacoes=len(os_),
        preco_kb=kb["preco_kg_brl"] if kb else None, data_cotacao_kb=kb["data_cotacao"] if kb else None,
        observacoes=[dict(valor=str(o["valor"]), fornecedor=o["fornecedor"], formula=o["formula"], pasta=o["pasta"], data_folha=o["data_folha"], foto=o["foto"]) for o in os_]))
    if not kb:
        staging["mps_fora_do_cadastro"].append(dict(mp_codigo=cod, nomes_lidos=sorted({o["nome"] for o in os_}), precos=[str(v) for v in vals],
                                                    fornecedores=sorted({o["fornecedor"] or "" for o in os_}), n_formulas=len({o["formula"] for o in os_})))
# ---------- preços para atualização (decisão do Gabriel, 04/10/2026) ----------
# O R$/kg da folha vale como preço atualizado NA DATA DA COTAÇÃO impressa na folha; sem data, referência = maio/2026.
# Fonte só de linha confiável: sem preço suspeito/atípico/zero, sem código inferido, sem nome divergente, sem
# anotação manuscrita na linha. Por código vence a observação de data mais recente; empate de data com preços
# diferentes = ambíguo (não atualiza). A comparação com a data já gravada no banco é feita no import (backend).
REF_MAIO = "2026-05-01"
DATA_MIN, DATA_MAX = "2025-01-01", GERADO


def data_iso(d):
    m = re.fullmatch(r"(\d{2})/(\d{2})/(\d{2}|\d{4})", d or "")
    if not m:
        return None
    ano = int(m.group(3)) + (2000 if len(m.group(3)) == 2 else 0)
    try:
        import datetime
        iso = datetime.date(ano, int(m.group(2)), int(m.group(1))).isoformat()
    except ValueError:
        return None
    return iso if DATA_MIN <= iso <= DATA_MAX else None


BLOQ = ("ANOTAÇÃO MANUSCRITA", "CÓDIGO INFERIDO", "nome não bate", "PREÇO/FORNECEDOR SUSPEITO", "PREÇO ATÍPICO")
cand = defaultdict(list)
for u in uni:
    r = u["r"]
    if r["status"] == "revisar":
        continue
    d = data_iso(r.get("data_folha"))
    for i in r.get("itens", []):
        if i["codigo"] is None or i["valor_kg"] is None or i.get("preco_suspeito") or i.get("preco_zero"):
            continue
        if any(pb.startswith(BLOQ) or BLOQ[0] in pb for pb in i["problemas"]):
            continue
        cand[i["codigo"]].append(dict(valor=i["valor_kg"], fornecedor=i["fornecedor"], data_cotacao=d or REF_MAIO,
                                      data_origem="folha" if d else "referencia_maio", formula=u["n"], produto=r.get("produto"),
                                      pasta=u["pasta_cliente"], foto=r["drive"], link=link(r["drive_id"]), sha256=r["sha256"]))
staging["precos_para_atualizar"] = []
staging["precos_ambiguos"] = []
for cod, obs_ in sorted(cand.items()):
    top = max(o["data_cotacao"] for o in obs_)
    na_data = [o for o in obs_ if o["data_cotacao"] == top]
    # o banco guarda R$/kg com 2 casas (Decimal(10,2)): 24,284 e 24,28 são o mesmo preço gravado
    from decimal import ROUND_HALF_UP
    vals = sorted({Decimal(o["valor"]).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP) for o in na_data})
    reg = dict(mp_codigo=cod, nome_cadastro_kb=MP[cod]["nome"] if cod in MP else None, n_observacoes=len(obs_))
    if len(vals) > 1:
        staging["precos_ambiguos"].append(dict(reg, data_cotacao=top, precos=[str(v) for v in vals],
                                               fontes=[f"{o['pasta']} (fórmula {o['formula']}): R$ {o['valor']}" for o in na_data]))
        continue
    o = na_data[0]
    staging["precos_para_atualizar"].append(dict(reg, preco_kg_brl=str(vals[0]), fornecedor_folha=o["fornecedor"], data_cotacao=top,
                                                 data_origem=o["data_origem"], fonte=f"{o['foto']} ({o['link']}) sha256 {o['sha256']}",
                                                 formula=o["formula"], produto=o["produto"]))
json.dump(staging, open(f"{OUT}/formulas_staging.json", "w"), ensure_ascii=False, indent=1)

# ---------- markdown ----------
md = [f"# Fórmulas extraídas do Drive — {GERADO}", "",
      "Gerado por Claude Code a partir das fotos da pasta *ORÇAMENTOS — MAIO A AGOSTO 2026*. **Staging: não importado.**", "",
      "Status: **confirmada** = todas as contas da folha fecham, todo código bate com o cadastro e não há anotação à mão que altere a fórmula · **pendente_conferencia** = contas fecham, mas há item a conferir (ver pendências) · **origem_nao_fecha_100** = a própria folha imprime TOTAL ≠ 100% · **revisar** = leitura não fechou.", ""]
for u in uni:
    r = u["r"]
    md += [f"## {u['n']}. {r.get('produto') or '(produto não lido)'} — {u['pasta_cliente']}", "",
           f"| Campo | Valor |", "|---|---|", f"| Status | {r['status']} |", f"| Categoria (pasta) | {u['categoria']} |",
           f"| Data na folha | {r.get('data_folha') or '—'} |", f"| Batelada | {r.get('batelada_kg') or '—'} kg |",
           f"| Soma dos % | {r.get('soma_pct') or '—'} |", f"| Foto(s) | " + " · ".join(f"[{x['arquivo'].split('__')[-1]}]({link(x['drive_id'])})" for x in u["fotos"]) + " |"]
    if r.get("motivos"):
        md.append(f"| Motivos | {'; '.join(r['motivos'])} |")
    if r.get("pendencias_cadastro"):
        md.append(f"| Pendências | {'; '.join(r['pendencias_cadastro'])} |")
    if r.get("notas_informativas"):
        md.append(f"| Notas | {' · '.join(r['notas_informativas'])} |")
    if u["kb_ids"]:
        md.append(f"| Já existe no sistema (kb id) | {', '.join(map(str, u['kb_ids']))} |")
    md += ["", "| # | Fase | Código | Matéria-prima | INCI | Concentração (%) | R$/kg na folha | Fornecedor |", "|---|---|---|---|---|---|---|---|"]
    for i in r.get("itens", []):
        md.append(f"| {i['ordem']} | {i.get('fase') or ''} | {i['codigo'] if i['codigo'] is not None else '?'} | {i['descricao_lida']} | _a definir_ | {i['pct_txt'] or '?'} | {i['valor_kg'] or ''} | {i['fornecedor'] or ''} |")
    md.append("")
open(f"{OUT}/biblioteca_extraida.md", "w").write("\n".join(md))

# ---------- planilha ----------
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter

wb = Workbook()
HDRF = Font(bold=True, color="FFFFFF")
HDRB = PatternFill("solid", fgColor="5B2C83")
COR = {"confirmada": "E2F0D9", "pendente_conferencia": "FFF2CC", "revisar": "F8CBAD", "origem_nao_fecha_100": "DDEBF7"}


def aba(nome, cab, linhas, larg=None, status_col=None):
    ws = wb.create_sheet(nome)
    ws.append(cab)
    for c in ws[1]:
        c.font, c.fill, c.alignment = HDRF, HDRB, Alignment(wrap_text=True, vertical="top")
    for l in linhas:
        ws.append(l)
        if status_col is not None and l[status_col] in COR:
            for c in ws[ws.max_row]:
                c.fill = PatternFill("solid", fgColor=COR[l[status_col]])
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = ws.dimensions
    for i, w in enumerate(larg or [], 1):
        ws.column_dimensions[get_column_letter(i)].width = w
    return ws


ws = wb.active
ws.title = "LEIA-ME"
st = Counter(u["r"]["status"] for u in uni)
for l in [
    ["Extração de fórmulas — fotos do Drive (ORÇAMENTOS — MAIO A AGOSTO 2026)"],
    [f"Gerado em {GERADO} por Claude Code. STAGING: nada foi gravado no banco do Private Studio."],
    [],
    ["Fotos no Drive", len(EX)], ["Fotos de fórmula", len(formulas)], ["Fórmulas únicas (após remover fotos repetidas)", len(uni)],
    ["  confirmada", st.get("confirmada", 0)], ["  pendente_conferencia", st.get("pendente_conferencia", 0)],
    ["  origem_nao_fecha_100", st.get("origem_nao_fecha_100", 0)], ["  revisar", st.get("revisar", 0)],
    ["Fotos de tabela de custo / outras (não extraídas como fórmula)", len(outras)],
    [],
    ["COMO LER O STATUS"],
    ["confirmada", "Todas as contas impressas na folha fecham com o que foi lido (Σ% = 100; QTDE = % × batelada; CUSTO = QTDE × R$/kg) e todo código bate com o nome no cadastro."],
    ["pendente_conferencia", "As contas fecham (leitura confiável), mas há algo a conferir antes de importar: código que não existe no cadastro de referência (kb-source.json, maio/2026 — MP criada depois?), nome diferente do cadastro, código INFERIDO (impresso coberto/cortado na foto), anotação à mão que pode mudar a fórmula (X, DOBRAR, troca de MP, valor riscado) ou nome do produto corrigido à mão. Ver coluna 'Pendências'."],
    ["origem_nao_fecha_100", "A leitura confere com a folha, mas a PRÓPRIA FOLHA imprime TOTAL ≠ 100% (ex.: 100,010%). A fórmula de origem não fecha: decisão do laboratório. Nada foi ajustado."],
    ["revisar", "Alguma conta não fechou ou faltou campo. NÃO usar sem conferência visual (motivo na aba Revisar)."],
    [],
    ["LIMITES CONHECIDOS"],
    ["Preço", "R$/kg é o valor IMPRESSO na folha usado naquele orçamento. A folha não traz a data da cotação: não é preço cotado/validado (regra 6)."],
    ["Cadastro de referência", "Comparação feita contra backend/prisma/kb-source.json (snapshot maio/2026), NÃO contra o banco de produção (sem acesso daqui)."],
    ["Precisão", "O banco guarda concentração com 3 casas (Decimal(6,3)) e preço com 2 (Decimal(10,2)). Valores com mais casas aparecem aqui exatos; decidir arredondamento antes de importar."],
]:
    ws.append(l)
ws.column_dimensions["A"].width = 48
ws.column_dimensions["B"].width = 140
ws["A1"].font = Font(bold=True, size=14)

aba("Fórmulas", ["Nº", "Status", "Produto (título impresso)", "Cliente (pasta)", "Categoria", "Data na folha", "Batelada (kg)", "Nº itens", "Soma %",
                 "Modelo folha", "Motivos", "Pendências (conferir antes de importar)", "Notas informativas (marcas, contas fora da fórmula)", "Fonte da tabela", "Concordância OCR × leitura visual", "Já existe no kb (ids)", "Foto(s)", "Link", "Fotos repetidas", "SHA-256"],
    [[u["n"], u["r"]["status"], u["r"].get("produto"), u["pasta_cliente"], u["categoria"], u["r"].get("data_folha"),
      float(u["r"]["batelada_kg"]) if u["r"].get("batelada_kg") else None, u["r"].get("n_itens"),
      float(u["r"]["soma_pct"]) if u["r"].get("soma_pct") else None, u["r"].get("modelo"), "; ".join(u["r"].get("motivos", [])),
      "; ".join(u["r"].get("pendencias_cadastro", [])), " | ".join(u["r"].get("notas_informativas", []) or []) or None, u["r"].get("fonte_tabela"),
      (f'{u["r"]["concordancia_ocr_visual"]["iguais"]}/{u["r"]["concordancia_ocr_visual"]["celulas"]} células' if u["r"].get("concordancia_ocr_visual") else None),
      ", ".join(map(str, u["kb_ids"] or [])) or None,
      u["r"]["drive"], link(u["r"]["drive_id"]), len(u["fotos"]) - 1 or None, u["r"]["sha256"]] for u in uni],
    [5, 18, 34, 26, 12, 11, 11, 8, 10, 8, 40, 60, 50, 14, 14, 12, 45, 45, 8, 20], status_col=1)

linhas = []
for u in uni:
    for i in u["r"].get("itens", []):
        linhas.append([u["n"], u["r"]["status"], u["r"].get("produto"), u["pasta_cliente"], i["ordem"], i.get("fase"), i["codigo"], i["descricao_lida"],
                       i["nome_cadastro"], float(i["pct"]) if i["pct"] else None, i["pct_txt"], float(i["qtde_kg"]) if i["qtde_kg"] else None,
                       float(i["valor_kg"]) if i["valor_kg"] else None, float(i["custo"]) if i["custo"] else None, i["fornecedor"], i["embal"],
                       i["preco_kb"], i["data_cotacao_kb"], "; ".join(i["problemas"]) or "OK", i["conf_min"]])
ws = aba("Composição", ["Nº fórmula", "Status fórmula", "Produto", "Cliente (pasta)", "Ordem", "Fase", "Código", "Descrição lida", "Nome no cadastro",
                        "Concentração %", "% (texto impresso)", "QTDE (kg)", "R$/kg na folha", "Custo na folha (R$)", "Fornecedor", "Embal. mín.",
                        "R$/kg cadastro (kb mai/26)", "Data cotação cadastro", "Conferências", "Confiança OCR mín."], linhas,
         [6, 14, 30, 22, 6, 6, 8, 40, 40, 11, 11, 10, 12, 12, 22, 9, 12, 12, 50, 9], status_col=1)
for row in ws.iter_rows(min_row=2):
    for idx in (12, 13, 16):
        row[idx].number_format = 'R$ #,##0.0000'

prec = []
for p in staging["precos_observados"]:
    kbp = p["preco_kb"]
    for v in p["precos_distintos"]:
        dv = float(v)
        prec.append([p["mp_codigo"], p["nome_cadastro"], " | ".join(p["nomes_lidos"]), dv, kbp, p["data_cotacao_kb"],
                     round((dv / kbp - 1) * 100, 2) if kbp else None,
                     sum(1 for o in p["observacoes"] if o["valor"] == v),
                     " | ".join(sorted({f"{o['pasta']} ({o['data_folha'] or 's/ data'})" for o in p["observacoes"] if o["valor"] == v})),
                     " | ".join(sorted({o["fornecedor"] or "" for o in p["observacoes"] if o["valor"] == v}))])
ws = aba("Preços MP", ["Código", "Nome no cadastro", "Nome(s) lido(s)", "R$/kg na folha", "R$/kg cadastro (kb mai/26)", "Data cotação cadastro", "Δ % vs cadastro",
                       "Nº fórmulas c/ este preço", "Onde (pasta e data da folha)", "Fornecedor(es) na folha"], prec,
         [8, 36, 36, 13, 13, 12, 10, 9, 60, 30])
for row in ws.iter_rows(min_row=2):
    row[3].number_format = row[4].number_format = 'R$ #,##0.0000'

aba("MPs fora do cadastro", ["Código", "Nome(s) lido(s)", "Preço(s) R$/kg", "Fornecedor(es)", "Nº fórmulas"],
    [[m["mp_codigo"], " | ".join(m["nomes_lidos"]), " | ".join(m["precos"]), " | ".join(m["fornecedores"]), m["n_formulas"]] for m in staging["mps_fora_do_cadastro"]],
    [8, 60, 20, 30, 10])
aba("Origem ≠ 100% e Revisar", ["Nº", "Produto", "Cliente (pasta)", "Motivos", "Link"],
    [[u["n"], u["r"].get("produto"), u["pasta_cliente"], "; ".join(u["r"].get("motivos", [])), link(u["r"]["drive_id"])] for u in uni if u["r"]["status"] in ("revisar", "origem_nao_fecha_100")],
    [5, 34, 26, 90, 45])
aba("Outras fotos", ["Tipo", "Foto", "Link"], [[r["tipo"], r["drive"], link(r["drive_id"])] for r in outras], [10, 60, 45])
wb.save(f"{OUT}/formulas_extraidas.xlsx")
print("fórmulas únicas:", len(uni), dict(st), "| MPs com preço:", len(obs), "| fora do cadastro:", len(staging["mps_fora_do_cadastro"]), "| outras fotos:", len(outras))
