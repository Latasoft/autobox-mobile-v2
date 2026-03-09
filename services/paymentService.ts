import apiService from './apiService';

// ==========================================
// 1. DEFINICIÓN DE TIPOS
// ==========================================

export enum PaymentStatus {
  PENDING = 'Pendiente',
  COMPLETED = 'Completado',
  FAILED = 'Fallido',
  REFUNDED = 'Reembolsado',
  REJECTED = 'Rechazado'
}

export enum PaymentMethod {
  WEBPAY = 'WebPay',
  TRANSFER = 'Transferencia',
  CASH = 'Efectivo',
  SALDO_AUTOBOX = 'Saldo AutoBox',
  POS_SEDE = 'POS Sede'
}

export enum PosPaymentStatus {
  PENDING = 'Pendiente',
  CONFIRMED = 'Confirmado',
  REJECTED = 'Rechazado',
}

export interface PosPaymentRequest {
  id: string;
  paymentId?: string;
  status: PosPaymentStatus | string;
  amount: number;
  publicationId?: string;
  inspectionId?: string;
  requesterUserId: string;
  requesterName?: string;
  requesterEmail?: string;
  sedeId?: number;
  sedeName?: string;
  requestedAt: string;
  expiresAt?: string;
  confirmedAt?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  metadata?: Record<string, any>;
}

export interface PosPaymentFilters {
  status?: string;
  date?: string;
  sedeId?: number;
}

const parsePosStatus = (status: any): string => {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'PENDING' || normalized === 'PENDIENTE') return PosPaymentStatus.PENDING;
  if (normalized === 'CONFIRMED' || normalized === 'CONFIRMADO') return PosPaymentStatus.CONFIRMED;
  if (normalized === 'REJECTED' || normalized === 'RECHAZADO' || normalized === 'EXPIRED' || normalized === 'CADUCADO') return PosPaymentStatus.REJECTED;
  return String(status || PosPaymentStatus.PENDING);
};

const normalizePosPayment = (item: any): PosPaymentRequest => {
  const requester = item?.requester || item?.usuario || item?.user;
  const sede = item?.sede;
  return {
    id: String(item?.id ?? item?.requestId ?? ''),
    paymentId: item?.paymentId,
    status: parsePosStatus(item?.status ?? item?.estado),
    amount: Number(item?.amount ?? item?.monto ?? 0),
    publicationId: item?.publicationId ?? item?.publicacionId,
    inspectionId: item?.inspectionId ?? item?.inspeccionId,
    requesterUserId: String(item?.requesterUserId ?? item?.usuarioId ?? requester?.id ?? ''),
    requesterName: item?.requesterName ?? [requester?.primerNombre, requester?.primerApellido].filter(Boolean).join(' ') || requester?.nombre,
    requesterEmail: item?.requesterEmail ?? requester?.email,
    sedeId: Number(item?.sedeId ?? sede?.id),
    sedeName: item?.sedeName ?? sede?.nombre,
    requestedAt: item?.requestedAt ?? item?.fechaSolicitud ?? item?.createdAt ?? new Date().toISOString(),
    expiresAt: item?.expiresAt ?? item?.fechaExpiracion,
    confirmedAt: item?.confirmedAt ?? item?.fechaConfirmacion,
    rejectedAt: item?.rejectedAt ?? item?.fechaRechazo,
    rejectionReason: item?.rejectionReason ?? item?.motivoRechazo,
    metadata: item?.metadata,
  };
};

export interface Payment {
  id: string;
  usuarioId: string;
  monto: number;
  estado: PaymentStatus | string;
  metodo: PaymentMethod | string;
  fechaCreacion: string;
  detalles?: string;
  usuario?: {
    nombre: string;
    apellido: string;
    email: string;
  };
  token?: string;
  idempotencyKey?: string;
  transactionDate?: string;
}

// Interface alineada con la entidad PagoMecanico del backend
// y con MechanicPayment de types/index.ts
export interface MechanicPayment {
  id: number;
  mecanico_id: string;
  monto: number;
  nota?: string;
  comprobante_url: string;
  fecha_pago: string;
  estado?: string;
  created_at?: string;
  mecanico?: {
    id: string;
    primerNombre: string;
    primerApellido: string;
    email?: string;
  };
  mechanic?: {
    id: string;
    firstName: string;
    lastName: string;
    module?: string;
  };
  sedeId?: number;
  sede?: {
    id: number;
    nombre: string;
  };
}

// Respuesta paginada que devuelve el endpoint GET /admin/mechanic-payments
export interface MechanicPaymentsResponse {
  data: MechanicPayment[];
  total: number;
  limit: number;
  offset: number;
}

export interface FinancialSummary {
  totalConfirmed: number;
  totalUserBalance: number;
  totalMechanicWithdrawals: number;
}

// ==========================================
// 2. CONFIGURACIÓN Y SERVICIO
// ==========================================

