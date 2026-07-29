# lightXtool — Prompt maestro del proyecto (v2, post-construcción)

Este documento reemplaza a `lightXtool-prompt-guia.md` (v1, el plan original).
Úsalo como mensaje inicial en cualquier conversación nueva con Claude donde
quieras: agregar artifacts, pedir cambios de branding, corregir bugs, o pedir
una nueva funcionalidad. Pégalo completo — así Claude no reinterpreta
decisiones ya tomadas ni te repite pasos ya hechos.

---

## 1. Estado real del proyecto (arquitectura ya construida)

- **Repo:** https://github.com/Gilwildox/lightXtool (público)
- **Sitio en vivo:** https://gilwildox.github.io/lightXtool/
- **Carpeta local:** `E:\lightXtool`
- **Base del template:** fork de `claudio-silva/claude-artifact-runner`
  (React 18 + TypeScript + Vite + Tailwind + Shadcn UI)
- **Terminal:** PowerShell en VS Code
- **GitHub CLI (`gh`)** instalado y autenticado

### Indexación automática de artifacts (YA FUNCIONA, no rehacer)
- `vite-plugin-pages` está configurado en `vite.config.ts` con
  `dirs: [{ dir: 'src/artifacts', baseRoute: '' }]`.
- Cada archivo `.tsx`/`.jsx` que se copie a `src/artifacts/` se vuelve
  automáticamente una ruta con su mismo nombre (ej. `Foo.jsx` → `/Foo`).
  No se edita ningún archivo de configuración al agregar un artifact.
- `src/artifacts/index.tsx` es el Home/galería: usa `import.meta.glob`
  para listar todos los demás artifacts y generar las tarjetas del grid
  automáticamente. Este archivo SÍ se toca si se quiere cambiar el diseño
  del grid/home — pero no para agregar artifacts individuales.

### Ruteo: HashRouter fijo (decisión ya tomada, no es un bug)
- `src/main.tsx` usa `createHashRouter` SIEMPRE (no condicional por
  protocolo). Las URLs se ven así: `sitio.com/#/NombreDelArtifact`.
- Motivo: GitHub Pages es hosting estático puro, no soporta rutas limpias
  con recarga sin configuración extra. Se evaluó el truco de `404.html`
  y se descartó por interactuar mal con el service worker de la PWA.
- Si en el futuro se quiere cambiar a URLs limpias, es una migración
  aparte, no algo que se deba "arreglar" por defecto.

### Base path de GitHub Pages (no tocar sin razón)
- `vite.config.ts` tiene `base: '/lightXtool/'` porque el repo no es
  `usuario.github.io` sino un repo con nombre propio.
- Cualquier imagen/asset referenciado con ruta absoluta a mano en código
  (ej. `<img src="/algo.png">`) DEBE usar `import.meta.env.BASE_URL` en su
  lugar, o se rompe en producción (ya ocurrió una vez con el logo).

### Branding (manual de identidad ya aplicado)
- Colores en `tailwind.config.mjs` como tokens: `brand-cyan` (#00A0FA),
  `brand-cyan-light` (#40A2FC), `brand-red` (#FF1D1D).
- Tema oscuro fijo, sin botón de cambio a nivel página (`index.html` tiene
  `class="dark"` fijo en el `<html>`; variables de Shadcn en `.dark` de
  `src/index.css` ya ajustadas a la paleta de marca).
- Tipografía monospace en el Home (`font-mono` de Tailwind).
- Logo en `public/logo.png` (versión completa, sin recortar).
- Footer del Home con crédito y link a Instagram
  (https://www.instagram.com/gilberto_santacolomba/), `target="_blank"` +
  `rel="noopener noreferrer"`.

### Artifacts con su propio switch de tema claro/oscuro
- Decisión tomada: NO se sincroniza con el tema del sitio. Cada artifact
  que traiga su propio botón interno opera aislado en su propia ruta —
  no hay iframes ni componentes padre-hijo simultáneos que requieran
  `postMessage`. No reabrir este tema salvo que se pida un modal de vista
  previa embebida (eso sí lo necesitaría).

### PWA / Offline
- `vite-plugin-pwa` instalado y configurado en `vite.config.ts`
  (`registerType: 'autoUpdate'`, `devOptions.enabled: true`).
- Íconos en `public/pwa-192x192.png` y `public/pwa-512x512.png`: el logo
  completo (sin recortar), escalado con relleno negro (letterbox) para
  encajar en formato cuadrado — decisión explícita, no recortar el logo.
- Manifest icons con ruta absoluta manual `/lightXtool/pwa-*.png` (bug
  conocido de `vite-plugin-pwa` que no hereda `base` automáticamente:
  github.com/vite-pwa/vite-plugin-pwa/issues/713).
- Limitación real: un artifact nuevo NO está disponible offline hasta que
  se haga `npm run deploy` Y se visite el sitio publicado una vez con
  conexión (el service worker cachea la versión del último build/deploy,
  no lo que exista solo en local).

### Deploy
- `npm run deploy` = `predeploy` (build) + `gh-pages -d dist` (publica a
  la rama `gh-pages`).
- GitHub Pages configurado en Settings → Pages → Deploy from branch
  `gh-pages` / root.
- Repo es público (requisito de GitHub Pages gratuito para repos no-Enterprise).

---

## 2. Cómo pedir cambios de aquí en adelante

Al pegar este documento en una conversación nueva, describe qué necesitas
usando este formato:

```
Contexto: lightXtool ya está construido y en producción (ver documento
adjunto con la arquitectura real). Quiero: [agregar el artifact X.tsx que
adjunto / cambiar el color de las tarjetas del grid / agregar una sección
de categorías / etc.]

Archivo(s) relevante(s) que ya tengo: [nombre, si aplica]
```

Reglas para Claude en esta conversación (recordatorio, no las repitas si ya
las tienes en tus instrucciones personalizadas):
- No reinterpretar decisiones ya tomadas en este documento sin avisar y
  poner a debate el cambio primero.
- Ver el archivo real (`Get-Content`) antes de dar un diff, no asumir
  contenido.
- Para archivos completos que se van a pegar, preferir entregarlos como
  archivo descargable (evita errores de copy-paste en JSX ya vividos en
  este proyecto).
- Confirmar en local (`npm run dev` y `npm run build` + `npm run preview`)
  antes de dar por buena una funcionalidad.
- Antes de `npm run deploy`, recordar el flujo de git
  (`add` → `commit` → `push` → `deploy`), no saltarse el respaldo del
  código fuente.

---

## 3. Restyling de artifacts individuales (prompt aparte, ya existente)

Para ajustar el estilo visual de un artifact que no combine con la paleta,
usa el prompt corto que ya está en `lightXtool-manual-identidad.md`
(sección "Prompt corto para restylear un artifact existente"). Esto sigue
siendo un entregable aparte, no se fusiona con este documento.
