import apiService from './apiService';
import authService from './authService';
import adminService from './adminService';
import { Inspection } from '../types';

export interface MechanicWorkingSede {
  id: number;
  nombre: string;
  direccion?: string;
  hasActiveSchedule?: boolean;
  blocked?: boolean;
}

export interface DaySchedule {
  dayOfWeek: number;
  timeSlots: string[];
  isActive: boolean;
  sedeId?: number;
}

export interface MechanicRatingItem {
  inspectionId: string;
  rating: number;
  comment?: string;
  createdAt: string;
  sedeId?: number;
  sedeNombre?: string;
  userName?: string;
  vehiclePatent?: string;
}

const PENDING_STATES = new Set(['Pendiente', 'Confirmada', 'En_sucursal']);

const parseNumber = (value: any): number | undefined => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const parseBoolean = (value: any): boolean | undefined => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'si', 'sí', 'yes', 'active', 'activo'].includes(normalized)) return true;
    if (['false', '0', 'no', 'inactive', 'inactivo'].includes(normalized)) return false;
  }

  return undefined;
};

const extractArrayPayload = (payload: any): any[] => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.sedes)) return payload.sedes;
  return [];
};

const normalizeSede = (raw: any): MechanicWorkingSede | null => {
  const id = parseNumber(raw?.id ?? raw?.sedeId ?? raw?.sede?.id);
  if (!id) return null;

  const hasActiveSchedule = parseBoolean(raw?.hasActiveSchedule ?? raw?.tieneHorarioVigente ?? raw?.hasSchedule);

  return {
    id,
    nombre: String(raw?.nombre ?? raw?.name ?? raw?.sede?.nombre ?? `Autobox ${id}`),
    direccion: raw?.direccion ?? raw?.address ?? raw?.sede?.direccion,
    hasActiveSchedule,
    blocked: Boolean(raw?.blocked ?? raw?.isBlocked ?? false),
  };
};

class MechanicSedeService {
  async getCurrentMechanicId(): Promise<string> {
    const user = await authService.getUser();
    if (!user) {
      throw new Error('Debes iniciar sesión');
    }

    try {
      const mechanic = await apiService.get(`/mechanics/by-user/${user.id}`);
      if (mechanic?.id) {
        return mechanic.id;
      }
    } catch (error) {
      // Fallback to user id for legacy backends where mechanic id equals user id.
    }

    return user.id;
  }

  async getSedesWithActiveSchedule(): Promise<MechanicWorkingSede[]> {
    // Mechanics should consume non-admin endpoints to avoid role-based empty results.
    const publicSedes = await apiService.get('/sedes').catch(() => []);
    const source = extractArrayPayload(publicSedes);

    if (source.length > 0) {
      return source
        .map(normalizeSede)
        .filter((item): item is MechanicWorkingSede => Boolean(item));
    }

    // Fallback for legacy deployments where /sedes is not exposed.
    const adminSedes = await adminService.getSedes().catch(() => []);
    return extractArrayPayload(adminSedes)
      .map(normalizeSede)
      .filter((item): item is MechanicWorkingSede => Boolean(item));
  }

  async getMechanicSchedules(mechanicId: string): Promise<DaySchedule[]> {
    const endpoints = [
      `/mechanics/${mechanicId}/schedule`,
      `/admin/mechanics/${mechanicId}/schedule`,
    ];

    for (const endpoint of endpoints) {
      try {
        const response = await apiService.get(endpoint);
        if (!Array.isArray(response)) continue;

        return response.map((item: any) => ({
          dayOfWeek: Number(item.dayOfWeek),
          timeSlots: Array.isArray(item.timeSlots) ? item.timeSlots : [],
          isActive: Boolean(item.isActive),
          sedeId: parseNumber(item?.sedeId ?? item?.sede?.id),
        }));
      } catch (_error) {
        // Try next endpoint.
      }
    }

    return [];
  }

  async getMyWorkingSedes(): Promise<MechanicWorkingSede[]> {
    const mechanicId = await this.getCurrentMechanicId();

    // GET /mechanics/:id/sedes is the only valid endpoint (mechanics.controller.ts)
    try {
      const response = await apiService.get(`/mechanics/${mechanicId}/sedes`);
      return extractArrayPayload(response)
        .map(normalizeSede)
        .filter((item): item is MechanicWorkingSede => Boolean(item));
    } catch (_error) {
      // Endpoint unreachable.
    }

    return [];
  }

