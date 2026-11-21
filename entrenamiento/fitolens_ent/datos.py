"""Descarga, etiquetado, deduplicación y partición de los datos.

Reglas de partición (las que hacen honesta la métrica de campo):
- Solo las fotos de CAMPO entran en validación y prueba. Las de laboratorio van a entrenamiento
  (y un 10 % a "lab_prueba", solo para informar el acierto en laboratorio).
- Las fotos casi idénticas (mismo hash perceptual) forman un grupo y el grupo entero cae en una sola partición.
- La prueba no se usa para nada más que el informe final.
"""
import csv, glob, hashlib, json, os, random, re, shutil, subprocess, zipfile
from collections import Counter, defaultdict
from multiprocessing import Pool

from PIL import Image, ImageOps

from . import catalogo, reglas

EXT = (".jpg", ".jpeg", ".png", ".bmp", ".webp")
KAGGLE_INPUT = "/kaggle/input"
LADO_CACHE = 512


def log(*a):
    print("[datos]", *a, flush=True)


# ------------------------------------------------------------ descarga
def _bajar(urls, destino):
    os.makedirs(os.path.dirname(destino), exist_ok=True)
    for url in urls:
        r = subprocess.run(["wget", "-q", "-c", "--tries=5", "--waitretry=30", "-O", destino, url])
        if r.returncode == 0 and zipfile.is_zipfile(destino):
            return
        log(f"falló {url} (código {r.returncode})")
    raise RuntimeError("ninguna URL funcionó")


def _descomprimir(zip_path, carpeta, extraer=None, borrar=True):
    with zipfile.ZipFile(zip_path) as z:
        miembros = [m for m in z.namelist() if not extraer or any(p in m for p in extraer)]
        z.extractall(carpeta, members=miembros)
    if borrar:
        os.remove(zip_path)
    for interno in glob.glob(os.path.join(carpeta, "**", "*.zip"), recursive=True):  # zips dentro de zips
        _descomprimir(interno, os.path.splitext(interno)[0])


def _buscar_input(nombre):
    """Busca en /kaggle/input una carpeta con ese nombre (hasta 5 niveles; '_' y '-' dan igual)."""
    objetivo = nombre.lower().replace("_", "-")
    if not os.path.isdir(KAGGLE_INPUT):
        return None
    for raiz, dirs, _ in os.walk(KAGGLE_INPUT):
        if raiz[len(KAGGLE_INPUT):].count(os.sep) >= 5:
            dirs[:] = []
            continue
        for d in dirs:
            if d.lower().replace("_", "-") == objetivo:
                return os.path.join(raiz, d)
    return None


def obtener(clave, cfg, raiz):
    """Devuelve la carpeta local con el dataset: primero /kaggle/input, si no, lo descarga."""
    destino = os.path.join(raiz, clave)
    if os.path.isdir(destino) and os.listdir(destino):
        return destino
    candidatos = [f"fitolens-{clave}"] + ([cfg["ref"].split("/")[1]] if cfg["tipo"] == "kaggle" else [])
    for nombre in candidatos:
        d = _buscar_input(nombre)
        if d:
            zips = glob.glob(os.path.join(d, "**", "*.zip"), recursive=True)
            if zips:   # subido como zip sin descomprimir: se extrae en la carpeta de trabajo
                for z in zips:
                    _descomprimir(z, destino, cfg.get("extraer"), borrar=False)
                return destino
            log(f"{clave}: usando {d}")
            return d
    t = cfg["tipo"]
    log(f"{clave}: descargando ({t})")
    if t == "kaggle":
        try:
            import kagglehub
            d = kagglehub.dataset_download(cfg["ref"])
            if d and os.path.isdir(d):
                log(f"{clave}: descargado con kagglehub en {d}")
                return d
        except Exception as e_kh:
            log(f"{clave}: kagglehub no pudo descargarlo ({e_kh})")
        raise RuntimeError(f"agrega el dataset con '+ Add Input': kaggle.com/datasets/{cfg['ref']}")
    if t == "git":
        subprocess.run(["git", "clone", "-q", "--depth", "1", cfg["url"], destino], check=True)
        return destino
    if t == "mendeley":
        i, v = cfg["id"], cfg["version"]
        urls = [f"https://data.mendeley.com/public-api/zip/{i}/download/{v}",
                f"https://prod-dcd-datasets-cache-zipfiles.s3.eu-west-1.amazonaws.com/{i}-{v}.zip"]
    else:
        urls = [cfg["url"]]
    z = destino + ".zip"
    _bajar(urls, z)
    _descomprimir(z, destino, cfg.get("extraer"))
    return destino


