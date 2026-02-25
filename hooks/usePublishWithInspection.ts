import { useState, useEffect, useCallback } from 'react';
import { Alert } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import apiService from '../services/apiService';
import adminService from '../services/adminService';
import vehicleService from '../services/vehicleService';
import uploadService from '../services/uploadService';
import authService from '../services/authService';

export function usePublishWithInspection() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const isEditMode = params.editMode === 'true';
  const vehicleId = params.vehicleId as string;

  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = 6;
  const [loading, setLoading] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [loadingPlateData, setLoadingPlateData] = useState(false);
  const [plateValid, setPlateValid] = useState<boolean | null>(null);

  const [formData, setFormData] = useState({
    plate: '',
    brand: '',
    model: '',
    version: '',
    year: '',
    price: '',
    kilometers: '',
    fuelType: 'Gasolina',
    transmission: 'Automática',
    bodyType: 'SUV',
    color: '',
    doors: '5',
    tipoVehiculo: '',
    vin: '',
    numeroMotor: '',
    motor: '',
    mesRevisionTecnica: '',
    description: '',
    region: '',
    commune: '',
    inspectionDate: '',
    inspectionTime: '',
    inspectionLocation: '',
    horarioId: null as number | null,
    contactName: '',
    contactPhone: '',
    contactEmail: '',
  });

  const [selectedImages, setSelectedImages] = useState<any[]>([]);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [availableTimeSlots, setAvailableTimeSlots] = useState<{ id: number; time: string }[]>([]);
  const [inspectionPrice, setInspectionPrice] = useState(90000);
  const [publicationPrice, setPublicationPrice] = useState(25000);
  const [autoBoxLocations, setAutoBoxLocations] = useState<any[]>([]);

  useEffect(() => {
    loadSettings();
    loadSedes();
  }, []);

  const loadSedes = async () => {
    try {
      console.log('Loading sedes...');
      const sedes = await apiService.getSedes();
      console.log('Sedes loaded:', sedes);
      if (Array.isArray(sedes)) {
        const formattedSedes = sedes.map((sede: any) => ({
          id: String(sede.id),
          name: sede.nombre,
          address: sede.direccion
        }));
        console.log('Formatted sedes:', formattedSedes);
        setAutoBoxLocations(formattedSedes);
      }
    } catch (error) {
      console.error('Error loading sedes:', error);
    }
  };

  useEffect(() => {
    if (formData.brand) {
      loadModels(formData.brand);
    }
  }, [formData.brand]);

  useEffect(() => {
    if (formData.inspectionDate && formData.inspectionLocation) {
      loadTimeSlots();
    }
  }, [formData.inspectionDate, formData.inspectionLocation]);

  const loadSettings = async () => {
    try {
      const prices = await apiService.getPrices();

      const pubPrice = prices.find(p => p.nombre.toLowerCase() === 'publicacion');
      const inspPrice = prices.find(p => p.nombre.toLowerCase() === 'inspeccion');

      if (pubPrice) {
        setPublicationPrice(pubPrice.precio);
      }

      if (inspPrice) {
        setInspectionPrice(inspPrice.precio);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  };

  const loadModels = async (brand: string) => {
    setLoadingModels(true);
    try {
      const models = await apiService.getModelsByBrand(brand);
      setAvailableModels(models || []);
    } catch (error) {
      console.error('Error loading models:', error);
    } finally {
      setLoadingModels(false);
    }
  };

  const loadTimeSlots = async () => {
    setLoadingSlots(true);
    try {
      // Handle different date formats (DD/MM/YYYY or ISO)
      let formattedDate = formData.inspectionDate;
      if (formData.inspectionDate.includes('/')) {
        const [day, month, year] = formData.inspectionDate.split('/');
        formattedDate = `${year}-${month}-${day}`;
      } else if (formData.inspectionDate.includes('T')) {
        formattedDate = formData.inspectionDate.split('T')[0];
      }

      const locationName = autoBoxLocations.find(l => l.id === formData.inspectionLocation)?.name || formData.inspectionLocation;

      const slots = await apiService.getAvailableSlots(formattedDate, locationName);
      setAvailableTimeSlots(slots || []);
    } catch (error) {
      console.error('Error loading slots:', error);
    } finally {
      setLoadingSlots(false);
    }
  };

  const updateFormData = (key: string, value: any) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  const handlePlateChange = async (text: string) => {
    const formatted = vehicleService.formatPlate(text);
    updateFormData('plate', formatted);
    setPlateValid(null);

    // Buscar datos cuando se complete la patente (6 caracteres)
    if (formatted.length === 6 && vehicleService.validatePlateFormat(formatted)) {
      await searchVehicleByPlate(formatted);
    }
  };

  const searchVehicleByPlate = async (plate: string) => {
    try {
      setLoadingPlateData(true);
      setPlateValid(null);

      console.log('🔍 [usePublishWithInspection] Buscando datos para patente:', plate);

      // Primero verificar si la patente ya está publicada
      const availability = await apiService.checkPlateAvailability(plate);

      if (!availability.available) {
        setPlateValid(false);
        Alert.alert(
          'Patente No Disponible',
          'Esta patente ya tiene una publicación activa. No puedes crear otra publicación con la misma patente.',
          [{ text: 'Entendido' }]
        );
        setLoadingPlateData(false);
        return;
      }

      const result = await vehicleService.searchByPlate(plate);

      console.log('📬 [usePublishWithInspection] Resultado de vehicleService:', JSON.stringify(result, null, 2));

      if (result.success && result.data) {
        console.log('✅ [usePublishWithInspection] Datos a mapear:', JSON.stringify(result.data, null, 2));

        // Auto-llenar los campos con los datos encontrados
        const updates: any = {};

        if (result.data.brand) updates.brand = result.data.brand;
        if (result.data.model) updates.model = result.data.model;
        if (result.data.year) updates.year = result.data.year.toString();
        if (result.data.version) updates.version = result.data.version;
        if (result.data.fuelType) updates.fuelType = result.data.fuelType;
        if (result.data.transmission) updates.transmission = result.data.transmission === 'MECANICA' ? 'Manual' : result.data.transmission === 'AUTOMATICA' ? 'Automática' : result.data.transmission;
        if (result.data.color) updates.color = result.data.color;
        if (result.data.kilometers) updates.kilometers = result.data.kilometers.toString();
        if (result.data.doors) updates.doors = result.data.doors.toString();
        if (result.data.vin) updates.vin = result.data.vin;
        if (result.data.engineNumber) updates.numeroMotor = result.data.engineNumber;
        if (result.data.engine) updates.motor = result.data.engine;
        if (result.data.vehicleType) updates.tipoVehiculo = result.data.vehicleType;
        if (result.data.monthRT) updates.mesRevisionTecnica = result.data.monthRT;

        console.log('📝 Campos que se actualizarán:', updates);

        setFormData(prev => ({
          ...prev,
          ...updates
        }));

        setPlateValid(true);

        const foundFields = Object.keys(updates).join(', ');
        Alert.alert(
          '¡Datos encontrados!',
          `Verifica que sean correctos.`,
          [{ text: 'Entendido' }]
        );
      } else {
        setPlateValid(false);
        Alert.alert(
          'Sin resultados',
          'No se encontraron datos para esta patente. Completa la información manualmente.',
          [{ text: 'Entendido' }]
        );
      }
    } catch (error) {
      console.error('Error al buscar datos de patente:', error);
      setPlateValid(false);
      Alert.alert(
        'Error',
        'No se pudieron cargar los datos automáticamente. Completa la información manualmente.',
        [{ text: 'Entendido' }]
      );
    } finally {
      setLoadingPlateData(false);
    }
  };

  const handleImagePick = async () => {
    Alert.alert(
      'Seleccionar Imagen',
      'Elige una opción',
      [
        {
          text: 'Tomar Foto',
          onPress: openCamera,
        },
        {
          text: 'Galería',
          onPress: openGallery,
        },
        {
          text: 'Cancelar',
          style: 'cancel',
        },
      ]
    );
  };

  const openCamera = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permiso denegado', 'Se requiere permiso para acceder a la cámara.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.8,
      });

      if (!result.canceled && result.assets) {
        const newImages = result.assets.map(asset => ({
          uri: asset.uri,
          name: asset.fileName || `camera_${Date.now()}.jpg`,
          type: 'image/jpeg',
        }));
        setSelectedImages(prev => [...prev, ...newImages]);
      }
    } catch (error) {
      console.error('Error camera:', error);
      Alert.alert('Error', 'No se pudo abrir la cámara');
    }
  };

  const openGallery = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        quality: 0.8,
        selectionLimit: 10 - selectedImages.length,
      });

      if (!result.canceled) {
        const newImages = result.assets.map(asset => ({
          uri: asset.uri,
          name: asset.fileName || `image_${Date.now()}.jpg`,
          type: 'image/jpeg',
        }));
        setSelectedImages(prev => [...prev, ...newImages]);
      }
    } catch (error) {
      Alert.alert('Error', 'No se pudieron seleccionar las imágenes');
    }
  };

  const handleRemoveImage = (index: number) => {
    setSelectedImages(prev => prev.filter((_, i) => i !== index));
  };

  const validateStep = () => {
    switch (currentStep) {
      case 1:
        // Paso 1: Solo patente válida
        return formData.plate && formData.plate.length === 6 && plateValid === true;
      case 2:
        // Paso 2: Info básica (marca, modelo, año)
        return formData.brand && formData.model && formData.year;
      case 3:
        // Paso 3: Detalles del vehículo (kilometraje, combustible, transmisión)
        return formData.kilometers && formData.fuelType && formData.transmission;
      case 4:
        // Paso 4: Precio del vehículo
        return formData.price && formData.price.length > 0;
      case 5:
        // Paso 5: Fotos
        return selectedImages.length >= 1;
      case 6:
        // Paso 6: Agendar inspección
        return formData.inspectionDate && formData.inspectionTime && formData.inspectionLocation;
      default:
        return true;
    }
  };

  const handleNext = () => {
    if (currentStep === 1 && plateValid !== true) {
      Alert.alert(
        'Patente no validada',
        'Debes ingresar una patente válida antes de continuar. Si no se encuentran datos, puedes completar la información manualmente en el siguiente paso.',
        [{ text: 'Entendido' }]
      );
      return;
    }

    if (validateStep()) {
      setCurrentStep(prev => Math.min(prev + 1, totalSteps));
    } else {
      Alert.alert('Error', 'Por favor completa todos los campos requeridos');
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(prev => prev - 1);
    } else {
      router.back();
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      // Upload images first
      const uploadedFiles = await uploadService.uploadMultipleFiles(selectedImages, 'vehicles');
      const uploadedUrls = uploadedFiles.map(f => f.publicUrl);

      const vehicleData = {
        ...formData,
        images: uploadedUrls,
        price: parseInt(formData.price.replace(/\D/g, '')),
        kilometers: parseInt(formData.kilometers.replace(/\D/g, '')),
        year: parseInt(formData.year),
        doors: formData.doors ? parseInt(formData.doors) : undefined,
      };

      // Create publication logic here
      // This part depends on how the backend expects the data
      // Usually it creates a vehicle, then an inspection, then a publication
      // Or a single endpoint

      // For now, let's assume we navigate to payment
      router.push({
        pathname: '/(tabs)/publish/payment-gateway',
        params: {
          amount: (Number(inspectionPrice) + Number(publicationPrice)).toString(),
          description: 'Inspección + Publicación Premium',
          serviceType: 'publication_with_inspection',
          metadata: JSON.stringify(vehicleData)
        }
      });

    } catch (error) {
      console.error('Error submitting:', error);
      Alert.alert('Error', 'Hubo un problema al procesar la solicitud');
    } finally {
      setLoading(false);
    }
  };

  return {
    currentStep,
    totalSteps,
    formData,
    updateFormData,
    handlePlateChange,
    loadingPlateData,
    plateValid,
    loading,
    loadingModels,
    loadingSlots,
    availableModels,
    availableTimeSlots,
    selectedImages,
    handleImagePick,
    handleRemoveImage,
    handleNext,
    handleBack,
    handleSubmit,
    inspectionPrice,
    publicationPrice,
    autoBoxLocations,
    isEditMode
  };
}
