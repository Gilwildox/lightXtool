# lightXtool — Flujo de actualización manual

Repo: https://github.com/Gilwildox/lightXtool
Sitio en vivo: https://gilwildox.github.io/lightXtool/
Carpeta local: `E:\lightXtool`

Esta guía es para cuando **no** estás en una conversación con Claude guiándote
paso a paso — para hacerlo tú solo desde PowerShell.

---

## A) Agregar un artifact nuevo

1. Copia el `.tsx` o `.jsx` a:
   ```
   E:\lightXtool\src\artifacts\
   ```
   El nombre del archivo define la URL: `MiComponente.tsx` → se abre en
   `/#/MiComponente`. No uses espacios ni acentos en el nombre del archivo.

2. Revisa en local antes de publicar:
   ```
   cd E:\lightXtool
   npm run dev
   ```
   Abre `http://localhost:5173/lightXtool/`, confirma que aparece la tarjeta
   nueva en el grid y que el componente abre sin pantalla en blanco ni
   errores en consola (F12 → Console).

   **Causa más común de error:** el artifact usa un import que no está
   instalado en este proyecto (ej. una librería que sí tenías disponible en
   Claude.ai pero no aquí). Si pasa, dime qué error da la consola y lo
   resolvemos antes de seguir.

3. Detén el servidor (`Ctrl+C` en la terminal) cuando termines de revisar.

---

## B) Guardar el cambio en git (historial de código fuente)

```
git add .
```

```
git status
```
(revisa que solo aparezcan los archivos que esperabas — el artifact nuevo,
y nada más raro)

```
git commit -m "Agrego artifact: NombreDelArtifact"
```

**Si te equivocaste en el mensaje del commit y AÚN NO has hecho `git push`:**
```
git commit --amend -m "Mensaje corregido"
```

**Si ya hiciste `git push` y quieres corregir el último mensaje:**
```
git commit --amend -m "Mensaje corregido"
git push --force
```
`--force` reescribe el historial remoto — úsalo solo si eres el único que
trabaja en este repo (es tu caso), nunca en un repo compartido con más gente
sin avisar.

```
git push
```
(sube tu código fuente a GitHub — esto NO publica el sitio todavía, es solo
respaldo del código)

---

## C) Publicar el sitio actualizado

```
npm run deploy
```

Esto hace `build` + publica automáticamente a la rama `gh-pages`. Espera
1–2 minutos y revisa:

```
https://gilwildox.github.io/lightXtool/
```

Si no ves el cambio reflejado, fuerza recarga sin caché: `Ctrl+Shift+R`
en el navegador (el service worker de la PWA puede tardar una visita extra
en actualizar — ver nota abajo).

---

## Notas importantes

- **PWA offline:** un artifact no queda disponible sin conexión hasta que
  hagas `npm run deploy` Y visites el sitio publicado una vez con internet
  (para que el service worker descargue la versión nueva). Si solo lo
  agregaste en local, offline no lo va a mostrar.
- **Orden correcto siempre:** primero `git commit` + `git push` (respaldo de
  código), después `npm run deploy` (publicación). Si el deploy falla, no
  pierdes el código porque ya está en GitHub.
- **No hay botón de instalar/desinstalar PWA manual** — el navegador lo
  ofrece solo (ícono ⊕ en la barra de direcciones en Chrome/Edge).