# ------------------------------------------------------------ índice
def _cajas_yolo(txt, nombres):
    """Lee un .txt YOLO (cajas o polígonos) y devuelve [(clase, x0, y0, x1, y1)] en coordenadas 0-1."""
    cajas = []
    for linea in open(txt, encoding="utf-8", errors="ignore"):
        v = linea.split()
        if len(v) < 5:
            continue
        c, nums = int(float(v[0])), [float(x) for x in v[1:]]
        if len(nums) == 4:   # cx cy w h
            cx, cy, w, h = nums
            caja = (cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2)
        else:                # polígono x1 y1 x2 y2 ...
            xs, ys = nums[0::2], nums[1::2]
            caja = (min(xs), min(ys), max(xs), max(ys))
        cajas.append((nombres[c] if c < len(nombres) else str(c), *caja))
    return cajas


def _nombres_yolo(carpeta):
    for patron in ("**/*.names", "**/classes.txt", "**/_darknet.labels"):
        for f in glob.glob(os.path.join(carpeta, patron), recursive=True):
            return [l.strip() for l in open(f, encoding="utf-8") if l.strip()]
    for f in glob.glob(os.path.join(carpeta, "**/data.yaml"), recursive=True):
        m = re.search(r"names:\s*\[(.*?)\]", open(f, encoding="utf-8").read(), re.S)
        if m:
            return [x.strip(" '\"\n") for x in m.group(1).split(",")]
    return []


def indexar(clave, cfg, carpeta):
    regla = getattr(reglas, cfg["regla"])
    imgs = [p for p in glob.glob(os.path.join(carpeta, "**", "*"), recursive=True) if p.lower().endswith(EXT)]
    if cfg.get("incluir"):
        imgs = [p for p in imgs if cfg["incluir"] in p.replace("\\", "/").lower()]
    txts = {}
    nombres = []
    if cfg.get("recorte_yolo"):
        nombres = _nombres_yolo(carpeta)
        for t in glob.glob(os.path.join(carpeta, "**", "*.txt"), recursive=True):
            txts.setdefault(os.path.splitext(os.path.basename(t))[0], t)
    muestras, resumen = [], Counter()
    for p in imgs:
        rel = os.path.relpath(p, carpeta).replace("\\", "/")
        carp = os.path.basename(os.path.dirname(p))
        split = None
        if cfg.get("split_por_carpeta"):
            split = "test" if "/test/" in f"/{rel.lower()}" else "pool"
        base = dict(ruta=p, fuente=clave, campo=cfg["campo"], split_fijo=split, caja=None)
        txt = txts.get(os.path.splitext(os.path.basename(p))[0])
        if cfg.get("recorte_yolo") and txt:
            for nom, *caja in _cajas_yolo(txt, nombres):
                et = regla(nom, cfg) if cfg["regla"] == "cacao_yolo" else regla(carp, cfg)
                resumen[(nom if cfg["regla"] == "cacao_yolo" else carp, et)] += 1
                if et and (caja[2] - caja[0]) * (caja[3] - caja[1]) > 0.004:
                    muestras.append(dict(base, etiqueta=et, caja=caja))
        else:
            et = regla(carp, cfg)
            resumen[(carp, et)] += 1
            if et:
                muestras.append(dict(base, etiqueta=et))
    log(f"{clave}: {len(imgs)} imágenes, {len(muestras)} muestras. Carpeta -> etiqueta:")
    for (c, e), n in sorted(resumen.items(), key=lambda x: -x[1])[:40]:
        log(f"   {c!r:45} -> {e} ({n})")
    return muestras


