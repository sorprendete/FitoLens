"""Medición de detección de huecos de gusano cogollero en hojas de maíz.

Recorre pruebas/huecos/fotos/<clase>/*.jpg, corre la segmentación y huecos_mordedura,
y el diagnóstico completo del pipeline con y sin la regla de huecos.
Usa los modelos de la variable de entorno MODELOS_DIR (por defecto ../modelos si existe).
Si no hay modelos reales disponibles, mide únicamente los huecos.

Uso (desde la carpeta api/):
    python -X utf8 pruebas/huecos/medir.py
"""
import os
import sys
from collections import defaultdict
from pathlib import Path

from PIL import Image, ImageDraw, ImageOps

AQUI = Path(__file__).resolve().parent
RAIZ_API = AQUI.parents[1]
sys.path.insert(0, str(RAIZ_API))

from app.ia.pipeline import diagnosticar
from app.ia.registro import cargar
from app.ia.segmentacion import Segmentador, huecos_mordedura


def _generar_fotos_muestra(carpeta_fotos: Path) -> None:
    """Genera fotos de prueba sintéticas si la carpeta de fotos está vacía."""
    clases = ["maiz_gusano_cogollero", "maiz_tizon_hoja", "maiz_sana"]
    for c in clases:
        (carpeta_fotos / c).mkdir(parents=True, exist_ok=True)

    # 1. Cogollero: hoja verde con 4 huecos encerrados (mordedura típica)
    img1 = Image.new("RGB", (300, 300), (225, 225, 225))
    d1 = ImageDraw.Draw(img1)
    d1.ellipse([50, 40, 250, 260], fill=(45, 140, 45))
    d1.ellipse([90, 80, 130, 120], fill=(225, 225, 225))
    d1.ellipse([170, 90, 205, 125], fill=(225, 225, 225))
    d1.ellipse([110, 160, 150, 200], fill=(225, 225, 225))
    d1.ellipse([165, 170, 195, 200], fill=(225, 225, 225))
    img1.save(carpeta_fotos / "maiz_gusano_cogollero" / "cogollero_4_huecos.jpg", quality=90)

    # 2. Cogollero: hoja con 1 hueco grande (> 6 % del área)
    img2 = Image.new("RGB", (300, 300), (225, 225, 225))
    d2 = ImageDraw.Draw(img2)
    d2.ellipse([50, 40, 250, 260], fill=(45, 140, 45))
    d2.ellipse([110, 110, 190, 190], fill=(225, 225, 225))
    img2.save(carpeta_fotos / "maiz_gusano_cogollero" / "cogollero_hueco_grande.jpg", quality=90)

    # 3. Tizón: hoja con manchas marrones secas (sin huecos)
    img3 = Image.new("RGB", (300, 300), (225, 225, 225))
    d3 = ImageDraw.Draw(img3)
    d3.ellipse([50, 40, 250, 260], fill=(45, 140, 45))
    d3.ellipse([90, 90, 140, 160], fill=(120, 80, 30))
    d3.ellipse([160, 130, 210, 210], fill=(130, 85, 35))
    img3.save(carpeta_fotos / "maiz_tizon_hoja" / "tizon_manchas.jpg", quality=90)

    # 4. Tizón: lesión alargada
    img4 = Image.new("RGB", (300, 300), (225, 225, 225))
    d4 = ImageDraw.Draw(img4)
    d4.ellipse([50, 40, 250, 260], fill=(45, 140, 45))
    d4.rectangle([145, 70, 155, 230], fill=(110, 75, 30))
    img4.save(carpeta_fotos / "maiz_tizon_hoja" / "tizon_lesion_alargada.jpg", quality=90)

    # 5. Sana: hoja verde lisa sin lesiones
    img5 = Image.new("RGB", (300, 300), (225, 225, 225))
    d5 = ImageDraw.Draw(img5)
    d5.ellipse([50, 40, 250, 260], fill=(45, 140, 45))
    img5.save(carpeta_fotos / "maiz_sana" / "maiz_sana_1.jpg", quality=90)


