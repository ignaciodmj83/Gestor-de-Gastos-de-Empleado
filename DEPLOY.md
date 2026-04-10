# Cómo configurar la GEMINI_API_KEY en Cloud Run

## Opción 1 — Google Cloud Console (más fácil)

1. Ve a https://console.cloud.google.com/run
2. Haz clic en tu servicio (`gestor-gastos-*`)
3. Pestaña **"Editar y desplegar nueva revisión"**
4. Sección **"Variables y secretos"** → **"Añadir variable"**
5. Nombre: `GEMINI_API_KEY`  |  Valor: tu clave de https://aistudio.google.com/apikey
6. Clic en **"Desplegar"**

## Opción 2 — gcloud CLI

```bash
gcloud run services update NOMBRE_DEL_SERVICIO \
  --set-env-vars GEMINI_API_KEY=TU_CLAVE_AQUI \
  --region europe-west2
```

## Verificar que funciona

Una vez desplegado, visita:
`https://TU_URL.europe-west2.run.app/api/health`

Debe devolver:
```json
{ "ok": true, "gemini": "configured" }
```

## Arquitectura

```
Navegador → /api/scan-ticket → Express server → Gemini API
                                    ↑
                          GEMINI_API_KEY (env var del servidor, segura)
```

La clave NUNCA llega al navegador del usuario.
