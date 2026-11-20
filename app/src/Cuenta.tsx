// Pestaña Cuenta: vincular el teléfono a una cuenta de la web (opcional) y elegir la provincia.
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { C, brillo } from './tema'
import { PROVINCIAS, alCambiar, cerrarSesion, cuentaActual, elegirProvincia, iniciarSesion, provinciaActual } from './cuenta'
import { pendientes, sincronizar } from './historial'
import { API } from './servidor'

export default function Cuenta() {
  const [, refrescar] = useState(0)
  const [pend, setPend] = useState(0)
  const actualizar = useCallback(() => { setPend(pendientes()); refrescar((x) => x + 1) }, [])
  useEffect(() => { actualizar(); return alCambiar(actualizar) }, [actualizar])
  const cuenta = cuentaActual()

  return (
    <ScrollView contentContainerStyle={s.contenido} keyboardShouldPersistTaps="handled">
      {cuenta ? <Vinculada pend={pend} actualizar={actualizar} /> : <Ingresar />}

      <View style={s.tarjeta}>
        <Text style={s.sobre}>MI PROVINCIA</Text>
        <Text style={s.tenue}>Va con cada diagnóstico para el mapa de brotes de San Martín. Se puede dejar sin elegir.</Text>
        <View style={s.fila}>
          {Object.entries(PROVINCIAS).map(([id, nombre]) => {
            const activa = provinciaActual() === id
            return (
              <Pressable key={id} onPress={() => elegirProvincia(activa ? null : id)}
                style={[s.etiqueta, activa && { borderColor: C.acento, backgroundColor: C.acento + '22' }]}>
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
  const [email, setEmail] = useState('')
  const [clave, setClave] = useState('')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const entrar = async () => {
    setError(null); setCargando(true)
    try { await iniciarSesion(email, clave); setClave('') } catch (e: any) {
      setError(e?.message === 'Network request failed' ? 'Sin conexión. Para iniciar sesión hace falta internet una sola vez.' : e?.message ?? 'No se pudo iniciar sesión.')
    } finally { setCargando(false) }
  }

  return (
    <View style={[s.tarjeta, brillo(C.acento2)]}>
      <Text style={[s.sobre, { color: C.acento2 }]}>CUENTA (OPCIONAL)</Text>
      <Text style={s.titulo}>Vincula este teléfono a tu cuenta de la web</Text>
      <Text style={s.tenue}>La app funciona igual sin cuenta. Con cuenta, lo que diagnostiques sin internet se sube solo cuando vuelva la señal y lo ves en el Historial de la web.</Text>
      <TextInput style={s.campo} placeholder="Correo" placeholderTextColor={C.tenue} value={email} onChangeText={setEmail}
        autoCapitalize="none" autoComplete="email" keyboardType="email-address" />
      <TextInput style={s.campo} placeholder="Contraseña" placeholderTextColor={C.tenue} value={clave} onChangeText={setClave}
        secureTextEntry autoComplete="password" onSubmitEditing={entrar} />
      {error && <Text style={{ color: C.coral }}>{error}</Text>}
      <Pressable onPress={entrar} disabled={cargando || !email || !clave}
        style={({ pressed }) => [s.boton, { backgroundColor: C.acento }, (pressed || cargando || !email || !clave) && { opacity: 0.6 }]}>
        {cargando ? <ActivityIndicator color={C.fondo} /> : <Text style={[s.botonTxt, { color: C.fondo }]}>Iniciar sesión</Text>}
      </Pressable>
      <Pressable onPress={() => Linking.openURL(API)}>
        <Text style={[s.tenue, { color: C.acento, marginTop: 6 }]}>¿No tienes cuenta? Créala en la web</Text>
      </Pressable>
    </View>
  )
}

function Vinculada({ pend, actualizar }: { pend: number; actualizar: () => void }) {
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
    <View style={[s.tarjeta, brillo(C.acento)]}>
      <Text style={s.sobre}>TELÉFONO VINCULADO</Text>
      <Text style={s.titulo}>{cuenta.nombre}</Text>
      <Text style={s.tenue}>{cuenta.email}</Text>
      <Text style={[s.texto, { marginTop: 8 }]}>
        {pend ? `${pend} diagnósticos esperan internet. Se suben solos cuando haya señal.` : 'Todo está subido a tu cuenta.'}
      </Text>
      {aviso && <Text style={{ color: C.acento }}>{aviso}</Text>}
      <View style={s.fila}>
        <Pressable onPress={subirAhora} disabled={enviando || pend === 0}
          style={({ pressed }) => [s.boton, { flex: 1, backgroundColor: C.acento }, (pressed || enviando || pend === 0) && { opacity: 0.6 }]}>
          <Text style={[s.botonTxt, { color: C.fondo }]}>{enviando ? 'Subiendo…' : 'Subir ahora'}</Text>
        </Pressable>
        <Pressable onPress={() => cerrarSesion()} style={({ pressed }) => [s.boton, { flex: 1, borderColor: C.borde2 }, pressed && { opacity: 0.6 }]}>
          <Text style={s.botonTxt}>Cerrar sesión</Text>
        </Pressable>
      </View>
      <Text style={s.pie}>Al cerrar sesión, lo ya subido queda en la web y lo pendiente se queda en este teléfono.</Text>
    </View>
  )
}

const s = StyleSheet.create({
  contenido: { padding: 16, gap: 14, paddingBottom: 30 },
  tarjeta: { backgroundColor: C.sup, borderWidth: 1, borderColor: C.borde, borderRadius: 18, padding: 18, gap: 8 },
  sobre: { color: C.acento, fontSize: 11, fontWeight: '700', letterSpacing: 1.6 },
  titulo: { color: C.texto, fontSize: 20, fontWeight: '800' },
  texto: { color: C.texto, fontSize: 15, lineHeight: 22 },
  tenue: { color: C.tenue, fontSize: 13, lineHeight: 19 },
  pie: { color: C.tenue, fontSize: 11, marginTop: 6 },
  fila: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  etiqueta: { borderWidth: 1, borderColor: C.borde2, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 6 },
  campo: { backgroundColor: C.fondo2, borderWidth: 1, borderColor: C.borde2, borderRadius: 12, color: C.texto, paddingHorizontal: 14, minHeight: 48, fontSize: 15 },
  boton: { minHeight: 50, borderRadius: 14, borderWidth: 1, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center', backgroundColor: C.sup, paddingHorizontal: 12 },
  botonTxt: { color: C.texto, fontWeight: '700', fontSize: 16 },
})
