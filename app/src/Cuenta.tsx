// Pestaña Cuenta: vinculación a la web, selector de tema claro/oscuro, mis cultivos y provincia.
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { GoogleSignin, isSuccessResponse, statusCodes } from '@react-native-google-signin/google-signin'
import { ModoTema, useTema } from './tema'
import { PROVINCIAS, alCambiar, cerrarSesion, cuentaActual, elegirProvincia, iniciarSesion, iniciarSesionGoogle, provinciaActual } from './cuenta'
import { pendientes, sincronizar } from './historial'
import { API, enLinea } from './servidor'
import MisCultivos from './MisCultivos'

const GOOGLE_WEB_CLIENT_ID = '57119843943-eri36uvtp35t2b0nuh6kqvoqt25fc6sp.apps.googleusercontent.com'

try {
  GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID })
} catch {}

export default function Cuenta() {
  const { colores: C, modo, setModo, brillo } = useTema()
  const [, refrescar] = useState(0)
  const [pend, setPend] = useState(0)
  const actualizar = useCallback(() => { setPend(pendientes()); refrescar((x) => x + 1) }, [])
  useEffect(() => { actualizar(); return alCambiar(actualizar) }, [actualizar])
  const cuenta = cuentaActual()

  return (
    <ScrollView contentContainerStyle={s.contenido} keyboardShouldPersistTaps="handled">
      {/* 1. Selector de Tema */}
      <View style={[s.tarjeta, { backgroundColor: C.sup, borderColor: C.borde }]}>
        <Text style={[s.sobre, { color: C.acento }]}>APARIENCIA</Text>
        <Text style={[s.titulo, { color: C.texto }]}>Tema de la aplicación</Text>
        <Text style={[s.tenue, { color: C.tenue }]}>Elige si prefieres el tema oscuro de campo o el tema claro con alto contraste solar.</Text>
        <View style={s.filaSelectorTema}>
          {(['sistema', 'claro', 'oscuro'] as ModoTema[]).map((m) => {
            const activo = modo === m
            const etiqueta = m === 'sistema' ? 'Automático' : m === 'claro' ? 'Tema Claro' : 'Tema Oscuro'
            return (
              <Pressable
                key={m}
                onPress={() => setModo(m)}
                style={[
                  s.opcionTema,
                  {
                    borderColor: activo ? C.acento : C.borde2,
                    backgroundColor: activo ? C.acento + '22' : C.fondo2,
                  },
                ]}
              >
                <Text style={{ color: activo ? C.acento : C.tenue, fontWeight: '700', fontSize: 13 }}>
                  {etiqueta}
                </Text>
              </Pressable>
            )
          })}
        </View>
      </View>

      {/* 2. Sesión / Vinculación */}
      {cuenta ? <Vinculada pend={pend} actualizar={actualizar} /> : <Ingresar />}

      {/* 3. Mis cultivos descargados */}
      <View style={[s.tarjeta, { backgroundColor: C.sup, borderColor: C.borde }]}>
        <MisCultivos alCambiar={actualizar} />
      </View>

      {/* 4. Mi provincia */}
      <View style={[s.tarjeta, { backgroundColor: C.sup, borderColor: C.borde }]}>
        <Text style={[s.sobre, { color: C.acento }]}>MI PROVINCIA</Text>
        <Text style={[s.tenue, { color: C.tenue }]}>Va con cada diagnóstico para el mapa de brotes de San Martín. Se puede dejar sin elegir.</Text>
        <View style={s.fila}>
          {Object.entries(PROVINCIAS).map(([id, nombre]) => {
            const activa = provinciaActual() === id
            return (
              <Pressable key={id} onPress={() => elegirProvincia(activa ? null : id)}
                style={[s.etiqueta, { borderColor: activa ? C.acento : C.borde2, backgroundColor: activa ? C.acento + '22' : 'transparent' }]}>
                <Text style={{ color: activa ? C.acento : C.tenue, fontWeight: '600' }}>{nombre}</Text>
              </Pressable>
            )
          })}
        </View>
      </View>
    </ScrollView>
  )
}

