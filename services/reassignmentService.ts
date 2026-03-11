import apiService from './apiService';
import adminService, { Mechanic } from './adminService';
import { Inspection } from '../types';

export type ReassignmentRequesterRole = 'CLIENT' | 'MECHANIC' | 'ADMIN';
export type ReassignmentRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';

export interface ReassignmentRequest {
  id: string;
  inspectionId: string;
  description: string;
  requesterRole: ReassignmentRequesterRole;
  status: ReassignmentRequestStatus;
  createdAt: string;
  expiresAt: string;
  sedeId?: number;
  scheduledDate?: string;
  currentMechanicId?: string;
  currentMechanicName?: string;
}

interface RequestFilters {
  status?: string;
  sedeId?: string;
  sortBy?: 'status' | 'sede' | 'date';
  order?: 'asc' | 'desc';
}

interface CreateRequestInput {
  inspection: Inspection;
  description: string;
  requesterRole: ReassignmentRequesterRole;
}

interface ReassignMechanicInput {
  inspection: Inspection;
  requestId?: string;
  mechanicId: string;
  description: string;
}

const REQUEST_TTL_MS = 5 * 60 * 1000;
const WINDOW_MS = 30 * 60 * 1000;

const CREATE_REQUEST_ENDPOINTS = [
  (inspectionId: string) => `/inspections/${inspectionId}/mechanic-change-requests`,
  (inspectionId: string) => `/inspections/${inspectionId}/reassignment-requests`,
  (inspectionId: string) => `/inspections/${inspectionId}/request-reassignment`,
  (inspectionId: string) => `/inspections/${inspectionId}/reassign/request`,
] as const;

const LIST_REQUESTS_ENDPOINTS = [
  '/inspections/mechanic-change-requests',         // ← nuevo endpoint real del controller
  '/admin/inspection-reassignment-requests',        // legacy fallback
  '/admin/mechanic-change-requests',               // legacy fallback
  '/inspections/reassignment-requests',            // legacy fallback
] as const;

const REASSIGN_ENDPOINTS = [
  (inspectionId: string) => `/inspections/${inspectionId}/reassign-mechanic`,
  (inspectionId: string) => `/admin/inspections/${inspectionId}/reassign-mechanic`,
  (inspectionId: string) => `/inspections/${inspectionId}/assign-mechanic`,
  (inspectionId: string) => `/admin/inspections/${inspectionId}/assign`,
] as const;

const RESOLVE_ENDPOINTS = [
  (requestId: string) => `/inspections/mechanic-change-requests/${requestId}/resolve`, // ← real
  (requestId: string) => `/admin/inspection-reassignment-requests/${requestId}`,        // legacy
  (requestId: string) => `/admin/mechanic-change-requests/${requestId}`,               // legacy
  (requestId: string) => `/inspections/reassignment-requests/${requestId}`,            // legacy
] as const;

const getInspectionCreatedAt = (inspection: Partial<Inspection> | null | undefined): string | undefined => {
  if (!inspection) return undefined;
  return (
    (inspection as any).fechaCreacion ||
    (inspection as any).createdAt ||
    (inspection as any).requestedAt ||
    (inspection as any).fechaSolicitud
  );
};

const getInspectionScheduledAt = (inspection: Partial<Inspection> | null | undefined): string | undefined => {
  if (!inspection) return undefined;
  return (
    inspection.fechaProgramada ||
    (inspection as any).scheduledDate ||
    (inspection as any).horario?.fecha
  );
};

const normalizeRequesterRole = (value: any): ReassignmentRequesterRole => {
  const role = String(value || '').toUpperCase();
  if (role.includes('MEC')) return 'MECHANIC';
  if (role.includes('ADM')) return 'ADMIN';
  return 'CLIENT';
};

const normalizeStatus = (value: any): ReassignmentRequestStatus => {
  const status = String(value || '').toUpperCase();
  // Backend returns Spanish: pendiente, aceptada, rechazada, expirada
  if (status.includes('ACEPT') || status.includes('APPROV') || status.includes('ACCEPT')) return 'APPROVED';
  if (status.includes('RECHAZ') || status.includes('REJECT')) return 'REJECTED';
  if (status.includes('EXPIR') || status.includes('VENC')) return 'EXPIRED';
  return 'PENDING';
};

