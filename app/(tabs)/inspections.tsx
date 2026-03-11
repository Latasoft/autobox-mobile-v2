import React, { useState } from 'react';
import { Alert, View, Text, StyleSheet, FlatList, RefreshControl, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../components/ui/Screen';
import { Button } from '../../components/ui/Button';
import { InspectionCard } from '../../components/InspectionCard';
import { useInspections } from '../../hooks/useInspections';
import { Inspection } from '../../types';
import ReassignmentRequestModal from '../../components/ReassignmentRequestModal';
import reassignmentService, { isInsideReassignmentWindow } from '../../services/reassignmentService';

export default function InspectionsScreen() {
  const router = useRouter();
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [selectedInspection, setSelectedInspection] = useState<Inspection | null>(null);
  const [requestDescription, setRequestDescription] = useState('');
  const [sendingRequest, setSendingRequest] = useState(false);
  const {
    isAuthenticated,
    myInspections,
    myPublicationInspections,
    loading,
    refreshing,
    onRefresh,
    activeTab,
    setActiveTab
  } = useInspections();

  if (!isAuthenticated) {
    return (
      <Screen backgroundColor="#F5F5F5">
        <View style={styles.centerContainer}>
          <Ionicons name="clipboard-outline" size={80} color="#4CAF50" />
          <Text style={styles.title}>Mis Inspecciones</Text>
          <Text style={styles.subtitle}>
            Inicia sesión para ver el historial de tus inspecciones y solicitudes.
          </Text>
          <Button
            title="Iniciar Sesión"
            onPress={() => router.push('/auth')}
            style={styles.button}
          />
          <Text style={styles.orText}>o</Text>
          <Button
            title="Solicitar Inspección como Invitado"
            variant="outline"
            onPress={() => router.push('/(tabs)/publish/publish-with-inspection')} 
            style={styles.button}
          />
        </View>
      </Screen>
    );
  }

  const data = activeTab === 'requests' ? myInspections : myPublicationInspections;

  const openReassignModal = (inspection: Inspection) => {
    if (!isInsideReassignmentWindow(inspection)) {
      Alert.alert('Fuera de plazo', 'El cambio de mecanico solo se permite durante los primeros 30 minutos.');
      return;
    }

    setSelectedInspection(inspection);
    setRequestDescription('');
    setShowReassignModal(true);
  };

  const handleSubmitRequest = async () => {
    if (!selectedInspection) return;
    if (!requestDescription.trim()) {
      Alert.alert('Motivo requerido', 'Debes escribir un motivo para solicitar la reasignacion.');
      return;
    }

    try {
      setSendingRequest(true);
      await reassignmentService.createRequest({
        inspection: selectedInspection,
        description: requestDescription,
        requesterRole: 'CLIENT',
      });
      Alert.alert('Solicitud enviada', 'Tu solicitud fue enviada al administrador para reasignar mecanico.');
      setShowReassignModal(false);
      setSelectedInspection(null);
      setRequestDescription('');
      onRefresh();
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'No se pudo enviar la solicitud de cambio de mecanico.');
    } finally {
      setSendingRequest(false);
    }
  };

  return (
    <Screen backgroundColor="#F5F5F5" edges={['left', 'right', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Mis Inspecciones</Text>
      </View>

      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'requests' && styles.activeTab]}
          onPress={() => setActiveTab('requests')}
        >
          <Text style={[styles.tabText, activeTab === 'requests' && styles.activeTabText]}>
            Solicitadas
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'publications' && styles.activeTab]}
          onPress={() => setActiveTab('publications')}
        >
          <Text style={[styles.tabText, activeTab === 'publications' && styles.activeTabText]}>
            De mis Publicaciones
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={data}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <InspectionCard
            inspection={item}
            canRequestReassign={isInsideReassignmentWindow(item)}
            onRequestReassign={() => openReassignModal(item)}
            onPress={
              item.estado_insp === 'Pendiente'
                ? undefined
                : () => router.push({
                    pathname: '/user-inspection-detail',
                    params: { id: item.id }
                  })
            }
          />
        )}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4CAF50" />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="clipboard-outline" size={64} color="#CCC" />
            <Text style={styles.emptyText}>No tienes inspecciones en esta categoría</Text>
          </View>
        }
      />

      <ReassignmentRequestModal
        visible={showReassignModal}
        title="Reasignar mecanico"
        subtitle="Describe brevemente por que quieres cambiar de mecanico."
        placeholder="Motivo del cambio de mecanico"
        value={requestDescription}
        maxLength={250}
        loading={sendingRequest}
        primaryLabel="Enviar solicitud"
        colors={{
          primary: '#4CAF50',
          light: '#E8F5E9',
          border: '#A5D6A7',
          text: '#1B5E20',
        }}
        onChangeText={setRequestDescription}
        onClose={() => setShowReassignModal(false)}
        onSubmit={handleSubmitRequest}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 24,
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 32,
  },
  button: {
    width: '100%',
    marginBottom: 16,
  },
  orText: {
    fontSize: 14,
    color: '#999',
    marginBottom: 16,
  },
  header: {
    padding: 16,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: '#4CAF50',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#999',
  },
  activeTabText: {
    color: '#4CAF50',
  },
  listContent: {
    padding: 16,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 48,
  },
  emptyText: {
    marginTop: 16,
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
  },
});