function Ingresar() {
  const { colores: C, brillo } = useTema()
  const [email, setEmail] = useState('')
  const [clave, setClave] = useState('')
  const [cargando, setCargando] = useState(false)
  const [cargandoGoogle, setCargandoGoogle] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const entrar = async () => {
    setError(null); setCargando(true)
    try { await iniciarSesion(email, clave); setClave('') } catch (e: any) {
      setError(e?.message === 'Network request failed' ? 'Sin conexión. Para iniciar sesión hace falta internet una sola vez.' : e?.message ?? 'No se pudo iniciar sesión.')
    } finally { setCargando(false) }
  }

  const entrarGoogle = async () => {
    setError(null)
    setCargandoGoogle(true)
    try {
      const conectado = await enLinea()
      if (!conectado) {
        setError('Sin conexión. Para iniciar sesión con Google se necesita internet.')
        return
      }
      await GoogleSignin.hasPlayServices()
      const r = await GoogleSignin.signIn()
      if (isSuccessResponse(r)) {
        const idToken = r.data.idToken
        if (!idToken) {
          setError('No se pudo obtener el token de Google.')
          return
        }
        await iniciarSesionGoogle(idToken)
      }
    } catch (e: any) {
      if (e?.code === statusCodes.SIGN_IN_CANCELLED) {
        return
      }
      if (e?.code === statusCodes.IN_PROGRESS) {
        return
      }
      if (e?.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        setError('Google Play Services no está disponible en este dispositivo.')
        return
      }
      const msj = e?.message ?? ''
      if (msj.includes('Network') || msj.includes('network') || msj === 'Network request failed') {
        setError('Sin conexión. Para iniciar sesión con Google se necesita internet.')
      } else {
        setError(typeof e?.message === 'string' ? e.message : 'No se pudo iniciar sesión con Google.')
      }
    } finally {
      setCargandoGoogle(false)
    }
  }

  return (
    <View style={[s.tarjeta, { backgroundColor: C.sup, borderColor: C.borde }, brillo(C.acento2)]}>
      <Text style={[s.sobre, { color: C.acento2 }]}>CUENTA (OPCIONAL)</Text>
      <Text style={[s.titulo, { color: C.texto }]}>Vincula este teléfono a tu cuenta de la web</Text>
      <Text style={[s.tenue, { color: C.tenue }]}>La app funciona igual sin cuenta. Con cuenta, lo que diagnostiques sin internet se sube solo cuando vuelva la señal y lo ves en el Historial de la web.</Text>
      <TextInput style={[s.campo, { backgroundColor: C.fondo2, borderColor: C.borde2, color: C.texto }]} placeholder="Correo" placeholderTextColor={C.tenue} value={email} onChangeText={setEmail}
        autoCapitalize="none" autoComplete="email" keyboardType="email-address" />
      <TextInput style={[s.campo, { backgroundColor: C.fondo2, borderColor: C.borde2, color: C.texto }]} placeholder="Contraseña" placeholderTextColor={C.tenue} value={clave} onChangeText={setClave}
        secureTextEntry autoComplete="password" onSubmitEditing={entrar} />
      {error && <Text style={{ color: C.coral }}>{error}</Text>}
      <Pressable onPress={entrar} disabled={cargando || cargandoGoogle || !email || !clave}
        style={({ pressed }) => [s.boton, { backgroundColor: C.acento }, (pressed || cargando || cargandoGoogle || !email || !clave) && { opacity: 0.6 }]}>
        {cargando ? <ActivityIndicator color={C.textoBotonAcento} /> : <Text style={[s.botonTxt, { color: C.textoBotonAcento }]}>Iniciar sesión</Text>}
      </Pressable>

      <View style={s.separadorFila}>
        <View style={[s.lineaSeparador, { backgroundColor: C.borde2 }]} />
        <Text style={[s.separadorTxt, { color: C.tenue }]}>o</Text>
        <View style={[s.lineaSeparador, { backgroundColor: C.borde2 }]} />
      </View>

      <Pressable onPress={entrarGoogle} disabled={cargando || cargandoGoogle}
        style={({ pressed }) => [s.boton, { backgroundColor: C.fondo2, borderColor: C.borde2 }, (pressed || cargando || cargandoGoogle) && { opacity: 0.6 }]}>
        {cargandoGoogle ? <ActivityIndicator color={C.texto} /> : <Text style={[s.botonTxt, { color: C.texto }]}>Continuar con Google</Text>}
      </Pressable>

      <Pressable onPress={() => Linking.openURL(API)} style={{ minHeight: 44, justifyContent: 'center' }}>
        <Text style={[s.tenue, { color: C.acento }]}>¿No tienes cuenta? Créala en la web</Text>
      </Pressable>
    </View>
  )
}

