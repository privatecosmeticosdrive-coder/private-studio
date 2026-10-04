# Decodifica respostas salvas do Drive (download_file_content) para $S/raw/<id>__<titulo>; idempotente.
import json,base64,glob,os,sys,hashlib
S=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
for p in glob.glob('/root/.claude/projects/**/mcp-Google_Drive-download_file_content-*.txt', recursive=True):
    try: d=json.load(open(p))
    except Exception as e: print("ERRO",p,e); continue
    out=f"{S}/raw/{d['id']}__{d['title'].replace('/','_')}"
    if os.path.exists(out): continue
    b=base64.b64decode(d['content']); tmp=f"{S}/raw_tmp_{os.getpid()}_{d['id']}"; open(tmp,'wb').write(b); os.replace(tmp,out)  # escrita atômica: o worker de OCR nunca vê arquivo pela metade
    print(len(b), hashlib.sha256(b).hexdigest()[:12], out.split('/')[-1])
