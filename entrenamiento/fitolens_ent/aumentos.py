"""Aumentos que imitan fotos de campo, y la carga de imágenes idéntica a la de la API."""
import io, random

import numpy as np
import torch
from PIL import Image, ImageFilter, ImageOps
from torchvision.transforms import v2 as T


def cargar_como_api(img, tam):
    """Exactamente lo que hace la API: RGB, orientación EXIF, redimensión directa (BILINEAR), 0-1, NCHW."""
    img = ImageOps.exif_transpose(img).convert("RGB").resize((tam, tam), Image.BILINEAR)
    return torch.from_numpy(np.asarray(img, np.float32) / 255.0).permute(2, 0, 1)


class ReemplazoFondo:
    """En fotos de laboratorio (fondo liso) cambia el fondo por un recorte de una foto de campo.

    La hoja se separa por saturación (umbral de Otsu) y se rellenan los huecos para no borrar lesiones.
    """

    def __init__(self, fondos, p=0.6):
        self.fondos, self.p = fondos, p

    def __call__(self, img):
        if not self.fondos or random.random() > self.p:
            return img
        from scipy import ndimage
        a = np.asarray(img.convert("HSV"))[..., 1].astype(np.float32)
        hist = np.histogram(a, 256, (0, 256))[0].astype(np.float64)
        w = np.cumsum(hist); mu = np.cumsum(hist * np.arange(256))
        var = (mu[-1] * w / w[-1] - mu) ** 2 / (w * (w[-1] - w) + 1e-9)
        mascara = a > np.argmax(var)
        mascara = ndimage.binary_fill_holes(ndimage.binary_closing(mascara, iterations=3))
        etiq, n = ndimage.label(mascara)
        if n == 0:
            return img
        mayor = np.argmax(ndimage.sum(mascara, etiq, range(1, n + 1))) + 1
        mascara = etiq == mayor
        if not 0.08 < mascara.mean() < 0.95:
            return img
        fondo = Image.open(random.choice(self.fondos)).convert("RGB")
        fondo = T.RandomResizedCrop(img.size[::-1], scale=(0.2, 1.0))(fondo)
        alfa = Image.fromarray((mascara * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(2))
        return Image.composite(img, fondo, alfa)


class JPEGAleatorio:
    def __init__(self, p=0.4, q=(30, 90)):
        self.p, self.q = p, q

    def __call__(self, img):
        if random.random() > self.p:
            return img
        b = io.BytesIO()
        img.save(b, "JPEG", quality=random.randint(*self.q))
        return Image.open(b).convert("RGB")


def entrenamiento(tam, suave=False):
    # suave (maíz): recortes grandes, poca deformación, poco desenfoque y borrado, para no perder
    # los huecos y el aserrín del gusano cogollero ni estirarlos en forma de lesión de tizón
    return T.Compose([
        T.RandomResizedCrop(tam, scale=(0.6, 1.0) if suave else (0.35, 1.0),
                            ratio=(0.85, 1.18) if suave else (0.75, 1.33), antialias=True),
        T.RandomHorizontalFlip(), T.RandomVerticalFlip(0.2), T.RandomRotation(20),
        T.ColorJitter(0.4, 0.4, 0.3, 0.05),
        T.RandomApply([T.GaussianBlur(5, (0.1, 1.0) if suave else (0.1, 2.0))], p=0.1 if suave else 0.25),
        JPEGAleatorio(),
        T.PILToTensor(), T.ToDtype(torch.float32, scale=True),
        T.RandomErasing(p=0.1 if suave else 0.2, scale=(0.02, 0.05) if suave else (0.02, 0.12)),
    ])


class Conjunto(torch.utils.data.Dataset):
    def __init__(self, muestras, tam, entrenar=False, fondos=None, suave=False):
        self.m, self.tam, self.entrenar = muestras, tam, entrenar
        self.aug = entrenamiento(tam, suave) if entrenar else None
        self.fondo = ReemplazoFondo(fondos or [])

    def __len__(self):
        return len(self.m)

    def __getitem__(self, i):
        m = self.m[i]
        img = Image.open(m["ruta"]).convert("RGB")
        if self.entrenar:
            if not m["campo"]:
                img = self.fondo(img)
            return self.aug(img), m["y"]
        return cargar_como_api(img, self.tam), m["y"]
