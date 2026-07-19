import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider, createHashRouter } from 'react-router-dom';
import routes from 'virtual:generated-pages-react';
import Layout from './components/layout';
import './index.css';

// HashRouter siempre: GitHub Pages es hosting 100% estático y no puede redirigir
// rutas como /TrussLoadCalculator hacia index.html al recargar. Con hash
// (ej. /#/TrussLoadCalculator) el navegador nunca le pide esa ruta al servidor,
// siempre pide index.html y el ruteo lo resuelve React Router en el cliente.
const mkRoutes = routes.map((route) => ({
  ...route,
  element: <Layout>{route.element}</Layout>,
}));
const router = createHashRouter(mkRoutes);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
