# lightXtool — Documento de proyecto

Este documento tiene 3 partes: (1) descripción del proyecto para dar contexto,
(2) el prompt paso a paso para llevar el desarrollo dentro de una conversación
de Claude/Claude Code, y (3) el mensaje con el que arrancas esa conversación.

Nota: el prompt para restylear artifacts individuales según tu paleta es un
entregable aparte (como acordamos), no está incluido aquí.

---

## 1. Descripción del proyecto

**Nombre:** lightXtool
**Objetivo:** Sitio estático personal que sirve como galería/lanzador de
artifacts (componentes React .tsx/.jsx generados en Claude), accesible desde
cualquier lugar (GitHub Pages) e instalable/offline (PWA).

**Stack base:** Fork del template `claude-artifact-runner`
(React 18 + TypeScript + Vite + Tailwind + Shadcn UI), extendido con:
- Indexación automática de artifacts vía `import.meta.glob` (no se edita
  manualmente el index al agregar archivos nuevos).
- Página de inicio con logo + galería tipo grid, tema oscuro por default.
- Identidad visual: cian, rojo y blanco (colores exactos a definir con el logo).
- PWA (manifest + service worker) para instalación offline en Windows y Android.
- Deploy a GitHub Pages.

**Repositorio:** nuevo e independiente (no reutilizar el repo de otro proyecto).

**Restricciones conocidas / decisiones ya tomadas:**
- Sin botón de claro/oscuro a nivel página — el sitio es oscuro fijo por defecto.
- Si algún artifact trae su propio botón claro/oscuro interno, se evalúa
  (no se garantiza) sincronizarlo con el tema de la página vía
  `postMessage` o similar; si no es viable, se deja el botón del artifact
  operando solo dentro de su propio iframe/vista, sin afectar el resto del sitio.
- El estilo visual de artifacts individuales que no combinen con la paleta se
  ajustará después, con un prompt aparte.

---

## 2. Prompt paso a paso (pégalo en una conversación de Claude Code)

```
Vamos a construir "lightXtool": un sitio estático que funciona como galería/
lanzador de artifacts React (.tsx/.jsx), con branding propio, PWA offline y
deploy a GitHub Pages.

Contexto técnico:
- Uso VS Code y ya tengo una cuenta de GitHub (voy a crear un repo nuevo,
  independiente de mis otros proyectos).
- Tengo Node.js instalado.
- Voy a subir artifacts sueltos (.tsx/.jsx) generados en Claude.ai, algunos
  usan Recharts, Shadcn UI, o tienen su propio botón de tema claro/oscuro.

Quiero que avancemos en este orden, confirmando conmigo antes de pasar al
siguiente paso:

PASO 1 — Base del proyecto
- Parte del template claude-artifact-runner (React+TS+Vite+Tailwind+Shadcn).
- Estructura mínima: src/artifacts/ (donde yo voy a soltar mis archivos),
  src/main.tsx, src/App.tsx, src/index.css.
- Explícame en 3-4 líneas qué hace cada archivo antes de tocarlo.

PASO 2 — Indexación automática
- Implementa en main.tsx (o en un componente Gallery.tsx separado) un
  import.meta.glob('./artifacts/*.tsx', { eager: true }) que detecte
  automáticamente cada archivo en src/artifacts/ y genere:
  a) una entrada en la página de inicio (tarjeta con el nombre del archivo)
  b) una ruta propia para abrirlo individualmente
- Debe funcionar sin que yo edite ningún archivo de configuración al agregar
  un nuevo artifact — solo copio el .tsx a la carpeta.
- Explica en el código, con comentarios breves, qué hace el glob y cómo se
  genera la ruta a partir del nombre del archivo.

PASO 3 — Branding e identidad visual
- Página de inicio: logo (versión fondo negro/transparente) arriba, luego el
  grid de artifacts debajo.
- Paleta exacta muestreada del logo:
  - Cian principal: #00A0FA
  - Cian claro (glow del texto): #40A2FC
  - Rojo: #FF1D1D
  - Fondo base: #000000
  - Blanco (texto secundario/subtítulo): #FFFFFF
- Tema oscuro fijo por defecto, sin botón de cambio a nivel página.
- Usa Tailwind config para centralizar estos colores como tokens
  (brand-cyan: #00A0FA, brand-cyan-light: #40A2FC, brand-red: #FF1D1D)
  en vez de hardcodear hex sueltos en cada componente.
- Adjunto un manual de identidad breve (lightXtool-manual-identidad.md) con
  estos valores y reglas de uso — síguelo para toda decisión de color,
  tipografía y espaciado del sitio.

PASO 4 — Compatibilidad con artifacts que traen su propio switch de tema
- Si un artifact individual ya trae un botón claro/oscuro interno, evalúa si
  es viable (sin reescribir el artifact) exponer ese estado hacia afuera,
  por ejemplo con un evento postMessage o un contexto compartido si el
  artifact se renderiza como componente hijo (no en iframe aislado).
- Si no es viable sin modificar cada artifact uno por uno, dime por qué y
  déjalo así: el botón interno solo afecta su propia vista, el resto del
  sitio se queda oscuro fijo.

PASO 5 — PWA / offline
- Agrega manifest.json + service worker para que el sitio sea instalable en
  Windows (Chrome/Edge) y Android, y funcione sin conexión después de la
  primera carga.
- Explícame qué se cachea y qué pasa si agrego un artifact nuevo estando
  offline (para que sepa la limitación real, no asumas que "simplemente
  funciona").

PASO 6 — Repositorio y deploy
- Ayúdame a inicializar un repo nuevo en GitHub (independiente de mis otros
  proyectos) y configurar el deploy a GitHub Pages (gh-pages branch).
- Dame los comandos exactos, uno por uno, no un bloque gigante.

PASO 7 — Flujo de uso diario
- Al final, resume en máximo 5 pasos cómo se ve mi flujo normal para: subir
  un artifact nuevo, verlo reflejado en el índice, y publicar los cambios.

Reglas para todo el proceso:
- No me des código que yo no entienda sin explicación — comentarios breves,
  concisos, sin relleno.
- Si algo que pido no es técnicamente viable tal como lo describo, dímelo y
  ofréceme alternativas, no lo reinterpretes en silencio.
- Ve confirmando conmigo antes de saltar de un paso a otro.
```

---

## 3. Mensaje para iniciar la conversación

Copia y pega esto como primer mensaje al abrir la nueva conversación:

```
Voy a construir lightXtool, un sitio galería de artifacts de Claude con
branding propio (cian #00A0FA, rojo #FF1D1D, fondo negro #000000, texto
blanco), indexación automática, tema oscuro fijo, y PWA offline, desplegado
en GitHub Pages. Ya tengo VS Code, cuenta de GitHub y Node.js. Te adjunto el
logo (versión fondo negro) y el manual de identidad breve. Aquí está el plan
paso a paso que quiero seguir: [pega aquí el PASO 1 al 7 de la sección 2 de
este documento]
```
