# Gestor Contable Empleado — ERP RRHH (MVP)

ERP web responsive para RRHH y contabilidad operativa de empleados, con los **4 módulos obligatorios** del informe de referencia:

1. **Gestor de tickets** — solicitudes internas (RRHH, IT, finanzas, reembolsos) con comentarios, adjuntos y aprobación.
2. **Gestor de viajes / kilometraje** — partes con trayectos, tarifa configurable, justificantes desde **cámara o galería**, y exportación CSV para contabilidad.
3. **Gestor de vacaciones** — solicitudes con saldos, tipos de ausencia, vista calendario por equipo y aprobación manager/admin.
4. **Fichaje laboral** — entradas/salidas/pausas, histórico, exportación CSV (preparado para retención 4 años — art. 34.9 ET) y solicitud/aprobación de **correcciones auditadas**.

Más cuenta de **administración**: gestión de usuarios y roles, configuración de empresa (tarifa km), bandeja de aprobaciones, y registro de **auditoría** consultable.

---

## Decisiones por defecto (NO ESPECIFICADO en el spec original)

| Decisión | Por defecto elegido | Alternativas |
|---|---|---|
| **Plataforma** | Web responsive (mobile-friendly: bottom nav + `<input capture>` para cámara/galería) | A) Web + apps nativas iOS/Android (Expo) · B) PWA offline-first |
| **Base de datos** | **SQLite** vía `node:sqlite` (módulo nativo de Node 22+, sin compilación) | A) PostgreSQL (recomendada en producción) · B) MySQL/MariaDB · C) better-sqlite3 (requiere build chain en Windows) |
| **Stack backend** | Node.js + Express + JWT + bcryptjs + multer | NestJS/Fastify + Prisma + Postgres |
| **Frontend** | SPA en HTML/CSS/JS vanilla servida por Express (sin build) | Next.js / React + Tailwind |
| **Adjuntos** | Filesystem local en `uploads/` con allowlist de MIME y tamaño máximo 10MB | S3/MinIO con URLs prefirmadas |
| **Auth** | JWT local + bcrypt | OIDC/SSO contra IdP corporativo |
| **Geolocalización** | **Desactivada** (cumplimiento RGPD/AEPD) | Opt-in con base jurídica documentada |
| **Biometría** | **No incluida** (alto riesgo según AEPD) | Análisis reforzado de proporcionalidad si se considerara |

**Por qué SQLite + vanilla JS para el MVP**: cero dependencias externas, arranca con `npm start`, sin Docker ni servicios. Todo el modelo relacional, las queries y la lógica de aprobación son portables a PostgreSQL cambiando solo la capa de driver. La SPA está estructurada por vistas independientes para poder migrarse a React/Next.js módulo a módulo.

---

## Cómo ejecutar

### Requisitos
- **Node.js 22.5+** (incluye `node:sqlite` integrado — no necesita compilar nada)
- Windows / macOS / Linux

### Instalación

```bash
npm install
npm start
```

Abre http://localhost:3000

La base de datos SQLite se crea automáticamente en `data/erp.db` con datos demo en el primer arranque.

### Usuarios demo

| Email | Contraseña | Rol |
|---|---|---|
| `admin@demo.local` | `admin123` | admin |
| `manager@demo.local` | `manager123` | manager |
| `empleado@demo.local` | `empleado123` | employee |
| `juan@demo.local` | `juan123` | employee |

`empleado@demo.local` y `juan@demo.local` reportan a `manager@demo.local`, que a su vez reporta a `admin@demo.local`. Esto permite probar el flujo: el manager ve y aprueba las solicitudes de su equipo, y el admin lo ve todo.

### Reset

```bash
rm -rf data/ uploads/
npm start
```

---

## Arquitectura

```
.
├── server.js                 # Express entry, mounts routes + static SPA
├── package.json
├── data/erp.db               # SQLite (auto-creada)
├── uploads/                  # Adjuntos
├── src/
│   ├── db.js                 # Schema + migraciones idempotentes + seed
│   ├── auth.js               # JWT, middleware authRequired/roleRequired, audit()
│   └── routes/
│       ├── auth.js           # POST /login, GET /me
│       ├── tickets.js        # CRUD + comentarios + decisión
│       ├── mileage.js        # Partes, trayectos, submit, decisión, export CSV
│       ├── vacations.js      # Solicitudes, balance, calendario, decisión, cancelar
│       ├── timeclock.js      # Eventos IN/OUT/BREAK, shifts, correcciones, export CSV
│       ├── attachments.js    # Subida segura (mime allowlist + tamaño + RBAC por objeto)
│       └── admin.js          # Usuarios, empresa, audit log, inbox de aprobación
└── public/
    ├── index.html
    ├── css/styles.css        # Design system dark-first (paleta del informe)
    └── js/
        ├── api.js            # Fetch wrapper + token persist
        ├── components.js     # UI helpers: chips, modal, formatters
        ├── app.js            # SPA hash router + shell
        └── views/            # 1 vista por módulo
            ├── login.js
            ├── dashboard.js
            ├── tickets.js
            ├── mileage.js
            ├── vacations.js
            ├── timeclock.js
            └── admin.js
```

### Roles y permisos (RBAC)

- **employee**: ve y crea sus propios tickets/km/vacaciones; ficha; pide correcciones.
- **manager**: lo anterior + ve y aprueba/rechaza solicitudes de empleados con `manager_id = self.id`.
- **admin**: ve todo, gestiona usuarios, edita empresa, consulta auditoría.

