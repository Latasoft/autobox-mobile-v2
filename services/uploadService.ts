// services/uploadService.ts
import * as FileSystem from 'expo-file-system/legacy'; // O 'expo-file-system' si te da warning
import * as ImagePicker from 'expo-image-picker';
import apiService from './apiService';

export interface UploadedFile {
  key: string;
  publicUrl: string;
  fileName: string;
  fileType: string;
}

class UploadService {
  /**
   * Selecciona una imagen de la galería o cámara
   * (ESTA ES LA QUE FALTABA)
   */
  async pickImage(useCamera = false): Promise<ImagePicker.ImagePickerAsset | null> {
    const { status } = await (useCamera 
      ? ImagePicker.requestCameraPermissionsAsync()
      : ImagePicker.requestMediaLibraryPermissionsAsync()
    );

    if (status !== 'granted') {
      throw new Error('Permiso denegado para acceder a las imágenes');
    }

    const result = useCamera
      ? await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          allowsEditing: true,
          aspect: [4, 3],
          quality: 0.8,
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsEditing: true,
          aspect: [4, 3],
          quality: 0.8,
          allowsMultipleSelection: false,
        });

    if (!result.canceled && result.assets.length > 0) {
      return result.assets[0];
    }

    return null;
  }

  /**
   * Selecciona múltiples imágenes
   * (TAMBIÉN FALTABA)
   */
  async pickMultipleImages(maxImages = 6): Promise<ImagePicker.ImagePickerAsset[]> {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (status !== 'granted') {
      throw new Error('Permiso denegado para acceder a las imágenes');
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.8,
      selectionLimit: maxImages,
    });

    if (!result.canceled) {
      return result.assets.slice(0, maxImages);
    }

    return [];
  }

  /**
   * Selecciona múltiples videos
   */
  async pickMultipleVideos(maxVideos = 6): Promise<ImagePicker.ImagePickerAsset[]> {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (status !== 'granted') {
      throw new Error('Permiso denegado para acceder a los videos');
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      allowsMultipleSelection: true,
      quality: 0.7,
      videoMaxDuration: 60,
      selectionLimit: maxVideos,
    });

    if (!result.canceled) {
      return result.assets.slice(0, maxVideos);
    }

    return [];
  }

  /**
   * Selecciona un documento
   */
  async pickDocument(): Promise<any | null> {
    console.log('La selección de documentos aún no está implementada');
    return null;
  }

  /**
   * Normaliza un folder a los valores válidos del enum del DTO del backend.
   * El backend solo acepta: 'vehicles' | 'inspections' | 'users' | 'publications' | 'receipts'
   */
  private normalizeFolder(folder: string): string {
    const VALID_FOLDERS = ['vehicles', 'inspections', 'users', 'publications', 'receipts'];
    if (VALID_FOLDERS.includes(folder)) return folder;

    // Mapear aliases conocidos
    if (folder === 'avatars' || folder.startsWith('users') || folder.startsWith('mechanics')) return 'users';
    if (folder === 'inspection-reports' || folder === 'inspection-media' || folder.startsWith('inspections')) return 'inspections';
    if (folder.startsWith('vehicles')) return 'vehicles';
    if (folder.startsWith('publications')) return 'publications';
    if (folder === 'receipts' || folder.startsWith('receipts')) return 'receipts';

    // Fallback
    console.warn(`[UploadService] Folder "${folder}" no es válido para el backend, usando "users" como fallback.`);
    return 'users';
  }

  /**
   * Sube un archivo a Cloudinary usando firma del backend
   * (ESTA ES LA LÓGICA NUEVA QUE YA TENÍAMOS BIEN)
   */
  async uploadFile(
    fileUri: string,
    fileName: string,
    fileType: string,
    folder = 'uploads',
    onProgress?: (progress: number) => void
  ): Promise<UploadedFile> {
    try {
      console.log(`[UploadService] Getting presigned data for ${fileName} (${fileType})`);
      
      // Normalizar folder al enum válido del backend antes de enviar
      const normalizedFolder = this.normalizeFolder(folder);

      // 1. Pedir credenciales al Backend
      const response = await apiService.post('/uploads/presigned-upload', {
        fileName,
        contentType: fileType,
        folder: normalizedFolder,
      });

      // Extraemos todo lo que nos mandó el backend
      const { url, publicUrl, key, signature, apiKey, timestamp, publicId } = response;

      if (!url) {
        throw new Error('No se recibió URL de subida del servidor');
      }

      console.log(`[UploadService] Uploading to Cloudinary...`);

      // 2. Subir a Cloudinary (POST Multipart)
      const uploadResponse = await FileSystem.uploadAsync(url, fileUri, {
        httpMethod: 'POST', 
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        fieldName: 'file', // OBLIGATORIO: Cloudinary pide 'file'
        headers: {
            // FileSystem pone multipart/form-data automático
        },
        parameters: {
            api_key: apiKey,
            timestamp: String(timestamp),
            signature: signature,
            // IMPORTANTE: NO enviar 'folder' por separado.
            // El public_id ya contiene la carpeta como prefijo (ej: "vehicles/123_file").
            // Si se envía 'folder' junto con un public_id que ya lo contiene,
            // Cloudinary almacena el archivo en una ruta DUPLICADA (ej: vehicles/vehicles/123_file).
            public_id: publicId
        }
      });

      if (uploadResponse.status !== 200) {
        console.error('❌ [UploadService] Cloudinary Upload Failed:', {
          status: uploadResponse.status,
          body: uploadResponse.body,
        });
        throw new Error(`Error al subir a Cloudinary (Status: ${uploadResponse.status})`);
      }

      // Parsear la respuesta real de Cloudinary para obtener la URL definitiva
      let finalPublicUrl = publicUrl; // fallback al pre-computado
      try {
        const cloudinaryData = JSON.parse(uploadResponse.body);
        if (cloudinaryData.secure_url) {
          finalPublicUrl = cloudinaryData.secure_url;
        } else if (cloudinaryData.url) {
          // Forzar HTTPS si solo viene http
          finalPublicUrl = cloudinaryData.url.replace('http://', 'https://');
        }
        console.log('✅ [UploadService] Cloudinary secure_url:', finalPublicUrl);
      } catch (parseError) {
        console.warn('⚠️ [UploadService] No se pudo parsear respuesta de Cloudinary, usando publicUrl pre-computada:', publicUrl);
      }

      console.log('✅ [UploadService] Upload successful:', finalPublicUrl);

      return {
        key,         
        publicUrl: finalPublicUrl,   
        fileName,
        fileType,
      };
    } catch (error) {
      console.error('Error al subir archivo:', error);
      throw error;
    }
  }

  /**
   * Sube múltiples archivos en paralelo
   */
  async uploadMultipleFiles(
    files: { uri: string; name: string; type: string }[],
    folder = 'uploads',
    onProgress?: (index: number, progress: number) => void
  ): Promise<UploadedFile[]> {
    console.log(`[UploadService] Starting parallel upload of ${files.length} files`);
    
    const uploadPromises = files.map((file, index) => 
      this.uploadFile(
        file.uri, 
        file.name, 
        file.type, 
        folder, 
        (progress) => onProgress?.(index, progress)
      )
    );

    try {
      const results = await Promise.all(uploadPromises);
      return results;
    } catch (error) {
      console.error('One or more uploads failed:', error);
      throw error;
    }
  }

  /**
   * Elimina un archivo
   */
  async deleteFile(key: string): Promise<void> {
    try {
      await apiService.delete(`/uploads/${encodeURIComponent(key)}`);
    } catch (error) {
      console.error('Error al eliminar archivo:', error);
      throw error;
    }
  }

  /**
   * Obtiene la URL de descarga
   */
  async getDownloadUrl(key: string): Promise<string> {
    try {
      const response = await apiService.post('/uploads/presigned-download', {
        key,
      });
      return response.url || response.downloadUrl; 
    } catch (error) {
      console.error('Error al obtener URL de descarga:', error);
      throw error;
    }
  }

  getMimeType(uri: string): string {
    const extension = uri.split('.').pop()?.toLowerCase();
    const mimeTypes: { [key: string]: string } = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      pdf: 'application/pdf',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xls: 'application/vnd.ms-excel',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      mp4: 'video/mp4',
      mov: 'video/quicktime',
    };
    return mimeTypes[extension || ''] || 'application/octet-stream';
  }

  // --- WRAPPERS (Funcionan porque llaman a uploadFile) ---

  async uploadAvatar(
    imageUri: string,
    userId: string,
    onProgress?: (progress: number) => void
  ): Promise<string> {
    try {
      const fileName = `avatar_${userId}_${Date.now()}.jpg`;
      const fileType = this.getMimeType(imageUri);
      
      const result = await this.uploadFile(
        imageUri,
        fileName,
        fileType,
        'users',
        onProgress
      );
      return result.publicUrl;
    } catch (error) {
      console.error('Error al subir avatar:', error);
      throw error;
    }
  }

  async uploadInspectionReport(
    file: { uri: string; name: string; mimeType?: string },
    inspectionId: string,
    token: string,
    onProgress?: (progress: number) => void
  ): Promise<string> {
    try {
      const fileName = `inspection_${inspectionId}_${Date.now()}.pdf`;
      const fileType = file.mimeType || 'application/pdf';
      
      const result = await this.uploadFile(
        file.uri,
        fileName,
        fileType,
        'inspection-reports',
        onProgress
      );
      return result.publicUrl;
    } catch (error) {
      console.error('Error al subir informe PDF:', error);
      throw error;
    }
  }

  async uploadInspectionMedia(
    file: { uri: string; name: string; mimeType?: string },
    inspectionId: string,
    token: string,
    onProgress?: (progress: number) => void
  ): Promise<string> {
    try {
      const extension = file.name?.split('.').pop() || 'jpg';
      const fileName = `inspection_${inspectionId}_doc_${Date.now()}.${extension}`;
      const fileType = file.mimeType || 'application/octet-stream';
      
      const result = await this.uploadFile(
        file.uri,
        fileName,
        fileType,
        'inspection-media',
        onProgress
      );
      return result.publicUrl;
    } catch (error) {
      console.error('Error al subir documento de inspección:', error);
      throw error;
    }
  }
}

export default new UploadService();