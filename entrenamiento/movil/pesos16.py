"""Guarda los pesos grandes en float16 y los vuelve a float32 con un Cast al cargar:
el archivo pesa la mitad y el calculo sigue en float32. Uso: python pesos16.py entrada.onnx salida.onnx"""
import sys
import numpy as np, onnx
from onnx import helper, numpy_helper, TensorProto

m = onnx.load(sys.argv[1])
g = m.graph
nuevos, casts = [], []
for ini in g.initializer:
    if ini.data_type == TensorProto.FLOAT and np.prod(ini.dims) >= 1024:
        a = numpy_helper.to_array(ini).astype(np.float16)
        h = numpy_helper.from_array(a, ini.name + "__f16")
        nuevos.append(h)
        casts.append(helper.make_node("Cast", [h.name], [ini.name], to=TensorProto.FLOAT, name=ini.name + "__cast"))
    else:
        nuevos.append(ini)
del g.initializer[:]
g.initializer.extend(nuevos)
nodos = list(g.node)
del g.node[:]
g.node.extend(casts + nodos)
onnx.save(m, sys.argv[2])
print(sys.argv[2], len(casts), "pesos a float16")
