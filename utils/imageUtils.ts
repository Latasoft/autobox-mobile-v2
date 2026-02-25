import { LOCAL_IP } from '../constants/Config';

/**
 * Normaliza y corrige URLs de imágenes para que sean visibles en la app.
 * - Reemplaza localhost por LOCAL_IP para desarrollo local.
 * - Fuerza HTTPS en URLs de Cloudinary para evitar bloqueos en móvil.
 * - Corrige rutas duplicadas de Cloudinary (ej: vehicles/vehicles/ → vehicles/).
 * - Retorna cadena vacía si la URL es inválida.
 */
export const getImageUrl = (url: string | null | undefined): string => {
  if (!url || typeof url !== 'string') return '';

  let processed = url.trim();

  // Desarrollo local: reemplazar localhost por IP de red
  if (processed.includes('localhost')) {
    processed = processed.replace('localhost', LOCAL_IP);
  }

  // Cloudinary: forzar HTTPS (Android / iOS pueden bloquear HTTP)
  if (processed.includes('res.cloudinary.com') && processed.startsWith('http://')) {
    processed = processed.replace('http://', 'https://');
  }

  // Cloudinary: corregir rutas duplicadas causadas por el bug de doble carpeta.
  // Ej: /upload/vehicles/vehicles/123 → /upload/vehicles/123
  // Ej: /upload/v123/users/users/abc  → /upload/v123/users/abc
  if (processed.includes('res.cloudinary.com')) {
    processed = processed.replace(
      /(\/upload\/(?:v\d+\/)?)(vehicles|inspections|users|publications|receipts)\/\2\//,
      '$1$2/'
    );
  }

  return processed;
};

/**
 * Genera una URL de Cloudinary optimizada con transformaciones.
 * Útil para thumbnails y previews que no necesitan resolución completa.
 * Si la URL no es de Cloudinary, la retorna sin cambios.
 */
export const getOptimizedImageUrl = (
  url: string | null | undefined,
  width = 400,
  quality = 'auto'
): string => {
  const base = getImageUrl(url);
  if (!base) return '';

  // Solo aplicar transformaciones a URLs de Cloudinary
  if (!base.includes('res.cloudinary.com')) return base;

  // Insertar transformaciones: /image/upload/TRANSFORMS/...
  return base.replace(
    '/image/upload/',
    `/image/upload/w_${width},q_${quality},f_auto/`
  );
};