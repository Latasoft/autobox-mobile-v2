import { useState, useEffect, useCallback } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Alert } from 'react-native';
import apiService from '../services/apiService';
import authService from '../services/authService';
import { Vehicle, User } from '../types';

export function useVehicleDetail() {
  const { id } = useLocalSearchParams();
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLiked, setIsLiked] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  useEffect(() => {
    loadCurrentUser();
    if (id) {
      loadVehicle(id as string);
    } else {
       console.warn('⚠️ [useVehicleDetail] Hook called without ID param');
       setLoading(false);
    }
  }, [id]);

  const loadCurrentUser = async () => {
    const user = await authService.getUser();
    setCurrentUser(user);
  };

  const loadVehicle = async (vehicleId: string) => {
    try {
      setLoading(true);
      const data = await apiService.getVehicleById(vehicleId);
      console.log('🚗 [useVehicleDetail] Loaded vehicle data:', data);
      
      if (!data) {
        console.error('❌ [useVehicleDetail] Vehicle data is null/undefined for ID:', vehicleId);
        setVehicle(null);
        return;
      }

      setVehicle(data);

      if (data.publicationId) {
        try {
          const likeStatus = await apiService.get(`/publications/${data.publicationId}/is-liked`);
          setIsLiked(likeStatus.isLiked);
        } catch (e) {
          console.log('Error checking like status', e);
        }
      }
    } catch (error) {
      console.error('Error loading vehicle:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleLike = async () => {
    if (!vehicle?.publicationId) return;
    try {
      if (isLiked) {
        await apiService.delete(`/publications/${vehicle.publicationId}/like`);
        setIsLiked(false);
      } else {
        await apiService.post(`/publications/${vehicle.publicationId}/like`);
        setIsLiked(true);
      }
    } catch (e) {
      console.error('Error toggling like', e);
    }
  };

  const deactivateVehicle = async () => {
    if (!vehicle?.publicationId) {
      Alert.alert('No se pudo desactivar', 'La publicación no tiene un ID válido para desactivar.');
      return;
    }
    
    Alert.alert(
      'Desactivar Publicación',
      '¿Estás seguro que deseas desactivar esta publicación? Podrás reactivarla después',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Desactivar',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiService.deactivatePublication(vehicle.publicationId!);
              Alert.alert('Éxito', 'Publicación desactivada correctamente', [
                { text: 'OK', onPress: () => vehicle?.id && loadVehicle(vehicle.id) }
              ]);
            } catch (error: any) {
              const errorMessage = error.message || 'No se pudo desactivar la publicación';
              Alert.alert('No se pudo desactivar', errorMessage);
            }
          },
        },
      ]
    );
  };

  const deleteVehiclePublication = async (onDeleted?: () => void) => {
    if (!vehicle?.publicationId) {
      Alert.alert('No se pudo eliminar', 'La publicación no tiene un ID válido para eliminar.');
      return;
    }

    Alert.alert(
      'Eliminar Publicación',
      '¿Estás seguro que deseas eliminar esta publicación de forma definitiva? Esta acción no se puede deshacer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiService.deletePublication(vehicle.publicationId!);
              Alert.alert('Éxito', 'Publicación eliminada correctamente', [
                { text: 'OK', onPress: () => onDeleted?.() }
              ]);
            } catch (error: any) {
              const errorMessage = error.message || 'No se pudo eliminar la publicación';
              Alert.alert('No se pudo eliminar', errorMessage);
            }
          },
        },
      ]
    );
  };

  const isOwner = !!(currentUser && vehicle && currentUser.id === vehicle.userId);

  const refresh = useCallback(() => {
    if (id) {
      loadVehicle(id as string);
    }
  }, [id]);

  return {
    vehicle,
    loading,
    isLiked,
    isOwner,
    toggleLike,
    deactivateVehicle,
    deleteVehiclePublication,
    refresh,
  };
}