# ------------------------------------------------------------ caché redimensionada + hash perceptual
def _cachear(args):
    m, carpeta_cache, con_hash = args
    clave = hashlib.md5((m["ruta"] + str(m["caja"])).encode()).hexdigest()
    destino = os.path.join(carpeta_cache, m["fuente"], clave + ".jpg")
    try:
        if not os.path.exists(destino):
            img = ImageOps.exif_transpose(Image.open(m["ruta"])).convert("RGB")
            if m["caja"]:
                W, H = img.size
                x0, y0, x1, y1 = m["caja"]
                mx, my = (x1 - x0) * 0.15, (y1 - y0) * 0.15
                img = img.crop((max(0, (x0 - mx) * W), max(0, (y0 - my) * H),
                                min(W, (x1 + mx) * W), min(H, (y1 + my) * H)))
            img.thumbnail((LADO_CACHE, LADO_CACHE), Image.BILINEAR)
            os.makedirs(os.path.dirname(destino), exist_ok=True)
            img.save(destino, quality=95)
        grupo = clave
        if con_hash:
            import imagehash
            grupo = str(imagehash.phash(Image.open(destino)))
        return destino, grupo
    except Exception as e:  # foto corrupta
        return None, str(e)


def sincronizar_foto_ronald():
    """Copia la foto de Ronald api/pruebas/huecos/fotos/maiz_gusano_cogollero/ronald_huecos.jpg
    a entrenamiento/fotos_campo y entrenamiento/fotos_propias si existe."""
    posibles = [
        os.path.join(os.getcwd(), "api", "pruebas", "huecos", "fotos", "maiz_gusano_cogollero", "ronald_huecos.jpg"),
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "api", "pruebas", "huecos", "fotos", "maiz_gusano_cogollero", "ronald_huecos.jpg")),
    ]
    origen = next((p for p in posibles if os.path.exists(p)), None)
    if not origen:
        return
    raiz_ent = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    destinos = [
        os.path.join(raiz_ent, "fotos_campo", "maiz_gusano_cogollero", "ronald_huecos.jpg"),
        os.path.join(raiz_ent, "fotos_campo", "ronald_huecos.jpg"),
        os.path.join(raiz_ent, "fotos_propias", "maiz_gusano_cogollero", "ronald_huecos.jpg"),
    ]
    for d in destinos:
        try:
            if not os.path.exists(d):
                os.makedirs(os.path.dirname(d), exist_ok=True)
                shutil.copy2(origen, d)
                log(f"foto de Ronald sincronizada en {d}")
        except Exception as e:
            log(f"no se pudo copiar foto de Ronald a {d}: {e}")


def buscar_fotos_propias(trabajo):
    """Localiza la carpeta de fotos propias del usuario."""
    sincronizar_foto_ronald()
    candidatos = [
        os.path.join(trabajo, "fotos_propias"),
        os.path.join(os.getcwd(), "entrenamiento", "fotos_propias"),
        os.path.join(os.getcwd(), "fotos_propias"),
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "fotos_propias")),
    ]
    if os.path.isdir(KAGGLE_INPUT):
        for nombre in ("fotos_propias", "fitolens-fotos-propias", "fotos-propias"):
            d = _buscar_input(nombre)
            if d:
                candidatos.append(d)
    for c in candidatos:
        if os.path.isdir(c):
            imgs = [p for p in glob.glob(os.path.join(c, "**", "*"), recursive=True) if p.lower().endswith(EXT)]
            if imgs:
                return c
    return None


