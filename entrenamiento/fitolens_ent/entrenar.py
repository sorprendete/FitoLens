"""Entrena un modelo de FitoLens de principio a fin y deja model.onnx + manifest.json + metricas.json.

Uso:  python -m fitolens_ent.entrenar --modelo hortalizas        (router | hortalizas | cafe | cacao)
      python -m fitolens_ent.entrenar --modelo cafe --prueba    (prueba rápida con datos falsos, en CPU)
"""
import argparse, copy, datetime, hashlib, json, math, os, random, shutil, time

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, WeightedRandomSampler

from . import catalogo, datos
from .aumentos import Conjunto
from .modelo import FitoNet, ParaExportar, exportar_onnx

DISP = "cuda" if torch.cuda.is_available() else "cpu"


def log(*a):
    print("[entrenar]", *a, flush=True)


# ------------------------------------------------------------ métricas
def probabilidades(logits, T, grupos=None, y=None):
    """softmax(logits/T). En hortalizas, igual que la API: solo entre las clases del cultivo (aquí, el real)."""
    z = logits / T
    if grupos is not None:
        mascara = grupos[None, :] != grupos[y][:, None]
        z = np.where(mascara, -1e9, z)
    z = z - z.max(1, keepdims=True)
    p = np.exp(z)
    return p / p.sum(1, keepdims=True)


def wilson(aciertos, n, z=1.96):
    if n == 0:
        return [0.0, 0.0]
    p = aciertos / n
    c = (p + z * z / (2 * n)) / (1 + z * z / n)
    d = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / (1 + z * z / n)
    return [round(c - d, 4), round(c + d, 4)]


def metricas(p, y, clases, umbral=None, modelo=None):
    pred, conf = p.argmax(1), p.max(1)
    K, n = len(clases), len(y)
    mc = np.zeros((K, K), int)
    for a, b in zip(y, pred):
        mc[a, b] += 1
    por_clase, f1s = {}, []
    for k, c in enumerate(clases):
        tp, sop, prd = mc[k, k], mc[k].sum(), mc[:, k].sum()
        prec = tp / prd if prd else 0.0
        rec = tp / sop if sop else 0.0
        f1 = 2 * prec * rec / (prec + rec) if prec + rec else 0.0
        por_clase[c] = dict(n=int(sop), precision=round(prec, 4), recall=round(rec, 4), f1=round(f1, 4))
        if sop:
            f1s.append(f1)
    acc = float((pred == y).mean()) if n else 0.0
    bins = np.linspace(0, 1, 11)
    ece = sum(abs((pred[s] == y[s]).mean() - conf[s].mean()) * s.mean()
              for s in [(conf > a) & (conf <= b) for a, b in zip(bins[:-1], bins[1:])] if s.any())
    r = dict(n=int(n), accuracy=round(acc, 4), accuracy_ic95=wilson(int((pred == y).sum()), n),
             f1_macro=round(float(np.mean(f1s)) if f1s else 0.0, 4), ece=round(float(ece), 4),
             por_clase=por_clase, matriz_confusion=mc.tolist(),
             clases_sin_fotos=[c for c in clases if por_clase[c]["n"] == 0])
    if umbral is not None:
        resp = conf >= umbral
        if modelo == "maiz" and "maiz_gusano_cogollero" in clases and "maiz_tizon_hoja" in clases:
            i_cog = clases.index("maiz_gusano_cogollero")
            i_tiz = clases.index("maiz_tizon_hoja")
            dif = np.abs(p[:, i_cog] - p[:, i_tiz])
            conflicto = ((pred == i_cog) | (pred == i_tiz)) & (dif < 0.15)
            resp = resp & (~conflicto)
        r["con_umbral"] = dict(umbral=umbral, cobertura=round(float(resp.mean()), 4),
                               accuracy_respondidas=round(float((pred[resp] == y[resp]).mean()) if resp.any() else 0.0, 4))
    return r


def elegir_temperatura(logits, y, grupos):
    mejor = (1e9, 1.0)
    for T in np.linspace(0.5, 5.0, 46):
        p = probabilidades(logits, T, grupos, y)
        nll = -np.log(p[np.arange(len(y)), y] + 1e-12).mean()
        mejor = min(mejor, (nll, float(T)))
    return round(mejor[1], 2)


