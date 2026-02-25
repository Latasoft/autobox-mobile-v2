import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Image,
  Alert,
  Modal,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import apiService from '../services/apiService';
import authService from '../services/authService';
import { getImageUrl } from '../utils/imageUtils';
import { Inspection, UserRole } from '../types';

interface InspectionWithStatus extends Omit<Inspection, 'estado_insp'> {
  estado_insp?: 'Pendiente' | 'Confirmada' | 'En_sucursal' | 'Postergada' | 'Cancelada' | 'Rechazada' | 'Finalizada';
  cancellationReason?: string;
  observacion?: string;
}
import { Screen } from '../components/ui/Screen';

interface Theme {
  primary: string;
  background: string;
  secondary: string;
  text: string;
  light: string;
}

const THEMES: Record<string, Theme> = {
  [UserRole.ADMIN]: {
    primary: '#2196F3', // Blue
    background: '#F5F5F5',
    secondary: '#1976D2',
    text: '#0D47A1',
    light: '#E3F2FD',
  },
  [UserRole.MECHANIC]: {
    primary: '#FF9800', // Orange
    background: '#F5F5F5',
    secondary: '#F57C00',
    text: '#E65100',
    light: '#FFF3E0',
  },
  [UserRole.USER]: {
    primary: '#4CAF50', // Green
    background: '#F5F5F5',
    secondary: '#388E3C',
    text: '#1B5E20',
    light: '#E8F5E9',
  },
  default: {
    primary: '#4CAF50',
    background: '#F5F5F5',
    secondary: '#388E3C',
    text: '#1B5E20',
    light: '#E8F5E9',
  }
};

interface AnswerOption {
  id: number;
  respuestaTexto: string;
  calificacion: number;
  color?: string;
}

interface Question {
  id: number;
  pregunta: string;
  tipo: 'seleccion_unica' | 'texto' | 'foto' | 'multiple';
  answers: AnswerOption[];
}

interface Subsection {
  id: number;
  nombre: string;
  questions: Question[];
}

interface Section {
  id: number;
  nombre: string;
  subsections: Subsection[];
}

interface InspectionAnswer {
  id: string;
  preguntaId: number;
  respuestaOpcionId?: number;
  respuestaTextoManual?: string;
  imagen_url?: string;
  pregunta: Question;
  respuestaOpcion?: AnswerOption;
}

interface ExtendedInspection extends InspectionWithStatus {
  inspectionAnswers: InspectionAnswer[];
  score?: number;
  maxScore?: number;
  createdAt: Date;
}