  async getBlockedSedes(mechanicId?: string): Promise<number[]> {
    const resolvedMechanicId = mechanicId || (await this.getCurrentMechanicId());

    try {
      const response = await apiService.get(`/mechanics/${resolvedMechanicId}/blocked-sedes`);
      if (Array.isArray(response)) {
        return response
          .map((item: any) => parseNumber(item?.sedeId ?? item?.id ?? item))
          .filter((item: number | undefined): item is number => Boolean(item));
      }
    } catch (_error) {
      // Endpoint unreachable.
    }

    return [];
  }

  async getSedeSchedule(sedeId: number): Promise<DaySchedule[]> {
    const endpoints = [
      `/mechanics/sede-schedule/${sedeId}`,   // GET mechanics/sede-schedule/:id ✓
      `/admin/sedes/${sedeId}/schedule`,       // GET admin/sedes/:id/schedule ✓
    ];

    for (const endpoint of endpoints) {
      try {
        const response = await apiService.get(endpoint);
        if (Array.isArray(response)) {
          return response.map((item: any) => ({
            dayOfWeek: Number(item.dayOfWeek),
            timeSlots: Array.isArray(item.timeSlots) ? item.timeSlots : [],
            isActive: Boolean(item.isActive),
            sedeId,
          }));
        }
      } catch (_error) {
        // Try next endpoint.
      }
    }

    return [];
  }

  async getMechanicScheduleBySede(mechanicId: string, sedeId: number): Promise<DaySchedule[]> {
    // GET /mechanics/:id/schedule returns all seats; filter by sedeId client-side.
    // The ?sedeId query param is passed for forward-compatibility but currently ignored by the backend.
    const endpoints = [
      `/mechanics/${mechanicId}/schedule?sedeId=${sedeId}`,
      `/mechanics/${mechanicId}/schedule`,
    ];

    for (const endpoint of endpoints) {
      try {
        const response = await apiService.get(endpoint);
        if (Array.isArray(response)) {
          const mapped = response
            .filter((item: any) => {
              const itemSedeId = parseNumber(item?.sedeId ?? item?.sede?.id);
              if (!itemSedeId) return true;
              return itemSedeId === sedeId;
            })
            .map((item: any) => ({
              dayOfWeek: Number(item.dayOfWeek),
              timeSlots: Array.isArray(item.timeSlots) ? item.timeSlots : [],
              isActive: Boolean(item.isActive),
              sedeId: parseNumber(item?.sedeId ?? item?.sede?.id) || sedeId,
            }));

          return mapped;
        }
      } catch (_error) {
        // Try next endpoint.
      }
    }

    return [];
  }

  async saveMechanicScheduleBySede(mechanicId: string, sedeId: number, schedules: DaySchedule[]) {
    const payload = {
      sedeId,
      schedules: schedules.map((item) => ({
        dayOfWeek: item.dayOfWeek,
        timeSlots: item.timeSlots,
        isActive: item.timeSlots.length > 0,
      })),
    };

    const endpoints = [
      `/mechanics/${mechanicId}/schedule?sedeId=${sedeId}`,
      `/mechanics/${mechanicId}/schedule`,
      `/admin/mechanics/${mechanicId}/schedule`,
    ];

    for (const endpoint of endpoints) {
      try {
        return await apiService.put(endpoint, payload);
      } catch (_error) {
        // Try next endpoint.
      }
    }

    throw new Error('No se pudo actualizar el horario para la sede seleccionada');
  }

