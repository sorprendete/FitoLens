"""Calibración de umbrales fuera de distribución (OOD) para FitoLens.

Calcula métricas de incertidumbre (prob_cultivo, prob_ajena, entropía normalizada,
energía del router y energía del especialista) en fotos de cultivos soportados
y ajenos, y propone umbrales U3 y U4 basados en el percentil 99.

Uso:
    python calibrar.py --modelos ../../../app/assets/modelos
    python calibrar.py --modelos ../../../app/assets/modelos --fotos dir1 dir2 --ajenas dir_ajenas
"""
import argparse
import json
import sys
from pathlib import Path

import numpy as np
import onnxruntime as ort
from PIL import Image, ImageOps

RAIZ = Path(__file__).resolve().parents[3]
EXTS_IMAGEN = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}


def logsumexp(logits: np.ndarray) -> float:
    m = float(np.max(logits))
    return float(m + np.log(np.sum(np.exp(logits - m))))


def energia(logits: np.ndarray) -> float:
    """Energía (-logsumexp de logits, antes de temperatura)."""
    return -logsumexp(logits)


def entropia_normalizada(p: np.ndarray) -> float:
    """Entropía de Shannon normalizada a [0, 1] dividiendo entre ln(K)."""
    k = len(p)
    if k <= 1:
        return 0.0
    p_pos = p[p > 0]
    h = -float(np.sum(p_pos * np.log(p_pos)))
    return float(h / np.log(k))


def softmax(logits: np.ndarray, temperatura: float = 1.0) -> np.ndarray:
    z = logits / temperatura
    e = np.exp(z - np.max(z))
    return e / np.sum(e)


def preparar_imagen(ruta: Path) -> Image.Image:
    """Replica la carga y preprocesado seguro de api/app/ia/imagen.py."""
    imagen = Image.open(ruta)
    imagen = ImageOps.exif_transpose(imagen)
    if max(imagen.size) > 512:
        imagen.thumbnail((512, 512), Image.BILINEAR)
    return imagen.convert("RGB")


def preprocesar_tensor(imagen: Image.Image, alto: int, ancho: int) -> np.ndarray:
    """RGB, redimensión directa bilineal, rango [0, 1], layout NCHW."""
    x = np.asarray(imagen.resize((ancho, alto), Image.BILINEAR), dtype=np.float32)
    return (x / 255.0).transpose(2, 0, 1)[None]


def inferir(sesion: ort.InferenceSession, imagen: Image.Image, entrada_cfg: dict, temperatura: float = 1.0):
    """Inferencia con TTA vertical (volteo arriba-abajo si la confianza es < 0.7)."""
    alto = entrada_cfg.get("alto", 256)
    ancho = entrada_cfg.get("ancho", 256)
    nombre_in = sesion.get_inputs()[0].name
    x = preprocesar_tensor(imagen, alto, ancho)
    salida = sesion.run(None, {nombre_in: x})
    logits = salida[0][0]
    p = softmax(logits, temperatura)
    if p.max() < 0.7:
        x_v = np.ascontiguousarray(x[:, :, ::-1])
        salida_v = sesion.run(None, {nombre_in: x_v})
        logits = (logits + salida_v[0][0]) / 2.0
        p = softmax(logits, temperatura)
    return logits, p


def cargar_modelos(carpeta_modelos: Path):
    """Carga modelos desde modelos.json (estilo app/assets/modelos) o carpetas manifest.json."""
    modelos_json = carpeta_modelos / "modelos.json"
    sesiones = {}
    manifests = {}
    opciones = ort.SessionOptions()
    opciones.intra_op_num_threads = 2
    opciones.inter_op_num_threads = 1

    if modelos_json.exists():
        datos = json.loads(modelos_json.read_text(encoding="utf-8"))
        for m in datos.get("modelos", []):
            nombre = m["nombre"]
            archivo = m.get("archivo", f"{nombre}.onnx")
            ruta_onnx = carpeta_modelos / archivo
            if not ruta_onnx.exists():
                ruta_onnx = carpeta_modelos / nombre / "model.onnx"
            if ruta_onnx.exists():
                sesion = ort.InferenceSession(str(ruta_onnx), opciones, providers=["CPUExecutionProvider"])
                sesiones[nombre] = sesion
                manifests[nombre] = m
    else:
        for sub in sorted(carpeta_modelos.iterdir()):
            if sub.is_dir() and (sub / "manifest.json").exists():
                m = json.loads((sub / "manifest.json").read_text(encoding="utf-8"))
                nombre = m.get("nombre", sub.name)
                ruta_onnx = sub / "model.onnx"
                if ruta_onnx.exists():
                    sesion = ort.InferenceSession(str(ruta_onnx), opciones, providers=["CPUExecutionProvider"])
                    sesiones[nombre] = sesion
                    manifests[nombre] = m

    return sesiones, manifests


