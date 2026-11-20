"""Nombre, agente y consejo por clase. Copia de bot/app/consejos.py y web/src/datos/clases.js: si cambias uno, cambia los otros.
Ids: snake_case con prefijo de cultivo (los mismos de manifest.json de cada modelo)."""

CULTIVOS = {"cafe": "Café", "cacao": "Cacao", "papa": "Papa", "tomate": "Tomate", "pimiento": "Pimiento",
            "maiz": "Maíz", "limon": "Limón", "naranja": "Naranja"}

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
    "tomate_septoriosis": ("Mancha por Septoria", "Septoria lycopersici", "Retira hojas bajas, riega al pie y aplica un fungicida protector registrado.", "media"),
    "tomate_arana_roja": ("Ácaro de dos manchas", "Tetranychus urticae", "Revisa el envés, lava con agua a presión y usa un acaricida registrado si la plaga sigue.", "media"),
    "tomate_mancha_diana": ("Mancha diana", "Corynespora cassiicola", "Mejora la ventilación y aplica un fungicida registrado.", "media"),
    "tomate_virus_rizado_amarillo": ("Virus del rizado amarillo", "TYLCV (mosca blanca)", "Arranca plantas enfermas y controla la mosca blanca. Un virus no se cura con fungicida.", "alta"),
    "tomate_virus_mosaico": ("Virus del mosaico", "ToMV", "Arranca plantas enfermas y desinfecta manos y herramientas. Un virus no se cura con fungicida.", "alta"),
    "pimiento_sana": _SANA,
    "pimiento_mancha_bacteriana": ("Mancha bacteriana", "Xanthomonas spp.", "Evita mojar el follaje, retira hojas afectadas y usa productos cúpricos registrados.", "media"),
    "maiz_sana": _SANA,
    "maiz_tizon_hoja": ("Tizón de la hoja", "Exserohilum turcicum", "Siembra variedades o híbridos tolerantes, rota con otro cultivo y no dejes rastrojo enfermo en la chacra. Si avanza antes de la floración y llueve seguido, aplica un fungicida registrado.", "media"),
    "maiz_roya_comun": ("Roya común", "Puccinia sorghi", "Usa variedades resistentes en la próxima siembra. Si las pústulas suben a las hojas de arriba antes de la floración, aplica un fungicida registrado.", "media"),
    "maiz_mancha_gris": ("Mancha gris", "Cercospora zeae-maydis", "Rota con otro cultivo, entierra o retira el rastrojo enfermo y siembra híbridos tolerantes. Si sube a la hoja de la mazorca con clima húmedo, aplica un fungicida registrado.", "media"),
    "maiz_gusano_cogollero": ("Gusano cogollero", "Spodoptera frugiperda", "Revisa el cogollo de las plantas jóvenes dos veces por semana. Si hay larvas vivas en varias plantas, aplica un insecticida registrado o uno biológico (Bacillus thuringiensis) dirigido al cogollo, al atardecer.", "alta"),
    "limon_sana": _SANA,
    "limon_cancrosis": ("Cancrosis", "Xanthomonas citri subsp. citri", "Poda y quema las ramas con lesiones, desinfecta las tijeras y protege los brotes nuevos y frutos pequeños con un cúprico registrado. Controla el minador: sus heridas facilitan la infección.", "alta"),
    "limon_hlb": ("HLB (enverdecimiento o greening)", "Candidatus Liberibacter spp. (lo transmite el psílido Diaphorina citri)", "No tiene cura. Confírmalo con un análisis de laboratorio y avisa a SENASA: es una plaga bajo vigilancia oficial. Controla el psílido y no saques plantas ni varetas de esta huerta.", "critica"),
    "limon_mancha_negra": ("Mancha negra", "Phyllosticta citricarpa", "Recoge y entierra las hojas y frutos caídos, y protege los frutos desde la caída de pétalos con un fungicida registrado. Pide a SENASA o a un agrónomo que la confirme: afecta la venta de fruta.", "alta"),
    "limon_melanosis": ("Melanosis", "Diaporthe citri", "Poda y saca de la huerta las ramas secas, que es donde vive el hongo. Protege los brotes y frutos pequeños con un cúprico registrado.", "media"),
    "limon_sarna": ("Sarna", "Elsinoë fawcettii", "Poda para ventilar y protege los brotes nuevos y la caída de pétalos con un cúprico registrado.", "media"),
    "limon_fumagina": ("Fumagina", "Capnodium spp. (crece sobre la melaza de insectos)", "El hongo vive de la melaza de pulgones, queresas o mosca blanca: controla a esos insectos con jabón potásico, aceite agrícola o un insecticida registrado. Sin melaza, la fumagina se seca y se cae.", "media"),
    "limon_minador": ("Minador de la hoja", "Phyllocnistis citrella", "Ataca solo los brotes tiernos. Protégelos durante la brotación con aceite agrícola o un insecticida registrado y evita el exceso de abono nitrogenado, que provoca brotes fuera de época.", "media"),
    "naranja_sana": _SANA,
    "naranja_cancrosis": ("Cancrosis", "Xanthomonas citri subsp. citri", "Poda y quema las ramas con lesiones, desinfecta las tijeras y protege los brotes nuevos y frutos pequeños con un cúprico registrado. Controla el minador: sus heridas facilitan la infección.", "alta"),
    "naranja_hlb": ("HLB (enverdecimiento o greening)", "Candidatus Liberibacter spp. (lo transmite el psílido Diaphorina citri)", "No tiene cura. Confírmalo con un análisis de laboratorio y avisa a SENASA: es una plaga bajo vigilancia oficial. Controla el psílido y no saques plantas ni varetas de esta huerta.", "critica"),
    "naranja_mancha_negra": ("Mancha negra", "Phyllosticta citricarpa", "Recoge y entierra las hojas y frutos caídos, y protege los frutos desde la caída de pétalos con un fungicida registrado. Pide a SENASA o a un agrónomo que la confirme: afecta la venta de fruta.", "alta"),
    "naranja_melanosis": ("Melanosis", "Diaporthe citri", "Poda y saca de la huerta las ramas secas, que es donde vive el hongo. Protege los brotes y frutos pequeños con un cúprico registrado.", "media"),
    "naranja_sarna": ("Sarna", "Elsinoë fawcettii", "Poda para ventilar y protege los brotes nuevos y la caída de pétalos con un cúprico registrado.", "media"),
    "naranja_fumagina": ("Fumagina", "Capnodium spp. (crece sobre la melaza de insectos)", "El hongo vive de la melaza de pulgones, queresas o mosca blanca: controla a esos insectos con jabón potásico, aceite agrícola o un insecticida registrado. Sin melaza, la fumagina se seca y se cae.", "media"),
    "naranja_minador": ("Minador de la hoja", "Phyllocnistis citrella", "Ataca solo los brotes tiernos. Protégelos durante la brotación con aceite agrícola o un insecticida registrado y evita el exceso de abono nitrogenado, que provoca brotes fuera de época.", "media"),
}

DESCONOCIDA = (None, None, "Consulta a un agrónomo para confirmar.", "media")