La autorización se aplica en cada endpoint con la combinación `authRequired` (verificación JWT) + lógica por objeto (ownership o relación de manager directo).

### Modelo de datos

| Tabla | Resumen |
|---|---|
| `company` | Empresa única (multi-empresa fuera de scope MVP). Tarifa km configurable. |
| `user` | Credenciales + rol + manager_id + días vacaciones/año. |
| `ticket`, `ticket_comment` | Tickets con estados `submitted/approved/rejected` y comentarios. |
| `mileage_report`, `mileage_trip` | Partes con trayectos; cálculo automático km×tarifa. |
| `leave_request` | Solicitudes de ausencia con días calculados, validación de solapes. |
| `time_event` | Eventos atómicos IN/OUT/BREAK_START/BREAK_END por empleado. |
| `time_correction` | Solicitudes de corrección de fichaje (auditadas; si se aprueban materializan un `time_event` con `source='correction'`). |
| `attachment` | Polimórfico (`object_type` + `object_id`); usa allowlist de MIME. |
| `audit_log` | Registro inmutable de acciones críticas (login, create, decisión, upload, etc). |

### Catálogo de endpoints

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/auth/login` | Login → JWT |
| GET | `/api/auth/me` | Perfil del usuario actual |
| GET / POST | `/api/tickets` | Listar / crear |
| GET | `/api/tickets/:id` | Detalle + comentarios + adjuntos |
| POST | `/api/tickets/:id/comments` | Comentar |
| POST | `/api/tickets/:id/decision` | Aprobar / rechazar |
| GET / POST | `/api/mileage` | Listar / crear parte |
| GET | `/api/mileage/:id` | Detalle parte |
| POST / DELETE | `/api/mileage/:id/trips[/:tripId]` | Añadir / eliminar trayecto |
| POST | `/api/mileage/:id/submit` | Enviar a aprobación |
| POST | `/api/mileage/:id/decision` | Aprobar / rechazar |
| GET | `/api/mileage/:id/export.csv` | Export contable |
| GET / POST | `/api/vacations` | Listar / solicitar |
| GET | `/api/vacations/balance` | Saldo del año en curso |
| GET | `/api/vacations/calendar` | Calendario de equipo |
| POST | `/api/vacations/:id/decision` | Aprobar / rechazar |
| POST | `/api/vacations/:id/cancel` | Cancelar (solo titular) |
| GET | `/api/time/status` | Estado actual de fichaje |
| POST | `/api/time/event` | Postear evento IN/OUT/BREAK_* |
| GET | `/api/time/shifts?from&to` | Resumen diario con minutos trabajados |
| GET | `/api/time/export.csv?from&to` | Export para auditoría |
| GET / POST | `/api/time/corrections` | Listar / solicitar corrección |
| POST | `/api/time/corrections/:id/decision` | Aprobar (materializa el evento) o rechazar |
| POST / GET | `/api/attachments` | Subir / descargar adjunto |
| GET / POST / PATCH | `/api/admin/users[/:id]` | Gestión de usuarios (admin) |
| GET / PATCH | `/api/admin/company` | Configuración empresa (admin) |
| GET | `/api/admin/audit` | Audit log (admin) |
| GET | `/api/admin/inbox` | Bandeja de pendientes del usuario actual |

---

## Cumplimiento legal (España)

Aspectos cubiertos por el diseño y advertencias para producción:

- **Fichaje laboral (art. 34.9 ET / RDL 8/2019)**: cada evento se registra con timestamp servidor, fuente y `created_by`. La exportación CSV permite cumplir la conservación de 4 años; en producción, mover los registros a un almacenamiento WORM o backups inmutables.
- **Correcciones de jornada**: requieren motivo obligatorio, son auditables y deben ser aprobadas por manager o admin antes de materializarse.
- **AEPD — base jurídica**: el registro horario se basa en obligación legal, no en consentimiento. La aplicación no pide consentimiento al fichar.
- **Geolocalización**: deshabilitada por defecto en este MVP. Si se reactiva, debe limitarse a eventos IN/OUT, con base jurídica documentada y avisos al usuario.
- **Biometría**: fuera de alcance (alto riesgo según AEPD).
- **Adjuntos**: allowlist de MIME (jpeg/png/webp/gif/heic/pdf), tamaño máx. 10MB, control de acceso por objeto. En producción añadir antivirus.

## Limitaciones conocidas / siguientes pasos

- Sin tests automatizados (el spec los pide; añadir Jest + supertest para integración).
- Sin notificaciones push/email — TODO: integración SMTP o adapter.
- Sin offline-first real (la guía recomienda IndexedDB + service worker para PWA o cola en React Native). Este MVP usa subida síncrona.
- El diseño es multi-tenant en su modelo (`company_id`) pero el endpoint de admin asume una sola empresa para simplicidad.
- Sin SSO/OIDC. Para producción, sustituir `src/auth.js` por adapter OIDC contra el IdP corporativo.
- Sin antivirus de adjuntos (TODO: ClamAV stub o servicio externo).
- Sin internacionalización: la UI está en español.

## Variables de entorno opcionales

| Variable | Default | Descripción |
|---|---|---|
| `PORT` | `3000` | Puerto HTTP |
| `JWT_SECRET` | `dev-secret-change-in-prod` | **Cambiar en producción** |

---

Generado a partir del spec "ERP para contabilidad de empleados y RRHH" — alcance MVP funcional.
