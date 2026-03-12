import React from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../components/ui/Screen';
import { useChatList } from '../../hooks/useChat';
import { getImageUrl } from '../../utils/imageUtils';

export default function AdminChatListScreen() {
  const router = useRouter();
  const { chats, loading, refresh } = useChatList();

  const renderChat = ({ item }: { item: any }) => {
    const otherUser = item.user || {};
    const fullName = `${otherUser.primerNombre || ''} ${otherUser.primerApellido || ''}`.trim() || 'Usuario';
    const avatarUrl = otherUser.foto_url;
    const lastMessageText = typeof item.lastMessage === 'string' ? item.lastMessage : item.lastMessage?.text || '';
    const lastMessageDate = item.lastMessageDate || item.lastMessage?.createdAt;

    return (
      <TouchableOpacity 
        style={styles.chatItem}
        onPress={() => router.push({
          pathname: '/(admin)/chat-detail' as any,
          params: { 
            chatId: item.userId, 
            userName: fullName,
            userAvatar: avatarUrl 
          }
        })}
      >
        <View style={styles.avatarContainer}>
          {avatarUrl ? (
            <Image source={{ uri: getImageUrl(avatarUrl) }} style={styles.avatar} />
          ) : (
            <View style={styles.placeholderAvatar}>
              <Text style={styles.avatarText}>{fullName.charAt(0)}</Text>
            </View>
          )}
        </View>
        <View style={styles.contentContainer}>
          <View style={styles.topRow}>
            <Text style={styles.userName}>{fullName}</Text>
            <Text style={styles.date}>
              {lastMessageDate ? new Date(lastMessageDate).toLocaleDateString() : ''}
            </Text>
          </View>
          <View style={styles.messageRow}>
            <Text 
              style={[
                styles.lastMessage, 
                item.unreadCount > 0 && styles.lastMessageBold
              ]} 
              numberOfLines={1}
            >
              {lastMessageText}
            </Text>
            {item.unreadCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{item.unreadCount}</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <Screen backgroundColor="#F5F5F5">
      <FlatList
        data={chats}
        keyExtractor={(item) => item.userId.toString()}
        renderItem={renderChat}
        refreshing={loading}
        onRefresh={refresh}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="chatbubbles-outline" size={64} color="#CCC" />
            <Text style={styles.emptyText}>No tienes conversaciones</Text>
          </View>
        }
        contentContainerStyle={styles.listContent}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  listContent: {
    padding: 16,
  },
  chatItem: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  avatarContainer: {
    marginRight: 16,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  placeholderAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#E3F2FD',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#007bff',
  },
  contentContainer: {
    flex: 1,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  userName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  date: {
    fontSize: 12,
    color: '#999',
  },
  lastMessage: {
    fontSize: 14,
    color: '#666',
    flex: 1,
  },
  messageRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  lastMessageBold: {
    fontWeight: 'bold',
    color: '#333',
  },
  badge: {
    backgroundColor: '#F44336',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
    marginLeft: 8,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 48,
  },
  emptyText: {
    marginTop: 12,
    fontSize: 16,
    color: '#999',
  },
});
