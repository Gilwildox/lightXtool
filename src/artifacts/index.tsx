import { Link } from 'react-router-dom';

// import.meta.glob escanea en BUILD TIME (Vite lo resuelve de forma estática, no es
// una lectura de disco en runtime). Cada key del objeto es la ruta de un archivo hallado.
// { eager: false } (default) = NO importa el componente completo, solo lo lista.
const modules = import.meta.glob('/src/artifacts/*.{tsx,jsx}');

// vite-plugin-pages convierte cada archivo de esta carpeta en una ruta con el MISMO
// NOMBRE (sin extensión), ej: 'Foo.jsx' -> '/Foo'. Replicamos esa conversión a mano
// para que el link de cada tarjeta apunte al lugar correcto.
function pathToRoute(filePath: string) {
  const name = filePath.split('/').pop()!.replace(/\.(tsx|jsx)$/, '');
  return { name, route: `/${name}` };
}

const artifacts = Object.keys(modules)
  .map(pathToRoute)
  .filter((a) => a.name !== 'index');

// import.meta.env.BASE_URL es el valor de "base" configurado en vite.config.ts
// ('/lightXtool/'). Las imágenes en public/ referenciadas con ruta absoluta a mano
// (ej. "/logo.png") NO se ajustan solas a ese base path — hay que anteponerlo
// manualmente, o se rompen al desplegar en el subpath de GitHub Pages.
const logoSrc = `${import.meta.env.BASE_URL}logo.png`;
// Versión "dark-bg" porque el sitio es fondo negro fijo (ver manual de identidad).
const cueForgeLogoSrc = `${import.meta.env.BASE_URL}logocueforge-dark-bg.svg`;

export default function Home() {
  return (
    <div className="min-h-screen bg-black text-white font-mono p-8">
      <div className="flex flex-col items-center mb-10">
        <img src={logoSrc} alt="lightXtool" className="w-full max-w-md" />
      </div>

      {artifacts.length === 0 ? (
        <p className="text-center text-white/50">
          No hay artifacts todavía. Copia un .tsx/.jsx a src/artifacts/
        </p>
      ) : (
        <div className="grid gap-4 max-w-5xl mx-auto" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
          {artifacts.map((a) => (
            <Link
              key={a.route}
              to={a.route}
              className="rounded-lg p-4 bg-white/[0.03] border border-brand-cyan/20 hover:border-brand-cyan hover:shadow-[0_0_14px_rgba(0,160,250,0.35)] transition-all text-center"
            >
              {a.name}
            </Link>
          ))}
        </div>
      )}

      {/* CueForge es un sitio hermano, no un artifact más: se trata como cross-link
          a otro proyecto (logo + nombre + descripción propia), no como una tarjeta
          del grid de arriba. Va junto al bloque de donación, no dentro del grid. */}
      <div className="flex flex-col sm:flex-row gap-4 justify-center items-stretch max-w-3xl mx-auto mt-10">
        <a
          href="https://gilwildox.github.io/CueForge/"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Ir a CueForge, otro sitio del mismo autor"
          className="flex-1 flex flex-col items-center justify-center gap-2 rounded-lg p-5 border border-white/20 bg-white/[0.03] hover:border-white/50 hover:bg-white/[0.06] transition-all text-center"
        >
          <img src={cueForgeLogoSrc} alt="CueForge" className="h-10" />
          <span className="text-xs text-white/50">
            Sistema de guion técnico y ficha técnica para proyectos escénicos
          </span>
        </a>

        <div className="flex-1 flex flex-col items-center justify-center gap-3 rounded-lg p-5 border border-brand-cyan/40 bg-brand-cyan/[0.06] shadow-[0_0_14px_rgba(0,160,250,0.15)] text-center">
          <p className="text-xs text-white/70 leading-relaxed">
            Si este sitio te ha facilitado el trabajo, considera apoyar el proyecto.
            Tu contribución ayuda a mantener estas herramientas disponibles y seguir
            desarrollándolas.
          </p>
          <a
            href="https://link.mercadopago.com.mx/imthelight"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg px-5 py-2.5 text-sm border border-brand-cyan/40 text-brand-cyan bg-brand-cyan/10 hover:border-brand-cyan hover:shadow-[0_0_14px_rgba(0,160,250,0.35)] transition-all tracking-wide"
          >
            ☕ Apoya este proyecto
          </a>
        </div>
      </div>

      <footer className="text-center text-xs text-white/40 mt-12 pb-6">
        lightXtool creado por{' '}
        <a
          href="https://www.instagram.com/gilberto_santacolomba/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand-cyan hover:text-brand-cyan-light hover:underline"
        >
          Gilberto Santacolomba
        </a>
      </footer>
    </div>
  );
}