def indexar_fotos_propias(carpeta, modelo, clases):
    """Indexa entrenamiento/fotos_propias/<clase>/*.jpg.
    - La foto ronald_huecos.jpg queda como prueba de campo (split='test', no entrenamiento).
    - Las demás fotos se suman al entrenamiento (split='train') con peso alto (repetidas 5 veces con aumentos).
    """
    muestras = []
    imgs = [p for p in glob.glob(os.path.join(carpeta, "**", "*"), recursive=True) if p.lower().endswith(EXT)]
    for p in imgs:
        carp = os.path.basename(os.path.dirname(p))
        nom = os.path.basename(p).lower()
        et = None
        if carp in clases:
            et = carp
        elif modelo == "maiz":
            et = reglas.maiz(carp, {})
            if et not in clases:
                et = None
        else:
            et = reglas.etiqueta_para_modelo(carp, modelo, clases)
        if not et:
            continue
        es_ronald = "ronald_huecos" in nom
        if es_ronald:
            muestras.append(dict(
                ruta=p, fuente="fotos_propias", campo=True, split_fijo="test",
                etiqueta=et, caja=None, grupo="ronald_huecos"
            ))
        else:
            # 5 repeticiones para peso alto con aumentos en entrenamiento
            for rep in range(5):
                muestras.append(dict(
                    ruta=p, fuente="fotos_propias", campo=True, split_fijo="train",
                    etiqueta=et, caja=None, grupo=f"propia_{hashlib.md5(p.encode()).hexdigest()[:8]}_{rep}"
                ))
    log(f"fotos_propias: {len(imgs)} imágenes en {carpeta} -> {len(muestras)} muestras generadas (5x peso entrenamiento)")
    return muestras


def _partir(muestras, semilla):
    """Asigna train / val / test / lab_prueba respetando grupos."""
    rnd = random.Random(semilla)
    grupos = defaultdict(list)
    for m in muestras:
        grupos[(m["fuente"], m["grupo"])].append(m)
    asignado = {}
    por_fuente_et = defaultdict(list)
    for g, ms in grupos.items():
        m0 = ms[0]
        if not m0["campo"]:
            asignado[g] = "lab_prueba" if rnd.random() < 0.10 else "train"
        elif m0["split_fijo"] == "test":
            asignado[g] = "test"
        elif m0["split_fijo"] == "train":
            asignado[g] = "train"
        else:
            por_fuente_et[(m0["fuente"], m0["etiqueta"], m0["split_fijo"])].append(g)
    for (fuente, et, fijo), gs in por_fuente_et.items():
        rnd.shuffle(gs)
        n = len(gs)
        if fijo == "pool":            # PlantDoc ya trae su "test": del resto, 15 % a validación
            n_val, n_test = round(n * 0.15), 0
        else:                         # 70 / 15 / 15
            n_val = n_test = round(n * 0.15)
        for i, g in enumerate(gs):
            asignado[g] = "test" if i < n_test else "val" if i < n_test + n_val else "train"
    # una foto repetida en dos fuentes: prueba > validación > entrenamiento
    prioridad = {"test": 3, "val": 2, "lab_prueba": 1, "train": 0}
    mejor = {}
    for (fuente, grupo), sp in asignado.items():
        if prioridad[sp] > prioridad.get(mejor.get(grupo), -1):
            mejor[grupo] = sp
    for m in muestras:
        sp = asignado[(m["fuente"], m["grupo"])]
        m["split"] = sp if mejor[m["grupo"]] == sp else None   # copia en otra partición: se descarta
    return [m for m in muestras if m["split"]]


