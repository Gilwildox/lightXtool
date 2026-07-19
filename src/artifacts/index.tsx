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
