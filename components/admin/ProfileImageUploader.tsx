import React, { useState } from 'react';
import { View, Image, TouchableOpacity, StyleSheet, Text, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import uploadService from '../../services/uploadService';
import { getImageUrl } from '../../utils/imageUtils';

interface ProfileImageUploaderProps {
  imageUri?: string;
  onImageSelected: (uri: string) => void;
  placeholder?: string;
}

export const ProfileImageUploader: React.FC<ProfileImageUploaderProps> = ({
  imageUri,
  onImageSelected,
  placeholder = 'Foto de perfil',
}) => {
  const [loading, setLoading] = useState(false);

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0].uri) {
        setLoading(true);
        const uri = result.assets[0].uri;
        
        // Upload image
        try {
          const fileName = `avatar_${Date.now()}.jpg`;
          const fileType = uploadService.getMimeType(uri);
          const uploadedFile = await uploadService.uploadFile(uri, fileName, fileType, 'avatars');
          
          if (uploadedFile) {
            onImageSelected(uploadedFile.publicUrl);
          }
        } catch (error) {
          console.error('Error uploading image:', error);
          Alert.alert('Error', 'No se pudo subir la imagen');
        } finally {
          setLoading(false);
        }
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'No se pudo seleccionar la imagen');
    }
  };

  return (
    <TouchableOpacity onPress={pickImage} style={styles.container}>
      {loading ? (
        <ActivityIndicator size="large" color="#007bff" />
      ) : imageUri ? (
        <Image source={{ uri: getImageUrl(imageUri) }} style={styles.image} />
      ) : (
        <View style={styles.placeholder}>
          <Ionicons name="camera-outline" size={40} color="#999" />
          <Text style={styles.placeholderText}>{placeholder}</Text>
        </View>
      )}
      <View style={styles.editBadge}>
        <Ionicons name="pencil" size={16} color="#FFF" />
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#F0F0F0',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    alignSelf: 'center',
    overflow: 'visible',
  },
  image: {
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  editBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#007bff',
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFF',
  },
});
