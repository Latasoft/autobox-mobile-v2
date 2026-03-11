import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Inspection } from '../types';
import { Card } from './ui/Card';
import { downloadInspectionPdf } from '../services/pdfService';

interface InspectionCardProps {
  inspection: Inspection;
  onPress?: () => void;
  onRequestReassign?: () => void;
  canRequestReassign?: boolean;
}

export const InspectionCard: React.FC<InspectionCardProps> = ({
  inspection,
  onPress,
  onRequestReassign,
  canRequestReassign = false,
}) => {
  const [downloading, setDownloading] = useState(false);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Pendiente': return '#FF9800';
      case 'Confirmada': return '#2196F3';
      case 'En_sucursal': return '#9C27B0';
      case 'Finalizada': return '#4CAF50';
      case 'Rechazada': return '#F44336';
      case 'Postergada': return '#FFC107';
      case 'Cancelada': return '#F44336'; // Backend sets Rechazada on cancel, kept for legacy data
      default: return '#9E9E9E';
    }
  };

  const getStatusText = (status: string) => {
    return status.replace('_', ' ');
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleString('es-CL', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Helper to get vehicle info from nested relations
  const vehicle = inspection.vehiculo || inspection.publicacion?.vehiculo;
  
  const vehicleName = vehicle 
    ? `${vehicle.marca} ${vehicle.modelo} ${vehicle.anio}`
    : 'Sin información del vehículo';

  const mechanicName = inspection.mecanico 
    ? `${inspection.mecanico.primerNombre} ${inspection.mecanico.primerApellido}`
    : 'Sin asignar';

  const locationName = inspection.horario?.sede?.nombre || 'Sede por definir';

  const getCancellationReasonText = (reason?: string) => {
    switch (reason) {
      case 'cancelado_admin': return 'Cancelado por Admin';
      case 'cancelado_dueno': return 'Cancelado por Dueño';
      case 'cancelado_vend': return 'Cancelado por Solicitante';
      case 'cancelado_mec': return 'Cancelado por Mecánico';
      default: return reason || 'Razón no especificada';
    }
  };

  return (
    <Card style={styles.card} onPress={onPress}>
      <View style={styles.header}>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(inspection.estado_insp) }]}>
          <Text style={styles.statusText}>{getStatusText(inspection.estado_insp)}</Text>
        </View>
        {inspection.publicacionId && (
          <View style={styles.publicationBadge}>
            <Text style={styles.publicationBadgeText}>Con Publicación</Text>
          </View>
        )}
      </View>

      {canRequestReassign && onRequestReassign ? (
        <TouchableOpacity style={styles.reassignButton} onPress={onRequestReassign}>
          <Text style={styles.reassignButtonText}>Reasignar mecanico</Text>
        </TouchableOpacity>
      ) : null}

      {inspection.estado_insp === 'Postergada' && (
        <View style={styles.cancellationContainer}>
          <Text style={styles.cancellationText}>
            Motivo: {getCancellationReasonText(inspection.cancellationReason)}
          </Text>
        </View>
      )}

      <View style={styles.row}>
        <Ionicons name="car-sport" size={24} color="#66BB6A" />
        <View style={styles.infoColumn}>
          <Text style={styles.patent}>{vehicle?.patente || 'Sin patente'}</Text>
          <Text style={styles.vehicleName}>{vehicleName}</Text>
        </View>
      </View>

      <View style={styles.infoRow}>
        <Ionicons name="person" size={18} color="#666" />
        <Text style={styles.infoText}>Mecánico: {mechanicName}</Text>
        {inspection.mecanico?.averageRating !== undefined && (
          <View style={styles.mechanicRatingInline}>
            <Ionicons name="star" size={13} color="#FFC107" />
            <Text style={styles.mechanicRatingText}>
              {Number(inspection.mecanico.averageRating).toFixed(1)}
            </Text>
          </View>
        )}
      </View>

      {inspection.fechaProgramada && (
        <View style={styles.infoRow}>
          <Ionicons name="calendar" size={18} color="#666" />
          <Text style={styles.infoText}>
            Agendada: {new Date(inspection.fechaProgramada).toLocaleDateString('es-CL', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            })}
            {inspection.horario ? ` ${inspection.horario.horaInicio.substring(0, 5)} - ${inspection.horario.horaFin.substring(0, 5)}` : 
             ` ${new Date(inspection.fechaProgramada).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}`}
          </Text>
        </View>
      )}

      <View style={styles.infoRow}>
        <Ionicons name="location" size={18} color="#666" />
        <Text style={styles.infoText}>{locationName}</Text>
      </View>

      {inspection.estado_insp === 'Finalizada' && (
        <TouchableOpacity 
          style={styles.downloadButton} 
          onPress={async () => {
            try {
              setDownloading(true);
              await downloadInspectionPdf(inspection);
            } catch (error) {
              Alert.alert('Error', 'No se pudo generar el PDF');
            } finally {
              setDownloading(false);
            }
          }}
          disabled={downloading}
        >
          {downloading ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <>
              <Ionicons name="document-text-outline" size={18} color="#FFF" />
              <Text style={styles.downloadButtonText}>Descargar Informe PDF</Text>
            </>
          )}
        </TouchableOpacity>
      )}
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    marginBottom: 16,
    padding: 16,
  },
  downloadButton: {
    backgroundColor: '#FF5722',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
    borderRadius: 8,
    marginTop: 12,
  },
  downloadButtonText: {
    color: '#FFF',
    fontWeight: 'bold',
    marginLeft: 8,
    fontSize: 14,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  reassignButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFE8D0',
    borderWidth: 1,
    borderColor: '#F57C00',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginBottom: 12,
  },
  reassignButtonText: {
    color: '#E65100',
    fontWeight: '700',
    fontSize: 13,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  publicationBadge: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#4CAF50',
  },
  publicationBadgeText: {
    color: '#4CAF50',
    fontSize: 10,
    fontWeight: 'bold',
  },
  cancellationContainer: {
    backgroundColor: '#FFF3E0',
    padding: 8,
    borderRadius: 4,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#FF9800',
  },
  cancellationText: {
    color: '#E65100',
    fontSize: 12,
    fontWeight: '500',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  infoColumn: {
    marginLeft: 12,
    flex: 1,
  },
  patent: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  vehicleName: {
    fontSize: 14,
    color: '#666',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  infoText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#555',
    flex: 1,
  },
  mechanicRatingInline: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 6,
    backgroundColor: '#FFF8E1',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  mechanicRatingText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FFA000',
    marginLeft: 2,
  },
});