function Vinculada({ pend, actualizar }: { pend: number; actualizar: () => void }) {
  const { colores: C, brillo } = useTema()
  const cuenta = cuentaActual()!
  const [aviso, setAviso] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const subirAhora = async () => {
    setEnviando(true); setAviso(null)
    try { const n = await sincronizar(); setAviso(n ? `${n} diagnósticos subidos a tu cuenta.` : 'Nada nuevo para subir.') }
    catch (e: any) { setAviso(e?.message ?? 'No se pudo subir.') }
    finally { setEnviando(false); actualizar() }
  }

  return (
    <View style={[s.tarjeta, { backgroundColor: C.sup, borderColor: C.borde }, brillo(C.acento)]}>
      <Text style={[s.sobre, { color: C.acento }]}>TELÉFONO VINCULADO</Text>
      <Text style={[s.titulo, { color: C.texto }]}>{cuenta.nombre}</Text>
      <Text style={[s.tenue, { color: C.tenue }]}>{cuenta.email}</Text>
      <Text style={[s.texto, { color: C.texto, marginTop: 4 }]}>
        {pend ? `${pend} diagnósticos esperan internet. Se suben solos cuando haya señal.` : 'Todo está subido a tu cuenta.'}
      </Text>
      {aviso && <Text style={{ color: C.acento }}>{aviso}</Text>}
      <View style={s.fila}>
        <Pressable onPress={subirAhora} disabled={enviando || pend === 0}
          style={({ pressed }) => [s.boton, { flex: 1, backgroundColor: C.acento }, (pressed || enviando || pend === 0) && { opacity: 0.6 }]}>
          <Text style={[s.botonTxt, { color: C.textoBotonAcento }]}>{enviando ? 'Subiendo…' : 'Subir ahora'}</Text>
        </Pressable>
        <Pressable onPress={() => { cerrarSesion().catch(() => {}) }} style={({ pressed }) => [s.boton, { flex: 1, borderColor: C.borde2 }, pressed && { opacity: 0.6 }]}>
          <Text style={[s.botonTxt, { color: C.texto }]}>Cerrar sesión</Text>
        </Pressable>
      </View>
      <Text style={[s.pie, { color: C.tenue }]}>Al cerrar sesión, lo ya subido queda en la web y lo pendiente se queda en este teléfono.</Text>
    </View>
  )
}

const s = StyleSheet.create({
  contenido: { padding: 16, gap: 14, paddingBottom: 36 },
  tarjeta: { borderWidth: 1, borderRadius: 18, padding: 18, gap: 10 },
  sobre: { fontSize: 11, fontWeight: '700', letterSpacing: 1.6 },
  titulo: { fontSize: 20, fontWeight: '800' },
  texto: { fontSize: 15, lineHeight: 22 },
  tenue: { fontSize: 13, lineHeight: 19 },
  pie: { fontSize: 11, marginTop: 4 },
  fila: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  filaSelectorTema: { flexDirection: 'row', gap: 8, marginTop: 4 },
  separadorFila: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 2 },
  lineaSeparador: { flex: 1, height: 1 },
  separadorTxt: { fontSize: 13, fontWeight: '600' },
  opcionTema: {
    flex: 1,
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  etiqueta: { borderWidth: 1, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 8, minHeight: 44, justifyContent: 'center' },
  campo: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, minHeight: 50, fontSize: 15 },
  boton: { minHeight: 50, borderRadius: 14, borderWidth: 1, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  botonTxt: { fontWeight: '700', fontSize: 15 },
})
