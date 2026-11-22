# Revisión Completa del Diseño Web de FitoLens

Documento de auditoría y detalle técnico de cambios realizados en la interfaz web de FitoLens en resoluciones de escritorio (1440 px), tablet (768 px) y móvil (375 px), tanto en modo claro como en modo oscuro, preservando íntegramente la paleta de colores del sistema.

---

## 1. Problemas reportados por el propietario y soluciones aplicadas

### (a) Barra lateral sticky en escritorio sin romper menú móvil
- **Problema encontrado:** En escritorio, la barra lateral (`.lateral`) quedaba fijada en la parte superior del flujo o se perdía al hacer scroll largo. El uso previo de `overflow-x: hidden` en `html` y `body` generaba un nuevo contexto de desplazamiento que rompía la especificación estándar de `position: sticky`. Además, en pantallas grandes la barra no mantenía su altura confinada al viewport con scroll interno propio.
- **Solución implementada:**
  - Se cambió `overflow-x: hidden` por `overflow-x: clip` en `html` y `body` (`web/src/estilos.css`), lo que evita cualquier desborde horizontal sin crear un contenedor de scroll secundario, permitiendo que `position: sticky` funcione fielmente con el scroll de la ventana.
  - En `.lateral` se estableció `position: sticky; top: 0; height: 100vh; max-height: 100vh; overflow-y: auto; overscroll-behavior: contain; z-index: 25;` en escritorio.
  - En dispositivos móviles (`@media (max-width: 960px)`), se preservó intacto el funcionamiento off-canvas drawer con `position: fixed; top: 0; left: 0; height: 100dvh; transform: translateX(-105%);` con apertura fluida al activar el menú y velo oscuro de fondo.

### (b) Espacios en blanco enormes (Mapa de brotes y grids)
- **Problema encontrado:**
  - En el mapa de brotes (`Brotes.jsx`), `.brotes-grid` usaba alineación por defecto `align-items: stretch`. Como la columna derecha contiene 3 tarjetas apiladas (KPI de casos + tarjeta de provincia activa + tarjeta de ranking de 10 provincias), la tarjeta izquierda del mapa se estiraba artificialmente a más de 850 px de alto, dejando un enorme vacío en blanco/oscuro bajo el mapa SVG.
  - El SVG del mapa no tenía límites controlados de altura (`max-height: 76dvh` sin clamp), expandiéndose o contrayéndose de forma desproporcionada.
  - En la portada de Diagnóstico (`Diagnostico.jsx`), `.portada` forzaba `min-height: 64dvh; align-items: center;`, distanciando innecesariamente el contenido respecto al encabezado superior.
- **Solución implementada:**
  - Se configuró `.brotes-grid` con `align-items: start`, permitiendo que la tarjeta del mapa tome exactamente la altura de su contenido sin estirarse artificialmente.
  - Se aplicó al mapa SVG una altura responsiva controlada mediante `height: clamp(320px, 55vh, 560px); max-width: 440px; margin: 0 auto; object-fit: contain;`, con leyenda y descripción alineadas.
  - En `.portada` de Diagnóstico se cambió a `align-items: start; gap: 28px;`, eliminando la altura mínima fija vacía.
  - En `.rejilla-2.ancha-izq` (Parcelas y Riesgos) se fijó `align-items: start` para evitar que formularios laterales queden flotando sobre espacios vacíos cuando las tablas crecen.
  - En rejillas homogéneas (`.rejilla-kpi`, `.rejilla-2`, `.rejilla-3`), se aseguró que las tarjetas hermanas en una misma fila compartan la misma altura (`align-items: stretch; height: 100%; display: flex; flex-direction: column;`).

### (c) Tabla del Historial y tablas globales (encabezados cortados y vista móvil)
- **Problema encontrado:**
  - La regla global en `body` de `word-break: break-word` y `overflow-wrap: anywhere` provocaba que palabras de encabezados de tabla como "CULTIVO" o "PROVINCIA" se partieran arbitrariamente entre líneas letra por letra ("CULTIV O", "PROVINCI A").
  - La columna "Acciones" en Historial quedaba apretada y amontonada.
  - Las tablas no tenían contenedor estandarizado con desplazamiento horizontal (`overflow-x: auto`), y en pantallas móviles se veían comprimidas o con filas sin estilo de tarjeta definido.
