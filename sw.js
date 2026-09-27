/* Service Worker mínimo de Conil Vacaciones.
   Su único propósito es cumplir el requisito técnico que exigen algunos
   navegadores (sobre todo Chrome/Android) para poder "instalar" la web
   como app. No cachea contenido ni funciona offline a propósito: las
   viviendas, precios y ofertas cambian en Supabase y no queremos que
   nadie vea datos desactualizados por culpa de una caché. */

self.addEventListener("install", function(event){
  self.skipWaiting();
});

self.addEventListener("activate", function(event){
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", function(event){
  event.respondWith(fetch(event.request));
});
