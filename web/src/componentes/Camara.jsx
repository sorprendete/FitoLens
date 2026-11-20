import { Camera, SwitchCamera, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

// Cámara en vivo (getUserMedia). Requiere HTTPS o localhost. Devuelve un File JPEG.
export default function Camara({ onCaptura, onCerrar }) {
  const video = useRef(null)
  const [modo, setModo] = useState('environment')
  const [error, setError] = useState('')
  const [varias, setVarias] = useState(false)

  useEffect(() => {
    let flujo, cancelado = false
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: { ideal: modo }, width: { ideal: 1920 } }, audio: false })
      .then(async (s) => {
        if (cancelado) return s.getTracks().forEach((t) => t.stop())
        flujo = s
        video.current.srcObject = s
        const d = await navigator.mediaDevices.enumerateDevices()
        setVarias(d.filter((x) => x.kind === 'videoinput').length > 1)
      })
      .catch((e) => setError(e?.name === 'NotAllowedError'
        ? 'No diste permiso para usar la cámara. Actívalo en el candado de la barra de direcciones.'
        : 'No se encontró una cámara. Usa "Subir foto".'))
    const esc = (e) => e.key === 'Escape' && onCerrar()
    window.addEventListener('keydown', esc)
    return () => { cancelado = true; flujo?.getTracks().forEach((t) => t.stop()); window.removeEventListener('keydown', esc) }
  }, [modo, onCerrar])

  function capturar() {
    const v = video.current
    if (!v?.videoWidth) return
    const c = document.createElement('canvas')
    c.width = v.videoWidth; c.height = v.videoHeight
    c.getContext('2d').drawImage(v, 0, 0)
    c.toBlob((b) => b && onCaptura(new File([b], 'foto.jpg', { type: 'image/jpeg' })), 'image/jpeg', 0.92)
  }

  return (
    <div className="camara-fondo" role="dialog" aria-modal="true" aria-label="Cámara">
      {error ? <p className="camara-error">{error}</p> : <video ref={video} autoPlay playsInline muted />}
      <div className="camara-guia" aria-hidden="true"><span>Centra una hoja o mazorca</span></div>
      <div className="camara-barra">
        <button className="boton-redondo sec" onClick={onCerrar} aria-label="Cerrar"><X /></button>
        <button className="disparador" onClick={capturar} disabled={!!error} aria-label="Capturar"><Camera size={30} /></button>
        <button className="boton-redondo sec" onClick={() => setModo((m) => (m === 'user' ? 'environment' : 'user'))}
          disabled={!varias} aria-label="Cambiar cámara"><SwitchCamera /></button>
      </div>
    </div>
  )
}
