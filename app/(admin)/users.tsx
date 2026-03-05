import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
  Image,
  TextInput,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../components/ui/Screen';
import adminService from '../../services/adminService';
import { User } from '../../types';
import { getImageUrl } from '../../utils/imageUtils';

type RolFilter   = 'todos' | 'Administrador' | 'Mecánico' | 'Usuario';
type EstadoFilter = 'todos' | 'activo' | 'inactivo';

const ROL_FILTERS: { key: RolFilter; label: string; color: string }[] = [
  { key: 'todos',         label: 'Todos',     color: '#607D8B' },
  { key: 'Usuario',       label: 'Usuarios',  color: '#4CAF50' },
  { key: 'Mecánico',      label: 'Mecánicos', color: '#2196F3' },
  { key: 'Administrador', label: 'Admins',    color: '#F44336' },
];

const ESTADO_FILTERS: { key: EstadoFilter; label: string; color: string }[] = [
  { key: 'todos',     label: 'Todos',      color: '#607D8B' },
  { key: 'activo',    label: 'Activos',    color: '#4CAF50' },
  { key: 'inactivo',  label: 'Inactivos',  color: '#FF9800' },
];

export default function UsersScreen() {
  const router = useRouter();

  const [allUsers, setAllUsers]       = useState<any[]>([]);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [search, setSearch]           = useState('');
  const [rolFilter, setRolFilter]         = useState<RolFilter>('todos');
  const [estadoFilter, setEstadoFilter]   = useState<EstadoFilter>('todos');

  // ── Carga de datos ─────────────────────────────────────────────────────────
  const loadUsers = async () => {
    try {
      setLoading(true);
      const data: any = await adminService.getUsers();

      let list: any[] = [];
      if (Array.isArray(data)) {
        list = data;
      } else if (data?.usuarios) {
        list = [
          ...(data.usuarios        || []),
          ...(data.mecanicos       || []),
          ...(data.administradores || []),
        ];
      }

      setAllUsers(list);
    } catch (error) {
      console.error('Error loading users:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadUsers(); }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadUsers();
    setRefreshing(false);
  };

  // ── Filtrado reactivo (client-side) ────────────────────────────────────────
  const filteredUsers: any[] = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allUsers.filter(u => {
      if (rolFilter !== 'todos' && u.rol !== rolFilter) return false;
      const estado: string = u.estado || 'activo';
      if (estadoFilter !== 'todos' && estado !== estadoFilter) return false;
      if (q) {
        const fullName = `${u.primerNombre || ''} ${u.primerApellido || ''}`.toLowerCase();
        const email    = (u.email    || '').toLowerCase();
        const telefono = (u.telefono || '').toLowerCase();
        if (!fullName.includes(q) && !email.includes(q) && !telefono.includes(q)) return false;
      }
      return true;
    });
  }, [allUsers, rolFilter, estadoFilter, search]);

  const handleUserPress = (user: any) => {
    router.push({ pathname: '/(admin)/user-detail', params: { id: user.id } });
  };

  const handleDeleteUser = (user: any) => {
    Alert.alert(
      'Eliminar Usuario',
      `¿Seguro que deseas eliminar definitivamente a ${user.primerNombre || ''} ${user.primerApellido || ''}? Esta acción no se puede deshacer.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              await adminService.deleteUser(user.id);
              Alert.alert('Éxito', 'Usuario eliminado correctamente');
              await loadUsers();
            } catch (error: any) {
              Alert.alert('Error', error?.message || 'No se pudo eliminar el usuario');
            }
          },
        },
      ]
    );
  };

  // ── Badges ─────────────────────────────────────────────────────────────────
  const getRoleBadge = (role: string) => {
    const map: Record<string, { color: string; label: string }> = {
      Administrador: { color: '#F44336', label: 'Admin' },
      Mecánico:      { color: '#2196F3', label: 'Mecánico' },
      Usuario:       { color: '#4CAF50', label: 'Usuario' },
    };
    const cfg = map[role] ?? { color: '#757575', label: role || 'Usuario' };
    return (
      <View style={[styles.badge, { backgroundColor: cfg.color }]}>
        <Text style={styles.badgeText}>{cfg.label}</Text>
      </View>
    );
  };

  const getEstadoBadge = (estado?: string) => {
    if (!estado || estado === 'activo') return null;
    const map: Record<string, { color: string; label: string }> = {
      inactivo:  { color: '#FF9800', label: 'Inactivo' },
      bloqueado: { color: '#F44336', label: 'Bloqueado' },
    };
    const cfg = map[estado];
    if (!cfg) return null;
    return (
      <View style={[styles.badge, { backgroundColor: cfg.color }]}>
        <Text style={styles.badgeText}>{cfg.label}</Text>
      </View>
    );
  };

  // ── Chips helper ───────────────────────────────────────────────────────────
  const renderChips = (
    items: { key: string; label: string; color: string }[],
    active: string,
    onSelect: (k: any) => void,
  ) => (
    <View style={styles.chipsRow}>
      {items.map(it => {
        const isActive = it.key === active;
        return (
          <TouchableOpacity
            key={it.key}
            onPress={() => onSelect(it.key)}
            style={[styles.chip, isActive ? { backgroundColor: it.color } : styles.chipInactive]}
            activeOpacity={0.8}
          >
            <Text style={[styles.chipText, isActive && styles.chipTextActive]}>{it.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  // ── Item ───────────────────────────────────────────────────────────────────
  const renderItem = ({ item }: { item: any }) => (
    <TouchableOpacity style={styles.card} onPress={() => handleUserPress(item)} activeOpacity={0.85}>
      <View style={styles.row}>
        <View style={styles.avatarContainer}>
          {item.foto_url ? (
            <Image source={{ uri: getImageUrl(item.foto_url) }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarInitial}>{item.primerNombre?.[0] || item.email?.[0] || '?'}</Text>
            </View>
          )}
        </View>
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={1}>{item.primerNombre} {item.primerApellido}</Text>
          <Text style={styles.email} numberOfLines={1}>{item.email}</Text>
          <Text style={styles.phone}>{item.telefono || 'Sin teléfono'}</Text>
        </View>
        <View style={styles.right}>
          {getRoleBadge(item.rol)}
          {getEstadoBadge(item.estado)}
          <View style={styles.actionsRight}>
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation();
                handleDeleteUser(item);
              }}
              style={styles.deleteAction}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Ionicons name="trash-outline" size={16} color="#F44336" />
            </TouchableOpacity>
            <Ionicons name="chevron-forward" size={18} color="#ccc" style={{ marginTop: 0 }} />
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <Screen backgroundColor="#F5F5F5" style={{ flex: 1 }}>

      {/* Cabecera */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Gestión de Usuarios</Text>
        <View style={styles.headerCountBadge}>
          <Text style={styles.headerCountText}>{allUsers.length}</Text>
        </View>
      </View>

      {/* Buscador */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={18} color="#999" style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar por nombre, email o teléfono…"
            placeholderTextColor="#bbb"
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={18} color="#bbb" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Filtros */}
      <View style={styles.filtersContainer}>
        <Text style={styles.filterLabel}>Rol</Text>
        {renderChips(ROL_FILTERS, rolFilter, setRolFilter)}
        <Text style={[styles.filterLabel, { marginTop: 10 }]}>Estado</Text>
        {renderChips(ESTADO_FILTERS, estadoFilter, setEstadoFilter)}
      </View>

      {/* Conteo de resultados */}
      {!loading && (
        <View style={styles.resultsBar}>
          <Text style={styles.resultsText}>
            {filteredUsers.length === 1
              ? '1 usuario encontrado'
              : `${filteredUsers.length} usuarios encontrados`}
          </Text>
        </View>
      )}

      {/* Lista */}
      {loading && !refreshing ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#007bff" />
        </View>
      ) : (
        <FlatList
          data={filteredUsers}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={[
            styles.listContent,
            filteredUsers.length === 0 && { flex: 1 },
          ]}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="people-outline" size={56} color="#ddd" />
              <Text style={styles.emptyTitle}>Sin resultados</Text>
              <Text style={styles.emptyText}>
                {search
                  ? 'No se encontraron usuarios con ese criterio.'
                  : 'No hay usuarios para los filtros seleccionados.'}
              </Text>
            </View>
          }
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  // Header
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 13,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee', gap: 10,
  },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#333', flex: 1 },
  headerCountBadge: {
    backgroundColor: '#007bff', borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 3, minWidth: 28, alignItems: 'center',
  },
  headerCountText: { color: '#fff', fontSize: 13, fontWeight: 'bold' },

  // Search
  searchContainer: {
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  searchBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F5F5F5', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9,
  },
  searchInput: { flex: 1, fontSize: 15, color: '#333', padding: 0 },

  // Filters
  filtersContainer: {
    backgroundColor: '#fff', paddingHorizontal: 16,
    paddingTop: 10, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: '#eee',
  },
  filterLabel: {
    fontSize: 11, fontWeight: '700', color: '#999',
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6,
  },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, borderWidth: 1.5, borderColor: 'transparent' },
  chipInactive: { backgroundColor: '#F5F5F5', borderColor: '#E0E0E0' },
  chipText: { fontSize: 12, fontWeight: '600', color: '#888' },
  chipTextActive: { color: '#fff' },

  // Results bar
  resultsBar: { paddingHorizontal: 16, paddingVertical: 8 },
  resultsText: { fontSize: 12, color: '#999', fontWeight: '500' },

  // List
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 40 },
  listContent: { padding: 16, paddingBottom: 32 },
  card: {
    backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08, shadowRadius: 3, elevation: 2,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  avatarContainer: { marginRight: 12 },
  avatar: { width: 50, height: 50, borderRadius: 25 },
  avatarPlaceholder: {
    width: 50, height: 50, borderRadius: 25, backgroundColor: '#E0E0E0',
    justifyContent: 'center', alignItems: 'center',
  },
  avatarInitial: { fontSize: 20, fontWeight: 'bold', color: '#757575' },
  info: { flex: 1 },
  name: { fontSize: 15, fontWeight: 'bold', color: '#333' },
  email: { fontSize: 13, color: '#666', marginTop: 1 },
  phone: { fontSize: 12, color: '#999', marginTop: 1 },
  right: { alignItems: 'flex-end', justifyContent: 'space-between', gap: 4 },
  actionsRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  deleteAction: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FDECEC',
  },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },

  // Empty
  emptyTitle: { fontSize: 16, fontWeight: 'bold', color: '#bbb', marginTop: 12 },
  emptyText: {
    fontSize: 13, color: '#ccc', marginTop: 4,
    textAlign: 'center', paddingHorizontal: 32, lineHeight: 20,
  },
});