def main():
    carpeta_fotos = AQUI / "fotos"
    fotos = sorted(carpeta_fotos.glob("*/*.jpg"))

    if not fotos:
        print(f"No se encontraron fotos en {carpeta_fotos}. Generando fotos de muestra...")
        _generar_fotos_muestra(carpeta_fotos)
        fotos = sorted(carpeta_fotos.glob("*/*.jpg"))

    # Localizar modelos
    dir_modelos_env = os.environ.get("MODELOS_DIR")
    if dir_modelos_env:
        ruta_modelos = Path(dir_modelos_env)
    else:
        ruta_modelos = RAIZ_API.parent / "modelos"

    hay_modelos = (
        ruta_modelos.exists()
        and any((p / "manifest.json").exists() for p in ruta_modelos.glob("*"))
    )

    registro = None
    segmentador = None

    if hay_modelos:
        try:
            registro = cargar(ruta_modelos, hilos=2, segmentar=True)
            if not registro.listo:
                print(f"Modelos en {ruta_modelos} incompletos; se medirá únicamente segmentación y huecos.")
                hay_modelos = False
                segmentador = Segmentador.cargar()
            else:
                print(f"Modelos cargados desde: {ruta_modelos}")
        except Exception as e:
            print(f"Error cargando modelos de {ruta_modelos} ({e}); se medirá únicamente segmentación y huecos.")
            hay_modelos = False
            segmentador = Segmentador.cargar()
    else:
        print(f"No hay modelos reales en {ruta_modelos}; midiendo solo huecos.")
        segmentador = Segmentador.cargar()

    total_fotos = len(fotos)
    cambios_por_clase = defaultdict(int)
    total_cambios = 0

    col_clase = 23
    col_foto = 28
    col_huecos = 30
    col_sin = 26
    col_con = 26

    encabezado = (
        f"{'Clase real':<{col_clase}} | {'Foto':<{col_foto}} | "
        f"{'Huecos (cant, frac, fuerte)':<{col_huecos}} | "
        f"{'Resultado sin regla':<{col_sin}} | {'Resultado con regla':<{col_con}}"
    )
    separador = "-" * len(encabezado)

    print("\n" + separador)
    print(encabezado)
    print(separador)

    for ruta in fotos:
        clase_real = ruta.parent.name
        nombre_foto = ruta.name

        try:
            img = ImageOps.exif_transpose(Image.open(ruta)).convert("RGB")
        except Exception as e:
            print(f"{clase_real:<{col_clase}} | {nombre_foto:<{col_foto}} | Error abriendo imagen: {e}")
            continue

        if hay_modelos and registro is not None:
            r_sin = diagnosticar(registro, img, regla_huecos=False)
            r_con = diagnosticar(registro, img, regla_huecos=True)

            seg = registro.segmentador.segmentar(img) if registro.segmentador else None
            mord = huecos_mordedura(seg.mascara) if (seg and seg.ok and seg.mascara is not None) else {
                "cantidad": 0, "fraccion": 0.0, "fuerte": False
            }

            sin_str = f"{r_sin.clase} ({r_sin.confianza:.0%})" if r_sin.clase else r_sin.estado
            con_str = f"{r_con.clase} ({r_con.confianza:.0%})" if r_con.clase else r_con.estado

            cambio = (r_sin.clase != r_con.clase) or (r_sin.estado != r_con.estado)
            if cambio:
                cambios_por_clase[clase_real] += 1
                total_cambios += 1
        else:
            seg = segmentador.segmentar(img) if segmentador else None
            mord = huecos_mordedura(seg.mascara) if (seg and seg.ok and seg.mascara is not None) else {
                "cantidad": 0, "fraccion": 0.0, "fuerte": False
            }
            sin_str = "N/A (sin modelos)"
            con_str = "N/A (sin modelos)"

        fuerte_str = "SÍ" if mord["fuerte"] else "no"
        huecos_str = f"cant={mord['cantidad']}, frac={mord['fraccion']:.1%}, fuerte={fuerte_str}"

        print(
            f"{clase_real:<{col_clase}} | {nombre_foto:<{col_foto}} | "
            f"{huecos_str:<{col_huecos}} | {sin_str:<{col_sin}} | {con_str:<{col_con}}"
        )

    print(separador)
    print("\nResumen final:")
    print(f"Total fotos procesadas: {total_fotos}")
    if hay_modelos:
        print(f"Total diagnósticos modificados por la regla: {total_cambios}")
        print("Cambios por clase real:")
        clases_encontradas = sorted(set(f.parent.name for f in fotos))
        for c in clases_encontradas:
            print(f"  - {c}: {cambios_por_clase[c]} cambiaron")
    else:
        print("Medición completada en modo solo huecos (sin modelos instalados en MODELOS_DIR).")


if __name__ == "__main__":
    main()
