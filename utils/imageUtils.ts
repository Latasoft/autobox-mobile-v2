import { API_URL, LOCAL_IP } from '../constants/Config';

const API_BASE_URL = API_URL.replace(/\/api\/?$/, '');

const extractUrlFromUnknown = (value: unknown): string => {
  if (!value) return '';

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return '';

    // Soporte para strings JSON serializados (objeto o arreglo)
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        const parsed = JSON.parse(trimmed);
        return extractUrlFromUnknown(parsed);
      } catch {
        return trimmed;
      }
    }

    return trimmed;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      const candidate = extractUrlFromUnknown(entry);
      if (candidate) return candidate;
    }
    return '';
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const priorityKeys = [
      'secure_url',
      'url',
      'publicUrl',
      'public_url',
      'foto_url',
      'imagen_url',
      'imageUrl',
      'uri',
      'src',
      'path',
    ];

    for (const key of priorityKeys) {
      if (key in obj) {
        const candidate = extractUrlFromUnknown(obj[key]);
        if (candidate) return candidate;
      }
    }

    for (const key of Object.keys(obj)) {
      const candidate = extractUrlFromUnknown(obj[key]);
      if (candidate) return candidate;
    }
  }

  return '';
};

/**
 * Normaliza y corrige URLs de imágenes para que sean visibles en la app.
 * - Reemplaza localhost por LOCAL_IP para desarrollo local.
 * - Fuerza HTTPS en URLs de Cloudinary para evitar bloqueos en móvil.
 * - Corrige rutas duplicadas de Cloudinary (ej: vehicles/vehicles/ → vehicles/).
 * - Retorna cadena vacía si la URL es inválida.
 */
export const getImageUrl = (url: unknown): string => {
  let processed = extractUrlFromUnknown(url);
  if (!processed) return '';

  // Normalizar comillas y slashes escapados
  processed = processed.replace(/^['"]+|['"]+$/g, '').replace(/\\/g, '/').trim();
  if (!processed) return '';

  // URLs esquema-relativo
  if (processed.startsWith('//')) {
    processed = `https:${processed}`;
  }

  // Rutas relativas del backend
  if (processed.startsWith('/')) {
    processed = `${API_BASE_URL}${processed}`;
  } else if (!/^(https?:|file:|content:|data:|blob:)/i.test(processed)) {
    if (processed.includes('res.cloudinary.com')) {
      processed = `https://${processed.replace(/^\/+/, '')}`;
    } else if (processed.startsWith('uploads/')) {
      processed = `${API_BASE_URL}/${processed}`;
    }
  }

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

  // Sanitizar caracteres para URL final
  return encodeURI(processed);
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