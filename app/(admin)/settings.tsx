import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import adminService, { GlobalSettings } from '../../services/adminService';
import { Screen } from '../../components/ui/Screen';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';

export default function SettingsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<GlobalSettings>({
    pricing: {
      inspectionPrice: 0,
      publicationPrice: 0,
      mechanicBonus: 0,
    },
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const data = await adminService.getGlobalSettings();
      setSettings(data);
    } catch (error) {
      console.error('Error loading settings:', error);
      Alert.alert('Error', 'No se pudo cargar la configuración');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await adminService.updateGlobalSettings(settings);
      Alert.alert('Éxito', 'Configuración guardada correctamente');
    } catch (error) {
      console.error('Error saving settings:', error);
      Alert.alert('Error', 'No se pudo guardar la configuración');
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (section: keyof GlobalSettings, field: string, value: string | number) => {
    setSettings(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: value,
      },
    }));
  };

  return (
    <Screen style={styles.container}>
      <Stack.Screen 
        options={{
          title: 'Configuración',
          headerStyle: { backgroundColor: '#fff' },
          headerShadowVisible: false,
        }} 
      />

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Horarios de Atención</Text>
            <Button 
              title="Gestionar Horario de Sede"
              onPress={() => router.push('/(admin)/sede-schedule')}
              variant="outline"
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Precios</Text>
            <Input
              label="Precio Inspección"
              value={settings.pricing.inspectionPrice.toString()}
              onChangeText={(text) => handleChange('pricing', 'inspectionPrice', parseInt(text) || 0)}
              keyboardType="numeric"
              leftIcon={<Text style={styles.currencyPrefix}>$</Text>}
            />
            <Input
              label="Precio Publicación"
              value={settings.pricing.publicationPrice.toString()}
              onChangeText={(text) => handleChange('pricing', 'publicationPrice', parseInt(text) || 0)}
              keyboardType="numeric"
              leftIcon={<Text style={styles.currencyPrefix}>$</Text>}
            />

            <Input
              label="Bonificación Mecánico (%)"
              value={settings.pricing.mechanicBonus ? (settings.pricing.mechanicBonus * 100).toFixed(0) : '0'}
              onChangeText={(text) => {
                const percentage = parseFloat(text);
                if (!isNaN(percentage)) {
                  handleChange('pricing', 'mechanicBonus', percentage / 100);
                } else {
                  handleChange('pricing', 'mechanicBonus', 0);
                }
              }}
              keyboardType="numeric"
              placeholder="Ej: 10, 20, 30"
              rightIcon={<Text style={styles.currencyPrefix}>%</Text>}
            />
          </View>

          <Button
            title="Guardar Cambios"
            onPress={handleSave}
            loading={saving}
            style={styles.saveButton}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  content: {
    padding: 16,
  },
  section: {
    backgroundColor: '#FFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    gap: 16,
  },
  halfInput: {
    flex: 1,
  },
  currencyPrefix: {
    fontSize: 16,
    color: '#666',
    marginRight: 8,
  },
  saveButton: {
    marginTop: 8,
    marginBottom: 32,
  },
});