const normalizeRequest = (raw: any): ReassignmentRequest => {
  const createdAt =
    raw?.createdAt ||
    raw?.fechaCreacion ||
    raw?.requestedAt ||
    raw?.fechaSolicitud ||
    new Date().toISOString();

  const expiresAt =
    raw?.expiresAt ||
    raw?.fechaExpiracion ||
    new Date(new Date(createdAt).getTime() + REQUEST_TTL_MS).toISOString();

  return {
    id: String(raw?.id || raw?.requestId || raw?._id || `${Date.now()}`),
    inspectionId: String(raw?.inspectionId || raw?.inspeccionId || raw?.inspection?.id || ''),
    description: String(raw?.description || raw?.reason || raw?.motivo || raw?.detalle || ''),
    requesterRole: normalizeRequesterRole(raw?.requesterRole || raw?.source || raw?.solicitadoPor || raw?.sourceRole),
    status: normalizeStatus(raw?.status || raw?.estado),
    createdAt,
    expiresAt,
    sedeId: Number(raw?.sedeId || raw?.sede?.id || raw?.inspection?.horario?.sede?.id || 0) || undefined,
    scheduledDate:
      raw?.scheduledDate ||
      raw?.fechaProgramada ||
      raw?.inspection?.fechaProgramada ||
      raw?.inspection?.scheduledDate,
    currentMechanicId: raw?.currentMechanicId || raw?.mecanicoIdActual || raw?.inspection?.mecanicoId,
    currentMechanicName:
      raw?.currentMechanicName ||
      raw?.mecanicoNombreActual ||
      raw?.inspection?.mecanico?.primerNombre,
  };
};

const extractArray = (payload: any): any[] => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.requests)) return payload.requests;
  return [];
};

const STATUS_MAP_TO_BACKEND: Record<string, string> = {
  PENDING: 'pendiente',
  APPROVED: 'aceptada',
  REJECTED: 'rechazada',
  EXPIRED: 'expirada',
  pending: 'pendiente',
  approved: 'aceptada',
  rejected: 'rechazada',
  expired: 'expirada',
};

const buildQuery = (filters: RequestFilters): string => {
  const query = new URLSearchParams();
  if (filters.status) query.append('status', STATUS_MAP_TO_BACKEND[filters.status] || filters.status);
  if (filters.sedeId) query.append('sedeId', filters.sedeId);
  if (filters.sortBy) query.append('sortBy', filters.sortBy);
  if (filters.order) query.append('order', filters.order);
  const queryString = query.toString();
  return queryString ? `?${queryString}` : '';
};

