import { Download, HardDrive, RefreshCw, ShieldCheck, Smartphone, WifiOff } from 'lucide-react'
import QRCode from 'qrcode'
import { useEffect, useState } from 'react'
import './AppMovil.css'

// Descarga de la app móvil. El APK no va en la imagen de la web: el servidor lo sirve
// desde /descargas/ (carpeta despliegue/descargas del VPS). Al publicar un APK nuevo,
// despliegue/scripts/publicar_apk.sh escribe /descargas/app.json con versión, tamaño y fecha.
// Si ese archivo no existe, la página dice que la descarga aún no está lista (no inventa nada).
const APK = '/descargas/FitoLens.apk'
const INFO = '/descargas/app.json'

const PASOS = [
  ['Descarga', 'Toca "Descargar APK" o escanea el código QR con la cámara del celular.'],
  ['Abre el archivo', 'Cuando termine, toca la notificación o búscalo en la carpeta Descargas.'],
  ['Permite la instalación', 'Android pedirá permiso para instalar apps de esta fuente. Acepta solo para FitoLens.'],
  ['Listo', 'Abre FitoLens, permite la cámara y fotografía una hoja. Funciona sin internet.'],
]

export default function AppMovil() {
  const [info, setInfo] = useState(undefined) // undefined: cargando · null: aún no hay APK
  const [qr, setQr] = useState('')
  const enlace = `${location.origin}${APK}`

  useEffect(() => {
    let vivo = true
    fetch(INFO, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((d) => vivo && setInfo(d?.version ? d : null))
    QRCode.toString(enlace, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0b1020', light: '#ffffff' } })
      .then((s) => vivo && setQr(s))
      .catch(() => {})
    return () => { vivo = false }
  }, [enlace])

  const lista = !!info
  return (
    <div className="apilado app-movil">
      <section className="tarjeta destacada am-portada">
        <div className="am-portada-txt">
          <p className="sobre">App móvil · Android</p>
          <h2>FitoLens en tu celular, incluso sin señal</h2>
          <p className="tenue">La IA va dentro del teléfono: diagnostica en la chacra aunque no haya internet. Cuando vuelve la señal,
            tus diagnósticos se suben solos a tu cuenta.</p>
          <ul className="am-ventajas">
            <li><WifiOff size={17} />Diagnóstico sin internet</li>
            <li><RefreshCw size={17} />Se sincroniza con la web</li>
            <li><ShieldCheck size={17} />Modelos verificados con SHA-256</li>
          </ul>
        </div>
        <Smartphone className="am-icono" size={64} strokeWidth={1.4} aria-hidden="true" />
      </section>

      <div>
        <section className="tarjeta am-plataforma">
          <div className="tarjeta-cab">
            <h3><Smartphone size={18} />Android</h3>
            {info === undefined ? <span className="insignia neutro">Revisando…</span>
              : lista ? <span className="insignia ok">Disponible</span> : <span className="insignia aviso">Muy pronto</span>}
          </div>
          <div className="am-descarga">
            <div className={`am-qr ${lista ? '' : 'apagado'}`} aria-label="Código QR para descargar el APK"
              dangerouslySetInnerHTML={{ __html: qr }} />
            <div className="am-descarga-txt">
              <p>Escanea el código con la cámara del celular o descarga el archivo directamente.</p>
              {lista ? (
                <a className="btn" href={APK} download="FitoLens.apk"><Download size={18} />Descargar APK</a>
              ) : (
                <button className="btn" disabled><Download size={18} />Descargar APK</button>
              )}
              <p className="pequeno tenue am-datos">
                {lista
                  ? <><HardDrive size={14} />Versión {info.version}{info.tamano_mb ? ` · ${info.tamano_mb} MB` : ''}{info.fecha ? ` · ${info.fecha}` : ''} · Android 7 o superior</>
                  : 'Estamos preparando el archivo de instalación. Vuelve a esta página en unos días.'}
              </p>
            </div>
          </div>
        </section>

      </div>

      <section className="tarjeta">
        <div className="tarjeta-cab"><h3>Cómo instalarla en Android</h3></div>
        <ol className="am-pasos">
          {PASOS.map(([t, d], i) => (
            <li key={t}><span>{i + 1}</span><div><b>{t}</b><small>{d}</small></div></li>
          ))}
        </ol>
        <p className="pequeno tenue am-nota">Android muestra un aviso porque la app no viene de Google Play. Es normal en apps descargadas desde una web:
          el archivo sale directamente de este servidor, con conexión cifrada.</p>
      </section>
    </div>
  )
}
