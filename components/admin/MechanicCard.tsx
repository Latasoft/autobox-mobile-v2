import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Mechanic } from '../../services/adminService';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { getImageUrl } from '../../utils/imageUtils';

interface MechanicCardProps {
  mechanic: Mechanic;
  onPress: () => void;
  onSchedulePress: () => void;
  onPaymentPress: () => void;
  onToggleInspections: () => void;
  isExpanded: boolean;
  inspections?: any[];
  loadingInspections?: boolean;
}

export const MechanicCard: React.FC<MechanicCardProps> = ({
  mechanic,
  onPress,
  onSchedulePress,
  onPaymentPress,
  onToggleInspections,
  isExpanded,
  inspections,
  loadingInspections,
}) => {
  return (
    <Card style={styles.card} onPress={onPress}>
      <View style={styles.header}>
        <View style={styles.avatarContainer}>
          {mechanic.profilePhoto ? (
            <Image source={{ uri: getImageUrl(mechanic.profilePhoto) }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarText}>
                {mechanic.firstName?.[0]}{mechanic.lastName?.[0]}
              </Text>
            </View>
          )}
          <View style={[styles.statusBadge, { backgroundColor: mechanic.status === 'active' ? '#4CAF50' : '#F44336' }]} />
        </View>
        
        <View style={styles.infoContainer}>
          <Text style={styles.name}>{mechanic.firstName} {mechanic.lastName}</Text>
          <View style={styles.ratingContainer}>
            <Ionicons name="star" size={16} color="#FFD700" />
            <Text style={styles.rating}>{mechanic.rating?.toFixed(1) || 'N/A'}</Text>
            <Text style={styles.inspections}>
              • {mechanic.completedInspections || 0} completas
              • {mechanic.assignedInspections || 0} asignadas
            </Text>
          </View>
        </View>
        
        <TouchableOpacity onPress={onToggleInspections}>
          <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={24} color="#666" />
        </TouchableOpacity>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Pendiente</Text>
          <Text style={styles.statValue}>${mechanic.pendingPayments?.toLocaleString('es-CL') || '0'}</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Por Pagar</Text>
          <Text style={styles.statValue}>{mechanic.pendingInspectionsCount || 0} insp.</Text>
        </View>
      </View>

      <View style={styles.actions}>
        <Button 
          title="Horario" 
          variant="outline" 
          size="small" 
          onPress={onSchedulePress}
          style={styles.actionButton}
        />
        <Button 
          title="Pagar" 
          variant="outline" 
          size="small" 
          onPress={onPaymentPress}
          style={styles.actionButton}
        />
      </View>

      {isExpanded && (
        <View style={styles.inspectionsContainer}>
          <Text style={styles.inspectionsTitle}>Inspecciones Realizadas</Text>
          {loadingInspections ? (
            <ActivityIndicator size="small" color="#007bff" />
          ) : inspections && inspections.length > 0 ? (
            inspections.map((insp) => (
              <View key={insp.id} style={styles.inspectionItem}>
                <View style={styles.inspectionHeader}>
                  <Text style={styles.inspectionDate}>
                    {new Date(insp.fechaCreacion || insp.createdAt).toLocaleDateString()}
                  </Text>
                  <Text style={[styles.inspectionStatus, { 
                    color: insp.estado_insp === 'Finalizada' ? '#4CAF50' : '#FF9800' 
                  }]}>
                    {insp.estado_insp || insp.status}
                  </Text>
                </View>
                <Text style={styles.inspectionVehicle}>
                  {insp.publicacion?.vehiculo?.marca || insp.vehicleBrand} {insp.publicacion?.vehiculo?.modelo || insp.vehicleModel}
                </Text>
                <Text style={styles.inspectionPlate}>
                  {insp.publicacion?.vehiculo?.patente || insp.vehiclePatent}
                </Text>
              </View>
            ))
          ) : (
            <Text style={styles.noInspections}>No hay inspecciones realizadas</Text>
          )}
        </View>
      )}
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 12,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  avatarPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#E0E0E0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#757575',
  },
  statusBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  infoContainer: {
    flex: 1,
  },
  name: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  specialization: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rating: {
    marginLeft: 4,
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
  },
  inspections: {
    marginLeft: 8,
    fontSize: 14,
    color: '#666',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#EEEEEE',
    marginBottom: 12,
  },
  stat: {
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  actionButton: {
    minWidth: 80,
  },
  inspectionsContainer: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#EEEEEE',
  },
  inspectionsTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  inspectionItem: {
    backgroundColor: '#F9F9F9',
    padding: 8,
    borderRadius: 8,
    marginBottom: 8,
  },
  inspectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  inspectionDate: {
    fontSize: 12,
    color: '#666',
  },
  inspectionStatus: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  inspectionVehicle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  inspectionPlate: {
    fontSize: 12,
    color: '#666',
  },
  noInspections: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 8,
  },
});
