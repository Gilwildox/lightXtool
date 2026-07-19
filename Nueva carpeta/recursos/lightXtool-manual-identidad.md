# lightXtool — Manual de identidad (resumen)

Colores muestreados directamente del logo (no aproximados).

## Paleta

| Uso | Hex | Notas |
|---|---|---|
| Cian principal | `#00A0FA` | Color de marca dominante. Botones primarios, links, íconos activos, bordes de foco. |
| Cian claro (glow) | `#40A2FC` | Solo para efectos de resplandor/hover, no como color base de superficie. |
| Rojo | `#FF1D1D` | Color de acento/alerta. Úsalo con moderación: errores, badges, elementos que deben destacar. No como color dominante de fondo. |
| Fondo base | `#000000` | Fondo principal del sitio y de tarjetas oscuras. |
| Blanco | `#FFFFFF` | Texto principal sobre fondo negro, subtítulos. |

Regla de proporción sugerida (60/30/10):
- 60% negro (fondos)
- 30% cian (interacción, acentos, texto destacado)
- 10% rojo (alertas, énfasis puntual — nunca como color de fondo grande)

## Tipografía

El logo usa una fuente monoespaciada (estilo terminal/código) para el texto
"I'm the Light". Para consistencia:
- Usa una fuente monospace para títulos/branding (ej. `JetBrains Mono`,
  `Fira Code`, o `ui-monospace` del sistema).
- El cuerpo de texto de los artifacts puede mantener su fuente original si
  ya es legible — no es obligatorio forzar monospace en todo el contenido,
  solo en headers/branding para mantener la identidad.

## Efectos visuales característicos del logo

- **Glow/resplandor** en el texto cian (sombra difusa del mismo color,
  no blanca). En CSS: `text-shadow: 0 0 12px #00A0FA` o
  `box-shadow: 0 0 16px rgba(0,160,250,0.5)` para elementos destacados.
- **Líneas finas geométricas** (efecto string-art) como motivo decorativo
  opcional — no es obligatorio replicarlo en cada artifact, es más un
  recurso para la página de inicio/splash.

## Prompt corto para restylear un artifact existente

Usa esto cuando quieras ajustar el estilo visual de un artifact ya generado,
pegándolo junto con el código del artifact:

```
Ajusta el estilo visual de este componente React a la identidad de
lightXtool, sin cambiar su funcionalidad ni su estructura lógica:

- Fondo principal: negro (#000000)
- Color de acento primario: cian (#00A0FA) — para botones, links, bordes de
  foco, elementos interactivos activos
- Color de acento secundario: rojo (#FF1D1D) — solo para alertas, errores o
  énfasis puntual, úsalo con moderación (no como fondo grande)
- Texto principal: blanco (#FFFFFF)
- Si hay elementos destacados (títulos, CTAs), puedes agregar un glow sutil
  en cian: text-shadow o box-shadow con rgba(0,160,250,0.5)
- Tipografía de títulos/headers: monospace (ui-monospace o similar) si el
  componente lo permite sin romper el layout

No agregues gradientes multicolor ni colores fuera de esta paleta. Si el
componente ya tenía su propia lógica de tema claro/oscuro, respétala pero
aplica esta paleta a la variante oscura.
```

## Qué NO hacer

- No usar el rojo como color de fondo dominante (queda muy agresivo en
  superficies grandes).
- No mezclar el cian de marca con otros azules/celestes de librerías UI por
  defecto (ej. el azul default de Tailwind `blue-500`) — reemplázalos por
  el token de marca.
- No perder el fondo negro fijo en ningún artifact que se muestre dentro
  del sitio, aunque el artifact originalmente tuviera fondo blanco.