def recopilar_imagenes(carpetas: list[str]) -> list[Path]:
    rutas = []
    for c in carpetas:
        p = Path(c)
        if not p.is_absolute():
            p = RAIZ / p
        if p.is_dir():
            for archivo in sorted(p.rglob("*")):
                if archivo.is_file() and archivo.suffix.lower() in EXTS_IMAGEN:
                    rutas.append(archivo)
        elif p.is_file() and p.suffix.lower() in EXTS_IMAGEN:
            rutas.append(p)
    return rutas


def procesar_foto(ruta: Path, sesion_router, manifest_router, sesiones_esp, manifests_esp):
    imagen = preparar_imagen(ruta)
    entrada_r = manifest_router.get("entrada", {})
    temp_r = manifest_router.get("temperatura", 1.0)
    logits_r, p_r = inferir(sesion_router, imagen, entrada_r, temp_r)

    clases_r = manifest_router.get("clases", [])
    ids_r = [c["id"] if isinstance(c, dict) else c for c in clases_r]
    rechazo_r = set(manifest_router.get("rechazo", ["otra_planta", "no_planta"]))

    i = int(np.argmax(p_r))
    cultivo = ids_r[i]
    prob_cultivo = float(p_r[i])
    prob_ajena = float(sum(p_r[k] for k, c_id in enumerate(ids_r) if c_id in rechazo_r))
    entropia = entropia_normalizada(p_r)
    energia_r = energia(logits_r)

    energia_esp = None
    if cultivo not in rechazo_r:
        esp_map = manifest_router.get("especialistas", {
            "pimiento": "hortalizas", "papa": "hortalizas", "tomate": "hortalizas",
            "cafe": "cafe", "cacao": "cacao", "maiz": "maiz", "limon": "citricos", "naranja": "citricos",
        })
        nombre_esp = esp_map.get(cultivo)
        if nombre_esp and nombre_esp in sesiones_esp:
            sesion_esp = sesiones_esp[nombre_esp]
            manifest_esp = manifests_esp[nombre_esp]
            entrada_e = manifest_esp.get("entrada", {})
            temp_e = manifest_esp.get("temperatura", 1.0)
            logits_e, _ = inferir(sesion_esp, imagen, entrada_e, temp_e)
            energia_esp = energia(logits_e)

    return {
        "archivo": ruta.name,
        "cultivo": cultivo,
        "prob_cultivo": prob_cultivo,
        "prob_ajena": prob_ajena,
        "entropia": entropia,
        "energia_router": energia_r,
        "energia_esp": energia_esp,
    }


def imprimir_foto(res: dict):
    esp_str = f"{res['energia_esp']:.4f}" if res["energia_esp"] is not None else "N/A"
    print(
        f"{res['archivo']}: cultivo={res['cultivo']}, prob_cultivo={res['prob_cultivo']:.4f}, "
        f"prob_ajena={res['prob_ajena']:.4f}, entropia={res['entropia']:.4f}, "
        f"energia_router={res['energia_router']:.4f}, energia_esp={esp_str}"
    )


