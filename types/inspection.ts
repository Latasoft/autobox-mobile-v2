export interface Inspection {
  id: string;
  solicitanteId: string;
  publicacionId?: string;
  horarioId?: number;
  mecanicoId?: string;
  estado_insp: 'Pendiente' | 'Confirmada' | 'En_sucursal' | 'Finalizada' | 'Rechazada' | 'Postergada' | 'Cancelada';
  estado_pago: 'Confirmado' | 'Incompleto' | 'Cancelado';
  fechaProgramada?: string;
  fechaCompletada?: string;
  fechaCreacion: string;
  observacion?: string;
  cancellationReason?: string;
  valor: number;
  rating?: number;
  answers?: Record<string, string>;
  comments?: Record<string, string>;
  
  // Relaciones (opcionales dependiendo de la query)
  solicitante?: {
    id: string;
    primerNombre: string;
    primerApellido: string;
    email: string;
    telefono?: number;
  };
  
  /** Mechanic's global average rating — populated by merging GET /mechanics/:id/rating response */
  averageRating?: number;
  totalRatings?: number;

  mecanico?: {
    id: string;
    primerNombre: string;
    primerApellido: string;
    email: string;
    /**
     * averageRating is NOT returned by the backend on the mecanico relation.
     * Callers must fetch GET /mechanics/:id/rating and merge it here manually.
     */
    averageRating?: number;
    totalRatings?: number;
  };
  
  publicacion?: {
    id: string;
    vendedorId?: string;
    vehiculo?: {
      id: string;
      patente: string;
      marca: string;
      modelo: string;
      anio: number;
    };
  };

  // Si el backend devuelve el vehículo directamente (ej. en historial de inspecciones sin publicación)
  vehiculo?: {
    id: string;
    patente: string;
    marca: string;
    modelo: string;
    anio: number;
  };
  
  // Sede (a través de horario)
  horario?: {
    id: number;
    sede?: {
      id: number;
      nombre: string;
    };
    fecha: string;
    horaInicio: string;
    horaFin: string;
  };
}

export interface InspectionItem {
  id: string;
  inspectionId: string;
  category: string;
  component: string;
  status: 'good' | 'warning' | 'critical';
  notes?: string;
  createdAt: string;
}

export interface InspectionMedia {
  id: string;
  inspectionId: string;
  mediaType: 'image' | 'video' | 'audio';
  url: string;
  category?: string;
  uploadedAt: string;
}

export interface InspectionComment {
  id: string;
  inspectionId: string;
  mechanicId: string;
  comment: string;
  createdAt: string;
  mechanic?: {
    id: string;
    firstName: string;
    lastName: string;
  };
}