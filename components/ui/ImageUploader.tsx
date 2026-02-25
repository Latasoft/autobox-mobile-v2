import React, { useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import uploadService, { UploadedFile } from '../../services/uploadService';
import { getImageUrl } from '../../utils/imageUtils';

interface ImageUploaderProps {
  onUploadComplete?: (files: UploadedFile[]) => void;
  maxImages?: number;
  folder?: string;
  initialImages?: string[];
  images?: any[];
  onAddImage?: () => void;
  onRemoveImage?: (index: number) => void;
  onImagesChange?: (images: string[]) => void;
  hideUploadButton?: boolean;
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({
  onUploadComplete,
  maxImages = 5,
  folder = 'vehicles',
  initialImages = [],
  images: controlledImages,
  onAddImage,
  onRemoveImage,
  onImagesChange,
  hideUploadButton = false
}) => {
  const [internalImages, setInternalImages] = useState<string[]>(initialImages);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);

  const currentImages = controlledImages 
    ? controlledImages.map(img => typeof img === 'string' ? img : img.uri) 
    : internalImages;

  const handlePickImage = async (useCamera = false) => {
    if (onAddImage) {
      onAddImage();
      return;
    }

    try {
      if (currentImages.length >= maxImages) {
        Alert.alert('Límite alcanzado', `Puedes subir máximo ${maxImages} imágenes`);
        return;
      }

      const image = await uploadService.pickImage(useCamera);
      if (image) {
        const newImages = [...currentImages, image.uri];
        setInternalImages(newImages);
        if (onImagesChange) {
          onImagesChange(newImages);
        }
      }
    } catch (error) {
      console.error('Error al seleccionar imagen:', error);
      Alert.alert('Error', 'No se pudo seleccionar la imagen');
    }
  };

  const handleRemove = (index: number) => {
    if (onRemoveImage) {
      onRemoveImage(index);
    } else {
      const newImages = [...currentImages];
      newImages.splice(index, 1);
      setInternalImages(newImages);
      if (onImagesChange) {
        onImagesChange(newImages);
      }
    }
  };

  const handleUpload = async () => {
    if (currentImages.length === 0) return;

    setUploading(true);
    try {
      // Filter out already uploaded images (if any logic existed for that)
      // For now, assume all local URIs need upload
      const filesToUpload = currentImages.map((uri, index) => ({
        uri,
        name: `image_${Date.now()}_${index}.jpg`,
        type: 'image/jpeg'
      }));
      
      const results = await uploadService.uploadMultipleFiles(filesToUpload, folder);
      setUploadedFiles(results);
      if (onUploadComplete) {
        onUploadComplete(results);
      }
      Alert.alert('Éxito', 'Imágenes subidas correctamente');
    } catch (error) {
      console.error('Error al subir imágenes:', error);
      Alert.alert('Error', 'No se pudieron subir las imágenes');
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.buttonsContainer}>
        <TouchableOpacity
          style={styles.button}
          onPress={() => handlePickImage(false)}
          disabled={uploading}
        >
          <Ionicons name="images-outline" size={24} color="#4CAF50" />
          <Text style={styles.buttonText}>Galería</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={styles.button}
          onPress={() => handlePickImage(true)}
          disabled={uploading}
        >
          <Ionicons name="camera-outline" size={24} color="#4CAF50" />
          <Text style={styles.buttonText}>Cámara</Text>
        </TouchableOpacity>
      </View>

      <ScrollView horizontal style={styles.imagesScroll}>
        {currentImages.map((uri, index) => (
          <View key={index} style={styles.imageContainer}>
            <Image source={{ uri: getImageUrl(uri) }} style={styles.image} />
            <TouchableOpacity
              style={styles.removeButton}
              onPress={() => handleRemove(index)}
              disabled={uploading}
            >
              <Ionicons name="close-circle" size={24} color="#F44336" />
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>

      {currentImages.length > 0 && !onAddImage && !hideUploadButton && (
        <TouchableOpacity
          style={[styles.uploadButton, uploading && styles.disabledButton]}
          onPress={handleUpload}
          disabled={uploading}
        >
          {uploading ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.uploadButtonText}>Subir Imágenes ({currentImages.length})</Text>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  buttonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  button: {
    alignItems: 'center',
    padding: 12,
    borderWidth: 1,
    borderColor: '#4CAF50',
    borderRadius: 8,
    width: '45%',
  },
  buttonText: {
    color: '#4CAF50',
    marginTop: 4,
    fontWeight: '600',
  },
  imagesScroll: {
    marginBottom: 16,
  },
  imageContainer: {
    marginRight: 12,
    position: 'relative',
  },
  image: {
    width: 100,
    height: 100,
    borderRadius: 8,
  },
  removeButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#FFF',
    borderRadius: 12,
  },
  uploadButton: {
    backgroundColor: '#4CAF50',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  disabledButton: {
    backgroundColor: '#A5D6A7',
  },
  uploadButtonText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 16,
  },
});
