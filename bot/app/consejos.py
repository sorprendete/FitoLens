"""Nombre, agente y consejo por clase. Copia de web/src/datos/clases.js: si cambias uno, cambia el otro.
Ids: snake_case con prefijo de cultivo (los mismos de manifest.json de cada modelo)."""

CULTIVOS = {"cafe": "Café", "cacao": "Cacao", "papa": "Papa", "tomate": "Tomate", "pimiento": "Pimiento"}

URGENCIA = {
    "ninguna": "🟢 Sin tratamiento",
    "media": "🟡 Actuar esta semana",
    "alta": "🟠 Actuar en 1 o 2 días",
    "critica": "🔴 Actuar hoy",
}

_SANA = ("Planta sana", None, "Sigue con el monitoreo semanal y el manejo preventivo.", "ninguna")

# id: (nombre, agente, consejo, urgencia)
CLASES = {
    "cafe_sana": _SANA,
    "cafe_roya": ("Roya amarilla", "Hemileia vastatrix", "Retira hojas muy afectadas, regula la sombra y aplica un fungicida cúprico o sistémico registrado. Avisa a tus vecinos: se dispersa con el viento.", "alta"),
    "cafe_ojo_de_gallo": ("Ojo de gallo", "Mycena citricolor", "Reduce la sombra y la humedad, poda para ventilar y aplica un fungicida cúprico registrado.", "media"),
    "cacao_sana": _SANA,
    "cacao_monilia": ("Moniliasis", "Moniliophthora roreri", "Cosecha y entierra o cubre las mazorcas enfermas cada semana, antes de que esporulen. No las dejes en el suelo.", "critica"),
    "cacao_mazorca_negra": ("Mazorca negra", "Phytophthora palmivora", "Retira mazorcas negras, mejora el drenaje y la poda, y protege las mazorcas jóvenes con un cúprico registrado.", "alta"),
    "papa_sana": _SANA,
    "papa_tizon_temprano": ("Tizón temprano", "Alternaria solani", "Elimina hojas bajas afectadas, rota cultivos y aplica un fungicida protector registrado.", "media"),
    "papa_tizon_tardio": ("Tizón tardío (rancha)", "Phytophthora infestans", "Actúa hoy: aplica un fungicida sistémico registrado y repite según la etiqueta. Avanza muy rápido con lluvia.", "critica"),
    "tomate_sana": _SANA,
    "tomate_mancha_bacteriana": ("Mancha bacteriana", "Xanthomonas spp.", "Evita mojar el follaje, retira hojas afectadas y usa productos cúpricos registrados.", "media"),
    "tomate_tizon_temprano": ("Tizón temprano", "Alternaria solani", "Retira hojas bajas afectadas, mejora la ventilación y aplica un fungicida protector registrado.", "media"),
    "tomate_tizon_tardio": ("Tizón tardío", "Phytophthora infestans", "Actúa hoy con un fungicida sistémico registrado; elimina plantas muy afectadas.", "critica"),
    "tomate_moho_hoja": ("Moho de la hoja", "Passalora fulva", "Baja la humedad, ventila y retira hojas afectadas.", "media"),
    "tomate_septoria": ("Mancha por Septoria", "Septoria lycopersici", "Retira hojas bajas, riega al pie y aplica un fungicida protector registrado.", "media"),
    "tomate_acaro": ("Ácaro de dos manchas", "Tetranychus urticae", "Revisa el envés, lava con agua a presión y usa un acaricida registrado si la plaga sigue.", "media"),
    "tomate_mancha_diana": ("Mancha diana", "Corynespora cassiicola", "Mejora la ventilación y aplica un fungicida registrado.", "media"),
    "tomate_virus_rizado": ("Virus del rizado amarillo", "TYLCV (mosca blanca)", "Arranca plantas enfermas y controla la mosca blanca. Un virus no se cura con fungicida.", "alta"),
    "tomate_virus_mosaico": ("Virus del mosaico", "ToMV", "Arranca plantas enfermas y desinfecta manos y herramientas. Un virus no se cura con fungicida.", "alta"),
    "pimiento_sana": _SANA,
    "pimiento_mancha_bacteriana": ("Mancha bacteriana", "Xanthomonas spp.", "Evita mojar el follaje, retira hojas afectadas y usa productos cúpricos registrados.", "media"),
}

DESCONOCIDA = (None, None, "Consulta a un agrónomo para confirmar.", "media")
