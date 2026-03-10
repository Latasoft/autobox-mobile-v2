import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Inspection } from '../types/inspection';
import { INSPECTION_SECTIONS } from '../constants/InspectionForm';
import apiService from './apiService';

const NOT_EXAMINED_TEXT = 'Aspecto no examinado';

const escapeHtml = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

const pickReportUrl = (inspection: Inspection): string | undefined => {
  const candidates = [
    inspection.reportUrl,
    inspection.report_url,
    inspection.inspectionPdfUrl,
    inspection.pdf_url,
    (inspection as any)?.report?.url,
    (inspection as any)?.informeUrl,
    (inspection as any)?.informe_url,
  ];

  return candidates.find((candidate) => typeof candidate === 'string' && candidate.trim().length > 0);
};

const buildQuestionMaps = (inspection: Inspection) => {
  const answerMap: Record<string, string> = { ...(inspection.answers || {}) };

  // Strip internal metadata keys before spreading comments as text answers.
  const rawComments = { ...(inspection.comments || {}) };
  delete (rawComments as any).__finalAttachmentUrl;
  delete (rawComments as any).mediaUrls;
  const commentMap: Record<string, string> = {
    ...rawComments,
    ...(inspection.textAnswers || {}),
  };

  // Backend stores per-question media inside inspection.comments.mediaUrls (nested)
  // during completeInspection. Fall back to the top-level mediaUrls column if present.
  const mediaMap: Record<string, string> = {
    ...((inspection.comments as any)?.mediaUrls || {}),
    ...(inspection.mediaUrls || {}),
  };

  const inspectionAnswers = Array.isArray(inspection.inspectionAnswers) ? inspection.inspectionAnswers : [];
  inspectionAnswers.forEach((row: any) => {
    const idCandidates = [
      row?.pregunta?.codigo,
      row?.preguntaId,
      row?.pregunta?.id,
      row?.questionId,
      row?.id,
    ]
      .map((entry: any) => (entry !== undefined && entry !== null ? String(entry) : ''))
      .filter(Boolean);

    // Prefer IDs that look like the constant question format (e.g. 1.1, 2.13).
    const questionId = idCandidates.find((entry: string) => /^\d+\.\d+$/.test(entry)) || idCandidates[0];
    if (!questionId) return;

    if (!commentMap[questionId] && typeof row?.respuestaTextoManual === 'string') {
      commentMap[questionId] = row.respuestaTextoManual;
    }
    if (!mediaMap[questionId] && typeof row?.imagen_url === 'string') {
      mediaMap[questionId] = row.imagen_url;
    }
  });

  return { answerMap, commentMap, mediaMap };
};

