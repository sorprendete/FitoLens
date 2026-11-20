# FitoLens app (Android e iPhone)

App móvil de FitoLens v2. Diagnostica **sin internet**: los modelos ONNX van dentro de la app y corren en el teléfono con el mismo flujo que la API (router de cultivo → especialista). Guarda un historial local (SQLite) y, cuando hay internet, puede **sincronizar** las fotos con `https://fitolens.5-253-232-122.sslip.io` (entran al mapa de brotes con `origen=app`).

Hecha con Expo (React Native + TypeScript). Un solo código para Android e iOS.

## Estructura

```
App.tsx              pantallas: Diagnosticar e Historial
src/ia.ts            diagnóstico en el teléfono (router → especialista, umbral, temperatura)
src/imagen.ts        foto → tensor [1,3,H,W] RGB 0–1 (redimensión directa)
src/modelos.ts       lista de modelos incluidos (lee modelos.json)
src/historial.ts     SQLite + sincronización
src/servidor.ts      conexión con la API
src/catalogo.ts      nombres, consejos y urgencia por clase (igual que la web)
src/tema.ts          paleta (igual que la web)
assets/modelos/      router.onnx, hortalizas.onnx, cafe.onnx, cacao.onnx + modelos.json
```

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
eas build -p android --profile apk
```

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
