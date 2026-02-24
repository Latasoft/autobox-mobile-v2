import { Platform } from 'react-native';
import authService from './authService';
import { API_URL, PAYMENT_API_URL } from '../constants/Config';

class WalletService {
  // Obtener billetera del usuario
  async getWallet() {
    try {
      const token = await authService.getToken();
      const response = await fetch(`${API_URL}/wallet`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Error al obtener billetera');
      }

      return await response.json();
    } catch (error) {
      console.error('Error getting wallet:', error);
      throw error;
    }
  }

  // Obtener balance
  async getBalance() {
    try {
      const token = await authService.getToken();
      const response = await fetch(`${API_URL}/wallet/balance`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Error al obtener balance');
      }

      const data = await response.json();
      return data.balance;
    } catch (error) {
      console.error('Error getting balance:', error);
      throw error;
    }
  }

  // Obtener transacciones
  async getTransactions(limit: number = 50) {
    try {
      const token = await authService.getToken();
      const response = await fetch(`${API_URL}/wallet/transactions?limit=${limit}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Error al obtener transacciones');
      }

      return await response.json();
    } catch (error) {
      console.error('Error getting transactions:', error);
      throw error;
    }
  }

  // Simular depósito (DEV)
  async simulateDeposit(amount: number) {
    try {
      const token = await authService.getToken();
      const response = await fetch(`${API_URL}/wallet/deposit/simulate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Error al simular depósito');
      }

      return await response.json();
    } catch (error) {
      console.error('Error simulating deposit:', error);
      throw error;
    }
  }

  // Iniciar depósito con Transbank
  async initiateTransbankDeposit(amount: number) {
    try {
      const token = await authService.getToken();
      const response = await fetch(`${API_URL}/wallet/deposit/transbank/init`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Error al iniciar depósito');
      }

      return await response.json(); // { paymentId, url, token }
    } catch (error) {
      console.error('Error initiating Transbank deposit:', error);
      throw error;
    }
  }

  // Confirmar depósito de Transbank
  async confirmTransbankDeposit(token: string, paymentId?: string) {
    try {
      const authToken = await authService.getToken();
      // Enviar token siempre y paymentId solo si existe
      const normalizedPaymentId = typeof paymentId === 'string' ? paymentId.trim() : '';
      const hasPaymentId = normalizedPaymentId.length > 0;
      const queryParams = hasPaymentId
        ? `token=${encodeURIComponent(token)}&paymentId=${encodeURIComponent(normalizedPaymentId)}`
        : `token=${encodeURIComponent(token)}`;
      const url = `${API_URL}/wallet/deposit/transbank/confirm?${queryParams}`;
      const requestBody = hasPaymentId ? { token, paymentId: normalizedPaymentId } : { token };
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Error al confirmar depósito');
      }

      return await response.json();
    } catch (error) {
      console.error('Error confirming Transbank deposit:', error);
      throw error;
    }
  }

  // Realizar pago con balance de billetera
  async makePayment(inspectionId: string, amount: number, description?: string) {
    try {
      const token = await authService.getToken();
      const response = await fetch(`${API_URL}/wallet/payment`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inspectionId,
          amount,
          description,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Error al realizar pago');
      }

      return await response.json();
    } catch (error) {
      console.error('Error making payment:', error);
      throw error;
    }
  }

  // Formatear monto en pesos chilenos
  formatAmount(amount: number): string {
    return `$${Math.round(amount).toLocaleString('es-CL')}`;
  }

  // Formatear fecha
  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-CL', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  // Obtener tipo de transacción en español
  getTransactionTypeText(type: string): string {
    const types: Record<string, string> = {
      deposit: 'Depósito',
      payment: 'Pago',
      refund: 'Reembolso',
      withdrawal: 'Retiro',
    };
    return types[type] || type;
  }

  // Obtener estado de transacción en español
  getTransactionStatusText(status: string): string {
    const statuses: Record<string, string> = {
      pending: 'Pendiente',
      completed: 'Completado',
      failed: 'Fallido',
      cancelled: 'Cancelado',
    };
    return statuses[status] || status;
  }
}

export default new WalletService();
