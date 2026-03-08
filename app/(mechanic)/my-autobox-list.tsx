import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../components/ui/Screen';
import mechanicSedeService, { MechanicWorkingSede } from '../../services/mechanicSedeService';

export default function MechanicMyAutoboxListScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [sedes, setSedes] = useState<MechanicWorkingSede[]>([]);
  const [workingSedeIds, setWorkingSedeIds] = useState<number[]>([]);
  const [blockedSedeIds, setBlockedSedeIds] = useState<number[]>([]);

  const loadData = async () => {
    try {
      setLoading(true);
      const mechanicId = await mechanicSedeService.getCurrentMechanicId();
      const [allSedes, mySedes, blocked] = await Promise.all([
        mechanicSedeService.getSedesWithActiveSchedule(),
        mechanicSedeService.getMyWorkingSedes(),
        mechanicSedeService.getBlockedSedes(mechanicId),
      ]);

      setSedes(allSedes);
      setWorkingSedeIds(mySedes.map((item) => item.id));
      setBlockedSedeIds(blocked);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const list = useMemo(() => sedes, [sedes]);

  return (
    <Screen style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Mis Autobox</Text>
        <Text style={styles.subtitle}>Autobox donde estás trabajando actualmente.</Text>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FF9800" />
        </View>
      ) : (
        <FlatList
          data={list}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.content}
          renderItem={({ item }) => {
            const isWorking = workingSedeIds.includes(item.id);
            const isBlocked = blockedSedeIds.includes(item.id);
            const isSelectable = isWorking && !isBlocked;

            return (
              <TouchableOpacity
                style={[styles.card, !isSelectable && styles.cardDisabled]}
                onPress={() =>
                  isSelectable &&
                  router.push({
                    pathname: '/(mechanic)/schedule',
                    params: { sedeId: String(item.id) },
                  })
                }
                disabled={!isSelectable}
              >
                <View style={styles.cardLeft}>
                  <Ionicons name="storefront-outline" size={20} color={isSelectable ? '#FF9800' : '#B0B0B0'} />
                  <View style={styles.cardInfo}>
                    <Text style={[styles.cardTitle, !isSelectable && styles.disabledText]}>{item.nombre}</Text>
                    <Text style={[styles.cardMeta, !isSelectable && styles.disabledText]}>ID: {item.id}</Text>
                    {!!item.direccion && <Text style={[styles.cardAddress, !isSelectable && styles.disabledText]}>{item.direccion}</Text>}
                    {!isWorking && <Text style={styles.statusHint}>No asignada</Text>}
                    {isBlocked && <Text style={styles.statusHintBlocked}>Bloqueada</Text>}
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={18} color={isSelectable ? '#999' : '#D0D0D0'} />
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>No tienes Autobox asignados todavía.</Text>
            </View>
          }
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    backgroundColor: '#FFF',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#222',
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    color: '#777',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    padding: 16,
    gap: 10,
  },
  card: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#EEE',
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardDisabled: {
    backgroundColor: '#F9F9F9',
  },
  cardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  cardInfo: {
    marginLeft: 10,
    flex: 1,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#232323',
  },
  cardMeta: {
    marginTop: 3,
    color: '#666',
    fontSize: 12,
  },
  cardAddress: {
    marginTop: 2,
    color: '#555',
    fontSize: 12,
  },
  disabledText: {
    color: '#A8A8A8',
  },
  statusHint: {
    marginTop: 4,
    fontSize: 12,
    color: '#9E9E9E',
    fontWeight: '600',
  },
  statusHintBlocked: {
    marginTop: 4,
    fontSize: 12,
    color: '#B71C1C',
    fontWeight: '700',
  },
  emptyWrap: {
    paddingTop: 50,
    alignItems: 'center',
  },
  emptyText: {
    color: '#777',
  },
});