export default function UserInspectionDetailScreen() {
  const params = useLocalSearchParams();
  const inspectionId = params.id || params.inspectionId;
  const [inspection, setInspection] = useState<ExtendedInspection | null>(null);
  const [formStructure, setFormStructure] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<number | null>(null);
  const [theme, setTheme] = useState<Theme>(THEMES.default);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [submittingRating, setSubmittingRating] = useState(false);

  useEffect(() => {
    loadUserAndTheme();
    loadData();
  }, [inspectionId]);

  const loadUserAndTheme = async () => {
    try {
      const user = await authService.getUser();
      setCurrentUser(user);
      if (user && user.rol && THEMES[user.rol]) {
        setTheme(THEMES[user.rol]);
      }
    } catch (error) {
      console.log('Error loading user theme:', error);
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const [inspectionData, formData] = await Promise.all([
        apiService.get(`/inspections/${inspectionId}`),
        apiService.get('/inspections/form/structure'),
      ]);

      setInspection(inspectionData);
      setFormStructure(formData);
      if (formData.length > 0) {
        setActiveSection(formData[0].id);
      }
    } catch (error) {
      console.error('Error loading inspection details:', error);
      Alert.alert('Error', 'No se pudieron cargar los detalles de la inspección');
    } finally {
      setLoading(false);
    }
  };

  const getAnswerForQuestion = (questionId: number) => {
    if (!inspection?.inspectionAnswers) return null;
    return inspection.inspectionAnswers.find(a => a.preguntaId === questionId);
  };

  const renderAnswer = (question: Question, answer: InspectionAnswer | null | undefined) => {
    if (!answer) {
      return <Text style={styles.noAnswerText}>Sin respuesta</Text>;
    }

    // Prioritize displaying the selected option if available
    if (answer.respuestaOpcion) {
      return (
        <View style={styles.answerContainer}>
          <View style={[
            styles.optionBadge, 
            answer.respuestaOpcion?.color ? { backgroundColor: answer.respuestaOpcion.color } : 
            (answer.respuestaOpcion?.respuestaTexto?.includes('Malo') || answer.respuestaOpcion?.respuestaTexto?.includes('Regular')) ? { backgroundColor: '#FF5252' } :
            { backgroundColor: '#4CAF50' }
          ]}>
            <Text style={styles.optionText}>
              {answer.respuestaOpcion?.respuestaTexto || 'Opción seleccionada'}
            </Text>
          </View>
          {answer.respuestaTextoManual && (
            <Text style={styles.commentText}>Nota: {answer.respuestaTextoManual}</Text>
          )}
          {answer.imagen_url && (
            <Image source={{ uri: getImageUrl(answer.imagen_url) }} style={styles.answerImage} />
          )}
        </View>
      );
    }

    // If no option selected but there is an image
    if (answer.imagen_url) {
      return (
        <View>
          <Image source={{ uri: getImageUrl(answer.imagen_url) }} style={styles.answerImage} />
          {answer.respuestaTextoManual && (
            <Text style={styles.commentText}>{answer.respuestaTextoManual}</Text>
          )}
        </View>
      );
    }

    // If only text
    if (answer.respuestaTextoManual) {
      return (
        <Text style={styles.textAnswer}>{answer.respuestaTextoManual}</Text>
      );
    }

    return <Text style={styles.textAnswer}>{JSON.stringify(answer)}</Text>;
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

  const handleCancelInspection = async () => {
    setCanceling(true);
    try {
        await apiService.patch(`/inspections/${inspectionId}/cancel`);
        Alert.alert('Éxito', 'La inspección ha sido cancelada.');
        setShowCancelModal(false);
        loadData(); // Reload to show updated status
    } catch (error) {
        console.error('Error canceling inspection:', error);
        Alert.alert('Error', 'No se pudo cancelar la inspección.');
    } finally {
        setCanceling(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={theme.primary} />
        <Text style={styles.loadingText}>Cargando detalles...</Text>
      </View>
    );
  }

  if (!inspection) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>No se encontró la inspección</Text>
        <TouchableOpacity style={[styles.backButton, { backgroundColor: theme.primary }]} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Volver</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isOwner = currentUser?.id === (inspection?.publicacion as any)?.vendedorId;
  const isSolicitant = currentUser?.id === inspection?.solicitanteId;
  const canCancel = isOwner && inspection?.estado_insp !== 'Rechazada' && inspection?.estado_insp !== 'Finalizada' && inspection?.estado_insp !== 'Cancelada';

  const handleRateMechanic = async (rating: number) => {
    setSubmittingRating(true);
    try {
      await apiService.post(`/inspections/${inspectionId}/rate`, { rating });
      Alert.alert('Éxito', 'Gracias por calificar al mecánico.');
      loadData();
    } catch (error) {
      console.error('Error rating mechanic:', error);
      Alert.alert('Error', 'No se pudo enviar la calificación.');
    } finally {
      setSubmittingRating(false);
    }
  };

  return (
    <Screen backgroundColor={theme.background}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBackButton}>
          <Ionicons name="arrow-back" size={24} color="#1A1A1A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Detalle de Inspección</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content}>
        {/* Cancellation Status Card */}
        {(inspection.estado_insp === 'Postergada' || inspection.estado_insp === 'Rechazada' || inspection.estado_insp === 'Cancelada') && (
          <View style={[styles.card, { borderLeftWidth: 4, borderLeftColor: '#F44336' }]}>
            <View style={styles.cardHeader}>
              <Ionicons name="alert-circle" size={24} color="#F44336" />
              <Text style={[styles.cardTitle, { color: '#D32F2F' }]}>
                Inspección {inspection.estado_insp}
              </Text>
            </View>
            <View style={styles.cardContent}>
              <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 4 }}>
                Motivo: {getCancellationReasonText(inspection.cancellationReason)}
              </Text>
              {inspection.observacion && (
                <Text style={{ fontSize: 14, color: '#666' }}>
                  {inspection.observacion}
                </Text>
              )}
            </View>
          </View>
        )}

        {/* Vehicle Info Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="car-sport" size={24} color={theme.primary} />
            <Text style={styles.cardTitle}>Vehículo</Text>
          </View>
          <View style={styles.cardContent}>
            <Text style={styles.vehicleTitle}>
              {(inspection.vehiculo || inspection.publicacion?.vehiculo)?.marca} {(inspection.vehiculo || inspection.publicacion?.vehiculo)?.modelo} {(inspection.vehiculo || inspection.publicacion?.vehiculo)?.anio}
            </Text>
            <Text style={styles.vehicleSubtitle}>Patente: {(inspection.vehiculo || inspection.publicacion?.vehiculo)?.patente || 'Sin patente'}</Text>
            
            <View style={styles.infoRow}>
              <Ionicons name="calendar-outline" size={16} color="#666" />
              <Text style={styles.infoText}>
                {inspection.fechaCompletada 
                  ? `Realizada: ${new Date(inspection.fechaCompletada).toLocaleString()}`
                  : `Programada: ${new Date(inspection.fechaProgramada || inspection.fechaCreacion).toLocaleDateString()}`
                }
              </Text>
            </View>
            
            {inspection.mecanico && (
              <>
                <View style={styles.infoRow}>
                  <Ionicons name="person-outline" size={16} color="#666" />
                  <Text style={styles.infoText}>
                    Mecánico: {inspection.mecanico.primerNombre} {inspection.mecanico.primerApellido}
                  </Text>
                </View>
                {inspection.mecanico.averageRating !== undefined && (
                  <View style={styles.mechanicRatingRow}>
                    <View style={styles.mechanicRatingStars}>
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Ionicons
                          key={star}
                          name={inspection.mecanico!.averageRating! >= star ? 'star' : 'star-outline'}
                          size={14}
                          color="#FFC107"
                        />
                      ))}
                    </View>
                    <Text style={styles.mechanicRatingValue}>
                      {Number(inspection.mecanico.averageRating).toFixed(1)}
                    </Text>
                    <Text style={styles.mechanicRatingLabel}> calificación del mecánico</Text>
                  </View>
                )}
              </>
            )}

            {/* Score Display */}
            {inspection.score !== undefined && inspection.maxScore !== undefined && inspection.maxScore > 0 && (() => {
              const percentage = Math.round((inspection.score / inspection.maxScore) * 100);
              let scoreColor = '#4CAF50'; // Green
              let scoreBg = '#E8F5E9';
              
              if (percentage < 50) {
                scoreColor = '#F44336'; // Red
                scoreBg = '#FFEBEE';
              } else if (percentage < 80) {
                scoreColor = '#FF9800'; // Orange
                scoreBg = '#FFF3E0';
              }

              return (
                <View style={styles.scoreContainer}>
                  <View style={styles.scoreHeader}>
                    <Text style={styles.scoreLabel}>Puntuación General</Text>
                    <View style={[styles.scoreBadge, { backgroundColor: scoreBg }]}>
                      <Text style={[styles.scoreBadgeText, { color: scoreColor }]}>
                        {inspection.score}/{inspection.maxScore} pts
                      </Text>
                    </View>
                  </View>
                  
                  <View style={styles.scoreMainDisplay}>
                    <Text style={[styles.scorePercentage, { color: scoreColor }]}>
                      {percentage}%
                    </Text>
                  </View>

                  <View style={styles.progressBarBackground}>
                    <View style={[
                      styles.progressBarFill, 
                      { 
                        width: `${percentage}%`,
                        backgroundColor: scoreColor 
                      }
                    ]} />
                  </View>
                </View>
              );
            })()}
          </View>
        </View>

        {/* Mechanic Rating Section */}
        {inspection.estado_insp === 'Finalizada' && isSolicitant && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="star" size={24} color="#FFC107" />
              <Text style={styles.cardTitle}>Calificar Mecánico</Text>
            </View>
            <View style={styles.cardContent}>
              <Text style={{ marginBottom: 12, color: '#666' }}>
                {inspection.rating 
                  ? 'Has calificado a este mecánico:' 
                  : 'Por favor califica el servicio del mecánico:'}
              </Text>
              <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <TouchableOpacity
                    key={star}
                    disabled={!!inspection.rating || submittingRating}
                    onPress={() => handleRateMechanic(star)}
                  >
                    <Ionicons 
                      name={(inspection.rating || 0) >= star ? "star" : "star-outline"} 
                      size={32} 
                      color="#FFC107" 
                    />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        )}

        {/* Questionnaire */}
        <Text style={styles.sectionHeader}>Resultados de la Inspección</Text>
        
        {formStructure.map((section) => (
          <View key={section.id} style={styles.sectionContainer}>
            <TouchableOpacity 
              style={styles.sectionTitleRow}
              onPress={() => setActiveSection(activeSection === section.id ? null : section.id)}
            >
              <Text style={styles.sectionTitle}>{section.nombre}</Text>
              <Ionicons 
                name={activeSection === section.id ? "chevron-up" : "chevron-down"} 
                size={24} 
                color="#666" 
              />
            </TouchableOpacity>
            
            {activeSection === section.id && (
              <View style={styles.sectionContent}>
                {section.subsections?.map((subsection) => (
                  <View key={subsection.id} style={styles.subsectionContainer}>
                    <Text style={[styles.subsectionTitle, { color: theme.secondary }]}>{subsection.nombre}</Text>
                    
                    {subsection.questions?.map((question) => {
                      const answer = getAnswerForQuestion(question.id);
                      return (
                        <View key={question.id} style={styles.questionContainer}>
                          <Text style={styles.questionText}>{question.pregunta}</Text>
                          {renderAnswer(question, answer)}
                        </View>
                      );
                    })}
                  </View>
                ))}
              </View>
            )}
          </View>
        ))}
        
        <View style={{ height: 40 }} />
        
        {canCancel && (
          <TouchableOpacity 
            style={styles.cancelButton} 
            onPress={() => setShowCancelModal(true)}
          >
            <Text style={styles.cancelButtonText}>Cancelar Inspección</Text>
          </TouchableOpacity>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>

      <Modal
        visible={showCancelModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowCancelModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Cancelar Inspección</Text>
            <Text style={styles.modalText}>
              ¿Estás seguro que deseas cancelar esta inspección? Esta acción no se puede deshacer.
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={[styles.modalButton, styles.modalButtonCancel]} 
                onPress={() => setShowCancelModal(false)}
              >
                <Text style={styles.modalButtonTextCancel}>Volver</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalButton, styles.modalButtonConfirm]} 
                onPress={handleCancelInspection}
                disabled={canceling}
              >
                {canceling ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <Text style={styles.modalButtonTextConfirm}>Sí, cancelar</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F0F2F5',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    color: '#666',
  },
  errorText: {
    fontSize: 18,
    color: '#666',
    marginBottom: 20,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerBackButton: {
    padding: 8,
    marginLeft: -8,
    backgroundColor: 'transparent',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A1A1A',
    textAlign: 'center',
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 8,
    color: '#333',
  },
  cardContent: {
    paddingLeft: 8,
  },
  vehicleTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  vehicleSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  infoText: {
    marginLeft: 8,
    color: '#666',
    fontSize: 14,
  },
  scoreContainer: {
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  scoreHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  scoreLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  scoreBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  scoreBadgeText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  scoreMainDisplay: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 12,
    gap: 12,
  },
  scorePercentage: {
    fontSize: 48,
    fontWeight: 'bold',
    lineHeight: 56,
  },
  scoreConditionText: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  progressBarBackground: {
    height: 12,
    backgroundColor: '#F0F0F0',
    borderRadius: 6,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 6,
  },
  sectionHeader: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
    marginLeft: 4,
  },
  sectionContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
    elevation: 1,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFFFFF',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  sectionContent: {
    padding: 16,
    paddingTop: 0,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  subsectionContainer: {
    marginTop: 16,
  },
  subsectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#66BB6A',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  questionContainer: {
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  questionText: {
    fontSize: 15,
    color: '#333',
    marginBottom: 8,
    lineHeight: 22,
  },
  answerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  optionBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
  },
  optionText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  commentText: {
    fontSize: 13,
    color: '#666',
    fontStyle: 'italic',
    marginTop: 4,
  },
  textAnswer: {
    fontSize: 14,
    color: '#333',
    backgroundColor: '#F5F5F5',
    padding: 10,
    borderRadius: 8,
  },
  noAnswerText: {
    fontSize: 13,
    color: '#999',
    fontStyle: 'italic',
  },
  mechanicRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    marginLeft: 24,
  },
  mechanicRatingStars: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 4,
  },
  mechanicRatingValue: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#FFA000',
    marginRight: 2,
  },
  mechanicRatingLabel: {
    fontSize: 12,
    color: '#888',
  },
  answerImage: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    marginTop: 8,
  },
  backButton: {
    marginTop: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#66BB6A',
    borderRadius: 8,
  },
  backButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  cancelButton: {
    backgroundColor: '#FFEBEE',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 20,
    borderWidth: 1,
    borderColor: '#FFCDD2',
  },
  cancelButtonText: {
    color: '#D32F2F',
    fontWeight: 'bold',
    fontSize: 16,
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
    padding: 24,
    width: '100%',
    maxWidth: 400,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
    textAlign: 'center',
  },
  modalText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 24,
    textAlign: 'center',
    lineHeight: 24,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalButtonCancel: {
    backgroundColor: '#F5F5F5',
  },
  modalButtonConfirm: {
    backgroundColor: '#D32F2F',
  },
  modalButtonTextCancel: {
    color: '#666',
    fontWeight: 'bold',
    fontSize: 16,
  },
  modalButtonTextConfirm: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 16,
  },
});