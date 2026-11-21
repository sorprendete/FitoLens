# Compila el APK de release de FitoLens en esta PC (sin cuenta de Expo).
# Requisitos: Android Studio (SDK + JDK) y la firma en C:\Users\PC1\FitoLens-firma.
# Uso, desde FitoLens\app:  powershell -ExecutionPolicy Bypass -File compilar_apk.ps1
# Antes de una version nueva, sube "version" en app.json (2.0.0 -> 2.0.1).
$ErrorActionPreference = 'Stop'
# Windows limita las rutas a 260 caracteres y la compilacion nativa las supera:
# compila desde una copia en una ruta corta (C:\f). Node resuelve rutas reales, asi que subst/junction no sirven.
$corta = 'C:\f'
if ($PSScriptRoot -ne $corta) {
  robocopy $PSScriptRoot $corta /MIR /XD "$PSScriptRoot\android\build" "$PSScriptRoot\android\app\build" "$PSScriptRoot\android\app\.cxx" "$PSScriptRoot\android\.gradle" /XF FitoLens.apk /NFL /NDL /NJH /NJS /NP | Out-Null
  & powershell -ExecutionPolicy Bypass -File "$corta\compilar_apk.ps1"
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  Copy-Item "$corta\FitoLens.apk" "$PSScriptRoot\FitoLens.apk" -Force
  exit 0
}
Set-Location $corta
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
# Cache de Gradle propia de FitoLens (no se mezcla con la de Android Studio).
$env:GRADLE_USER_HOME = "$env:USERPROFILE\.gradle-fitolens3"
$firma = "$env:USERPROFILE\FitoLens-firma\firma.properties"
if (-not (Test-Path $firma)) { throw "Falta la firma: $firma" }
if (-not (Test-Path android\gradlew.bat)) { $env:CI = '1'; npx expo prebuild -p android --no-install }
# android/ lo genera expo prebuild (no va a git): le agregamos la firma propia y el versionCode.
$g = (Resolve-Path 'android\app\build.gradle').Path; $t = [IO.File]::ReadAllText($g)
if ($t -notmatch 'FITOLENS_UPLOAD_STORE_FILE') {
  $t = $t -replace "(keyPassword 'android'\s*\r?\n\s*\})", "`$1`n        release {`n            if (findProperty('FITOLENS_UPLOAD_STORE_FILE')) {`n                storeFile file(findProperty('FITOLENS_UPLOAD_STORE_FILE'))`n                storePassword findProperty('FITOLENS_UPLOAD_STORE_PASSWORD')`n                keyAlias findProperty('FITOLENS_UPLOAD_KEY_ALIAS')`n                keyPassword findProperty('FITOLENS_UPLOAD_KEY_PASSWORD')`n            }`n        }"
  $t = $t -replace "(release \{\s*\r?\n(\s*//[^\n]*\n)*\s*)signingConfig signingConfigs\.debug", "`$1signingConfig findProperty('FITOLENS_UPLOAD_STORE_FILE') ? signingConfigs.release : signingConfigs.debug"
  $t = $t -replace 'versionCode 1\b', "versionCode((findProperty('versionCodeOverride') ?: '1') as int)"
  [IO.File]::WriteAllText($g, $t)
  if ($t -notmatch 'signingConfigs\.release') { throw 'No se pudo poner la firma en build.gradle' }
}
# La compilacion nativa (CMake) crea rutas muy largas dentro de android\app\.cxx: la mandamos a C:\c.
$t = [IO.File]::ReadAllText($g)
if ($t -notmatch 'buildStagingDirectory') {
  $t = $t -replace '(ndkVersion rootProject\.ext\.ndkVersion)', "`$1`n    externalNativeBuild { cmake { buildStagingDirectory = file('C:/c') } }"
  [IO.File]::WriteAllText($g, $t)
}
# onnxruntime-react-native trae un unimodule.json viejo y el autolinking de Expo NO lo enlaza:
# sin esto el APK sale sin ONNX Runtime y la app cae a "IA en el servidor" (sin diagnostico offline).
$st = (Resolve-Path 'android\settings.gradle').Path; $sc = [IO.File]::ReadAllText($st)
if ($sc -notmatch 'onnxruntime-react-native') {
  [IO.File]::WriteAllText($st, $sc + "`ninclude ':onnxruntime-react-native'`nproject(':onnxruntime-react-native').projectDir = new File(rootDir, '../node_modules/onnxruntime-react-native/android')`n")
}
$t = [IO.File]::ReadAllText($g)
if ($t -notmatch "project\(':onnxruntime-react-native'\)") {
  $t = $t -replace '(dependencies \{)', "`$1`n    implementation project(':onnxruntime-react-native')"
  [IO.File]::WriteAllText($g, $t)
}
$ma = (Get-ChildItem 'android\app\src\main' -Recurse -Filter MainApplication.kt | Select-Object -First 1).FullName; $mc = [IO.File]::ReadAllText($ma)
if ($mc -notmatch 'OnnxruntimePackage') {
  $mc = $mc -replace '// add\(MyReactNativePackage\(\)\)', 'add(ai.onnxruntime.reactnative.OnnxruntimePackage())'
  [IO.File]::WriteAllText($ma, $mc)
  if ($mc -notmatch 'OnnxruntimePackage') { throw 'No se pudo registrar OnnxruntimePackage en MainApplication' }
}
# onnxruntime-react-native usa VersionNumber, que Gradle 9 ya no tiene; esa rama solo aplica a RN < 0.71.
$ort = (Resolve-Path 'node_modules\onnxruntime-react-native\android\build.gradle').Path
$o = [IO.File]::ReadAllText($ort)
if ($o -match 'VersionNumber\.parse') { [IO.File]::WriteAllText($ort, ($o -replace 'if \(VersionNumber\.parse\(REACT_NATIVE_VERSION\) < VersionNumber\.parse\("0\.71"\)\)', 'if (false /* RN >= 0.71 */)')) }
Set-Content android\local.properties ("sdk.dir=" + ($env:ANDROID_HOME -replace '\\', '/')) -Encoding ascii
$props = Get-Content $firma | Where-Object { $_ -match '^FITOLENS_' } | ForEach-Object { "-P$_" }
# versionCode = numero de compilacion (sube solo): minutos desde 2026
$codigo = [int]((Get-Date) - (Get-Date '2026-01-01')).TotalMinutes
$args = @('assembleRelease', '--no-daemon', "-PversionCodeOverride=$codigo", "-PreactNativeArchitectures=$(if ($env:FITOLENS_ABIS) { $env:FITOLENS_ABIS } else { 'arm64-v8a' })") + $props
Push-Location android
.\gradlew.bat @args
$ok = $LASTEXITCODE
Pop-Location
if ($ok -ne 0) { throw "Gradle fallo (codigo $ok)" }
$apk = 'android\app\build\outputs\apk\release\app-release.apk'
Copy-Item $apk FitoLens.apk -Force
Get-Item FitoLens.apk | Select-Object Name, @{n = 'MB'; e = { [math]::Round($_.Length / 1MB, 1) } }
