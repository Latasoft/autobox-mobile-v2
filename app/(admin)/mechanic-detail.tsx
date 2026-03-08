import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, ActivityIndicator, Alert, Image, TouchableOpacity, Modal } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../components/ui/Screen';
import { Button } from '../../components/ui/Button';
import { ProfileImageUploader } from '../../components/admin/ProfileImageUploader';
import adminService, { Mechanic, Sede } from '../../services/adminService';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { Select } from '../../components/ui/Select';

export default function MechanicDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [mechanic, setMechanic] = useState<Mechanic | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Edit form state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [profilePhoto, setProfilePhoto] = useState('');
  const [email, setEmail] = useState('');
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [showSedeModal, setShowSedeModal] = useState(false);
  const [sedeActionType, setSedeActionType] = useState<'block' | 'change' | null>(null);
  const [selectedSedeId, setSelectedSedeId] = useState<string>('');
  const [mechanicWorkingSedes, setMechanicWorkingSedes] = useState<{ id: number; nombre: string }[]>([]);
  const [mechanicBlockedSedeIds, setMechanicBlockedSedeIds] = useState<number[]>([]);
  const [currentMechanicSedeId, setCurrentMechanicSedeId] = useState<number | null>(null);
  const [activeChangeChip, setActiveChangeChip] = useState<'one' | 'two'>('one');
  const [selectedChangeSedeOne, setSelectedChangeSedeOne] = useState<string>('');
  const [selectedChangeSedeTwo, setSelectedChangeSedeTwo] = useState<string>('');
  const [runningSedeAction, setRunningSedeAction] = useState(false);

  useEffect(() => {
    loadMechanic();
    loadSedes();
  }, [id]);

  const loadSedes = async () => {
    try {
      const data = await adminService.getSedes();
      setSedes(data || []);
    } catch (error) {
      console.error('Error loading sedes:', error);
    }
  };

  const loadMechanic = async () => {
    try {
      if (!id) return;
      setLoading(true);
      const data = await adminService.getMechanicById(id as string);
      setMechanic(data);
      
      // Init form
      setFirstName(data.firstName || '');
      setLastName(data.lastName || '');
      // Formatear el teléfono desde formato limpio de DB ("56912345678")
      // al formato visual ("+56 9 1234 5678") para que el input lo muestre correctamente
      const rawPhone = data.phone || '';
      let digits = rawPhone.replace(/\D/g, '');
      if (digits.length >= 3 && digits.startsWith('569')) {
        const rest = digits.slice(3);
        let displayPhone = '+56 9 ';
        if (rest.length > 0) {
          displayPhone += rest.slice(0, 4);
          if (rest.length > 4) displayPhone += ' ' + rest.slice(4, 8);
        }
        setPhone(displayPhone);
      } else {
        setPhone(rawPhone);
      }
      setProfilePhoto(data.profilePhoto || '');
      setEmail(data.email || '');

    } catch (error) {
      console.error('Error loading mechanic:', error);
      Alert.alert('Error', 'No se pudo cargar la información del mecánico');
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const handleFirstNameChange = (text: string) => {
    // Solo permitir letras y espacios (incluyendo tildes y ñ)
    if (/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]*$/.test(text)) {
      setFirstName(text);
    }
  };

  const handleLastNameChange = (text: string) => {
    // Solo permitir letras y espacios (incluyendo tildes y ñ)
    if (/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]*$/.test(text)) {
      setLastName(text);
    }
  };

  // Función pura de formateo de teléfono chileno.
  // Acepta tanto formato limpio ("56912345678") como con símbolos ("+56 9 1234 5678").
  const formatPhoneDisplay = (raw: string): string => {
    let digits = raw.replace(/\D/g, '');
    if (digits.length < 3) digits = '569';
    if (!digits.startsWith('569')) digits = '569' + digits;
    if (digits.length > 11) digits = digits.slice(0, 11);
    let formatted = '+56 9 ';
    const rest = digits.slice(3);
    if (rest.length > 0) {
      formatted += rest.slice(0, 4);
      if (rest.length > 4) formatted += ' ' + rest.slice(4, 8);
    }
    return formatted;
  };

  const handlePhoneChange = (text: string) => {
    setPhone(formatPhoneDisplay(text));
  };

  const handleImageSelected = (uri: string) => {
    setProfilePhoto(uri);
  };

  const handleSave = async () => {
    if (!mechanic) return;
    try {
      setSaving(true);
      
      // Validar duplicados solo si email o teléfono fueron cambiados
      const emailChanged = email !== mechanic.email;
      // Comparar en formato limpio (solo dígitos) para no disparar check innecesario
      // cuando el phone del estado está formateado y el de la DB está limpio
      const cleanCurrentPhone = phone.replace(/\D/g, '');
      const cleanOriginalPhone = (mechanic.phone || '').replace(/\D/g, '');
      const phoneChanged = cleanCurrentPhone !== cleanOriginalPhone;
      
      if (emailChanged || phoneChanged) {
        try {
          const cleanPhone = phone.replace(/\D/g, '');
          const existenceCheck = await adminService.checkMechanicExistence(
            mechanic.rut ? mechanic.rut.replace(/[^0-9kK]/g, '').toUpperCase() : '',
            email,
            cleanPhone,
            mechanic.id, // excluir el propio mecánico del chequeo de duplicados
          );
          
          if (existenceCheck.exists) {
            Alert.alert(
              'Datos Duplicados',
              existenceCheck.message || `${existenceCheck.field} ya está registrado en el sistema.`,
              [{ text: 'OK' }]
            );
            setSaving(false);
            return;
          }
        } catch (validationError: any) {
          // El endpoint existe — propagar el error para no ocultar problemas de red
          console.error('Error al validar duplicados:', validationError);
          Alert.alert('Error', 'No se pudo verificar disponibilidad de datos. Intenta nuevamente.');
          setSaving(false);
          return;
        }
      }
      
      await adminService.updateMechanic(mechanic.id, {
        firstName,
        lastName,
        phone,
        email,
        profilePhoto,
      });
      Alert.alert('Éxito', 'Información actualizada correctamente');
      loadMechanic(); // Reload to be sure
    } catch (error) {
      console.error('Error updating mechanic:', error);
      Alert.alert('Error', 'No se pudo actualizar el mecánico');
    } finally {
      setSaving(false);
    }
  };

  const handleViewInspections = () => {
    if (!mechanic) return;
    router.push({
      pathname: '/(admin)/mechanic-inspections',
      params: { mechanicId: mechanic.id, mechanicName: `${mechanic.firstName} ${mechanic.lastName}` }
    });
  };

  const handleViewPayments = () => {
    if (!mechanic) return;
    router.push({
      pathname: '/(admin)/mechanic-payments',
      params: { mechanicId: mechanic.id, mechanicName: `${mechanic.firstName} ${mechanic.lastName}` }
    });
  };

  const handleDeleteMechanic = () => {
    if (!mechanic) return;
    
    Alert.alert(
      'Eliminar Mecánico',
      `¿Seguro que deseas eliminar a ${mechanic.firstName} ${mechanic.lastName}? Esta acción no se puede deshacer.`,
      [
        {
          text: 'Cancelar',
          onPress: () => {},
          style: 'cancel',
        },
        {
          text: 'Eliminar',
          onPress: async () => {
            try {
              setSaving(true);
              await adminService.deleteMechanic(mechanic.id);
              Alert.alert(
                'Éxito',
                'Mecánico eliminado correctamente',
                [{ text: 'OK', onPress: () => router.back() }]
              );
            } catch (error: any) {
              console.error('Error deleting mechanic:', error);
              Alert.alert('Error', error.message || 'No se pudo eliminar el mecánico');
            } finally {
              setSaving(false);
            }
          },
          style: 'destructive',
        },
      ]
    );
  };;

  const handleViewSchedule = () => {
    if (!mechanic) return;
    router.push({
      pathname: '/(admin)/mechanic-schedule',
      params: {
        id: mechanic.id,
        name: `${mechanic.firstName} ${mechanic.lastName}`,
      },
    });
  };

  const openSedeActionModal = async (type: 'block' | 'change') => {
    setSedeActionType(type);
    if (type === 'change' && mechanic) {
      const [working, blocked] = await Promise.all([
        adminService.getMechanicWorkingSedes(mechanic.id).catch(() => []),
        adminService.getMechanicBlockedSedes(mechanic.id).catch(() => []),
      ]);

      const normalizedWorking = (working || []).map((item) => ({ id: Number(item.id), nombre: item.nombre }));
      setMechanicWorkingSedes(normalizedWorking.filter((item) => Number.isFinite(item.id)));
      setMechanicBlockedSedeIds(blocked || []);

      const directId = Number((mechanic as any)?.sedeId ?? (mechanic as any)?.sede?.id);
      const fromName = (() => {
        const currentName = String((mechanic as any)?.sede?.nombre || (mechanic as any)?.module || '').trim().toLowerCase();
        const matched = sedes.find((sede) => sede.nombre.trim().toLowerCase() === currentName);
        return matched ? matched.id : null;
      })();

      setCurrentMechanicSedeId(Number.isFinite(directId) ? directId : fromName);
      setSelectedChangeSedeOne('');
      setSelectedChangeSedeTwo('');
      setActiveChangeChip('one');
      setSelectedSedeId('');
    } else {
      setMechanicWorkingSedes([]);
      setMechanicBlockedSedeIds([]);
      setCurrentMechanicSedeId(null);
      setSelectedChangeSedeOne('');
      setSelectedChangeSedeTwo('');
      setActiveChangeChip('one');
      setSelectedSedeId('');
    }
    setShowSedeModal(true);
  };

  const getChangeDisabledReason = (sedeId: number): string | null => {
    const workingIds = new Set(mechanicWorkingSedes.map((item) => item.id));
    const selectedOtherChip = activeChangeChip === 'one' ? Number(selectedChangeSedeTwo) : Number(selectedChangeSedeOne);

    if (currentMechanicSedeId === sedeId) return 'Sede actual';
    if (workingIds.has(sedeId)) return 'Ya inscrita';
    if (mechanicBlockedSedeIds.includes(sedeId)) return 'Bloqueada';
    if (Number.isFinite(selectedOtherChip) && selectedOtherChip === sedeId) return 'Ya elegida';

    return null;
  };

  const handleSelectChangeSede = (sedeId: number) => {
    const reason = getChangeDisabledReason(sedeId);
    if (reason) {
      Alert.alert('No disponible', `No puedes seleccionar esta sede: ${reason}.`);
      return;
    }

    if (activeChangeChip === 'one') {
      setSelectedChangeSedeOne(String(sedeId));
      return;
    }

    setSelectedChangeSedeTwo(String(sedeId));
  };

  const runSedeAction = async () => {
    if (!mechanic || !sedeActionType) return;

    try {
      setRunningSedeAction(true);

      if (sedeActionType === 'block') {
        if (!selectedSedeId) return;
        const sedeId = Number(selectedSedeId);
        await adminService.blockMechanicFromSede(mechanic.id, sedeId);
        Alert.alert('Éxito', 'Mecánico bloqueado correctamente de la sede seleccionada.');
      } else {
        const secondChipEnabled = mechanicWorkingSedes.length >= 2;
        const rawTargets = [selectedChangeSedeOne, secondChipEnabled ? selectedChangeSedeTwo : '']
          .map((value) => Number(value))
          .filter((value) => Number.isFinite(value));

        const uniqueTargets = Array.from(new Set(rawTargets));

        if (uniqueTargets.length === 0) {
          Alert.alert('Selección requerida', 'Debes seleccionar al menos una sede para cambiar.');
          return;
        }

        if (rawTargets.length !== uniqueTargets.length) {
          Alert.alert('Selección inválida', 'No puede estar la misma sede en ambos chips.');
          return;
        }

        const workingIds = new Set(mechanicWorkingSedes.map((item) => item.id));
        const invalidTarget = uniqueTargets.find((sedeId) => {
          return (
            workingIds.has(sedeId) ||
            mechanicBlockedSedeIds.includes(sedeId) ||
            currentMechanicSedeId === sedeId
          );
        });

        if (invalidTarget) {
          Alert.alert('Selección inválida', 'Hay sedes seleccionadas que no están permitidas para el cambio.');
          return;
        }

        for (const targetSedeId of uniqueTargets) {
          await adminService.changeMechanicSede(mechanic.id, targetSedeId);
        }

        Alert.alert('Éxito', 'Sedes del mecánico actualizadas correctamente.');
      }

      setShowSedeModal(false);
      setSedeActionType(null);
      setSelectedSedeId('');
      setSelectedChangeSedeOne('');
      setSelectedChangeSedeTwo('');
      await loadMechanic();
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'No se pudo ejecutar la acción de sede');
    } finally {
      setRunningSedeAction(false);
    }
  };

  if (loading) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#007bff" />
        </View>
      </Screen>
    );
  }

  if (!mechanic) return null;

  return (
    <Screen style={styles.container} backgroundColor="#fff">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Perfil del Mecánico</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAwareScrollView
      style={{ flex: 1, backgroundColor: '#F8F9FA' }}
      resetScrollToCoords={{ x: 0, y: 0 }}
      contentContainerStyle={{ flexGrow: 1 }}
      scrollEnabled={true}
      enableOnAndroid={true} // Vital para que funcione en Android
      extraScrollHeight={20} // Un pequeño margen extra arriba del teclado
      keyboardShouldPersistTaps="handled" // Para que al tocar fuera se cierre el teclado o funcionen los botones
      >
        
        {/* Avatar Section */}
        <View style={styles.avatarSection}>
          <ProfileImageUploader
              imageUri={profilePhoto}
              onImageSelected={handleImageSelected}
              placeholder="Foto"
          />
          <View style={{flexDirection: 'row', alignItems: 'center', marginTop: 12}}>
             <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: mechanic.status === 'active' ? '#4CAF50' : '#F44336', marginRight: 8 }} />
             <Text style={styles.mechanicName}>{firstName} {lastName}</Text>
          </View>
          <Text style={styles.mechanicEmail}>{email}</Text>
        </View>

        {/* Form Section */}
        <View style={styles.formSection}>
          <Text style={styles.sectionTitle}>Información Personal</Text>
          
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="Email"
              keyboardType="email-address"
              autoCapitalize="none"
              editable={false}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Nombre</Text>
            <TextInput
              style={styles.input}
              value={firstName}
              onChangeText={handleFirstNameChange}
              placeholder="Nombre"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Apellido</Text>
            <TextInput
              style={styles.input}
              value={lastName}
              onChangeText={handleLastNameChange}
              placeholder="Apellido"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Teléfono</Text>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={handlePhoneChange}
              keyboardType="phone-pad"
              maxLength={15}
              placeholder="+56 9 ..."
            />
          </View>

          <Button 
            title={saving ? "Guardando..." : "Guardar Cambios"}
            onPress={handleSave}
            disabled={saving}
            style={styles.saveButton}
          />
        </View>

        {/* Stats / Reviews Section could go here */}

        <View style={styles.actionsSection}>
          <Text style={styles.sectionTitle}>Acciones</Text>
          
          <TouchableOpacity style={styles.actionCard} onPress={handleViewInspections}>
            <View style={[styles.iconBox, { backgroundColor: '#E3F2FD' }]}>
              <Ionicons name="clipboard-outline" size={24} color="#2196F3" />
            </View>
            <View style={styles.actionContent}>
              <Text style={styles.actionTitle}>Ver Inspecciones</Text>
              <Text style={styles.actionSubtitle}>Historial completo de trabajos</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#999" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionCard} onPress={handleViewPayments}>
            <View style={[styles.iconBox, { backgroundColor: '#E8F5E9' }]}>
              <Ionicons name="wallet-outline" size={24} color="#4CAF50" />
            </View>
            <View style={styles.actionContent}>
              <Text style={styles.actionTitle}>Ver Pagos</Text>
              <Text style={styles.actionSubtitle}>Manejar transacciones y comprobantes</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#999" />
          </TouchableOpacity>

          <View style={styles.adminActionButtonsSection}>
            <Button
              title="Ver horario"
              onPress={handleViewSchedule}
              icon={<Ionicons name="time-outline" size={20} color="#FFF" />}
              style={styles.viewScheduleButton}
            />

            <Button
              title="Cambiar de sede"
              onPress={() => openSedeActionModal('change')}
              icon={<Ionicons name="swap-horizontal-outline" size={20} color="#FFF" />}
              style={styles.changeSedeButton}
            />

            <Button
              title="Bloquear mecánico de sede"
              variant="danger"
              onPress={() => openSedeActionModal('block')}
              icon={<Ionicons name="lock-closed-outline" size={20} color="#FFF" />}
              style={styles.blockSedeButton}
            />
          </View>
        </View>

        <Modal
          visible={showSedeModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowSedeModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>
                {sedeActionType === 'block' ? 'Bloquear mecánico de sede' : 'Cambiar mecánico de sede'}
              </Text>

              {sedeActionType === 'block' ? (
                <Select
                  label="Sede"
                  value={selectedSedeId}
                  onChange={setSelectedSedeId}
                  options={sedes.map((sede) => ({ label: sede.nombre, value: String(sede.id) }))}
                  placeholder="Selecciona una sede"
                />
              ) : (
                <View style={styles.changeSedeContainer}>
                  <View style={styles.changeChipsRow}>
                    <TouchableOpacity
                      style={[styles.changeChip, activeChangeChip === 'one' && styles.changeChipActive]}
                      onPress={() => setActiveChangeChip('one')}
                    >
                      <Text style={styles.changeChipLabel}>Autobox 1</Text>
                      <Text style={[styles.changeChipValue, !selectedChangeSedeOne && styles.changeChipPlaceholder]}>
                        {selectedChangeSedeOne
                          ? sedes.find((item) => item.id === Number(selectedChangeSedeOne))?.nombre || `Sede #${selectedChangeSedeOne}`
                          : 'Seleccionar sede'}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.changeChip,
                        activeChangeChip === 'two' && styles.changeChipActive,
                        mechanicWorkingSedes.length < 2 && styles.changeChipDisabled,
                      ]}
                      onPress={() => {
                        if (mechanicWorkingSedes.length < 2) return;
                        setActiveChangeChip('two');
                      }}
                      disabled={mechanicWorkingSedes.length < 2}
                    >
                      <Text style={styles.changeChipLabel}>Autobox 2</Text>
                      <Text style={[styles.changeChipValue, !selectedChangeSedeTwo && styles.changeChipPlaceholder]}>
                        {selectedChangeSedeTwo
                          ? sedes.find((item) => item.id === Number(selectedChangeSedeTwo))?.nombre || `Sede #${selectedChangeSedeTwo}`
                          : 'Seleccionar sede'}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <Text style={styles.changeHelpText}>No se pueden elegir sedes bloqueadas, ya inscritas, la sede actual ni repetir la misma sede en ambos chips.</Text>

                  <ScrollView style={styles.sedeListContainer}>
                    {sedes.map((sede) => {
                      const disabledReason = getChangeDisabledReason(sede.id);
                      const isDisabled = Boolean(disabledReason);
                      return (
                        <TouchableOpacity
                          key={String(sede.id)}
                          style={[styles.changeSedeItem, isDisabled && styles.changeSedeItemDisabled]}
                          onPress={() => handleSelectChangeSede(sede.id)}
                          disabled={isDisabled}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={styles.changeSedeName}>{sede.nombre}</Text>
                            <Text style={styles.changeSedeMeta}>ID: {sede.id}</Text>
                          </View>
                          {isDisabled ? (
                            <Text style={styles.changeSedeBadgeDisabled}>{disabledReason}</Text>
                          ) : (
                            <Ionicons name="chevron-forward" size={18} color="#999" />
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              )}

              <View style={styles.modalButtonsRow}>
                <Button
                  title="Cancelar"
                  variant="outline"
                  onPress={() => setShowSedeModal(false)}
                  style={styles.modalButton}
                />
                <Button
                  title={sedeActionType === 'block' ? 'Bloquear' : 'Cambiar'}
                  onPress={runSedeAction}
                  loading={runningSedeAction}
                  disabled={
                    runningSedeAction ||
                    (sedeActionType === 'block'
                      ? !selectedSedeId
                      : !selectedChangeSedeOne && !selectedChangeSedeTwo)
                  }
                  style={[
                    styles.modalButton,
                    sedeActionType === 'block' ? styles.blockButton : styles.changeButton,
                  ]}
                />
              </View>
            </View>
          </View>
        </Modal>

        {/* Delete Section */}
        <View style={styles.deleteSection}>
          <Button 
            title={saving ? "Eliminando..." : "Eliminar Mecánico"}
            variant="danger"
            size="large"
            onPress={handleDeleteMechanic}
            disabled={saving}
            loading={saving}
            icon={!saving ? <Ionicons name="trash-outline" size={20} color="#FFF" /> : undefined}
            style={styles.deleteButton}
          />
        </View>

      </KeyboardAwareScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  backButton: { padding: 4 },
  content: { paddingBottom: 40 },
  
  avatarSection: {
    alignItems: 'center',
    paddingVertical: 24,
    backgroundColor: '#fff',
    marginBottom: 16,
  },
  avatarContainer: { position: 'relative', marginBottom: 12 },
  avatar: { width: 100, height: 100, borderRadius: 50 },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#E0E0E0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { fontSize: 36, fontWeight: 'bold', color: '#757575' },
  statusBadge: {
    position: 'absolute', bottom: 4, right: 4,
    width: 20, height: 20, borderRadius: 10, borderWidth: 3, borderColor: '#fff'
  },
  mechanicName: { fontSize: 20, fontWeight: 'bold', color: '#333', marginBottom: 4 },
  mechanicEmail: { fontSize: 14, color: '#666' },

  formSection: {
    padding: 16,
    backgroundColor: '#fff',
    marginBottom: 16,
  },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 16 },
  inputGroup: { marginBottom: 16 },
  label: { fontSize: 14, color: '#666', marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: '#DDD', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 16, color: '#333',
  },
  saveButton: { marginTop: 8 },

  actionsSection: {
    padding: 16,
    backgroundColor: '#fff',
    marginBottom: 16,
  },
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  iconBox: {
    width: 44, height: 44, borderRadius: 10,
    justifyContent: 'center', alignItems: 'center',
    marginRight: 16,
  },
  actionContent: { flex: 1 },
  actionTitle: { fontSize: 16, fontWeight: '600', color: '#333' },
  actionSubtitle: { fontSize: 13, color: '#888', marginTop: 2 },

  deleteSection: {
    padding: 16,
    backgroundColor: '#FFF8F8',
    borderTopWidth: 1,
    borderTopColor: '#FFE0E0',
    borderBottomWidth: 1,
    borderBottomColor: '#FFE0E0',
    marginBottom: 16,
  },
  deleteButton: {
    marginTop: 0,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#333',
    marginBottom: 12,
  },
  changeSedeContainer: {
    gap: 10,
    marginBottom: 8,
  },
  changeChipsRow: {
    gap: 8,
  },
  changeChip: {
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 10,
    backgroundColor: '#FFF',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  changeChipActive: {
    borderColor: '#F9A825',
    backgroundColor: '#FFF9E8',
  },
  changeChipDisabled: {
    backgroundColor: '#F4F4F4',
    borderColor: '#ECECEC',
  },
  changeChipLabel: {
    fontSize: 12,
    color: '#777',
    marginBottom: 2,
  },
  changeChipValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#222',
  },
  changeChipPlaceholder: {
    color: '#A0A0A0',
    fontWeight: '400',
  },
  changeHelpText: {
    fontSize: 12,
    color: '#666',
  },
  sedeListContainer: {
    maxHeight: 220,
    borderWidth: 1,
    borderColor: '#EEEEEE',
    borderRadius: 10,
    backgroundColor: '#FFF',
  },
  changeSedeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F3F3',
  },
  changeSedeItemDisabled: {
    opacity: 0.55,
  },
  changeSedeName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#222',
  },
  changeSedeMeta: {
    marginTop: 2,
    fontSize: 12,
    color: '#777',
  },
  changeSedeBadgeDisabled: {
    fontSize: 11,
    color: '#C62828',
    fontWeight: '700',
  },
  modalButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  modalButton: {
    flex: 1,
  },
  blockButton: {
    backgroundColor: '#D32F2F',
  },
  changeButton: {
    backgroundColor: '#F9A825',
  },
  adminActionButtonsSection: {
    marginTop: 10,
    gap: 10,
  },
  viewScheduleButton: {
    backgroundColor: '#1E88E5',
  },
  changeSedeButton: {
    backgroundColor: '#F9A825',
  },
  blockSedeButton: {
    backgroundColor: '#D32F2F',
  },
});