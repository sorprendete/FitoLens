# FitoLens app (Android e iPhone)

App móvil de FitoLens v2. Diagnostica **sin internet**: los modelos ONNX van dentro de la app y corren en el teléfono con el mismo flujo que la API (router de cultivo → especialista). Guarda un historial local (SQLite) y, cuando hay internet, puede **sincronizar** las fotos con `https://fitolens.5-253-232-122.sslip.io` (entran al mapa de brotes con `origen=app`).

Hecha con Expo (React Native + TypeScript). Un solo código para Android e iOS.

## Estructura

```
App.tsx              pantallas: Diagnosticar e Historial
src/ia.ts            diagnóstico en el teléfono (router → especialista, umbral, temperatura)
src/imagen.ts        foto → tensor [1,3,H,W] RGB 0–1 (redimensión directa)
src/modelos.ts       lista de modelos incluidos (lee modelos.json)
src/historial.ts     SQLite: historial y cola de envío (subida automática con cuenta)
src/servidor.ts      conexión con la API
src/cuenta.ts        cuenta opcional: token en expo-secure-store, provincia
src/Cuenta.tsx       pestaña Cuenta
src/catalogo.ts      nombres, consejos y urgencia por clase (igual que la web)
src/tema.ts          paleta (igual que la web)
assets/modelos/      router.onnx, hortalizas.onnx, cafe.onnx, cacao.onnx + modelos.json
```

## Cuenta y sincronización

La app funciona entera sin internet y sin cuenta. En la pestaña **Cuenta** se puede iniciar sesión con la misma cuenta de la web (hace falta internet una sola vez):

1. La app llama a `POST /api/dispositivos` y recibe un token que dura 90 días (la web dura 12 h, pero el teléfono puede pasar días sin señal). Se guarda cifrado en el teléfono.
2. Cada diagnóstico se guarda en SQLite con un `id_cliente` único. Esa tabla es la cola.
3. Cuando vuelve internet (o al abrir la app, o tras diagnosticar), la cola se sube sola a `POST /api/sincronizar` con el resultado que vio el agricultor, la fecha real de la foto y la provincia elegida. Si un envío se corta y se repite, el servidor no lo duplica.
4. Los diagnósticos aparecen en el **Historial** de la web (columna "Desde: App"). Ahí mismo se ve la lista de teléfonos vinculados y se puede desvincular uno perdido: ese token deja de servir al instante.

Sin cuenta, el botón Sincronizar del historial sigue enviando las fotos de forma anónima (solo suman al mapa de brotes).

## Visión de la IA, reporte y voz (sin internet)

- Resultado: pasos "Analizando…", nombre y consejo en letra grande, consejos con dibujo para repetir la foto y botón "Tomar otra foto" (`src/Resultado.tsx`).
- Interruptor "Foto original / Visión de la IA" (`src/VisionIA.tsx`): mapa de calor de la salida `cam` del especialista y contorno de la hoja con U2-Net-p (`assets/recursos/u2netp_192.onnx`, 4.6 MB). La lógica está en `src/vision.ts` y es copia de `api/app/ia/segmentacion.py` y `mapa_calor.py` (probada: mismo resultado que Python en las 88 fotos de `api/pruebas/segmentacion`). El contorno nunca cambia el diagnóstico.
- Reporte PDF hecho en el teléfono con `expo-print` y compartido con `expo-sharing` (`src/BotonReporte.tsx`).
- Voz en castellano y quechua con la voz del teléfono (`src/Voz.tsx`).

## Cambiar los modelos

Los de `assets/modelos/` ahora son **falsos** (pesan bytes y responden al azar), solo para que la app compile. Para poner los reales, desde `FitoLens/`:

```bash
python entrenamiento/movil/cuantizar.py --modelos modelos --fotos muestras --salida app/assets/modelos
```

y vuelve a compilar. No hace falta tocar código. Un cultivo que no esté en `modelos.json` sale como "Todavía no hay un modelo instalado para este cultivo".

## Probar rápido con Expo Go

```bash
cd app
npm install
npx expo start          # escanea el QR con Expo Go (Android) o la cámara (iPhone)
```

Expo Go **no** puede cargar onnxruntime (es código nativo), así que ahí la app diagnostica con el servidor (necesita internet). El chip de arriba dice "IA en el servidor". Sirve para revisar pantallas y flujo.

## Probar la IA sin internet (build de desarrollo)

```bash
npm install -g eas-cli
eas login                                   # cuenta gratuita de expo.dev
eas build -p android --profile desarrollo   # instala el APK y luego:  npx expo start --dev-client
```

## Generar el APK (Android)

```bash
# Desde la carpeta app/. EAS_NO_VCS hace que use .easignore (que sí incluye los modelos .onnx).
# En Windows (PowerShell):  $env:EAS_NO_VCS=1; $env:EAS_PROJECT_ROOT="."; npx eas-cli build -p android --profile apk
EAS_NO_VCS=1 EAS_PROJECT_ROOT=. npx eas-cli build -p android --profile apk
```

Para que se descargue desde la web (sección "App móvil"): copia el `.apk` al VPS y publícalo con
`bash scripts/publicar_apk.sh FitoLens.apk 2.0.1 "Qué cambió"` dentro de `despliegue/` (queda en `https://<sitio>/descargas/FitoLens.apk`).

## Actualizaciones (aviso "Actualizar")

Con internet, la app revisa `/descargas/app.json` al abrirse (máximo una vez por hora). Si esa versión es mayor que la suya,
muestra una franja "Nueva versión X · Actualizar": descarga el APK y abre el instalador de Android. El historial y la cuenta se conservan.

Para sacar una versión nueva: 1) sube `version` en `app.json` (2.0.0 → 2.0.1), 2) compila con EAS (perfil `apk`, el número interno sube solo),
3) publícalo con `publicar_apk.sh`. Siempre con la misma cuenta de Expo: Android solo actualiza si el APK lleva la misma firma.

Al terminar, EAS da un enlace y un QR para descargar el `.apk` e instalarlo en cualquier Android (sirve para el stand de la Expoferia).

## Generar el IPA (iPhone)

```bash
eas build -p ios --profile ios-prueba
```

Necesita una cuenta de **Apple Developer** (99 USD/año). EAS registra los iPhone de prueba con `eas device:create` y genera el `.ipa` instalable por enlace. Para publicar en tiendas: `eas build --profile tiendas` y `eas submit`.

## Datos técnicos

- Expo SDK 58, React Native 0.88, `onnxruntime-react-native` 1.24.
- Identificador: `pe.edu.unsm.fitolens` (Android e iOS). Cámbialo en `app.json` si hace falta.
- La URL del servidor está en `app.json` → `expo.extra.api`.
- Revisión rápida: `npx tsc --noEmit` y `npx expo export --platform android`.