def elegir_umbral(p, y, objetivo, clases=None, modelo=None):
    pred, conf = p.argmax(1), p.max(1)
    opciones = []
    conflicto = np.zeros(len(y), dtype=bool)
    if modelo == "maiz" and clases and "maiz_gusano_cogollero" in clases and "maiz_tizon_hoja" in clases:
        i_cog = clases.index("maiz_gusano_cogollero")
        i_tiz = clases.index("maiz_tizon_hoja")
        dif = np.abs(p[:, i_cog] - p[:, i_tiz])
        conflicto = ((pred == i_cog) | (pred == i_tiz)) & (dif < 0.15)
    for t in np.arange(0.30, 0.96, 0.01):
        resp = (conf >= t) & (~conflicto)
        if resp.mean() < 0.3:
            break
        opciones.append((round(float(t), 2), float((pred[resp] == y[resp]).mean()), float(resp.mean())))
    for t, acc, cob in opciones:
        if acc >= objetivo:
            return t, True
    return (max(opciones, key=lambda o: o[1])[0] if opciones else 0.5), False


# ------------------------------------------------------------ entrenamiento
@torch.no_grad()
def predecir(red, cargador, tta=True):
    red.eval()
    L, Y = [], []
    for x, y in cargador:
        x = x.to(DISP, non_blocking=True).to(memory_format=torch.channels_last)
        with torch.autocast(DISP, enabled=DISP == "cuda"):
            l = red(x)
            if tta:
                l = (l + red(torch.flip(x, dims=[3]))) / 2
        L.append(l.float().cpu())
        Y.append(y)
    return torch.cat(L).numpy(), torch.cat(Y).numpy()


def entrenar_backbone(backbone, muestras, clases, r, grupos, prueba, modelo=None):
    tr = [m for m in muestras if m["split"] == "train"]
    va = [m for m in muestras if m["split"] == "val"]
    fondos = [m["ruta"] for m in tr if m["campo"]][:3000]
    cuenta = np.bincount([m["y"] for m in tr], minlength=len(clases))
    sobremuestreo = r.get("sobremuestreo", {})
    pesos = [(1 / math.sqrt(cuenta[m["y"]])) * sobremuestreo.get(clases[m["y"]], 1.0)
             * (r["peso_campo"] if m["campo"] else 1.0) for m in tr]
    nw = min(8, os.cpu_count() or 2)
    escala_min = r.get("escala_recorte_min", 0.35)
    ctr = DataLoader(Conjunto(tr, r["tam"], True, fondos, escala_min=escala_min, cultivo=modelo),
                     r["lote"], num_workers=nw, pin_memory=True,
                     sampler=WeightedRandomSampler(pesos, r["muestras_por_epoca"], replacement=True),
                     drop_last=True, persistent_workers=nw > 0)
    cva = DataLoader(Conjunto(va, r["tam"]), r["lote"] * 2, num_workers=nw)

    red = FitoNet(backbone, len(clases), preentrenado=not prueba).to(DISP).to(memory_format=torch.channels_last)
    pesos_perdida = None
    if "peso_perdida" in r:
        pesos_perdida = torch.tensor([r["peso_perdida"].get(c, 1.0) for c in clases],
                                     dtype=torch.float, device=DISP)
    criterio = nn.CrossEntropyLoss(weight=pesos_perdida, label_smoothing=r["suavizado"])
    escalador = torch.amp.GradScaler(enabled=DISP == "cuda")

    def una_epoca(opt, sched=None):
        red.train()
        total, t0 = 0.0, time.time()
        for x, y in ctr:
            x = x.to(DISP, non_blocking=True).to(memory_format=torch.channels_last)
            y = y.to(DISP)
            with torch.autocast(DISP, enabled=DISP == "cuda"):
                perdida = criterio(red(x), y)
            opt.zero_grad(set_to_none=True)
            escalador.scale(perdida).backward()
            escalador.unscale_(opt)
            nn.utils.clip_grad_norm_(red.parameters(), 2.0)
            escalador.step(opt)
            escalador.update()
            if sched:
                sched.step()
            total += perdida.item()
        return total / max(1, len(ctr)), time.time() - t0

    def f1_val():
        l, y = predecir(red, cva, tta=False)
        return metricas(probabilidades(l, 1.0, grupos, y), y, clases, modelo=modelo)["f1_macro"]

    # fase 1: solo la cabeza
    for p in red.base.parameters():
        p.requires_grad = False
    for p in red.cabeza():
        p.requires_grad = True
    opt = torch.optim.AdamW(red.cabeza(), lr=r["lr_cabeza"], weight_decay=1e-4)
    for e in range(r["epocas_cabeza"]):
        perd, s = una_epoca(opt)
        log(f"{backbone} cabeza {e + 1}/{r['epocas_cabeza']} pérdida={perd:.3f} f1_val={f1_val():.4f} ({s:.0f}s)")

    # fase 2: ajuste fino completo, coseno con calentamiento
    for p in red.parameters():
        p.requires_grad = True
    opt = torch.optim.AdamW(red.parameters(), lr=r["lr"], weight_decay=r["wd"])
    pasos = r["epocas"] * len(ctr)
    cal = max(1, int(0.05 * pasos))
    sched = torch.optim.lr_scheduler.LambdaLR(
        opt, lambda i: (i + 1) / cal if i < cal else 0.5 * (1 + math.cos(math.pi * (i - cal) / max(1, pasos - cal))))
    mejor, estado, sin_mejora = -1.0, None, 0
    for e in range(r["epocas"]):
        perd, s = una_epoca(opt, sched)
        f1 = f1_val()
        log(f"{backbone} época {e + 1}/{r['epocas']} pérdida={perd:.3f} f1_val_campo={f1:.4f} ({s:.0f}s)")
        if f1 > mejor:
            mejor, estado, sin_mejora = f1, copy.deepcopy(red.state_dict()), 0
        else:
            sin_mejora += 1
            if sin_mejora >= r["paciencia"]:
                log("parada temprana")
                break
    red.load_state_dict(estado)
    return red, mejor, cva


