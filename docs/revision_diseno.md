# Revisión de Diseño Web (FitoLens Web)

Auditoría integral de interfaz y experiencia de usuario para escritorio y dispositivos móviles (360–430 px) en la carpeta `web/src`.

---

## 1. Resumen Ejecutivo y Metodología

Se revisaron todas las páginas, componentes y estilos CSS de la aplicación web:
- **Páginas principales**: Diagnóstico, Panel, Historial, Mis Parcelas, App Móvil, Mapa de Brotes, Cómo Piensa la IA, Precisión en Campo (Modelos), Acceso (Login/Registro).
- **Módulos de administración**: Alertas de Brote, Amenazas ML, Auditoría, Reporte Semanal, Matriz de Riesgos, Usuarios.
- **Componentes**: AlertasBrote, Barra, BotonReporte, Camara, ErrorPantalla, Graficos, Logo, MapaCalor, Pasos, Shell, Voz.
- **Hojas de estilo**: `estilos.css`, `AppMovil.css`, `Parcelas.css`.

El análisis se centró en inconsistencias de diseño, elementos sin estilo, bloques desconectados, desalineaciones móviles en anchos estándar de celulares (360–430 px) y cumplimiento estricto del criterio de alineación (centrado con propósito vs. alineación natural a la izquierda).

---

## 2. Inventario de Problemas Encontrados

### A. Elementos sin estilo y bloques sueltos
1. **Bloque "¿Dónde está tu cultivo?" en Diagnóstico (`Diagnostico.jsx`)**:
   - **Problema**: El bloque (`.ubicacion`) era un contenedor básico sin tarjeta ni jerarquía visual. El `<select>` no tenía estilos integrados con el sistema de entradas de texto, el botón de geolocalización era un icono mínimo de 40px (`.icono-btn`) sin etiqueta de texto descriptiva, y la nota informativa ("La provincia alimenta el mapa de brotes...") flotaba suelta debajo fuera del bloque.
   - **En móvil (360–430 px)**: Forzaba un centrado tosco (`justify-content: center`) que rompía la relación visual entre la etiqueta, el selector y el botón.
   - **Solución requerida**: Rediseñar como tarjeta dedicada (`.tarjeta.ubicacion-tarjeta`), con etiqueta estructurada e icono, selector con las mismas propiedades de borde, radio y foco que `.entrada`, botón secundario con texto e icono (`.btn.sec`), alineados horizontalmente en escritorio y apilados en móvil.

2. **Campo de fecha sin estilo en Reporte Semanal (`Reporte.jsx`)**:
   - **Problema**: `<input type="date">` dentro de un `<label className="tenue">` no tenía clases ni estilos de formulario: utilizaba el borde y fondo nativo del navegador, perdiendo consistencia con el tema claro/oscuro y desentonando con los botones adyacentes.
   - **Solución requerida**: Estilizar `input[type="date"]` con las mismas variables que `.entrada` y `select` (altura mínima de 44px, borde `var(--borde-2)`, fondo `var(--sup)`, radio y anillo de foco `var(--acento)`), y estructurar el contenedor `.campo-inline`.

3. **Selector de idioma en componente de Voz (`Voz.jsx`)**:
   - **Problema**: Altura fija de 40px en `.voz select` que difería de la altura base (44px) de las demás entradas del sistema; sin estilos responsivos para pantallas de 360 px, provocando saltos de línea irregulares junto al botón "Escuchar resultado".
   - **Solución requerida**: Crear clase `.voz-select` con 44px de altura, estados de foco coherentes y distribución fluida en móvil.

4. **Mensajes de estado/error en Reporte PDF (`BotonReporte.jsx`)**:
   - **Problema**: Los errores de conexión o generación de PDF se mostraban con `<p className="tenue pequeno">`, resultando apenas visibles para el agricultor en caso de fallo.
   - **Solución requerida**: Aplicar formato de alerta visual de error (`.alerta.mal` o `.mal-txt`) para retroalimentación accesible y evidente.

---

### B. Alineación indiscriminada al centro vs. Criterio estructurado
El bloque de reglas responsivas añadido previamente en `web/src/estilos.css` aplicaba `text-align: center` y `justify-content: center` de forma generalizada a contenedores que deben mantener alineación izquierda:

1. **`.tarjeta.destacada` en móvil (`estilos.css` l.625)**:
   - **Problema**: Forzaba `align-items: center; text-align: center;`. Esto afectaba negativamente a:
     - Página **Amenazas**: centró todo el párrafo explicativo sobre Isolation Forest y algoritmos no supervisados.
     - Página **Mis Parcelas (Detalle)**: centró el nombre de la parcela, el cultivo, la fecha y los datos fitosanitarios.
   - **Corrección**: Retirar el centrado general de texto en `.tarjeta.destacada`. Mantener `align-items: flex-start; text-align: left;`, centrando únicamente elementos visuales específicos que lo requieran (como el radar de amenazas mediante `align-self: center`).

2. **`.barra-filtros` y `.filtros` en móvil (`estilos.css` l.631)**:
   - **Problema**: Aplicaba `justify-content: center; text-align: center;`. Formularios de búsqueda, desplegables de filtrado y botones de exportación en Historial, Alertas, Auditoría y Reportes quedaban flotando centrados con anchos variables en vez de alinearse a la izquierda.
   - **Corrección**: Restablecer `justify-content: flex-start; text-align: left;`, adaptando los elementos interactivos al ancho completo o a una cuadrícula cómoda para el dedo (touch targets de 44px mínimo).