- **Solución implementada:**
  - En `.tabla th` se definió `white-space: nowrap; word-break: keep-all; overflow-wrap: normal;`, imposibilitando cualquier ruptura intra-palabra en los encabezados.
  - Se establecieron anchos mínimos (`min-width`) por columna en toda la tabla (`.tabla td` con `white-space: nowrap`, columna `principal` con `min-width: 160px; white-space: normal`, y columna de acciones con `min-width: 190px`).
  - Se creó la clase `.tabla-contenedor` con `overflow-x: auto; -webkit-overflow-scrolling: touch;` y se envolvió cada tabla en las páginas afectadas (`Historial`, `Parcelas`, `Alertas`, `Auditoria`, `Reporte`, `Riesgos`, `Usuarios`).
  - En celular (`@media (max-width: 760px)`), se implementó la conversión completa de cada fila `tr` en una tarjeta individual estilizada (`border: 1px solid var(--borde); border-radius: var(--radio-s); background: var(--sup); box-shadow: var(--sombra); padding: 14px 16px; margin-bottom: 12px`), mostrando la etiqueta de la columna a la izquierda mediante `data-l` y el valor alineado a la derecha, con botones de acción al pie de la tarjeta.

### (d) Botones desbordados, alturas desiguales y alineación de acciones
- **Problema encontrado:**
  - Botones que no tenían `min-height` uniforme (oscilaban entre 30 px y 45 px) y se desalineaban al compartir fila con `<select>` (44 px) o `.entrada` (44 px).
  - Textos de botones propensos a cortarse o envolver letras por falta de `white-space: nowrap`.
- **Solución implementada:**
  - Se asignó a `.btn` una altura mínima base de `min-height: 40px`, padding uniforme `9px 18px`, `line-height: 1.25` y `white-space: nowrap`.
  - Para barras de control y filtros (`.barra-filtros`, `.filtros`, `.acciones`), se estandarizó una altura fija y uniforme de 42 px para `.btn`, `select`, `.entrada` e `.icono-btn`, garantizando una línea visual idéntica en toda la fila.
  - `.segmentado` se integró a la escala de 42 px con botones internos de 34 px centrados verticalmente.
  - En móvil (<= 640 px), los controles de filtros y botones de acciones ocupan el 100% del ancho con `min-height: 44px` para accesibilidad táctil óptima.

---

## 2. Auditoría por página (1440 px, 768 px y 375 px)