def latencia_y_paridad(ruta_onnx, red, cva, tam):
    import onnxruntime as ort
    so = ort.SessionOptions()
    so.intra_op_num_threads = min(4, os.cpu_count() or 1)
    ses = ort.InferenceSession(ruta_onnx, so, providers=["CPUExecutionProvider"])
    x, _ = next(iter(cva))
    x = x[:4]
    ref = ParaExportar(copy.deepcopy(red).cpu().float(), True)(x)[0].detach().numpy()
    out = ses.run(None, {"imagen": x.numpy()})
    dif = float(np.abs(out[0] - ref).max())
    uno = x[:1].numpy()
    for _ in range(5):
        ses.run(None, {"imagen": uno})
    tiempos = []
    for _ in range(30):
        t0 = time.perf_counter()
        ses.run(None, {"imagen": uno})
        tiempos.append((time.perf_counter() - t0) * 1000)
    return round(float(np.median(tiempos)), 1), dif, list(out[1].shape[2:])


def sha256(ruta):
    h = hashlib.sha256()
    with open(ruta, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--modelo", required=True, choices=list(catalogo.CLASES))
    ap.add_argument("--trabajo", default="/kaggle/working/fitolens")
    ap.add_argument("--salida", default="/kaggle/working/salida")
    ap.add_argument("--backbones", nargs="*")
    ap.add_argument("--version", default=datetime.date.today().strftime("%Y.%m.%d"))
    ap.add_argument("--prueba", action="store_true", help="datos falsos y red mínima, para probar el pipeline")
    a = ap.parse_args()

    r = catalogo.receta(a.modelo)
    if a.prueba:
        r.update(backbones=["resnet18"], tam=64, lote=8, epocas_cabeza=1, epocas=1, muestras_por_epoca=64)
    if a.backbones:
        r["backbones"] = a.backbones
    random.seed(r["semilla"]); np.random.seed(r["semilla"]); torch.manual_seed(r["semilla"])
    os.makedirs(a.trabajo, exist_ok=True)
    log(f"modelo={a.modelo} dispositivo={DISP} receta={r}")

    muestras, clases, info = datos.preparar(a.modelo, a.trabajo, r["semilla"], a.prueba)
    if not any(m["split"] == "val" for m in muestras) or not any(m["split"] == "test" for m in muestras):
        raise RuntimeError("No hay fotos de campo para validación o prueba: revisa las fuentes.")
    grupos = None
    if a.modelo == "hortalizas":
        cult = sorted({c.split("_")[0] for c in clases})
        grupos = np.array([cult.index(c.split("_")[0]) for c in clases])

    tmp = os.path.join(a.trabajo, "candidatos")
    os.makedirs(tmp, exist_ok=True)
    candidatos = []
    for bb in r["backbones"]:
        red, f1_sin_tta, cva = entrenar_backbone(bb, muestras, clases, r, grupos, a.prueba, modelo=a.modelo)
        lv, yv = predecir(red, cva, r["tta"])
        T = elegir_temperatura(lv, yv, grupos)
        pv = probabilidades(lv, T, grupos, yv)
        umbral, alcanzado = elegir_umbral(pv, yv, r["precision_objetivo"], clases=clases, modelo=a.modelo)
        f1v = metricas(pv, yv, clases, modelo=a.modelo)["f1_macro"]
        ruta = os.path.join(tmp, bb.replace("/", "_") + ".onnx")
        exportar_onnx(copy.deepcopy(red).cpu().float(), ruta, r["tam"], r["tta"])
        lat, dif, cam_hw = latencia_y_paridad(ruta, red, cva, r["tam"])
        log(f"{bb}: f1_val_campo={f1v:.4f} T={T} umbral={umbral} latencia_cpu={lat}ms dif_onnx={dif:.2e}")
        if dif > 1e-2:
            log("AVISO: el ONNX difiere de PyTorch más de 1e-2")
        candidatos.append(dict(backbone=bb, red=red.cpu(), f1_val=f1v, T=T, umbral=umbral, alcanzado=alcanzado,
                               onnx=ruta, latencia_ms=lat, dif_onnx=dif, cam_hw=cam_hw))
        torch.cuda.empty_cache()

    validos = [c for c in candidatos if c["latencia_ms"] <= r["latencia_max_ms"]] or candidatos
    c = max(validos, key=lambda c: c["f1_val"])      # se elige con VALIDACIÓN, nunca con la prueba
    log(f"elegido: {c['backbone']}")

    # informe final con la prueba de campo (no se tocó antes)
    red = c["red"].to(DISP)
    conj = lambda sp: DataLoader(Conjunto([m for m in muestras if m["split"] == sp], r["tam"]), r["lote"] * 2,
                                 num_workers=min(8, os.cpu_count() or 2))
    lt, yt = predecir(red, conj("test"), r["tta"])
    campo = metricas(probabilidades(lt, c["T"], grupos, yt), yt, clases, c["umbral"], modelo=a.modelo)
    campo_sin_filtro = metricas(probabilidades(lt, c["T"]), yt, clases, modelo=a.modelo) if grupos is not None else None
    lab = None
    if any(m["split"] == "lab_prueba" for m in muestras):
        ll, yl = predecir(red, conj("lab_prueba"), r["tta"])
        lab = metricas(probabilidades(ll, c["T"], grupos, yl), yl, clases, modelo=a.modelo)
    log(f"PRUEBA DE CAMPO: n={campo['n']} accuracy={campo['accuracy']} IC95={campo['accuracy_ic95']} "
        f"f1_macro={campo['f1_macro']} | con umbral {c['umbral']}: {campo['con_umbral']}")

    if a.modelo == "maiz":
        log("==================== EVALUACIÓN MODELO MAÍZ ====================")
        log(f"Accuracy de campo: {campo['accuracy']:.4f} (IC95: {campo['accuracy_ic95']})")
        log("Matriz de confusión de campo:")
        log(f"{'':>25} " + " ".join(f"{c[:10]:>10}" for c in clases))
        for idx_c, fila in enumerate(campo["matriz_confusion"]):
            log(f"{clases[idx_c]:>25} " + " ".join(f"{v:10d}" for v in fila))

        from .aumentos import cargar_como_api
        from PIL import Image
        import glob
        candidatos_campo = [
            os.path.join(a.trabajo, "fotos_campo"),
            os.path.join(os.getcwd(), "entrenamiento", "fotos_campo"),
            os.path.join(os.getcwd(), "fotos_campo"),
            os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "fotos_campo")),
        ]
        if os.path.isdir(datos.KAGGLE_INPUT):
            for nom in ("fotos_campo", "fitolens-fotos-campo", "fotos-campo"):
                d = datos._buscar_input(nom)
                if d:
                    candidatos_campo.append(d)

        fotos_campo_encontradas = []
        for c_dir in candidatos_campo:
            if os.path.isdir(c_dir):
                for p in glob.glob(os.path.join(c_dir, "**", "*"), recursive=True):
                    if p.lower().endswith(datos.EXT) and p not in fotos_campo_encontradas:
                        fotos_campo_encontradas.append(p)

        if not any("ronald_huecos" in os.path.basename(p).lower() for p in fotos_campo_encontradas):
            for p_alt in [
                os.path.join(os.getcwd(), "api", "pruebas", "huecos", "fotos", "maiz_gusano_cogollero", "ronald_huecos.jpg"),
                os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "api", "pruebas", "huecos", "fotos", "maiz_gusano_cogollero", "ronald_huecos.jpg")),
                os.path.join(os.getcwd(), "entrenamiento", "fotos_propias", "maiz_gusano_cogollero", "ronald_huecos.jpg"),
                os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "fotos_propias", "maiz_gusano_cogollero", "ronald_huecos.jpg")),
            ]:
                if os.path.exists(p_alt) and p_alt not in fotos_campo_encontradas:
                    fotos_campo_encontradas.append(p_alt)

        log(f"Predicciones para fotos de campo ({len(fotos_campo_encontradas)} fotos) SIN reglas:")
        pred_ronald = None
        conf_ronald = 0.0
        red.eval()
        for ruta_f in fotos_campo_encontradas:
            nom = os.path.basename(ruta_f)
            img = Image.open(ruta_f)
            t_img = cargar_como_api(img, r["tam"]).unsqueeze(0).to(DISP)
            with torch.no_grad():
                l = red(t_img)
                if r["tta"]:
                    l = (l + red(torch.flip(t_img, dims=[3]))) / 2
                probs = torch.softmax(l, dim=1).cpu().numpy()[0]
            pred_k = int(np.argmax(probs))
            clase_pred = clases[pred_k]
            conf = float(probs[pred_k])
            log(f"   {nom:35} -> {clase_pred:25} (conf: {conf:.1%}) [SIN reglas]")
            if "ronald_huecos" in nom.lower():
                pred_ronald = clase_pred
                conf_ronald = conf

        if not a.prueba:
            assert campo["accuracy"] >= 0.959, (
                f"FALLO VISIBLE: Accuracy de campo {campo['accuracy']:.4f} baja del mínimo de 95.9 % (0.9590)."
            )
            if pred_ronald is not None:
                assert pred_ronald == "maiz_gusano_cogollero", (
                    f"FALLO VISIBLE: La foto de Ronald no salió 'maiz_gusano_cogollero' (dio '{pred_ronald}' conf={conf_ronald:.1%})."
                )
            else:
                log("AVISO: No se encontró la foto de Ronald para validación directa.")

    # carpeta final con el contrato de la API
    dest = os.path.join(a.salida, a.modelo)
    shutil.rmtree(dest, ignore_errors=True)
    os.makedirs(dest)
    shutil.copy(c["onnx"], os.path.join(dest, "model.onnx"))
    manifest = dict(
        nombre=a.modelo, version=a.version, tipo="router" if a.modelo == "router" else "especialista",
        backbone=c["backbone"],
        clases=[dict(id=k, nombre=n, etiqueta=catalogo.ETIQUETAS.get(n, n),
                     cultivo=n if a.modelo == "router" else n.split("_")[0],
                     sana=n.endswith("_sana")) for k, n in enumerate(clases)],
        entrada=dict(alto=r["tam"], ancho=r["tam"], formato="RGB", rango=[0, 1], redimension="directa",
                     interpolacion="bilinear", orientacion_exif=True, layout="NCHW"),
        salidas=dict(logits="logits", cam="cam", cam_tam=c["cam_hw"], tta_incluido=r["tta"]),
        temperatura=c["T"], umbral=c["umbral"], sha256=sha256(os.path.join(dest, "model.onnx")),
        entrenado=dict(fecha=datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
                       datasets=info["datasets"], receta={k: v for k, v in r.items() if k != "backbones"}),
    )
    if a.modelo == "router":
        manifest["rechazo"] = catalogo.RECHAZO
        manifest["especialistas"] = catalogo.ESPECIALISTA_DE_CULTIVO
    if a.modelo == "maiz":
        manifest["regla_no_seguro"] = dict(
            par=["maiz_gusano_cogollero", "maiz_tizon_hoja"],
            margen_minimo=0.15,
            resultado="no_concluyente",
            motivo="Ambigüedad entre daño de gusano cogollero y tizón foliar",
        )
    metr = dict(
        modelo=a.modelo, version=a.version, backbone=c["backbone"],
        campo=campo, laboratorio=dict(accuracy=lab["accuracy"], n=lab["n"]) if lab else None,
        latencia_ms=c["latencia_ms"],
        nota=("Prueba solo con fotos de campo que no se usaron para entrenar ni para elegir épocas, "
              "temperatura, umbral ni backbone." +
              (" En hortalizas las probabilidades se calculan solo entre las clases del cultivo, como hace la API "
               "cuando el router acierta el cultivo." if grupos is not None else "")),
        campo_sin_filtro_cultivo=campo_sin_filtro,
        validacion=dict(f1_macro=c["f1_val"], precision_objetivo=r["precision_objetivo"],
                        precision_objetivo_alcanzada=c["alcanzado"]),
        candidatos=[{k: v for k, v in x.items() if k not in ("red", "onnx")} for x in candidatos],
        datos=dict(conteos=info["conteos"], clases_quitadas=info["clases_quitadas"]),
    )
    json.dump(manifest, open(os.path.join(dest, "manifest.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    json.dump(metr, open(os.path.join(dest, "metricas.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    zip_ = shutil.make_archive(os.path.join(a.salida, f"modelo_{a.modelo}"), "zip", a.salida, a.modelo)
    log(f"listo: {dest}  ->  descarga {zip_}")


if __name__ == "__main__":
    main()
