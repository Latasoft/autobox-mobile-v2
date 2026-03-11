import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Inspection } from '../../types';

interface InspectionListItemProps {
  inspection: Inspection;
  onPress: () => void;
  onViewResult?: () => void;
  onRequestReassign?: () => void;
  canRequestReassign?: boolean;
}

export const InspectionListItem: React.FC<InspectionListItemProps> = ({
  inspection,
  onPress,
  onViewResult,
  onRequestReassign,
  canRequestReassign = false,
}) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Finalizada': return '#4CAF50';
      case 'Confirmada': return '#2196F3';
      case 'En_sucursal': return '#FF9800';
      case 'Pendiente': return '#9C27B0';
      case 'Rechazada': return '#F44336';
      case 'Postergada': return '#FFC107';
      default: return '#9E9E9E';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'Finalizada': return 'Completada';
      case 'Confirmada': return 'Agendada';
      case 'En_sucursal': return 'En Taller';
      case 'Pendiente': return 'Pendiente';
      case 'Rechazada': return 'Rechazada';
      case 'Postergada': return 'Postergada';
      default: return status;
    }
  };

  const vehicle = inspection.vehiculo || inspection.publicacion?.vehiculo;
  const date = inspection.fechaProgramada ? new Date(inspection.fechaProgramada) : null;

  return (
    <Card style={styles.card} onPress={onPress}>
      <View style={styles.header}>
        <View style={styles.titleContainer}>
          <Text style={styles.title}>
            {vehicle?.marca} {vehicle?.modelo}
          </Text>
          <Text style={styles.subtitle}>{vehicle?.patente || 'Sin patente'}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(inspection.estado_insp) }]}>
          <Text style={styles.statusText}>{getStatusLabel(inspection.estado_insp)}</Text>
        </View>
      </View>

      {canRequestReassign && onRequestReassign ? (
        <TouchableOpacity style={styles.reassignButton} onPress={onRequestReassign}>
          <Text style={styles.reassignButtonText}>Solicitar reasignación</Text>
        </TouchableOpacity>
      ) : null}

      <View style={styles.details}>
        <View style={styles.detailRow}>
          <Ionicons name="calendar-outline" size={16} color="#666" />
          <Text style={styles.detailText}>
            {date ? date.toLocaleDateString('es-CL') : 'Fecha pendiente'}
          </Text>
        </View>
        <View style={styles.detailRow}>
          <Ionicons name="time-outline" size={16} color="#666" />
          <Text style={styles.detailText}>
            {date ? date.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) : '--:--'}
          </Text>
        </View>
      </View>

      {inspection.estado_insp === 'Finalizada' && onViewResult && (
        <View style={styles.actions}>
          <Button
            title="Ver Resultado"
            onPress={(e) => {
              // e?.stopPropagation();
              onViewResult();
            }}
            variant="outline"
            size="small"
            icon={<Ionicons name="clipboard-outline" size={16} color="#4CAF50" />}
          />
        </View>
      )}
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    marginBottom: 16,
  },
  actions: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#EEE',
    paddingTop: 12,
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
  reassignButton: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#F57C00',
    backgroundColor: '#FFE8D0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginBottom: 10,
  },
  reassignButtonText: {
    color: '#E65100',
    fontWeight: '700',
    fontSize: 12,
  },
  details: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 8,
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
});