export const generateInspectionHtml = (inspection: Inspection) => {
  const vehicle = inspection.vehiculo || inspection.publicacion?.vehiculo;
  const mechanic = inspection.mecanico;
  const date = inspection.fechaCompletada 
    ? new Date(inspection.fechaCompletada).toLocaleDateString() 
    : new Date().toLocaleDateString();
  const reportUrl = pickReportUrl(inspection);
  const { answerMap, commentMap, mediaMap } = buildQuestionMaps(inspection);

  const getAnswerDetails = (questionId: string, value: string) => {
    for (const section of INSPECTION_SECTIONS) {
      for (const q of section.questions) {
        if (q.id === questionId) {
          const option = q.options.find(o => o.value === value);
          return {
            question: q.text,
            answer: option ? option.label : value
          };
        }
      }
    }
    return { question: questionId, answer: value };
  };

  let questionsHtml = '';

  INSPECTION_SECTIONS.forEach((section) => {
    questionsHtml += `
      <div class="section">
        <h3>${escapeHtml(section.title)}</h3>
        ${section.questions
          .map((question) => {
            const answerValue = answerMap[question.id];
            const commentValue = commentMap[question.id]?.trim();
            const photoUrl = mediaMap[question.id];
            const answerDetails = answerValue ? getAnswerDetails(question.id, answerValue) : null;

            const answerText = answerDetails?.answer || NOT_EXAMINED_TEXT;
            const answerColor = !answerValue
              ? '#9E9E9E'
              : answerValue === 'a'
              ? '#2E7D32'
              : answerValue === 'b'
              ? '#EF6C00'
              : '#C62828';

            return `
              <div class="question-row">
                <div class="question-text">${escapeHtml(question.text)}</div>
                <div class="answer-text" style="color: ${answerColor}">
                  ${escapeHtml(answerText)}
                </div>
                <div class="meta-label">Comentario técnico</div>
                <div class="meta-text ${commentValue ? '' : 'placeholder'}">
                  ${escapeHtml(commentValue || NOT_EXAMINED_TEXT)}
                </div>
                <div class="meta-label">Registro fotográfico</div>
                ${photoUrl
                  ? `<img class="photo" src="${escapeHtml(photoUrl)}" alt="Foto ${escapeHtml(question.id)}" />`
                  : `<div class="meta-text placeholder">${NOT_EXAMINED_TEXT}</div>`}
              </div>
            `;
          })
          .join('')}
      </div>
    `;
  });

  const html = `
<!DOCTYPE html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
    <style>
      body { font-family: 'Helvetica', sans-serif; padding: 20px; color: #333; }
      .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 10px; }
      .title { font-size: 24px; font-weight: bold; color: #E65100; margin: 0; }
      .subtitle { font-size: 14px; color: #666; margin-top: 5px; }
      
      .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 30px; background: #f9f9f9; padding: 15px; border-radius: 8px; }
      .info-item { margin-bottom: 5px; }
      .label { font-weight: bold; font-size: 12px; color: #666; }
      .value { font-size: 14px; }

      .section { margin-bottom: 25px; border-bottom: 1px solid #eee; padding-bottom: 15px; }
      .section h3 { margin: 0 0 10px 0; font-size: 16px; background: #E65100; color: white; padding: 5px 10px; border-radius: 4px; }
      
      .question-row { margin-bottom: 12px; padding: 10px; border: 1px solid #eee; border-radius: 8px; }
      .question-text { font-size: 12px; font-weight: bold; margin-bottom: 2px; }
      .answer-text { font-size: 12px; }
      .meta-label { font-size: 11px; color: #666; margin-top: 8px; font-weight: bold; }
      .meta-text { font-size: 12px; margin-top: 2px; }
      .placeholder { color: #9E9E9E; font-style: italic; }
      .photo { margin-top: 8px; width: 220px; height: 160px; object-fit: cover; border-radius: 6px; border: 1px solid #DDD; }
      .attachment { margin-top: 20px; padding: 12px; background: #FFF8E1; border: 1px solid #FFE082; border-radius: 8px; }
      .attachment a { color: #E65100; text-decoration: none; word-break: break-all; }

      .score-summary { text-align: right; font-size: 18px; font-weight: bold; margin-top: 20px; }
      
      .footer { margin-top: 50px; text-align: center; font-size: 10px; color: #999; border-top: 1px solid #eee; padding-top: 10px; }
    </style>
  </head>
  <body>
    <div class="header">
      <h1 class="title">Informe de Inspección AutoBox</h1>
      <div class="subtitle">ID: ${inspection.id} | Fecha: ${date}</div>
    </div>

    <div class="info-grid">
      <div>
        <div class="info-item">
          <div class="label">VEHÍCULO</div>
          <div class="value">${vehicle?.marca} ${vehicle?.modelo} ${vehicle?.anio}</div>
        </div>
        <div class="info-item">
          <div class="label">PATENTE</div>
          <div class="value">${vehicle?.patente || 'N/A'}</div>
        </div>
      </div>
      <div>
        <div class="info-item">
          <div class="label">MECÁNICO</div>
          <div class="value">${mechanic ? `${mechanic.primerNombre} ${mechanic.primerApellido}` : 'No asignado'}</div>
        </div>
        <div class="info-item">
          <div class="label">ESTADO</div>
          <div class="value">${inspection.estado_insp}</div>
        </div>
      </div>
    </div>

    <div class="content">
      ${questionsHtml}
      ${reportUrl
        ? `<div class="attachment"><strong>PDF adjunto por mecánico:</strong><br/><a href="${escapeHtml(reportUrl)}">${escapeHtml(reportUrl)}</a></div>`
        : `<div class="attachment"><strong>PDF adjunto por mecánico:</strong><br/><span class="placeholder">${NOT_EXAMINED_TEXT}</span></div>`}
    </div>

    <div class="footer">
      Generado por AutoBox App
    </div>
  </body>
</html>
  `;
  return html;
};

export const downloadInspectionPdf = async (inspection: Inspection) => {
  try {
    let inspectionForPdf = inspection;
    try {
      const fullInspection = await apiService.get(`/inspections/${inspection.id}`);
      if (fullInspection && typeof fullInspection === 'object') {
        inspectionForPdf = { ...inspection, ...(fullInspection as Inspection) };
      }
    } catch {
      // Fallback to available data when detailed fetch fails.
    }

    const html = generateInspectionHtml(inspectionForPdf);
    const { uri } = await Print.printToFileAsync({ html });
    await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw error;
  }
};