  async assignSedeToMechanic(mechanicId: string, sedeId: number) {
    const payload = { sedeId };
    const attempts: Array<{ method: 'put' | 'post'; endpoint: string; includeBody: boolean }> = [
      { method: 'put', endpoint: `/mechanics/${mechanicId}/sede`, includeBody: true },
      { method: 'post', endpoint: `/mechanics/${mechanicId}/sedes`, includeBody: true },
      // Some backends bind sedeId from path only and reject JSON bodies for this route.
      { method: 'post', endpoint: `/mechanics/${mechanicId}/sedes/${sedeId}`, includeBody: false },
      { method: 'post', endpoint: `/mechanics/${mechanicId}/sedes/${sedeId}`, includeBody: true },
    ];

    for (const attempt of attempts) {
      try {
        if (attempt.method === 'put') {
          return attempt.includeBody
            ? await apiService.put(attempt.endpoint, payload)
            : await apiService.put(attempt.endpoint);
        }

        return attempt.includeBody
          ? await apiService.post(attempt.endpoint, payload)
          : await apiService.post(attempt.endpoint);
      } catch (_error) {
        // Try next endpoint shape for compatibility.
      }
    }

    throw new Error('No se pudo asignar la sede seleccionada');
  }

  async validateSedeChange(mechanicId: string, sedeId: number): Promise<{ allowed: boolean; message?: string }> {
    // No dedicated validate-sede-change endpoint exists in the backend.
    // The real validation happens server-side when PUT /mechanics/:id/sede is called.
    // Here we do a lightweight pre-check: confirm the sede is not blocked for this mechanic.
    const blockedIds = await this.getBlockedSedes(mechanicId).catch(() => []);
    if (blockedIds.includes(sedeId)) {
      return { allowed: false, message: 'Esta sede está bloqueada para ti.' };
    }

    return { allowed: true };
  }

  async getPendingInspections(mechanicId: string): Promise<Inspection[]> {
    try {
      const data = await apiService.get(`/inspections/mechanic/${mechanicId}`);
      if (!Array.isArray(data)) return [];

      return data.filter((inspection: Inspection) => {
        if (inspection.estado_insp && PENDING_STATES.has(inspection.estado_insp)) {
          return true;
        }

        const rawStatus = String((inspection as any).status || '').trim();
        return PENDING_STATES.has(rawStatus as any);
      });
    } catch (_error) {
      return [];
    }
  }

  async getMyRatings(): Promise<MechanicRatingItem[]> {
    const mechanicId = await this.getCurrentMechanicId();
    const endpoints = [
      `/mechanics/${mechanicId}/ratings`,
    ];

    for (const endpoint of endpoints) {
      try {
        const response = await apiService.get(endpoint);

        // Backend getRatingsHistory returns { mechanicId, mechanicName, averageRating, totalRatings, ratings: [...] }
        const rawList: any[] = Array.isArray(response)
          ? response
          : Array.isArray(response?.ratings)
          ? response.ratings
          : null;

        if (rawList) {
          return rawList.map((item: any) => ({
            inspectionId: String(item.inspectionId ?? item.inspection?.id ?? item.id),
            rating: Number(item.rating ?? item.calificacion ?? 0),
            comment: item.comment ?? item.comentario,
            createdAt: String(item.createdAt ?? item.date ?? item.fechaCreacion ?? new Date().toISOString()),
            sedeId: parseNumber(item.sedeId ?? item.sede?.id),
            sedeNombre: item.sede?.nombre ?? item.sedeNombre,
            userName: item.userName ?? item.clientName ?? item.usuarioNombre,
            vehiclePatent: item.vehiclePatent ?? item.vehiculoPatente ?? item.publicacion?.vehiculo?.patente,
          }));
        }
      } catch (_error) {
        // Try next endpoint.
      }
    }

    // Fallback: infer from inspections with rating.
    const inspections = await apiService.get(`/inspections/mechanic/${mechanicId}`).catch(() => []);
    if (!Array.isArray(inspections)) return [];

    return inspections
      .filter((item: any) => Number(item.rating) > 0)
      .map((item: any) => ({
        inspectionId: String(item.id),
        rating: Number(item.rating),
        createdAt: String(item.fechaCompletada || item.updatedAt || item.fechaCreacion || new Date().toISOString()),
        sedeId: parseNumber(item.horario?.sede?.id),
        sedeNombre: item.horario?.sede?.nombre,
        userName: item.solicitante
          ? `${item.solicitante.primerNombre || ''} ${item.solicitante.primerApellido || ''}`.trim()
          : undefined,
        vehiclePatent: item.vehiculo?.patente || item.publicacion?.vehiculo?.patente,
      }));
  }
}

export default new MechanicSedeService();