def main():
    parser = argparse.ArgumentParser(description="Calibración OOD para router y especialistas de FitoLens")
    parser.add_argument(
        "--modelos",
        type=str,
        default=str(RAIZ / "app" / "assets" / "modelos"),
        help="Carpeta con modelos .onnx y modelos.json",
    )
    parser.add_argument(
        "--fotos",
        nargs="*",
        default=[
            str(RAIZ / "api" / "pruebas" / "segmentacion" / "datos" / "imagenes"),
            str(RAIZ / "entrenamiento" / "fotos_campo"),
        ],
        help="Carpetas con fotos de cultivos soportados",
    )
    parser.add_argument(
        "--ajenas",
        nargs="*",
        default=None,
        help="Carpetas opcionales con fotos de plantas no soportadas",
    )

    args = parser.parse_args()
    carpeta_modelos = Path(args.modelos)
    if not carpeta_modelos.is_absolute():
        carpeta_modelos = RAIZ / carpeta_modelos

    if not carpeta_modelos.exists():
        print(f"Error: la carpeta de modelos {carpeta_modelos} no existe.", file=sys.stderr)
        sys.exit(1)

    print(f"Cargando modelos desde {carpeta_modelos}...")
    sesiones, manifests = cargar_modelos(carpeta_modelos)
    if "router" not in sesiones:
        print("Error: no se encontró el modelo 'router'.", file=sys.stderr)
        sys.exit(1)

    sesion_router = sesiones["router"]
    manifest_router = manifests["router"]
    sesiones_esp = {k: v for k, v in sesiones.items() if k != "router"}
    manifests_esp = {k: v for k, v in manifests.items() if k != "router"}

    fotos_soportadas = recopilar_imagenes(args.fotos)
    print(f"\nFotos soportadas encontradas: {len(fotos_soportadas)}")

    resultados_soportadas = []
    for f in fotos_soportadas:
        try:
            r = procesar_foto(f, sesion_router, manifest_router, sesiones_esp, manifests_esp)
            resultados_soportadas.append(r)
            imprimir_foto(r)
        except Exception as e:
            print(f"{f.name}: error al procesar ({e})", file=sys.stderr)

    if resultados_soportadas:
        probs_cultivo = [r["prob_cultivo"] for r in resultados_soportadas]
        probs_ajena = [r["prob_ajena"] for r in resultados_soportadas]
        entropias = [r["entropia"] for r in resultados_soportadas]
        energias_router = [r["energia_router"] for r in resultados_soportadas]
        energias_esp = [r["energia_esp"] for r in resultados_soportadas if r["energia_esp"] is not None]

        print("\n" + "=" * 70)
        print(f"PERCENTILES EN FOTOS SOPORTADAS (N = {len(resultados_soportadas)})")
        print("=" * 70)
        print(f"{'Métrica':<20} {'P1':>12} {'P5':>12} {'P50 (Mediana)':>16}")
        print("-" * 70)
        for nombre, valores in [
            ("prob_cultivo", probs_cultivo),
            ("prob_ajena", probs_ajena),
            ("entropia", entropias),
            ("energia_router", energias_router),
            ("energia_esp", energias_esp),
        ]:
            if valores:
                p1, p5, p50 = np.percentile(valores, [1, 5, 50])
                print(f"{nombre:<20} {p1:>12.4f} {p5:>12.4f} {p50:>16.4f}")
            else:
                print(f"{nombre:<20} {'N/A':>12} {'N/A':>12} {'N/A':>16}")
        print("=" * 70)

        u3_propuesto = float(np.percentile(energias_router, 99)) if energias_router else None
        u4_propuesto = float(np.percentile(energias_esp, 99)) if energias_esp else None

        print("\nPropuesta de umbrales OOD (percentil 99 de fotos soportadas):")
        print(f"  U3 (energia_router): {u3_propuesto:.4f}" if u3_propuesto is not None else "  U3 (energia_router): N/A")
        print(f"  U4 (energia_esp):    {u4_propuesto:.4f}" if u4_propuesto is not None else "  U4 (energia_esp):    N/A")

    if args.ajenas:
        fotos_ajenas = recopilar_imagenes(args.ajenas)
        print(f"\nFotos ajenas / no soportadas encontradas: {len(fotos_ajenas)}")
        resultados_ajenas = []
        for f in fotos_ajenas:
            try:
                r = procesar_foto(f, sesion_router, manifest_router, sesiones_esp, manifests_esp)
                resultados_ajenas.append(r)
                imprimir_foto(r)
            except Exception as e:
                print(f"{f.name}: error al procesar ({e})", file=sys.stderr)


if __name__ == "__main__":
    main()
