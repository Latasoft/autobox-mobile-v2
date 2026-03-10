import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
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
import { downloadInspectionPdf } from '../../services/pdfService';

const NOT_EXAMINED_TEXT = 'Aspecto no examinado';

export default function InspectionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [activeSectionIndex, setActiveSectionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [textAnswers, setTextAnswers] = useState<Record<string, string>>({});
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
  const [reportUrl, setReportUrl] = useState('');
  const [reportName, setReportName] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [cancellationReason, setCancellationReason] = useState('');

  const handleAnswer = (questionId: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const handleTextAnswer = (questionId: string, text: string) => {
    setTextAnswers((prev) => ({ ...prev, [questionId]: text }));
  };

  const handleMediaUrl = (questionId: string, url: string) => {
    setMediaUrls((prev) => ({ ...prev, [questionId]: url }));
  };

  const getQuestionCompletion = (questionId: string) => {
    const hasAnswer = Boolean(answers[questionId]);
    const hasComment = Boolean(textAnswers[questionId]?.trim());
    const hasPhoto = Boolean(mediaUrls[questionId]);
    const isComplete = hasAnswer && hasComment && hasPhoto;

    return {
      hasAnswer,
      hasComment,
      hasPhoto,
      isComplete,
      completedFields: Number(hasAnswer) + Number(hasComment) + Number(hasPhoto),
      totalFields: 3,
    };
  };

  const getSectionProgress = (sectionIndex: number) => {
    const section = INSPECTION_SECTIONS[sectionIndex];
    const completedQuestions = section.questions.filter((question) => getQuestionCompletion(question.id).isComplete).length;
    return {
      completedQuestions,
      totalQuestions: section.questions.length,
      isComplete: completedQuestions === section.questions.length,
    };
  };

  const getSectionIsComplete = (sectionIndex: number) => {
    const section = INSPECTION_SECTIONS[sectionIndex];
    return section.questions.every((question) => {
      const hasAnswer = Boolean(answers[question.id]);
      const hasComment = Boolean(textAnswers[question.id]?.trim());
      const hasPhoto = Boolean(mediaUrls[question.id]);
      return hasAnswer && hasComment && hasPhoto;
    });
  };

  const getSectionIsCompleteFromData = (
    sectionIndex: number,
    answerMap: Record<string, string>,
    commentMap: Record<string, string>,
    mediaMap: Record<string, string>
  ) => {
    const section = INSPECTION_SECTIONS[sectionIndex];
    return section.questions.every((question) => {
      const hasAnswer = Boolean(answerMap[question.id]);
      const hasComment = Boolean(commentMap[question.id]?.trim());
      const hasPhoto = Boolean(mediaMap[question.id]);
      return hasAnswer && hasComment && hasPhoto;
    });
  };

  const getFirstIncompleteSectionIndex = () => {
    const incompleteIndex = INSPECTION_SECTIONS.findIndex((_, index) => !getSectionIsComplete(index));
    return incompleteIndex >= 0 ? incompleteIndex : INSPECTION_SECTIONS.length;
  };

  const handleGoToSection = (sectionIndex: number) => {
    const firstIncomplete = getFirstIncompleteSectionIndex();
    if (sectionIndex > firstIncomplete) {
      Alert.alert('Paso bloqueado', 'No se puede avanzar hasta completar el paso actual.');
      return;
    }
    setActiveSectionIndex(sectionIndex);
  };

  const handleContinueSection = (sectionIndex: number) => {
    if (!getSectionIsComplete(sectionIndex)) {
      Alert.alert('Faltan campos', 'Debes completar todos los campos del paso actual para continuar.');
      return;
    }

    const nextIndex = sectionIndex + 1;
    if (nextIndex < INSPECTION_SECTIONS.length) {
      setActiveSectionIndex(nextIndex);
      return;
    }

    Alert.alert('Checklist completo', 'Todos los pasos fueron completados. Ahora adjunta el PDF y finaliza la inspeccion.');
  };

  const handleUploadImage = async (questionId: string) => {
    try {
      const image = await uploadService.pickImage(true);
      if (!image) return;

      setUploading(true);
      const fileName = image.fileName || `inspection_${id}_${questionId}_${Date.now()}.jpg`;
      const fileType = image.uri.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';

      const uploaded = await uploadService.uploadFile(image.uri, fileName, fileType, 'inspections');
      handleMediaUrl(questionId, uploaded.publicUrl);
      Alert.alert('Exito', 'Foto subida correctamente');
    } catch (error: any) {
      console.error('Upload error:', error);
      Alert.alert('Error', 'No se pudo subir la foto: ' + (error.message || 'Error desconocido'));
    } finally {
      setUploading(false);
    }
  };

  const handleRejectInspection = async () => {
    if (!cancellationReason.trim()) {
      Alert.alert('Error', 'Por favor ingrese un motivo para la cancelacion');
      return;
    }

    try {
      setLoading(true);
      setShowRejectModal(false);
      await apiService.patch(`/inspections/${id}/cancel`, { reason: cancellationReason });
      Alert.alert('Exito', 'La inspeccion ha sido cancelada.');
      loadInspection();
    } catch (error: any) {
      console.error('Error rejecting inspection:', error);
      Alert.alert('Error', 'No se pudo cancelar la inspeccion');
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

      const nextAnswers = { ...(data?.answers || {}) };
      const nextTextAnswers = {
        ...(data?.comments || {}),
        ...(data?.textAnswers || {}),
      };
      const nextMediaUrls = { ...(data?.mediaUrls || {}) };

      const inspectionAnswers = Array.isArray(data?.inspectionAnswers) ? data.inspectionAnswers : [];
      inspectionAnswers.forEach((entry: any) => {
        const questionId = String(entry?.pregunta?.codigo || entry?.preguntaId || entry?.pregunta?.id || '');
        if (!/^\d+\.\d+$/.test(questionId)) return;

        if (!nextTextAnswers[questionId] && entry?.respuestaTextoManual) {
          nextTextAnswers[questionId] = entry.respuestaTextoManual;
        }
        if (!nextMediaUrls[questionId] && entry?.imagen_url) {
          nextMediaUrls[questionId] = entry.imagen_url;
        }
      });

      setAnswers(nextAnswers);
      setTextAnswers(nextTextAnswers);
      setMediaUrls(nextMediaUrls);

      const resolvedReportUrl =
        data?.reportUrl ||
        data?.report_url ||
        data?.inspectionPdfUrl ||
        data?.pdf_url ||
        data?.report?.url ||
        data?.informeUrl ||
        '';
      setReportUrl(resolvedReportUrl);
      setReportName(resolvedReportUrl ? resolvedReportUrl.split('/').pop() || 'informe.pdf' : '');

      const firstIncomplete = INSPECTION_SECTIONS.findIndex(
        (_, index) => !getSectionIsCompleteFromData(index, nextAnswers, nextTextAnswers, nextMediaUrls)
      );
      setActiveSectionIndex(firstIncomplete >= 0 ? firstIncomplete : INSPECTION_SECTIONS.length - 1);
    } catch (error: any) {
      console.error('Error loading inspection:', error);
      Alert.alert('Error', error.message || 'No se pudo cargar la inspeccion');
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
      Alert.alert('Exito', 'Inspeccion iniciada');
      loadInspection();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'No se pudo iniciar la inspeccion');
    }
  };

  const handleCompleteInspection = async () => {
    const firstIncomplete = getFirstIncompleteSectionIndex();
    if (firstIncomplete < INSPECTION_SECTIONS.length) {
      setActiveSectionIndex(firstIncomplete);
      Alert.alert('Faltan campos', `Debes completar el paso ${firstIncomplete + 1} para finalizar.`);
      return;
    }

    if (!reportUrl) {
      Alert.alert('Falta PDF', 'Debes adjuntar el PDF final antes de finalizar la inspeccion.');
      return;
    }

    try {
      await apiService.post(`/inspections/${id}/complete`, {
        answers,
        textAnswers,
        comments: textAnswers,
        mediaUrls,
        reportUrl,
        inspectionPdfUrl: reportUrl,
      });
      Alert.alert('Exito', 'Inspeccion completada');
      router.back();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'No se pudo completar la inspeccion');
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
      const uploadedReportUrl = await uploadService.uploadInspectionReport(
        {
          uri: file.uri,
          name: file.name || `inspection_${id}_${Date.now()}.pdf`,
          mimeType: file.mimeType || 'application/pdf',
        },
        String(id),
        ''
      );

      setReportUrl(uploadedReportUrl);
      setReportName(file.name || uploadedReportUrl.split('/').pop() || 'informe.pdf');
      Alert.alert('Exito', 'Informe PDF subido correctamente');
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
        <Text>No se encontro la inspeccion</Text>
      </Screen>
    );
  }

  const vehicle = inspection.vehiculo || inspection.publicacion?.vehiculo;
  const address = inspection.horario?.sede?.nombre || 'Direccion no disponible';
  const date = inspection.fechaProgramada
    ? new Date(inspection.fechaProgramada).toLocaleString('es-CL')
    : 'Fecha no disponible';

  return (
    <Screen style={styles.container}>
      <KeyboardAwareScrollView
        contentContainerStyle={styles.content}
        enableOnAndroid={true}
        extraScrollHeight={100}
        keyboardShouldPersistTaps="handled"
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
            <Text style={styles.label}>Direccion:</Text>
            <Text style={styles.value}>{address}</Text>
          </View>
        </Card>

        {inspection.estado_insp === 'Confirmada' && (
          <View>
            <Button title="Iniciar Inspeccion" onPress={handleStartInspection} style={styles.actionButton} />
            <Button
              title="Cancelar Inspeccion"
              onPress={() => setShowRejectModal(true)}
              variant="outline"
              style={[styles.actionButton, { borderColor: '#F44336' }]}
              textStyle={{ color: '#F44336' }}
            />
          </View>
        )}

        {inspection.estado_insp === 'En_sucursal' && (
          <View style={styles.checklistContainer}>
            <Text style={styles.sectionHeader}>Checklist de Inspeccion</Text>
            <View style={styles.warningBox}>
              <Ionicons name="alert-circle-outline" size={18} color="#E65100" />
              <Text style={styles.warningText}>En cada paso debes adjuntar fotos</Text>
            </View>

            {INSPECTION_SECTIONS.map((section, sectionIndex) => {
              const sectionComplete = getSectionIsComplete(sectionIndex);
              const isLocked = sectionIndex > getFirstIncompleteSectionIndex();
              const isActive = activeSectionIndex === sectionIndex;
              const sectionProgress = getSectionProgress(sectionIndex);

              return (
                <View key={section.id} style={styles.sectionContainer}>
                  <TouchableOpacity style={styles.sectionTitleRow} onPress={() => handleGoToSection(sectionIndex)}>
                    <View style={styles.sectionTitleLeft}>
                      <Ionicons
                        name={isLocked ? 'lock-closed-outline' : (section.icon as any)}
                        size={24}
                        color={isLocked ? '#9E9E9E' : '#4CAF50'}
                      />
                      <Text style={styles.sectionTitleText}>{section.title}</Text>
                    </View>
                    <View style={styles.sectionHeaderStatus}>
                      <View style={[styles.progressBadge, sectionProgress.isComplete && styles.progressBadgeComplete]}>
                        <Text style={[styles.progressBadgeText, sectionProgress.isComplete && styles.progressBadgeTextComplete]}>
                          {sectionProgress.completedQuestions}/{sectionProgress.totalQuestions}
                        </Text>
                      </View>
                      {sectionComplete ? <Ionicons name="checkmark-circle" size={20} color="#2E7D32" /> : null}
                      <Ionicons name={isActive ? 'chevron-up' : 'chevron-down'} size={24} color="#666" />
                    </View>
                  </TouchableOpacity>

                  {isActive && (
                    <View style={styles.sectionContent}>
                      {section.questions.map((question) => (
                        <View
                          key={question.id}
                          style={[
                            styles.questionContainer,
                            getQuestionCompletion(question.id).isComplete
                              ? styles.questionContainerComplete
                              : styles.questionContainerIncomplete,
                          ]}
                        >
                          <View style={styles.questionHeaderRow}>
                            <Text style={styles.questionText}>{question.text}</Text>
                            <View
                              style={[
                                styles.questionStatusChip,
                                getQuestionCompletion(question.id).isComplete
                                  ? styles.questionStatusChipComplete
                                  : styles.questionStatusChipIncomplete,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.questionStatusChipText,
                                  getQuestionCompletion(question.id).isComplete
                                    ? styles.questionStatusChipTextComplete
                                    : styles.questionStatusChipTextIncomplete,
                                ]}
                              >
                                {getQuestionCompletion(question.id).isComplete ? 'Completo' : 'Incompleto'}
                              </Text>
                            </View>
                          </View>

                          <Text style={styles.questionProgressText}>
                            Campos completos: {getQuestionCompletion(question.id).completedFields}/{getQuestionCompletion(question.id).totalFields}
                          </Text>

                          <View style={styles.optionsContainer}>
                            {question.options.map((option) => (
                              <TouchableOpacity
                                key={option.value}
                                style={[
                                  styles.optionButton,
                                  answers[question.id] === option.value && styles.optionButtonSelected,
                                ]}
                                onPress={() => handleAnswer(question.id, option.value)}
                              >
                                <View
                                  style={[
                                    styles.radioButton,
                                    answers[question.id] === option.value && styles.radioButtonSelected,
                                  ]}
                                />
                                <Text
                                  style={[
                                    styles.optionText,
                                    answers[question.id] === option.value && styles.optionTextSelected,
                                  ]}
                                >
                                  {option.label}
                                </Text>
                              </TouchableOpacity>
                            ))}
                          </View>

                          <View style={styles.extraInputsContainer}>
                            <Text style={styles.inputLabel}>Observacion (obligatoria):</Text>
                            <TextInput
                              style={styles.smallInput}
                              placeholder="Escribe aqui..."
                              value={textAnswers[question.id] || ''}
                              onChangeText={(text) => handleTextAnswer(question.id, text)}
                              multiline
                            />
                            <View style={styles.mediaRow}>
                              {mediaUrls[question.id] ? (
                                <View style={styles.previewContainer}>
                                  <Image source={{ uri: getImageUrl(mediaUrls[question.id]) }} style={styles.miniPreview} />
                                  <TouchableOpacity style={styles.removeButton} onPress={() => handleMediaUrl(question.id, '')}>
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
                                    <>
                                      <Ionicons name="camera-outline" size={20} color="#FFF" />
                                      <Text style={styles.uploadButtonText}>Tomar foto</Text>
                                    </>
                                  )}
                                </TouchableOpacity>
                              )}
                            </View>
                            {!mediaUrls[question.id] && <Text style={styles.requiredHelper}>{NOT_EXAMINED_TEXT}</Text>}
                          </View>
                        </View>
                      ))}

                      <Button
                        title={
                          sectionIndex < INSPECTION_SECTIONS.length - 1
                            ? `Continuar al paso ${sectionIndex + 2}`
                            : 'Paso completado'
                        }
                        onPress={() => handleContinueSection(sectionIndex)}
                        disabled={!sectionComplete}
                        style={styles.continueButton}
                      />
                    </View>
                  )}
                </View>
              );
            })}

            <Button
              title={reportUrl ? `PDF adjunto: ${reportName || 'informe.pdf'}` : 'Adjuntar informe PDF final'}
              onPress={handleUploadReport}
              variant="secondary"
              loading={uploading}
              style={styles.actionButton}
              icon={<Ionicons name="document-text-outline" size={20} color="#FFF" />}
            />

            <Card style={styles.finalChecklistCard}>
              <Text style={styles.finalChecklistTitle}>Checklist final antes de finalizar</Text>

              {INSPECTION_SECTIONS.map((section, index) => {
                const progress = getSectionProgress(index);
                const complete = progress.isComplete;
                return (
                  <View key={`final-${section.id}`} style={styles.finalChecklistRow}>
                    <View style={styles.finalChecklistLabelWrap}>
                      <Ionicons
                        name={complete ? 'checkmark-circle' : 'ellipse-outline'}
                        size={18}
                        color={complete ? '#2E7D32' : '#9E9E9E'}
                      />
                      <Text style={styles.finalChecklistLabel}>{`Paso ${index + 1}`}</Text>
                    </View>
                    <Text style={[styles.finalChecklistValue, complete ? styles.finalChecklistValueOk : styles.finalChecklistValuePending]}>
                      {progress.completedQuestions}/{progress.totalQuestions}
                    </Text>
                  </View>
                );
              })}

              <View style={[styles.finalChecklistRow, styles.finalChecklistPdfRow]}>
                <View style={styles.finalChecklistLabelWrap}>
                  <Ionicons
                    name={reportUrl ? 'checkmark-circle' : 'ellipse-outline'}
                    size={18}
                    color={reportUrl ? '#2E7D32' : '#9E9E9E'}
                  />
                  <Text style={styles.finalChecklistLabel}>PDF final adjunto</Text>
                </View>
                <Text style={[styles.finalChecklistValue, reportUrl ? styles.finalChecklistValueOk : styles.finalChecklistValuePending]}>
                  {reportUrl ? 'Completo' : 'Pendiente'}
                </Text>
              </View>
            </Card>

            <Button
              title="Finalizar Inspeccion"
              onPress={handleCompleteInspection}
              disabled={getFirstIncompleteSectionIndex() < INSPECTION_SECTIONS.length || !reportUrl}
              style={styles.actionButton}
            />

            <Button
              title="Rechazar Inspeccion"
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
            <Text style={[styles.completedText, { color: '#FF9800' }]}>Inspeccion Postergada</Text>
            <Text style={{ textAlign: 'center', marginBottom: 8, fontWeight: 'bold' }}>
              Motivo:{' '}
              {inspection.cancellationReason === 'cancelado_admin'
                ? 'Cancelado por Admin'
                : inspection.cancellationReason === 'cancelado_dueno'
                ? 'Cancelado por Dueño'
                : inspection.cancellationReason === 'cancelado_vend'
                ? 'Cancelado por Solicitante'
                : inspection.cancellationReason === 'cancelado_mec'
                ? 'Cancelado por Mecanico'
                : inspection.cancellationReason || 'No especificado'}
            </Text>
            <Text style={{ textAlign: 'center', color: '#666' }}>{inspection.observacion}</Text>
          </Card>
        )}

        {inspection.estado_insp === 'Finalizada' && (
          <Card style={styles.completedCard}>
            <Ionicons name="checkmark-circle" size={48} color="#4CAF50" />
            <Text style={styles.completedText}>Inspeccion Completada</Text>
            <Button
              title="Ver Resultados del Cuestionario"
              onPress={() =>
                router.push({
                  pathname: '/user-inspection-detail',
                  params: { id: id },
                })
              }
              style={styles.viewResultsButton}
            />
            <Button
              title="Descargar Informe PDF"
              onPress={async () => {
                try {
                  setDownloadingPdf(true);
                  await downloadInspectionPdf(inspection);
                } catch {
                  Alert.alert('Error', 'No se pudo generar el PDF');
                } finally {
                  setDownloadingPdf(false);
                }
              }}
              loading={downloadingPdf}
              style={styles.viewResultsButton}
              variant="secondary"
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
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Cancelar Inspeccion</Text>
              <Text style={styles.modalSubtitle}>Por favor indique el motivo de la cancelacion:</Text>

              <TextInput
                style={styles.commentInput}
                placeholder="Escriba el motivo aqui..."
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
  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFF3E0',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FFCC80',
    padding: 10,
    marginBottom: 12,
  },
  warningText: {
    color: '#E65100',
    fontWeight: '600',
    flex: 1,
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
  sectionHeaderStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  progressBadge: {
    backgroundColor: '#F1F3F4',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  progressBadgeComplete: {
    backgroundColor: '#E8F5E9',
  },
  progressBadgeText: {
    color: '#616161',
    fontSize: 11,
    fontWeight: '700',
  },
  progressBadgeTextComplete: {
    color: '#2E7D32',
  },
  sectionContent: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    backgroundColor: '#FAFAFA',
  },
  questionContainer: {
    marginBottom: 20,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    backgroundColor: '#FFF',
  },
  questionContainerComplete: {
    borderColor: '#C8E6C9',
  },
  questionContainerIncomplete: {
    borderColor: '#ECEFF1',
  },
  questionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  questionStatusChip: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginTop: 2,
  },
  questionStatusChipComplete: {
    backgroundColor: '#E8F5E9',
  },
  questionStatusChipIncomplete: {
    backgroundColor: '#F5F5F5',
  },
  questionStatusChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
  questionStatusChipTextComplete: {
    color: '#2E7D32',
  },
  questionStatusChipTextIncomplete: {
    color: '#757575',
  },
  questionText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    flex: 1,
  },
  questionProgressText: {
    fontSize: 12,
    color: '#757575',
    marginBottom: 10,
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
    minHeight: 56,
  },
  mediaRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginTop: 4,
  },
  previewContainer: {
    width: 80,
    height: 80,
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
    minWidth: 110,
    height: 40,
    flexDirection: 'row',
    gap: 6,
  },
  uploadButtonText: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: 12,
  },
  requiredHelper: {
    fontSize: 12,
    color: '#9E9E9E',
    fontStyle: 'italic',
  },
  continueButton: {
    marginTop: 8,
  },
  finalChecklistCard: {
    marginTop: 4,
    marginBottom: 6,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  finalChecklistTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#333',
    marginBottom: 10,
  },
  finalChecklistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  finalChecklistPdfRow: {
    marginTop: 6,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#EEEEEE',
  },
  finalChecklistLabelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  finalChecklistLabel: {
    fontSize: 13,
    color: '#424242',
  },
  finalChecklistValue: {
    fontSize: 12,
    fontWeight: '700',
  },
  finalChecklistValueOk: {
    color: '#2E7D32',
  },
  finalChecklistValuePending: {
    color: '#8D6E63',
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
});