function normalizeMechanicPayment(item: MechanicPayment): MechanicPayment {
  if (item.mecanico && !item.mechanic) {
    item.mechanic = {
      id: item.mecanico.id,
      firstName: item.mecanico.primerNombre,
      lastName: item.mecanico.primerApellido,
    };
  }
  return item;
}

const paymentService = {

  async requestInSedePosPayment(payload: {
    amount: number;
    sedeId: number;
    publicationId?: string;
    inspectionId?: string;
    expiresAt?: string;
    metadata?: Record<string, any>;
  }): Promise<PosPaymentRequest> {
    const endpoints = ['/payments/pos/requests', '/payments/pos/request', '/payments/pos'];
    let lastError: any;

    for (const endpoint of endpoints) {
      try {
        const response = await apiService.post(endpoint, payload);
        return normalizePosPayment(response);
      } catch (error: any) {
        lastError = error;
      }
    }

    throw lastError || new Error('No se pudo crear la solicitud de pago POS');
  },

  async getPosPaymentRequests(filters: PosPaymentFilters = {}): Promise<PosPaymentRequest[]> {
    const params = new URLSearchParams();
    if (filters.status && filters.status !== 'all') params.append('status', filters.status);
    if (filters.date) params.append('date', filters.date);
    if (filters.sedeId !== undefined) params.append('sedeId', String(filters.sedeId));
    const query = params.toString() ? `?${params.toString()}` : '';

    const endpoints = [`/payments/pos/requests${query}`, `/payments/pos${query}`, `/admin/pos-payments${query}`];
    for (const endpoint of endpoints) {
      try {
        const response = await apiService.get(endpoint);
        const list = Array.isArray(response)
          ? response
          : Array.isArray(response?.data)
          ? response.data
          : Array.isArray(response?.items)
          ? response.items
          : [];
        return list.map(normalizePosPayment);
      } catch {
        // Try next endpoint shape
      }
    }
    return [];
  },

  async getPosPaymentRequestById(requestId: string): Promise<PosPaymentRequest | null> {
    const endpoints = [
      `/payments/pos/requests/${requestId}`,
      `/payments/pos/${requestId}`,
      `/admin/pos-payments/${requestId}`,
    ];

    for (const endpoint of endpoints) {
      try {
        const response = await apiService.get(endpoint);
        if (response) return normalizePosPayment(response);
      } catch {
        // Try next endpoint.
      }
    }

    return null;
  },

  async confirmPosPaymentRequest(requestId: string): Promise<PosPaymentRequest> {
    const endpoints = [
      `/payments/pos/requests/${requestId}/confirm`,
      `/payments/pos/${requestId}/confirm`,
      `/admin/pos-payments/${requestId}/confirm`,
    ];
    let lastError: any;

    for (const endpoint of endpoints) {
      try {
        const response = await apiService.patch(endpoint, {});
        return normalizePosPayment(response);
      } catch (error: any) {
        lastError = error;
      }
    }

    throw lastError || new Error('No se pudo confirmar el pago POS');
  },

  async rejectPosPaymentRequest(requestId: string, reason?: string): Promise<PosPaymentRequest> {
    const endpoints = [
      `/payments/pos/requests/${requestId}/reject`,
      `/payments/pos/${requestId}/reject`,
      `/admin/pos-payments/${requestId}/reject`,
    ];
    let lastError: any;

    for (const endpoint of endpoints) {
      try {
        const response = await apiService.patch(endpoint, { reason });
        return normalizePosPayment(response);
      } catch (error: any) {
        lastError = error;
      }
    }

    throw lastError || new Error('No se pudo rechazar el pago POS');
  },

  async expirePosPaymentRequest(requestId: string): Promise<PosPaymentRequest | null> {
    const endpoints = [
      `/payments/pos/requests/${requestId}/expire`,
      `/payments/pos/${requestId}/expire`,
      `/admin/pos-payments/${requestId}/expire`,
    ];

    for (const endpoint of endpoints) {
      try {
        const response = await apiService.patch(endpoint, {});
        return normalizePosPayment(response);
      } catch {
        // Try next endpoint.
      }
    }

    return null;
  },

  // ---------------------------------------------------------
  // 1. GESTIÓN DE PAGOS (HISTORIAL)
  // ---------------------------------------------------------

  async getAllPayments(): Promise<Payment[]> {
    try {
      const response = await apiService.get('/payments');
      return response || [];
    } catch (error) {
      console.error('Error obteniendo todos los pagos:', error);
      return [];
    }
  },

  async getPaymentsByUser(userId: string): Promise<Payment[]> {
    try {
      const response = await apiService.get(`/payments/user/${userId}`);
      return response || [];
    } catch (error) {
      console.error('Error obteniendo pagos del usuario:', error);
      return [];
    }
  },

  async updatePaymentStatus(id: string, status: PaymentStatus): Promise<any> {
    try {
      // FIX: el backend expone PATCH /payments/:id/status (con RolesGuard ADMINISTRADOR)
      const response = await apiService.patch(`/payments/${id}/status`, { estado: status });
      return response;
    } catch (error) {
      console.error('Error actualizando estado de pago:', error);
      throw error;
    }
  },

  async getFinancialSummary(): Promise<FinancialSummary> {
    try {
      // FIX: el backend expone GET /payments/summary (no /payments/summary/financial)
      const response = await apiService.get('/payments/summary');
      return response || { totalConfirmed: 0, totalUserBalance: 0, totalMechanicWithdrawals: 0 };
    } catch (error) {
      return { totalConfirmed: 0, totalUserBalance: 0, totalMechanicWithdrawals: 0 };
    }
  },

  // ---------------------------------------------------------
  // 3. GESTIÓN DE PAGOS A MECÁNICOS
  // ---------------------------------------------------------

  async getMechanicPayouts(mechanicId: string): Promise<MechanicPayment[]> {
    try {
      const response = await apiService.get(`/mechanics/${mechanicId}/payouts`);
      const items: MechanicPayment[] = response || [];
      return items.map(normalizeMechanicPayment);
    } catch (error) {
      console.error('Error obteniendo pagos del mecánico:', error);
      return [];
    }
  },

  async getAllMechanicPayouts(
    sedeId?: number,
    mechanicId?: string,
    startDate?: string,
    endDate?: string,
    limit?: number,
    offset?: number,
  ): Promise<MechanicPayment[]> {
    try {
      const params = new URLSearchParams();
      if (sedeId !== undefined) params.append('sedeId', sedeId.toString());
      if (mechanicId) params.append('mechanicId', mechanicId);
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      if (limit !== undefined) params.append('limit', limit.toString());
      if (offset !== undefined) params.append('offset', offset.toString());

      const query = params.toString() ? `?${params.toString()}` : '';
      const response: MechanicPaymentsResponse = await apiService.get(`/admin/mechanic-payments${query}`);

      const items: MechanicPayment[] = response?.data || [];
      return items.map(normalizeMechanicPayment);
    } catch (error) {
      console.error('Error obteniendo todos los pagos a mecánicos:', error);
      return [];
    }
  },

  async registerMechanicPayout(mechanicId: string, amount: string, note: string, receiptImage: any): Promise<any> {
    try {
      const formData = new FormData();
      formData.append('mecanicoId', mechanicId);
      formData.append('monto', amount);
      formData.append('nota', note || '');

      if (receiptImage) {
        const fileToUpload: any = {
          uri: receiptImage.uri,
          type: 'image/jpeg',
          name: receiptImage.fileName || `receipt-${Date.now()}.jpg`,
        };
        formData.append('comprobante', fileToUpload);
      }

      const response = await apiService.post('/payments/mechanic', formData);
      return response;
    } catch (error) {
      console.error('Error registrando pago a mecánico:', error);
      throw error;
    }
  },

  async deleteMechanicPayout(paymentId: number): Promise<void> {
    try {
      await apiService.delete(`/payments/mechanic/${paymentId}`);
    } catch (error) {
      console.error('Error eliminando pago a mecánico:', error);
      throw error;
    }
  },

  // ---------------------------------------------------------
  // 4. HELPERS VISUALES
  // ---------------------------------------------------------

  formatCurrency(amount: number | string): string {
    if (amount === undefined || amount === null) return '$0';
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return '$' + num.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  },

  getStatusColor(estado?: string): string {
    if (!estado) return '#999';
    const upperStatus = estado.toUpperCase();
    if (upperStatus.includes('COMPLET') || upperStatus.includes('AUTHORIZ') || upperStatus === 'PAGADO') return '#4CAF50';
    if (upperStatus.includes('PEND')) return '#FF9800';
    if (upperStatus.includes('FAIL') || upperStatus.includes('FALL') || upperStatus.includes('REJECT')) return '#F44336';
    if (upperStatus.includes('REFUND') || upperStatus.includes('REEMB')) return '#9C27B0';
    return '#999';
  },

  getStatusLabel(estado?: string): string {
    if (!estado) return 'Desconocido';
    const upperStatus = estado.toUpperCase();
    if (upperStatus === 'PENDING' || upperStatus === 'PENDIENTE') return 'Pendiente';
    if (upperStatus === 'COMPLETED' || upperStatus === 'COMPLETADO' || upperStatus === 'AUTHORIZED') return 'Aprobado';
    if (upperStatus === 'FAILED' || upperStatus === 'FALLIDO') return 'Fallido';
    if (upperStatus === 'REFUNDED' || upperStatus === 'REEMBOLSADO') return 'Reembolsado';
    if (upperStatus === 'REJECTED' || upperStatus === 'RECHAZADO') return 'Rechazado';
    return estado;
  }
};

export default paymentService;