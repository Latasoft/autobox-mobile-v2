import { useState, useEffect } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Alert } from 'react-native';
import apiService from '../services/apiService';
import vehicleService from '../services/vehicleService';
import uploadService from '../services/uploadService';
import adminService from '../services/adminService';

export const useRawPublish = () => {
  const router = useRouter();
  const params = useLocalSearchParams();
  const isEditMode = params.editMode === 'true';
  const vehicleId = params.vehicleId as string;
  const publicationId = params.publicationId as string;

  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingPlateData, setLoadingPlateData] = useState(false);
  const [plateValid, setPlateValid] = useState<boolean | null>(null);
  const [publicationPrice, setPublicationPrice] = useState(25000);

  useEffect(() => {
    loadPrices();
  }, []);

  const loadPrices = async () => {
    try {
      const prices = await apiService.getPrices();
      const pubPrice = prices.find(p => p.nombre.toLowerCase() === 'publicacion');
      if (pubPrice) {
        setPublicationPrice(pubPrice.precio);
      }
    } catch (error) {
      console.error('Error loading prices:', error);
    }
  };
  
  const [formData, setFormData] = useState({
    patente: '',
    brand: '',
    model: '',
    version: '',
    year: '',
    price: '',
    kilometers: '',
    fuelType: 'Gasolina',
    transmission: 'Manual',
    bodyType: '',
    color: '',
    doors: '',
    tipoVehiculo: '',
    vin: '',
    numeroMotor: '',
    motor: '',
    mesRevisionTecnica: '',
    description: '',
    region: '',
    comuna: '',
    images: [] as string[],
  });

  const updateFormData = (key: string, value: any) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  const handlePlateChange = async (text: string) => {
    const formatted = vehicleService.formatPlate(text);
    updateFormData('patente', formatted);
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
      
      console.log('🔍 [useRawPublish] Buscando datos para patente:', plate);
      
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
      
      console.log('📬 [useRawPublish] Resultado de vehicleService:', JSON.stringify(result, null, 2));
      
      if (result.success && result.data) {
        console.log('✅ [useRawPublish] Datos a mapear:', JSON.stringify(result.data, null, 2));
        
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
        
        console.log('📝 [useRawPublish] Campos que se actualizarán:', JSON.stringify(updates, null, 2));
        console.log('📋 [useRawPublish] FormData antes de actualizar:', JSON.stringify(formData, null, 2));
        
        setFormData(prev => {
          const newFormData = {
            ...prev,
            ...updates
          };
          console.log('🎯 [useRawPublish] FormData después de actualizar:', JSON.stringify(newFormData, null, 2));
          return newFormData;
        });
        
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

  const nextStep = () => {
    if (currentStep === 1) {
      // Paso 1: Solo validar patente
      if (!formData.patente || formData.patente.length !== 6) {
        Alert.alert('Error', 'Por favor ingresa una patente válida de 6 caracteres');
        return;
      }
      if (plateValid !== true) {
        Alert.alert(
          'Patente no validada', 
          'Debes ingresar una patente válida antes de continuar. Si no se encuentran datos, puedes completar la información manualmente en el siguiente paso.',
          [{ text: 'Entendido' }]
        );
        return;
      }
      setCurrentStep(2);
    } else if (currentStep === 2) {
      // Paso 2: Validar información básica
      if (!formData.brand || !formData.model || !formData.year) {
        Alert.alert('Error', 'Por favor completa marca, modelo y año');
        return;
      }
      setCurrentStep(3);
    } else if (currentStep === 3) {
      // Paso 3: Validar información específica
      if (!formData.kilometers) {
        Alert.alert('Error', 'Por favor completa el kilometraje');
        return;
      }
      setCurrentStep(4);
    } else if (currentStep === 4) {
      // Paso 4: Validar precio
      if (!formData.price) {
        Alert.alert('Error', 'Por favor ingresa el precio del vehículo');
        return;
      }
      setCurrentStep(5);
    } else if (currentStep === 5) {
      // Paso 5: Fotos
      if (formData.images.length === 0) {
        Alert.alert('Error', 'Debes subir al menos una foto');
        return;
      }
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    } else {
      router.back();
    }
  };

  const handleImagesUploaded = (files: any[]) => {
    const imageUrls = files.map(f => f.publicUrl);
    updateFormData('images', imageUrls);
  };

  const publish = async () => {
    setLoading(true);
    try {
      // Asegurar que todas las imágenes sean públicas (Cloudinary) antes de ir a pagar.
      // En raw-publish el ImageUploader puede entregar URIs locales (file://, content://, ph://).
      const localUris = (formData.images || []).filter((uri) => {
        if (typeof uri !== 'string') return false;
        return /^(file:|content:|ph:|assets-library:)/i.test(uri);
      });

      let finalImages = [...(formData.images || [])];

      if (localUris.length > 0) {
        const filesToUpload = localUris.map((uri, index) => ({
          uri,
          name: `vehicle_${Date.now()}_${index}.jpg`,
          type: uploadService.getMimeType(uri),
        }));

        const uploadedFiles = await uploadService.uploadMultipleFiles(filesToUpload, 'vehicles');
        const uploadedUrls = uploadedFiles.map(f => f.publicUrl);

        // Mantener cualquier URL ya remota y reemplazar solo las locales
        const remoteUrls = finalImages.filter((uri) => typeof uri === 'string' && !/^(file:|content:|ph:|assets-library:)/i.test(uri));
        finalImages = [...remoteUrls, ...uploadedUrls];
      }

      // Prepare data
      const vehicleData = {
        ...formData,
        images: finalImages,
        price: parseInt(formData.price.replace(/\D/g, '')),
        kilometers: parseInt(formData.kilometers.replace(/\D/g, '')),
        year: parseInt(formData.year),
      };

      // Navigate to payment gateway
      router.push({
        pathname: '/(tabs)/publish/payment-gateway',
        params: {
          amount: publicationPrice.toString(),
          description: 'Publicación Estándar',
          serviceType: 'raw_publish',
          metadata: JSON.stringify(vehicleData)
        }
      });
    } catch (error: any) {
      console.error('Error preparing publication:', error);
      Alert.alert('Error', 'Hubo un problema al procesar la solicitud');
    } finally {
      setLoading(false);
    }
  };

  return {
    currentStep,
    formData,
    updateFormData,
    handlePlateChange,
    loadingPlateData,
    plateValid,
    nextStep,
    prevStep,
    handleImagesUploaded,
    publish,
    loading,
    isEditMode,
    vehicleId,
    publicationId,
  };
};