3. **Tarjeta de Bienvenida en Panel (`Panel.jsx` / `estilos.css` l.656)**:
   - **Problema**: `.bienvenida` en móvil forzaba `align-items: center; text-align: center;`, centrando el saludo al agricultor y el texto descriptivo largo.
   - **Corrección**: Alinear el saludo, titular y textos a la izquierda (`text-align: left; align-items: flex-start;`), manteniendo solo el botón de acción principal de forma destacada y accesible.

4. **Tarjetas de Resultado de Diagnóstico (`Diagnostico.jsx` / `estilos.css`)**:
   - **Problema**: Las recomendaciones agronómicas, detalles de la enfermedad y consejos debían asegurarse estrictamente a la izquierda para garantizar una lectura natural al aire libre y bajo luz solar.
   - **Corrección**: Asegurar `text-align: left` explícito en `.resultado`, `.veredicto`, `.consejo` y fichas de consejos.

---

### C. Registro de Usuario e Integridad de Formularios (`Acceso.jsx`)
1. **Falta de confirmación de contraseña**:
   - **Problema**: La pestaña "Crear cuenta" solo solicitaba la contraseña una sola vez, sin permitir al agricultor confirmar si cometió un error de escritura.
   - **Solución requerida**:
     - Agregar campo "Confirmar contraseña" con icono `Lock` y opción para alternar visibilidad (`Eye`/`EyeOff`).
     - Deshabilitar el botón "Crear cuenta" si el campo está vacío, si no coincide con la contraseña o si la fuerza no cumple los requisitos mínimos.
     - Mostrar aviso en rojo claro (`.alerta.mal` con mensaje `"Las contraseñas no coinciden."`) de forma inmediata cuando los valores ingresados difieren.
     - Preservar exactamente intacta la firma y llamada a la API (`s.registrar(nombre, email, password)`).

---

### D. Inconsistencia tipográfica, botones y selects
1. **Comportamiento y dimensiones de `<select>`**:
   - Varios selects carecían de `width: 100%` en formularios, heredando anchos heterogéneos según la longitud del texto de sus opciones.
   - Falta de contraste de color en opciones desplegables dentro de navegadores con temas personalizados.
   - Se unificó la regla global para que cualquier `select` dentro de un `.campo` o `.ubicacion-tarjeta` tenga 44px de altura, transición suave, radio idéntico a `.entrada` y el mismo anillo de foco `box-shadow: 0 0 0 3px color-mix(in srgb, var(--acento) 15%, transparent)`.

2. **Formulario manual de técnicos en Alertas (`Alertas.jsx`)**:
   - Se estilizó para que en celulares (360–430 px) los campos de ID de chat, nombre y selector de provincia se apilen de forma limpia y alineada a la izquierda.

3. **Tarjetas de consejos con dibujo en Diagnóstico (`.consejos-grid`)**:
   - En pantallas estrechas (360 px), `minmax(150px, 1fr)` provocaba desbordes o compresión ilegible de las 3 tarjetas de sugerencias fotográficas.
   - Se ajustó para apilar a 1 columna completa por debajo de 480 px, asegurando textos legibles a la izquierda.

---

## 3. Matriz de Correcciones Realizadas

| Archivo | Problema | Corrección Aplicada | Estado |
|---|---|---|---|
| `web/src/paginas/Diagnostico.jsx` | Bloque "¿Dónde está tu cultivo?" sin diseño y elementos sueltos | Rediseñado como tarjeta estructurada `.ubicacion-tarjeta` con etiqueta, selector estilizado, botón secundario con icono y texto de ayuda integrado | **Corregido** |
| `web/src/paginas/Acceso.jsx` | Ausencia de confirmación de contraseña en registro | Añadido campo Confirmar contraseña, validación visual en rojo, deshabilitación de botón y preservación estricta de la API | **Corregido** |
| `web/src/estilos.css` | Reglas de centrado indiscriminado en móvil (`@media (max-width: 640px)`) | Corregidas `.tarjeta.destacada`, `.barra-filtros`, `.bienvenida`, `.acciones`, preservando alineación a la izquierda en formularios, tablas, listas y textos largos | **Corregido** |
| `web/src/estilos.css` | Estilos incompletos en selects y campos de fecha | Añadidos estilos unificados para `select`, `input[type="date"]`, `.campo-inline`, `.ubicacion-tarjeta`, foco consistente y opciones para tema oscuro/claro | **Corregido** |
| `web/src/paginas/admin/Reporte.jsx` | Selector de fecha `input[type="date"]` sin diseño | Envuelto en `.campo-inline` con estilos consistentes a los demás controles | **Corregido** |
| `web/src/componentes/BotonReporte.jsx` | Mensajes de error con estilo tenue poco visible | Cambiado a alerta en rojo visible `.alerta.mal.pequeno` con `role="alert"` | **Corregido** |
| `web/src/componentes/Voz.jsx` | Desalineación de selector de idioma y botón en móvil | Estilizado con `.voz-select` a 44px de altura y comportamiento elástico en móvil | **Corregido** |
| `web/src/paginas/Parcelas.css` | Alineación forzada a la derecha del estado de parcela en celular | Añadida media query para alinear a la izquierda el estado y severidad en móvil | **Corregido** |

---

## 4. Estado de Verificación y Pendientes

- **Problemas corregidos**: 7 de 7 categorías identificadas (estilos de selects e inputs, bloque de cultivo, centrado indiscriminado corregido, confirmación de registro, alertas de error, responsividad 360–430 px).
- **Problemas pendientes**: 0 pendientes dentro del alcance del frontend.