### 2.1 Diagnóstico (`Diagnostico.jsx`)
- **Escritorio (1440 px):** Portada limpia a 2 columnas (intro y tarjeta de ubicación a la izquierda, guía de recomendaciones fotográficas a la derecha). En modo análisis, la columna izquierda contiene el visor Grad-CAM y botones de acción, mientras que la derecha aloja el veredicto, barras de confianza calibrada y reporte PDF.
- **Tablet (768 px):** La cuadrícula pasa ordenadamente a una sola columna; el mapa de calor queda centrado con controles de opacidad accesibles.
- **Celular (375 px):** Titular centrado, botones de "Tomar foto" y "Subir foto" ocupan ancho completo con 44 px de altura mínima. Desplegable "¿Dónde está tu cultivo?" apila select y botón de GPS verticalmente. El resultado hace scroll automático a la vista al completarse el análisis.
- **Modo Claro / Oscuro:** Los marcos de contraste (#marco-bien y #marco-mal), contorno segmentado de la hoja (SVG polygon con filtro de sombra) y chips de cultivo son perfectamente legibles en ambos esquemas.

### 2.2 Historial (`Historial.jsx`)
- **Escritorio (1440 px):** Barra superior de filtros de 42 px de altura alineada con buscador, selects de cultivo, estado, urgencia, fecha, orden y botón de exportar CSV. Tabla con scroll horizontal fluido en su contenedor si la ventana se reduce, sin corte de encabezados y columna de acciones con 190 px de ancho mínimo.
- **Tablet (768 px):** Los filtros se distribuyen en filas compactas con flex-wrap y gap de 10 px. La tabla mantiene scroll interno suave sin alterar el ancho del layout.
- **Celular (375 px):** La tabla se transforma en tarjetas individuales ordenadas verticalmente con separación de 12 px, bordes claros y sombras tenues. En cada tarjeta, la fecha, cultivo con punto de color, resultado, confianza, provincia y acciones se visualizan como pares clave-valor nítidos.

### 2.3 Mis Parcelas (`Parcelas.jsx`)
- **Escritorio (1440 px):** En el listado, rejilla de 3 columnas de tarjetas de parcelas con igual altura. En el detalle, la cabecera destacada muestra cultivo, nombre, severidad y tendencia; la línea de tiempo SVG ocupa el ancho completo; y la sección inferior distribuye en 2 columnas la tabla de visitas (con `.tabla-contenedor`) y el formulario de nueva visita alineado al inicio.
- **Tablet (768 px):** Rejilla a 2 columnas. Detalle con formulario de visita apilado debajo de la tabla.
- **Celular (375 px):** Tarjetas a 1 columna; opciones de severidad de daño en formulario de visita con labels amplios de fácil pulsación táctil (44 px).

### 2.4 Mapa de Brotes (`Brotes.jsx`)
- **Escritorio (1440 px):** Rejilla balanceada con `align-items: start`. El mapa SVG se restringe a `clamp(320px, 55vh, 560px)` con drop-shadow sutil, eliminando el espacio en blanco inferior. La columna derecha contiene el KPI de casos totales, la tarjeta de la provincia seleccionada y la lista completa de provincias.
- **Tablet (768 px):** El mapa se sitúa en la parte superior y la columna de datos se desplaza abajo, manteniendo la interactividad al tocar cualquier provincia.
- **Celular (375 px):** El selector de período y cultivo se ajusta a 100% de ancho; el mapa es completamente visible y legible sin desborde horizontal.

### 2.5 Alertas de Brote (`admin/Alertas.jsx`)
- **Escritorio (1440 px):** Rejilla de 3 KPIs (brotes activos, suscripciones, avisos enviados), tarjeta de alertas activas y formulario de suscripción manual en una sola fila compacta de 42 px. Tabla de destinatarios envuelta en `.tabla-contenedor`.
- **Tablet y Celular (768 / 375 px):** Los KPIs se adaptan a 2 columnas y luego a 1 columna. La tabla de suscriptores se visualiza en tarjetas con botones de eliminación accesibles.

### 2.6 Reporte para Autoridades (`admin/Reporte.jsx`)
- **Escritorio (1440 px):** Controles de rango de semanas, fecha límite e informe Excel en fila homogénea. Rejilla de 4 KPIs y tabla epidemiológica con mini-gráficos de barras por semana.
- **Tablet y Celular (768 / 375 px):** Tabla con scroll contenido en tablet y conversión en tarjetas en móvil, mostrando provincia, cultivo, casos y tendencia con insignias de alto contraste.

### 2.7 App Móvil (`AppMovil.jsx`)
- **Escritorio (1440 px):** Portada destacada con smartphone flotante a la derecha, tarjeta de descarga con código QR de 148x148 px e instrucciones paso a paso numeradas en 4 columnas.
- **Tablet y Celular (768 / 375 px):** El texto de la portada se alinea a la izquierda de forma natural; el código QR se centra y los 4 pasos se apilan verticalmente.

### 2.8 Panel (`Panel.jsx`)
- **Escritorio (1440 px):** Bienvenida personalizada con gradiente tenue, rejilla de 4 KPIs de diagnósticos y plantas sanas, gráfica de barras diarias por categoría, y 2 tarjetas de igual altura (ranking de enfermedades frecuentes y dona de distribución por cultivo).
- **Tablet y Celular (768 / 375 px):** Gráficos apilados verticalmente; la dona y su leyenda se adaptan sin comprimir los números ni ocultar etiquetas.

### 2.9 Cómo Piensa la IA (`ComoPiensa.jsx`)
- **Escritorio (1440 px):** Flujo de 5 etapas en tarjetas con iconos degradados y sombra de brillo. Cuadrícula de 2 columnas con el simulador interactivo de umbral (12 casos demostrativos y slider) y tarjeta explicativa de fotos de campo y CAM.
- **Tablet y Celular (768 / 375 px):** Tarjetas de flujo a 1 columna. El deslizador de umbral y la matriz de casos se adaptan a 4 columnas sin salirse del ancho de pantalla.

### 2.10 Precisión en Campo / Modelos (`Modelos.jsx`)
- **Escritorio (1440 px):** Tarjetas de modelos especialistas (Café, Cacao, Hortalizas, etc.) con porcentaje de acierto en tipografía titular degradada, barras de precisión en campo vs laboratorio y matriz de confusión desplegable.
- **Tablet y Celular (768 / 375 px):** Cuadrícula a 1 columna; la matriz de confusión cuenta con scroll horizontal interno (`overflow-x: auto`) con padding inferior para no obstruir las celdas.

### 2.11 Acceso (`Acceso.jsx`)
- **Escritorio (1440 px):** Portada dividida con hero visual (partículas ascendentes, animación de escaneo y ficha flotante) a la izquierda y formulario de autenticación a la derecha. Botón de Google OAuth alineado a 400 px.
- **Tablet y Celular (768 / 375 px):** El hero se compacta ocultando textos secundarios para dar prioridad inmediata al formulario de login / registro con campos de 44 px de altura.

### 2.12 Seguridad y Auditoría (`Amenazas.jsx`, `Auditoria.jsx`, `Riesgos.jsx`, `Usuarios.jsx`)
- **Amenazas:** Radar SVG animado y selector de simulación; gráfico de dispersión de anomalía con umbral centrado.
- **Auditoria:** Buscador y filtros de estado/acción con tabla de eventos auditados responsiva.
- **Riesgos:** Matriz 5x5 con `overflow-x: auto` en móvil, visualización de controles antes y después.
- **Usuarios:** Gestión de cuentas con estados activos/desactivados y confirmación de seguridad.

---

## 3. Escala de espaciados y jerarquía visual

- **Tokens de espaciado:** 4 px (micro-gaps e insignias), 8 px (gaps entre elementos y botones), 12 px (padding interno de inputs y tarjetas compactas), 16 px (gaps de rejillas y padding móvil), 24 px (separación entre secciones principales) y 32 px (padding horizontal en escritorio).
- **Jerarquía tipográfica:**
  - `titular`: `clamp(1.8rem, 3.2vw, 2.6rem)`, font-weight 700, line-height 1.15.
  - `h1`: `clamp(1.6rem, 2.8vw, 2.2rem)`, font-weight 700.
  - `h2`: `1.35rem` (21.6 px), font-weight 700.
  - `h3`: `1.05rem` (16.8 px), font-weight 700.
  - `h4`: `0.92rem` (14.7 px), font-weight 600.
  - `body`: `15px`, line-height 1.55.
  - `tenue` / `pequeno`: `0.82rem` (13.1 px).
  - `sobretitulo`: `0.75rem`, font-weight 700, letter-spacing `0.12em`.

---

## 4. Archivos modificados

1. **`web/src/estilos.css`:**
   - Sustitución de `overflow-x: hidden` por `overflow-x: clip` en `html` y `body`.
   - Eliminación de `word-break: break-word` y `overflow-wrap: anywhere` en `body` para evitar partición arbitraria de palabras.
   - Barra lateral `.lateral` convertida en sticky (`position: sticky; top: 0; height: 100vh; overflow-y: auto; z-index: 25`) en escritorio.
   - Botones con `min-height: 40px`, `white-space: nowrap`, y estándar de 42 px en barras de filtros y acciones compartidas con inputs y selects.
   - Control de altura del mapa de brotes con `clamp(320px, 55vh, 560px)` y `align-items: start` en `.brotes-grid`.
   - Ajuste de `align-items: stretch` en `.rejilla-kpi`, `.rejilla-2`, `.rejilla-3` para igualar alturas de tarjetas en la misma fila.
   - Sistema responsivo de tablas con encabezados `white-space: nowrap`, anchos mínimos por columna, contenedor con `overflow-x: auto` y transformación completa a tarjetas individuales en móvil (<= 760 px).
   - `.matriz-r` protegida con `overflow-x: auto` en pantallas estrechas.
   - Jerarquía tipográfica y espaciados armonizados.

2. **`web/src/paginas/Historial.jsx`:**
   - Envoltura de la tabla principal de diagnósticos dentro de `<div className="tabla-contenedor">`.
   - Envoltura de la tabla de teléfonos vinculados dentro de `<div className="tabla-contenedor">`.

3. **`web/src/paginas/Parcelas.jsx`:**
   - Envoltura de la tabla de visitas en la vista de detalle dentro de `<div className="tabla-contenedor">`.

4. **`web/src/paginas/admin/Alertas.jsx`:**
   - Envoltura de la tabla de suscriptores y técnicos dentro de `<div className="tabla-contenedor">`.

5. **`web/src/paginas/admin/Auditoria.jsx`:**
   - Envoltura de la tabla de auditoría inalterable dentro de `<div className="tabla-contenedor">`.

6. **`web/src/paginas/admin/Reporte.jsx`:**
   - Envoltura de la tabla epidemiológica semanal dentro de `<div className="tabla-contenedor">`.

7. **`web/src/paginas/admin/Riesgos.jsx`:**
   - Envoltura de la tabla de matriz de riesgos dentro de `<div className="tabla-contenedor">`.

8. **`web/src/paginas/admin/Usuarios.jsx`:**
   - Envoltura de la tabla de usuarios y cuentas dentro de `<div className="tabla-contenedor">`.

9. **`web/src/paginas/AppMovil.css`:**
   - Ajuste de alineación responsive de la portada a la izquierda en móvil para consistencia con el resto del diseño.

10. **`docs/revision_diseno_web.md`:**
    - Creación del presente informe detallado de revisión y soluciones de diseño.
