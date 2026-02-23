import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Share,
  Linking,
  Platform,
  Alert,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';

const BASE_URL = 'https://autobox.cl';

interface ShareModalProps {
  visible: boolean;
  onClose: () => void;
  vehicleId?: string;
  publicationId?: string;
  vehicleTitle?: string;
}

/**
 * Genera la URL para compartir una publicación.
 * Cuando el deep-linking esté activo, el link abrirá la app directamente;
 * mientras tanto apunta al dominio web que redirigirá a la tienda.
 */
function buildShareUrl(publicationId?: string): string {
  if (!publicationId) return BASE_URL;
  return `${BASE_URL}/vehiculo/${publicationId}`;
}

export const ShareModal: React.FC<ShareModalProps> = ({
  visible,
  onClose,
  vehicleId,
  publicationId,
  vehicleTitle,
}) => {
  const shareUrl = buildShareUrl(publicationId || vehicleId);
  const shareMessage = vehicleTitle
    ? `¡Mira este vehículo en AutoBox! ${vehicleTitle}\n${shareUrl}`
    : `¡Mira este vehículo en AutoBox!\n${shareUrl}`;

  const handleWhatsApp = async () => {
    try {
      const encoded = encodeURIComponent(shareMessage);
      const url = `whatsapp://send?text=${encoded}`;
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      } else {
        Alert.alert('WhatsApp', 'WhatsApp no está instalado en este dispositivo.');
      }
    } catch (error) {
      console.error('Error sharing to WhatsApp:', error);
    } finally {
      onClose();
    }
  };

  const handleFacebook = async () => {
    try {
      const encoded = encodeURIComponent(shareUrl);
      const url = `https://www.facebook.com/sharer/sharer.php?u=${encoded}`;
      await Linking.openURL(url);
    } catch (error) {
      console.error('Error sharing to Facebook:', error);
    } finally {
      onClose();
    }
  };

  const handleInstagram = async () => {
    try {
      // Instagram no soporta compartir enlaces directamente vía URL scheme.
      // Usamos el share sheet nativo para que el usuario elija Instagram Stories/DM.
      await Share.share({
        message: shareMessage,
        ...(Platform.OS === 'ios' ? { url: shareUrl } : {}),
      });
    } catch (error) {
      console.error('Error sharing to Instagram:', error);
    } finally {
      onClose();
    }
  };

  const handleCopyLink = async () => {
    try {
      await Clipboard.setStringAsync(shareUrl);
      Alert.alert('Enlace copiado', 'El enlace ha sido copiado al portapapeles.');
    } catch (error) {
      console.error('Error copying link:', error);
      Alert.alert('Error', 'No se pudo copiar el enlace.');
    } finally {
      onClose();
    }
  };

  const handleNativeShare = async () => {
    try {
      await Share.share({
        message: shareMessage,
        ...(Platform.OS === 'ios' ? { url: shareUrl } : {}),
      });
    } catch (error) {
      console.error('Error native share:', error);
    } finally {
      onClose();
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>Compartir publicación</Text>

          <View style={styles.optionsRow}>
            <TouchableOpacity style={styles.option} onPress={handleWhatsApp}>
              <View style={[styles.iconCircle, { backgroundColor: '#25D366' }]}>
                <Ionicons name="logo-whatsapp" size={28} color="#FFF" />
              </View>
              <Text style={styles.optionLabel}>WhatsApp</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.option} onPress={handleFacebook}>
              <View style={[styles.iconCircle, { backgroundColor: '#1877F2' }]}>
                <Ionicons name="logo-facebook" size={28} color="#FFF" />
              </View>
              <Text style={styles.optionLabel}>Facebook</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.option} onPress={handleInstagram}>
              <View style={[styles.iconCircle, { backgroundColor: '#E4405F' }]}>
                <Ionicons name="logo-instagram" size={28} color="#FFF" />
              </View>
              <Text style={styles.optionLabel}>Instagram</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.option} onPress={handleCopyLink}>
              <View style={[styles.iconCircle, { backgroundColor: '#607D8B' }]}>
                <Ionicons name="link" size={28} color="#FFF" />
              </View>
              <Text style={styles.optionLabel}>Copiar enlace</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.moreButton} onPress={handleNativeShare}>
            <Ionicons name="share-social-outline" size={20} color="#333" />
            <Text style={styles.moreButtonText}>Más opciones</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
            <Text style={styles.cancelText}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#DDD',
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 24,
  },
  optionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 24,
  },
  option: {
    alignItems: 'center',
    width: 72,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  optionLabel: {
    fontSize: 12,
    color: '#555',
    textAlign: 'center',
  },
  moreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#F5F5F5',
    marginBottom: 12,
    gap: 8,
  },
  moreButtonText: {
    fontSize: 15,
    color: '#333',
    fontWeight: '500',
  },
  cancelButton: {
    alignItems: 'center',
    paddingVertical: 14,
  },
  cancelText: {
    fontSize: 15,
    color: '#999',
    fontWeight: '500',
  },
});
