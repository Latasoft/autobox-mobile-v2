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

const normalizeSede = (raw: any): MechanicWorkingSede | null => {
  const id = parseNumber(raw?.id ?? raw?.sedeId ?? raw?.sede?.id);
  if (!id) return null;

  return {
    id,
    nombre: String(raw?.nombre ?? raw?.name ?? raw?.sede?.nombre ?? `Autobox ${id}`),
    direccion: raw?.direccion ?? raw?.address ?? raw?.sede?.direccion,
    hasActiveSchedule: Boolean(raw?.hasActiveSchedule ?? raw?.tieneHorarioVigente ?? true),
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
    const endpoints = [
      '/mechanics/sedes/with-active-schedule',
      '/mechanics/sedes/available',
      '/mechanics/sedes',
    ];

    for (const endpoint of endpoints) {
      try {
        const response = await apiService.get(endpoint);
        if (Array.isArray(response)) {
          const normalized = response
            .map(normalizeSede)
            .filter((item): item is MechanicWorkingSede => Boolean(item))
            .filter((item) => item.hasActiveSchedule !== false);

          if (normalized.length > 0) {
            return normalized;
          }
        }
      } catch (_error) {
        // Try next endpoint.
      }
    }

    const sedes = await adminService.getSedes().catch(() => []);
    const withSchedule = await Promise.all(
      sedes.map(async (sede: any) => {
        try {
          const schedule = await this.getSedeSchedule(sede.id);
          const hasSchedule = schedule.some((item) => item.isActive && Array.isArray(item.timeSlots) && item.timeSlots.length > 0);
          return hasSchedule ? normalizeSede(sede) : null;
        } catch {
          return null;
        }
      })
    );

    return withSchedule.filter((item): item is MechanicWorkingSede => Boolean(item));
  }

  async getMyWorkingSedes(): Promise<MechanicWorkingSede[]> {
    const mechanicId = await this.getCurrentMechanicId();

    const endpoints = [
      `/mechanics/${mechanicId}/working-sedes`,
      '/mechanics/me/working-sedes',
      `/mechanics/${mechanicId}/sedes`,
      '/mechanics/me/sedes',
    ];

    for (const endpoint of endpoints) {
      try {
        const response = await apiService.get(endpoint);
        if (Array.isArray(response)) {
          return response
            .map(normalizeSede)
            .filter((item): item is MechanicWorkingSede => Boolean(item));
        }
      } catch (_error) {
        // Try next endpoint.
      }
    }

    return [];
  }

  async getBlockedSedes(mechanicId?: string): Promise<number[]> {
    const resolvedMechanicId = mechanicId || (await this.getCurrentMechanicId());
    const endpoints = [
      `/mechanics/${resolvedMechanicId}/blocked-sedes`,
      '/mechanics/me/blocked-sedes',
    ];

    for (const endpoint of endpoints) {
      try {
        const response = await apiService.get(endpoint);
        if (Array.isArray(response)) {
          return response
            .map((item: any) => parseNumber(item?.id ?? item?.sedeId ?? item))
            .filter((item: number | undefined): item is number => Boolean(item));
        }
      } catch (_error) {
        // Try next endpoint.
      }
    }

    return [];
  }

  async getSedeSchedule(sedeId: number): Promise<DaySchedule[]> {
    const endpoints = [
      `/mechanics/sede-schedule/${sedeId}`,
      `/sedes/${sedeId}/schedule`,
      `/admin/sedes/${sedeId}/schedule`,
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
    const endpoints = [
      `/mechanics/${mechanicId}/schedule?sedeId=${sedeId}`,
      `/mechanics/${mechanicId}/schedule/${sedeId}`,
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
    const endpoints = [
      `/mechanics/${mechanicId}/working-sedes`,
      '/mechanics/me/working-sedes',
      `/mechanics/${mechanicId}/change-sede`,
      '/mechanics/me/change-sede',
    ];

    for (const endpoint of endpoints) {
      try {
        return await apiService.post(endpoint, payload);
      } catch (_error) {
        // Try next endpoint.
      }
    }

    throw new Error('No se pudo asignar la sede seleccionada');
  }

  async validateSedeChange(mechanicId: string, sedeId: number): Promise<{ allowed: boolean; message?: string }> {
    const endpoints = [
      `/mechanics/${mechanicId}/validate-sede-change`,
      '/mechanics/me/validate-sede-change',
    ];

    for (const endpoint of endpoints) {
      try {
        const response = await apiService.post(endpoint, { sedeId });
        if (typeof response?.allowed === 'boolean') {
          return response;
        }
      } catch (_error) {
        // Try next endpoint.
      }
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
      '/mechanics/me/ratings',
    ];

    for (const endpoint of endpoints) {
      try {
        const response = await apiService.get(endpoint);
        if (Array.isArray(response)) {
          return response.map((item: any) => ({
            inspectionId: String(item.inspectionId ?? item.inspection?.id ?? item.id),
            rating: Number(item.rating ?? item.calificacion ?? 0),
            comment: item.comment ?? item.comentario,
            createdAt: String(item.createdAt ?? item.fechaCreacion ?? new Date().toISOString()),
            sedeId: parseNumber(item.sedeId ?? item.sede?.id),
            sedeNombre: item.sede?.nombre ?? item.sedeNombre,
            userName: item.userName ?? item.usuarioNombre,
            vehiclePatent: item.vehiclePatent ?? item.vehiculoPatente,
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
