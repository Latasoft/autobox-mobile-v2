import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  TextInput,
  Image,
  Platform,
  Modal,
  KeyboardAvoidingView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import apiService from '../../services/apiService';
import uploadService from '../../services/uploadService';
import { Screen } from '../../components/ui/Screen';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { useFocusEffect } from '@react-navigation/native';
import { Inspection } from '../../types';
import { INSPECTION_SECTIONS } from '../../constants/InspectionForm';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { getImageUrl } from '../../utils/imageUtils';

export default function InspectionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [textAnswers, setTextAnswers] = useState<Record<string, string>>({});
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [cancellationReason, setCancellationReason] = useState('');

  const toggleSection = (sectionId: string) => {
    setActiveSection(activeSection === sectionId ? null : sectionId);
  };

  const handleAnswer = (questionId: string, value: string) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }));
  };

  const handleTextAnswer = (questionId: string, text: string) => {
    setTextAnswers(prev => ({ ...prev, [questionId]: text }));
  };

  const handleMediaUrl = (questionId: string, url: string) => {
    setMediaUrls(prev => ({ ...prev, [questionId]: url }));
  };

  const handleUploadImage = async (questionId: string) => {
    try {
      const result = await uploadService.pickMultipleImages(1);
      if (result.length > 0) {
        const image = result[0];
        setUploading(true);
        
        const fileName = image.fileName || `image_${Date.now()}.jpg`;
        // Simple mime type detection or default
        const fileType = image.uri.endsWith('.png') ? 'image/png' : 'image/jpeg';
        
        const uploaded = await uploadService.uploadFile(
            image.uri, 
            fileName, 
            fileType, 
            'inspections'
        );
        
        handleMediaUrl(questionId, uploaded.publicUrl);
        Alert.alert('Éxito', 'Imagen subida correctamente');
      }
    } catch (error: any) {
      console.error('Upload error:', error);
      Alert.alert('Error', 'No se pudo subir la imagen: ' + (error.message || 'Error desconocido'));
    } finally {
      setUploading(false);
    }
  };

  const handleRejectInspection = async () => {
    if (!cancellationReason.trim()) {
      Alert.alert('Error', 'Por favor ingrese un motivo para la cancelación');
      return;
    }

    try {
      setLoading(true);
      setShowRejectModal(false);
      
      // Use the new cancel endpoint which handles notifications and status update
      await apiService.patch(`/inspections/${id}/cancel`, {
        reason: cancellationReason
      });

      Alert.alert('Éxito', 'La inspección ha sido cancelada.');
      loadInspection();
    } catch (error: any) {
      console.error('Error rejecting inspection:', error);
      Alert.alert('Error', 'No se pudo cancelar la inspección');
    } finally {
      setLoading(false);
      setCancellationReason('');
    }
  };

  const loadInspection = async () => {
    try {
      setLoading(true);
      const data = await apiService.get(`/inspections/${id}`);
      setInspection(data);
      
      // Load existing answers if any (mock logic for now)
      // setAnswers(data.answers || {});
    } catch (error: any) {
      console.error('Error loading inspection:', error);
      Alert.alert('Error', error.message || 'No se pudo cargar la inspección');
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      if (id) {
        loadInspection();
      }
    }, [id])
  );

  const handleStartInspection = async () => {
    try {
      await apiService.post(`/inspections/${id}/start`);
      Alert.alert('Éxito', 'Inspección iniciada');
      loadInspection();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'No se pudo iniciar la inspección');
    }
  };

  const handleCompleteInspection = async () => {
    try {
      // Validate answers
      // if (Object.keys(answers).length < TOTAL_QUESTIONS) ...

      await apiService.post(`/inspections/${id}/complete`, {
        answers,
        textAnswers,
        mediaUrls
      });
      Alert.alert('Éxito', 'Inspección completada');
      router.back();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'No se pudo completar la inspección');
    }
  };

  const handleUploadReport = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      setUploading(true);
      const file = result.assets[0];
      
      // Upload logic
      // const url = await uploadService.uploadInspectionReport(file, id, token);
      // await apiService.post(`/inspections/${id}/report`, { url });
      
      Alert.alert('Éxito', 'Informe subido correctamente');
      loadInspection();
    } catch (error: any) {
      console.error('Error uploading report:', error);
      Alert.alert('Error', 'No se pudo subir el informe');
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <Screen style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FF9800" />
      </Screen>
    );
  }

  if (!inspection) {
    return (
      <Screen style={styles.errorContainer}>
        <Text>No se encontró la inspección</Text>
      </Screen>
    );
  }

  const vehicle = inspection.vehiculo || inspection.publicacion?.vehiculo;
  const address = inspection.horario?.sede?.nombre || 'Dirección no disponible';
  const date = inspection.fechaProgramada ? new Date(inspection.fechaProgramada).toLocaleString('es-CL') : 'Fecha no disponible';

  return (
    <Screen style={styles.container}>
      <KeyboardAwareScrollView
         contentContainerStyle={styles.content} // Mantenemos tu estilo original
         enableOnAndroid={true}
         extraScrollHeight={100} // Damos buen espacio extra porque hay muchos inputs
         keyboardShouldPersistTaps="handled" // IMPORTANTE: Para que los botones (radio buttons) funcionen al primer toque aunque el teclado esté abierto
      >
        <Card style={styles.headerCard}>
          <Text style={styles.title}>
            {vehicle?.marca} {vehicle?.modelo}
          </Text>
          <Text style={styles.subtitle}>{vehicle?.patente}</Text>
          <View style={styles.statusRow}>
            <Text style={styles.label}>Estado:</Text>
            <Text style={styles.value}>{inspection.estado_insp}</Text>
          </View>
          <View style={styles.statusRow}>
            <Text style={styles.label}>Fecha:</Text>
            <Text style={styles.value}>{date}</Text>
          </View>
          <View style={styles.statusRow}>
            <Text style={styles.label}>Dirección:</Text>
            <Text style={styles.value}>{address}</Text>
          </View>
        </Card>

        {inspection.estado_insp === 'Confirmada' && (
          <View>
            <Button
              title="Iniciar Inspección"
              onPress={handleStartInspection}
              style={styles.actionButton}
            />
            <Button
              title="Cancelar Inspección"
              onPress={() => setShowRejectModal(true)}
              variant="outline"
              style={[styles.actionButton, { borderColor: '#F44336' }]}
              textStyle={{ color: '#F44336' }}
            />
          </View>
        )}

        {inspection.estado_insp === 'En_sucursal' && (
          <View style={styles.checklistContainer}>
            <Text style={styles.sectionHeader}>Checklist de Inspección</Text>
            
            {INSPECTION_SECTIONS.map((section) => (
              <View key={section.id} style={styles.sectionContainer}>
                <TouchableOpacity 
                  style={styles.sectionTitleRow} 
                  onPress={() => toggleSection(section.id)}
                >
                  <View style={styles.sectionTitleLeft}>
                    <Ionicons name={section.icon as any} size={24} color="#4CAF50" />
                    <Text style={styles.sectionTitleText}>{section.title}</Text>
                  </View>
                  <Ionicons 
                    name={activeSection === section.id ? "chevron-up" : "chevron-down"} 
                    size={24} 
                    color="#666" 
                  />
                </TouchableOpacity>

                {activeSection === section.id && (
                  <View style={styles.sectionContent}>
                    {section.questions.map((question) => (
                      <View key={question.id} style={styles.questionContainer}>
                        <Text style={styles.questionText}>{question.text}</Text>
                        <View style={styles.optionsContainer}>
                          {question.options.map((option) => (
                            <TouchableOpacity
                              key={option.value}
                              style={[
                                styles.optionButton,
                                answers[question.id] === option.value && styles.optionButtonSelected
                              ]}
                              onPress={() => handleAnswer(question.id, option.value)}
                            >
                              <View style={[
                                styles.radioButton,
                                answers[question.id] === option.value && styles.radioButtonSelected
                              ]} />
                              <Text style={[
                                styles.optionText,
                                answers[question.id] === option.value && styles.optionTextSelected
                              ]}>
                                {option.label}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                        
                        <View style={styles.extraInputsContainer}>
                          <Text style={styles.inputLabel}>Observación:</Text>
                          <TextInput
                            style={styles.smallInput}
                            placeholder="Escribe aquí..."
                            value={textAnswers[question.id] || ''}
                            onChangeText={(text) => handleTextAnswer(question.id, text)}
                          />
                          <View style={styles.mediaRow}>
                            {mediaUrls[question.id] ? (
                              <View style={styles.previewContainer}>
                                <Image 
                                  source={{ uri: getImageUrl(mediaUrls[question.id]) }} 
                                  style={styles.miniPreview} 
                                />
                                <TouchableOpacity 
                                  style={styles.removeButton}
                                  onPress={() => handleMediaUrl(question.id, '')}
                                >
                                  <Ionicons name="close" size={12} color="#FFF" />
                                </TouchableOpacity>
                              </View>
                            ) : (
                              <TouchableOpacity 
                                style={styles.uploadButton}
                                onPress={() => handleUploadImage(question.id)}
                                disabled={uploading}
                              >
                                {uploading ? (
                                  <ActivityIndicator size="small" color="#FFF" />
                                ) : (
                                  <Ionicons name="camera-outline" size={20} color="#FFF" />
                                )}
                              </TouchableOpacity>
                            )}
                          </View>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            ))}
            
            <Button
              title="Subir Informe PDF"
              onPress={handleUploadReport}
              variant="secondary"
              loading={uploading}
              style={styles.actionButton}
              icon={<Ionicons name="document-text-outline" size={20} color="#FFF" />}
            />

            <Button
              title="Finalizar Inspección"
              onPress={handleCompleteInspection}
              style={styles.actionButton}
            />
            
            <Button
              title="Rechazar Inspección"
              onPress={() => setShowRejectModal(true)}
              variant="outline"
              style={[styles.actionButton, { borderColor: '#F44336', marginTop: 20 }]}
              textStyle={{ color: '#F44336' }}
            />
          </View>
        )}

        {inspection.estado_insp === 'Postergada' && (
          <Card style={[styles.completedCard, { borderColor: '#FF9800', borderWidth: 1 }]}>
            <Ionicons name="time-outline" size={48} color="#FF9800" />
            <Text style={[styles.completedText, { color: '#FF9800' }]}>Inspección Postergada</Text>
            <Text style={{ textAlign: 'center', marginBottom: 8, fontWeight: 'bold' }}>
              Motivo: {
                inspection.cancellationReason === 'cancelado_admin' ? 'Cancelado por Admin' :
                inspection.cancellationReason === 'cancelado_dueno' ? 'Cancelado por Dueño' :
                inspection.cancellationReason === 'cancelado_vend' ? 'Cancelado por Solicitante' :
                inspection.cancellationReason === 'cancelado_mec' ? 'Cancelado por Mecánico' :
                inspection.cancellationReason || 'No especificado'
              }
            </Text>
            <Text style={{ textAlign: 'center', color: '#666' }}>
              {inspection.observacion}
            </Text>
          </Card>
        )}

        {inspection.estado_insp === 'Finalizada' && (
          <Card style={styles.completedCard}>
            <Ionicons name="checkmark-circle" size={48} color="#4CAF50" />
            <Text style={styles.completedText}>Inspección Completada</Text>
            <Button
              title="Ver Resultados del Cuestionario"
              onPress={() => router.push({
                pathname: '/user-inspection-detail',
                params: { id: id }
              })}
              style={styles.viewResultsButton}
            />
          </Card>
        )}
      </KeyboardAwareScrollView>

      <Modal
        visible={showRejectModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowRejectModal(false)}
      >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Cancelar Inspección</Text>
            <Text style={styles.modalSubtitle}>Por favor indique el motivo de la cancelación:</Text>
            
            <TextInput
              style={styles.commentInput}
              placeholder="Escriba el motivo aquí..."
              value={cancellationReason}
              onChangeText={setCancellationReason}
              multiline
              numberOfLines={4}
            />

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
              <Button
                title="Volver"
                onPress={() => {
                  setShowRejectModal(false);
                  setCancellationReason('');
                }}
                variant="secondary"
                style={{ flex: 1 }}
              />
              <Button
                title="Confirmar"
                onPress={handleRejectInspection}
                style={{ flex: 1, backgroundColor: '#F44336' }}
              />
            </View>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    padding: 16,
  },
  headerCard: {
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 12,
  },
  statusRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  label: {
    fontWeight: '600',
    color: '#555',
    width: 80,
  },
  value: {
    color: '#333',
    flex: 1,
  },
  actionButton: {
    marginVertical: 8,
  },
  checklistContainer: {
    marginTop: 16,
  },
  sectionHeader: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#333',
  },
  placeholderText: {
    fontStyle: 'italic',
    color: '#999',
    textAlign: 'center',
    marginVertical: 20,
  },
  completedCard: {
    alignItems: 'center',
    padding: 24,
  },
  completedText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#4CAF50',
    marginTop: 12,
    marginBottom: 16,
  },
  viewResultsButton: {
    marginTop: 16,
    width: '100%',
  },
  sectionContainer: {
    backgroundColor: '#FFF',
    borderRadius: 8,
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  sectionTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFF',
  },
  sectionTitleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  sectionTitleText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginLeft: 12,
    flex: 1,
  },
  sectionContent: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    backgroundColor: '#FAFAFA',
  },
  questionContainer: {
    marginBottom: 20,
  },
  questionText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  optionsContainer: {
    gap: 8,
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    backgroundColor: '#FFF',
  },
  optionButtonSelected: {
    borderColor: '#4CAF50',
    backgroundColor: '#E8F5E9',
  },
  radioButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#999',
    marginRight: 12,
  },
  radioButtonSelected: {
    borderColor: '#4CAF50',
    backgroundColor: '#4CAF50',
  },
  optionText: {
    fontSize: 14,
    color: '#666',
    flex: 1,
  },
  optionTextSelected: {
    color: '#2E7D32',
    fontWeight: '500',
  },
  commentInput: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    padding: 12,
    minHeight: 100,
    fontSize: 14,
    color: '#333',
  },
  extraInputsContainer: {
    marginTop: 12,
    gap: 8,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#666',
    marginBottom: -4,
  },
  smallInput: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 6,
    padding: 8,
    fontSize: 13,
    color: '#333',
  },
  videoInputContainer: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  mediaRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginTop: 4,
  },
  previewContainer: {
    width: 60,
    height: 60,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  miniPreview: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  removeButton: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 10,
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadButton: {
    backgroundColor: '#2196F3',
    padding: 8,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    width: 40,
    height: 40,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 20,
    width: '100%',
    maxWidth: 400,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 20,
    textAlign: 'center',
  },
  modalOption: {
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
  },
  modalOptionText: {
    fontSize: 16,
    color: '#333',
    textAlign: 'center',
  },
});
