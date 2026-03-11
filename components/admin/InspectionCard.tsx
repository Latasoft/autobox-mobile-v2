import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AdminInspection } from '../../services/adminService';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { getImageUrl } from '../../utils/imageUtils';

interface InspectionCardProps {
  inspection: AdminInspection;
  onPress: () => void;
  onAssignPress?: () => void;
  onViewResult?: () => void;
  onDelete?: () => void;
  showMechanic?: boolean;
  style?: any;
}

export const InspectionCard: React.FC<InspectionCardProps> = ({
  inspection,
  onPress,
  onAssignPress,
  onViewResult,
  onDelete,
  showMechanic = true,
  style,
}) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return '#4CAF50';
      case 'scheduled': return '#2196F3';
      case 'pending': return '#FF9800';
      case 'cancelled': return '#F44336';
      case 'postergada': return '#FFC107';
      default: return '#9E9E9E';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'completed': return 'Completada';
      case 'scheduled': return 'Agendada';
      case 'pending': return 'Pendiente';
      case 'cancelled': return 'Cancelada';
      case 'postergada': return 'Postergada';
      default: return status;
    }
  };

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
    <Card style={[styles.card, style]} onPress={onPress}>
      <View style={styles.header}>
        <View style={styles.titleContainer}>
          <Text style={styles.title}>
            {inspection.vehicleBrand} {inspection.vehicleModel}
          </Text>
          <Text style={styles.subtitle}>{inspection.vehiclePatent || 'Sin patente'}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(inspection.status) }]}>
          <Text style={styles.statusText}>{getStatusLabel(inspection.status)}</Text>
        </View>
      </View>

      {inspection.status === 'postergada' && (
        <View style={styles.cancellationContainer}>
          <Text style={styles.cancellationText}>
            Motivo: {getCancellationReasonText(inspection.cancellationReason)}
          </Text>
        </View>
      )}

      <View style={styles.details}>
        <View style={styles.detailRow}>
          <Ionicons name="calendar-outline" size={16} color="#666" />
          <Text style={styles.detailText}>
            {new Date(inspection.scheduledDate).toLocaleDateString('es-CL')}
          </Text>
        </View>
        <View style={styles.detailRow}>
          <Ionicons name="time-outline" size={16} color="#666" />
          <Text style={styles.detailText}>
            {new Date(inspection.scheduledDate).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
      </View>

      {showMechanic && (
        <View style={styles.mechanicContainer}>
          <Text style={styles.mechanicLabel}>Mecánico asignado:</Text>
          {inspection.mechanicName ? (
            <View style={styles.mechanicInfo}>
              {inspection.mechanicPhoto ? (
                <Image source={{ uri: getImageUrl(inspection.mechanicPhoto) }} style={styles.mechanicPhoto} />
              ) : (
                <View style={styles.mechanicPhotoPlaceholder}>
                  <Ionicons name="person" size={20} color="#999" />
                </View>
              )}
              <Text style={styles.mechanicName}>{inspection.mechanicName}</Text>
            </View>
          ) : (
            <Text style={styles.noMechanic}>Sin asignar</Text>
          )}
        </View>
      )}

      <View style={styles.actions}>
        {(inspection.status === 'completed' || inspection.status === 'Finalizada') && onViewResult && (
          <Button
            title="Ver Resultado"
            onPress={(e) => {
              onViewResult();
            }}
            variant="outline"
            size="small"
            style={{ marginRight: 8 }}
            icon={<Ionicons name="clipboard-outline" size={16} color="#4CAF50" />}
          />
        )}
        {inspection.status !== 'cancelled' && onAssignPress && (
          <Button
            title={inspection.mechanicId ? 'Reasignar Mecánico' : 'Asignar Mecánico'}
            onPress={onAssignPress}
            size="small"
            variant="secondary"
          />
        )}
        {onDelete && (
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={onDelete}
          >
            <Ionicons name="trash-outline" size={18} color="#F44336" />
          </TouchableOpacity>
        )}
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  titleContainer: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  details: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  detailText: {
    fontSize: 14,
    color: '#666',
  },
  mechanicContainer: {
    backgroundColor: '#F5F5F5',
    padding: 8,
    borderRadius: 8,
    marginBottom: 12,
  },
  mechanicLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  mechanicInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  mechanicPhoto: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 8,
  },
  mechanicPhotoPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E0E0E0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  mechanicName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
  },
  noMechanic: {
    fontSize: 14,
    color: '#F44336',
    fontStyle: 'italic',
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
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  deleteButton: {
    marginLeft: 8,
    padding: 6,
    borderRadius: 6,
    backgroundColor: '#FFF0F0',
    borderWidth: 1,
    borderColor: '#FFCDD2',
  },
});