const tryGet = async (endpoints: readonly string[]) => {
  let lastError: any = null;
  for (const endpoint of endpoints) {
    try {
      return await apiService.get(endpoint);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('No fue posible consultar solicitudes de reasignacion');
};

const tryPost = async (endpointBuilders: readonly ((id: string) => string)[], id: string, payload: any) => {
  let lastError: any = null;
  for (const endpointBuilder of endpointBuilders) {
    try {
      const endpoint = endpointBuilder(id);
      return await apiService.post(endpoint, payload);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('No fue posible crear la solicitud de reasignacion');
};

const tryPatch = async (endpointBuilders: readonly ((id: string) => string)[], id: string, payload: any) => {
  let lastError: any = null;
  for (const endpointBuilder of endpointBuilders) {
    try {
      const endpoint = endpointBuilder(id);
      return await apiService.patch(endpoint, payload);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('No fue posible actualizar la solicitud');
};

export const isInsideReassignmentWindow = (inspection: Partial<Inspection> | null | undefined): boolean => {
  const createdAt = getInspectionCreatedAt(inspection);
  if (!createdAt) return false;
  return Date.now() - new Date(createdAt).getTime() <= WINDOW_MS;
};

export const getReassignmentWindowRemainingMs = (inspection: Partial<Inspection> | null | undefined): number => {
  const createdAt = getInspectionCreatedAt(inspection);
  if (!createdAt) return 0;
  const remaining = WINDOW_MS - (Date.now() - new Date(createdAt).getTime());
  return Math.max(0, remaining);
};

export const isRequestExpired = (request: ReassignmentRequest): boolean => {
  return Date.now() > new Date(request.expiresAt).getTime() || request.status === 'EXPIRED';
};

const isMechanicBusyAtDate = async (mechanicId: string, scheduledDate?: string): Promise<boolean> => {
  if (!scheduledDate) return false;
  try {
    const items = await apiService.get(`/inspections/mechanic/${mechanicId}`);
    if (!Array.isArray(items)) return false;

    const target = new Date(scheduledDate);
    const targetDate = target.toDateString();
    const targetTime = `${target.getHours().toString().padStart(2, '0')}:${target.getMinutes().toString().padStart(2, '0')}`;

    return items.some((item: any) => {
      const state = String(item?.estado_insp || item?.status || '').toLowerCase();
      if (['rechazada', 'cancelada', 'cancelled', 'finalizada', 'completed'].includes(state)) {
        return false;
      }

      const itemDateRaw = item?.fechaProgramada || item?.scheduledDate;
      if (!itemDateRaw) return false;

      const itemDate = new Date(itemDateRaw);
      const itemDateText = itemDate.toDateString();
      const itemTime = `${itemDate.getHours().toString().padStart(2, '0')}:${itemDate.getMinutes().toString().padStart(2, '0')}`;
      return itemDateText === targetDate && itemTime === targetTime;
    });
  } catch {
    return false;
  }
};

export const reassignmentService = {
  async createRequest(input: CreateRequestInput): Promise<ReassignmentRequest> {
    if (!isInsideReassignmentWindow(input.inspection)) {
      throw new Error('Solo se puede solicitar cambio de mecanico durante los primeros 30 minutos.');
    }

    const description = input.description.trim();
    if (!description) {
      throw new Error('Debes ingresar un motivo para solicitar el cambio de mecanico.');
    }

    // Backend expects 'reason' as the primary field (not 'description')
    const payload = {
      reason: description,
      description,
      requesterRole: input.requesterRole,
      role: input.requesterRole,
      ttlMinutes: 5,
    };

    const endpointBuilders: readonly ((id: string) => string)[] = [
      (id) => `/inspections/${id}/mechanic-change-requests`,
      ...CREATE_REQUEST_ENDPOINTS.slice(1),
    ];

    const response = await tryPost(endpointBuilders, input.inspection.id, payload);
    return normalizeRequest(response || payload);
  },

  async getRequests(filters: RequestFilters = {}): Promise<ReassignmentRequest[]> {
    const query = buildQuery(filters);
    const endpoints = LIST_REQUESTS_ENDPOINTS.map((endpoint) => `${endpoint}${query}`);
    const response = await tryGet(endpoints);
    const items = extractArray(response);

    return items
      .map(normalizeRequest)
      .map((item) => {
        if (item.status === 'PENDING' && isRequestExpired(item)) {
          return { ...item, status: 'EXPIRED' as ReassignmentRequestStatus };
        }
        return item;
      });
  },

  async getPendingCount(): Promise<number> {
    const requests = await this.getRequests({ status: 'pending' });
    return requests.filter((item) => item.status === 'PENDING' && !isRequestExpired(item)).length;
  },

  async resolveRequest(requestId: string, accept: boolean, mechanicId?: string, description?: string): Promise<void> {
    // Backend expects action: 'accept'|'reject', not status: 'APPROVED'|'REJECTED'
    const payload = {
      action: accept ? 'accept' : 'reject',
      targetMechanicId: mechanicId,
      resolutionReason: description,
      reason: description,
      // Legacy fallback fields kept for other possible backends
      status: accept ? 'APPROVED' : 'REJECTED',
      decision: accept ? 'APPROVED' : 'REJECTED',
      mechanicId,
      description,
    };
    const endpointBuilders: readonly ((id: string) => string)[] = [
      (id) => `/inspections/mechanic-change-requests/${id}/resolve`,
      ...RESOLVE_ENDPOINTS,
    ];
    try {
      await tryPatch(endpointBuilders, requestId, payload);
    } catch {
      await tryPost(endpointBuilders, requestId, payload);
    }
  },

  async getAvailableMechanicsForInspection(inspection: Inspection): Promise<Array<Mechanic & { isSelectable: boolean; unavailableReason?: string }>> {
    const scheduledAt = getInspectionScheduledAt(inspection);
    const scheduledDate = scheduledAt ? new Date(scheduledAt) : null;
    const dateText = scheduledDate
      ? `${scheduledDate.getFullYear()}-${String(scheduledDate.getMonth() + 1).padStart(2, '0')}-${String(scheduledDate.getDate()).padStart(2, '0')}`
      : undefined;
    const timeText = scheduledDate
      ? `${String(scheduledDate.getHours()).padStart(2, '0')}:${String(scheduledDate.getMinutes()).padStart(2, '0')}`
      : undefined;
    const sedeId = inspection.horario?.sede?.id;

    const mechanics = await adminService.getAllMechanics('', dateText, timeText, undefined, sedeId);

    const evaluated = await Promise.all(
      mechanics.map(async (mechanic) => {
        const isCurrent = mechanic.id === inspection.mecanicoId;
        if (isCurrent) {
          return {
            ...mechanic,
            isSelectable: false,
            unavailableReason: 'Ya es el mecanico asignado.',
          };
        }

        const isBusy = await isMechanicBusyAtDate(mechanic.id, scheduledAt);
        if (isBusy) {
          return {
            ...mechanic,
            isSelectable: false,
            unavailableReason: 'No disponible: tiene una inspeccion en ese horario.',
          };
        }

        return {
          ...mechanic,
          isSelectable: true,
        };
      })
    );

    return evaluated;
  },

  async reassignMechanic(input: ReassignMechanicInput): Promise<void> {
    if (!isInsideReassignmentWindow(input.inspection)) {
      throw new Error('Solo se puede reasignar durante los primeros 30 minutos desde la solicitud.');
    }

    const description = input.description.trim();
    if (!description) {
      throw new Error('Debes ingresar el motivo de la reasignacion.');
    }

    const payload = {
      mechanicId: input.mechanicId,
      description,
      reason: description,
      requestId: input.requestId,
    };

    try {
      await tryPatch(REASSIGN_ENDPOINTS, input.inspection.id, payload);
    } catch {
      await tryPost(REASSIGN_ENDPOINTS, input.inspection.id, payload);
    }
  },
};

export default reassignmentService;