def preparar(modelo, trabajo, semilla=42, prueba=False):
    """Devuelve (muestras, clases, info). Cada muestra: ruta (caché), y (índice), campo, split, fuente."""
    clases = list(catalogo.CLASES[modelo])
    indice_csv = os.path.join(trabajo, f"indice_{modelo}.csv")
    if prueba:
        muestras = _datos_falsos(clases, os.path.join(trabajo, "falsos"))
    elif os.path.exists(indice_csv):
        log(f"reutilizando {indice_csv}")
        muestras = [dict(r, campo=r["campo"] == "True") for r in csv.DictReader(open(indice_csv, encoding="utf-8"))]
    else:
        muestras, fallos = [], []
        for clave, cfg in catalogo.FUENTES.items():
            if modelo not in cfg["modelos"] or not cfg.get("activo", True):
                continue
            try:
                carpeta = obtener(clave, cfg, os.path.join(trabajo, "fuentes"))
                ms = indexar(clave, cfg, carpeta)
            except Exception as e:
                if cfg["requerido"]:
                    raise RuntimeError(f"No se pudo obtener '{clave}' ({e}). Súbelo a Kaggle como dataset "
                                       f"'fitolens-{clave.replace('_', '-')}' y agrégalo con '+ Add Input'.") from e
                log(f"AVISO: se omite {clave}: {e}")
                fallos.append(clave)
                continue
            rnd = random.Random(semilla)
            por_et = defaultdict(list)
            for m in ms:
                et = reglas.etiqueta_para_modelo(m["etiqueta"], modelo, clases)
                if et:
                    por_et[et].append(dict(m, etiqueta=et))
            for et, lista in por_et.items():
                rnd.shuffle(lista)
                muestras += lista[: catalogo.receta(modelo)["max_por_clase_y_fuente"]]
        # Incorporar fotos propias del usuario (entrenamiento/fotos_propias/<clase>/*.jpg)
        carpeta_propias = buscar_fotos_propias(trabajo)
        if carpeta_propias:
            ms_propias = indexar_fotos_propias(carpeta_propias, modelo, clases)
            muestras += ms_propias
        log(f"cacheando {len(muestras)} fotos (redimensión a {LADO_CACHE}px y hash perceptual)")
        cache = os.path.join(trabajo, "cache")
        with Pool(os.cpu_count()) as pool:
            res = pool.map(_cachear, [(m, cache, m["campo"]) for m in muestras], chunksize=64)
        ok = []
        for m, (ruta, grupo) in zip(muestras, res):
            if ruta:
                ok.append(dict(m, ruta=ruta, grupo=grupo))
        log(f"{len(muestras) - len(ok)} fotos ilegibles descartadas")
        muestras = _partir(ok, semilla)
        with open(indice_csv, "w", newline="", encoding="utf-8") as f:
            campos = ["ruta", "etiqueta", "fuente", "campo", "split", "grupo"]
            w = csv.DictWriter(f, fieldnames=campos, extrasaction="ignore")
            w.writeheader()
            w.writerows(muestras)
    # clases sin suficientes fotos de entrenamiento: se quitan y se avisa
    n_train = Counter(m["etiqueta"] for m in muestras if m["split"] == "train")
    quitadas = [c for c in clases if n_train[c] < catalogo.MIN_FOTOS_CLASE]
    if quitadas:
        log(f"AVISO: clases quitadas por tener < {catalogo.MIN_FOTOS_CLASE} fotos de entrenamiento: {quitadas}")
        clases = [c for c in clases if c not in quitadas]
    pos = {c: i for i, c in enumerate(clases)}
    muestras = [dict(m, y=pos[m["etiqueta"]]) for m in muestras if m["etiqueta"] in pos]
    tabla = defaultdict(Counter)
    for m in muestras:
        tabla[m["etiqueta"]][m["split"]] += 1
    log("fotos por clase y partición (val y test son solo de campo):")
    for c in clases:
        t = tabla[c]
        log(f"   {c:32} train={t['train']:6} val={t['val']:5} test={t['test']:5} lab_prueba={t['lab_prueba']:5}")
    fuentes = sorted({m["fuente"] for m in muestras})
    info = dict(conteos={c: dict(tabla[c]) for c in clases}, clases_quitadas=quitadas,
                datasets=[dict(clave=f, cita=catalogo.FUENTES.get(f, {}).get("cita", f),
                               licencia=catalogo.FUENTES.get(f, {}).get("licencia", "")) for f in fuentes])
    return muestras, clases, info


def _datos_falsos(clases, carpeta):
    """Fotos sintéticas para probar el pipeline sin descargar nada (modo --prueba)."""
    import numpy as np
    rnd = np.random.default_rng(0)
    muestras = []
    for i, c in enumerate(clases):
        for j in range(60):
            ruta = os.path.join(carpeta, c, f"{j}.jpg")
            if not os.path.exists(ruta):
                os.makedirs(os.path.dirname(ruta), exist_ok=True)
                base = np.full((96, 96, 3), (i * 37) % 255, np.uint8)
                base = np.clip(base + rnd.integers(0, 60, base.shape), 0, 255).astype(np.uint8)
                Image.fromarray(base).save(ruta)
            sp = "train" if j < 40 else "val" if j < 50 else "test"
            muestras.append(dict(ruta=ruta, etiqueta=c, fuente="falsa", campo=j % 2 == 0 or sp != "train",
                                 split=sp, grupo=f"{c}{j}"))
    return muestras
