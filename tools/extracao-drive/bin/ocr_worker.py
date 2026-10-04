"""Fila de OCR: processa cada imagem de raw/ que ainda não tem ocr/<id>.json.
Lock por arquivo (ocr/<id>.lock) permite N workers em paralelo. Reduz para 2400 px
(validado: mesma leitura que resolução total em IMG_2023, 82 s vs 218 s).

Uso: python ocr_worker.py <worker_id>   (rodar com o python do venv do PaddleOCR)
"""
import os, sys, glob, json, time, hashlib, traceback

S = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW, OUT = f"{S}/raw", f"{S}/dados/ocr"  # raw/ = fotos baixadas (não versionado)
os.makedirs(OUT, exist_ok=True)
os.environ.setdefault("PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK", "True")

from PIL import Image
from paddleocr import PaddleOCR

ocr = PaddleOCR(use_doc_orientation_classify=True, use_doc_unwarping=False, use_textline_orientation=False,
                enable_mkldnn=False, text_det_limit_side_len=3000, text_det_limit_type="max", cpu_threads=2)
wid = sys.argv[1] if len(sys.argv) > 1 else "0"
IMG_EXT = (".jpg", ".jpeg", ".png", ".heic", ".webp")

while True:
    todo = sorted(p for p in glob.glob(f"{RAW}/*") if p.lower().endswith(IMG_EXT))
    picked = None
    for p in todo:
        fid = os.path.basename(p).split("__")[0]
        if os.path.exists(f"{OUT}/{fid}.json") or os.path.exists(f"{OUT}/{fid}.err"):
            continue
        try:
            fd = os.open(f"{OUT}/{fid}.lock", os.O_CREAT | os.O_EXCL)
            os.close(fd)
            picked = (p, fid)
            break
        except FileExistsError:
            continue
    if not picked:
        if os.path.exists(f"{S}/ocr_STOP_WHEN_EMPTY"):
            break
        time.sleep(20)
        continue
    p, fid = picked
    t = time.time()
    try:
        raw = open(p, "rb").read()
        im = Image.open(p)
        im.load()
        small = f"{OUT}/{fid}_2400.jpg"
        im2 = im.convert("RGB")
        im2.thumbnail((2400, 2400))
        im2.save(small, quality=95)
        r = ocr.predict(small)[0]
        j = r.json["res"]
        rec = dict(
            id=fid, arquivo=os.path.basename(p), sha256=hashlib.sha256(raw).hexdigest(), bytes=len(raw),
            orig_size=im.size, proc_size=im2.size, angle=j.get("doc_preprocessor_res", {}).get("angle"),
            rec_texts=j["rec_texts"], rec_scores=[float(s) for s in j["rec_scores"]],
            rec_boxes=[[int(v) for v in b] for b in j["rec_boxes"]], segundos=round(time.time() - t, 1), worker=wid)
        # salva também a imagem já girada (coordenadas das caixas referem-se a ela) para recortes de conferência
        Image.fromarray(r["doc_preprocessor_res"]["output_img"][:, :, ::-1]).save(f"{OUT}/{fid}_rot.jpg", quality=92)
        os.remove(small)
        json.dump(rec, open(f"{OUT}/{fid}.json.tmp", "w"), ensure_ascii=False)
        os.replace(f"{OUT}/{fid}.json.tmp", f"{OUT}/{fid}.json")
        print(f"[w{wid}] ok {fid} {rec['segundos']}s n={len(rec['rec_texts'])}", flush=True)
    except Exception as e:
        open(f"{OUT}/{fid}.err", "w").write(traceback.format_exc())
        print(f"[w{wid}] ERRO {fid}: {e}", flush=True)
    finally:
        try:
            os.remove(f"{OUT}/{fid}.lock")
        except FileNotFoundError:
            pass
