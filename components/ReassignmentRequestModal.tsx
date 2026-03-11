import React from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

interface ReassignmentRequestModalProps {
  visible: boolean;
  title: string;
  subtitle: string;
  placeholder: string;
  value: string;
  maxLength?: number;
  loading?: boolean;
  primaryLabel: string;
  secondaryLabel?: string;
  colors: {
    primary: string;
    light: string;
    border: string;
    text: string;
  };
  onChangeText: (text: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}

export default function ReassignmentRequestModal({
  visible,
  title,
  subtitle,
  placeholder,
  value,
  maxLength = 250,
  loading = false,
  primaryLabel,
  secondaryLabel = 'Cancelar',
  colors,
  onChangeText,
  onSubmit,
  onClose,
}: ReassignmentRequestModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.content, { borderColor: colors.border }]}> 
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>

          <TextInput
            style={styles.input}
            placeholder={placeholder}
            multiline
            maxLength={maxLength}
            value={value}
            onChangeText={onChangeText}
          />

          <Text style={styles.counter}>{value.length}/{maxLength}</Text>

          <View style={styles.row}>
            <TouchableOpacity style={[styles.button, styles.secondary]} onPress={onClose} disabled={loading}>
              <Text style={styles.secondaryText}>{secondaryLabel}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, { backgroundColor: colors.primary }, loading && styles.disabled]}
              onPress={onSubmit}
              disabled={loading}
            >
              {loading ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.primaryText}>{primaryLabel}</Text>}
            </TouchableOpacity>
          </View>

          <View style={[styles.accent, { backgroundColor: colors.light }]} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 20,
  },
  content: {
    backgroundColor: '#FFF',
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
  },
  title: {
    fontSize: 19,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    color: '#666',
    fontSize: 14,
    marginBottom: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 10,
    minHeight: 100,
    textAlignVertical: 'top',
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: '#333',
    backgroundColor: '#FAFAFA',
  },
  counter: {
    marginTop: 6,
    textAlign: 'right',
    color: '#888',
    fontSize: 12,
  },
  row: {
    flexDirection: 'row',
    marginTop: 14,
    gap: 8,
  },
  button: {
    flex: 1,
    height: 42,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondary: {
    backgroundColor: '#F0F0F0',
    borderWidth: 1,
    borderColor: '#DDD',
  },
  secondaryText: {
    color: '#555',
    fontWeight: '600',
  },
  primaryText: {
    color: '#FFF',
    fontWeight: '700',
  },
  disabled: {
    opacity: 0.7,
  },
  accent: {
    height: 3,
    borderRadius: 2,
    marginTop: 12,
  },
});
