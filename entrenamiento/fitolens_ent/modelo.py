"""Red de FitoLens: backbone timm + cabeza GAP -> Linear, que permite el mapa de calor (CAM) exacto.

La normalización ImageNet va dentro de la red: la entrada siempre es RGB en rango 0-1.
"""
import torch
import torch.nn as nn
import timm

MEDIA = (0.485, 0.456, 0.406)
DESV = (0.229, 0.224, 0.225)


class FitoNet(nn.Module):
    def __init__(self, backbone, n_clases, preentrenado=True):
        super().__init__()
        base = timm.create_model(backbone, pretrained=preentrenado, drop_path_rate=0.1)
        cfg = base.pretrained_cfg or {}
        media, desv = cfg.get("mean", MEDIA), cfg.get("std", DESV)
        self.register_buffer("media", torch.tensor(media).view(1, 3, 1, 1))
        self.register_buffer("desv", torch.tensor(desv).view(1, 3, 1, 1))
        # ConvNeXt normaliza después del pooling (LayerNorm2d): se aplica por posición y el CAM sigue exacto
        norm = getattr(getattr(base, "head", None), "norm", None)
        self.norm = norm if isinstance(norm, nn.Module) else nn.Identity()
        base.reset_classifier(0, "")
        self.base = base
        self.drop = nn.Dropout(0.3)
        self.fc = nn.Linear(base.num_features, n_clases)

    def mapas(self, x01):
        return self.norm(self.base.forward_features((x01 - self.media) / self.desv))

    def forward(self, x01):
        return self.fc(self.drop(self.mapas(x01).mean((2, 3))))

    def cabeza(self):
        return list(self.fc.parameters()) + list(self.norm.parameters())


class ParaExportar(nn.Module):
    """Lo que va dentro del ONNX: logits (con TTA de espejo) y CAM por clase."""

    def __init__(self, red, tta=True):
        super().__init__()
        self.red, self.tta = red.eval(), tta

    def forward(self, imagen):
        f = self.red.mapas(imagen)
        logits = self.red.fc(f.mean((2, 3)))
        if self.tta:
            logits = (logits + self.red.fc(self.red.mapas(torch.flip(imagen, dims=[3])).mean((2, 3)))) / 2
        cam = torch.einsum("kc,nchw->nkhw", self.red.fc.weight, f)
        return logits, cam


def exportar_onnx(red, ruta, tam, tta=True):
    m = ParaExportar(red, tta).cpu().eval()
    x = torch.rand(1, 3, tam, tam)
    kw = dict(input_names=["imagen"], output_names=["logits", "cam"], opset_version=17,
              dynamic_axes={"imagen": {0: "n"}, "logits": {0: "n"}, "cam": {0: "n"}})
    try:
        torch.onnx.export(m, (x,), ruta, dynamo=False, **kw)
    except TypeError:   # versiones de torch sin el parámetro dynamo
        torch.onnx.export(m, (x,), ruta, **kw)
    return m
