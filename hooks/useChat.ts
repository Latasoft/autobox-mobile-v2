import { useState, useEffect, useRef, useCallback } from 'react';
import apiService from '../services/apiService';
import authService from '../services/authService';
import socketService from '../services/socketService';

export function useChatList() {
  const [chats, setChats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadChats();

    // Escuchar nuevos mensajes para refrescar la lista de conversaciones
    const handleNewMessage = () => {
      loadChats();
    };

    const handleMessageSent = () => {
      loadChats();
    };

    socketService.on('new_message', handleNewMessage);
    socketService.on('message_sent', handleMessageSent);

    return () => {
      socketService.off('new_message', handleNewMessage);
      socketService.off('message_sent', handleMessageSent);
    };
  }, []);

  const loadChats = async () => {
    try {
      setLoading(true);
      const data = await apiService.getChats();
      // Sort by date DESC (Newest activity first)
      const sorted = (data || []).sort((a, b) => {
        const dateA = new Date(a.lastMessageDate || 0).getTime();
        const dateB = new Date(b.lastMessageDate || 0).getTime();
        return dateB - dateA;
      });
      setChats(sorted);
    } catch (error) {
      console.error('Error loading chats:', error);
    } finally {
      setLoading(false);
    }
  };

  return {
    chats,
    loading,
    refresh: loadChats
  };
}

export function useChatMessages(chatId: string) {
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const currentUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (chatId) {
      loadMessages();
    }

    // Escuchar mensajes entrantes en tiempo real vía WebSocket
    const handleNewMessage = (data: any) => {
      if (!data) return;
      // Solo agregar si el mensaje pertenece a esta conversación
      const senderId = data.remitenteId || data.senderId;
      if (senderId === chatId) {
        const mappedMessage = {
          id: data.id,
          text: data.contenido || data.mensaje || data.message,
          createdAt: data.fechaCreacion || data.createdAt || new Date().toISOString(),
          isMe: false
        };
        setMessages(prev => {
          // Evitar duplicados
          if (prev.some(m => m.id === mappedMessage.id)) return prev;
          return [mappedMessage, ...prev];
        });

        // Marcar como leído ya que estamos viendo la conversación
        socketService.markAsRead(chatId).catch(() => {});
        apiService.markConversationAsRead(chatId).catch(() => {});
        socketService.loadConversations();
      }
    };

    // Confirmación de mensaje enviado vía WebSocket
    const handleMessageSent = (data: any) => {
      if (!data) return;
      const receiverId = data.destinatarioId || data.receiverId;
      if (receiverId === chatId) {
        const mappedMessage = {
          id: data.id,
          text: data.contenido || data.mensaje || data.message,
          createdAt: data.fechaCreacion || data.createdAt || new Date().toISOString(),
          isMe: true
        };
        setMessages(prev => {
          // Reemplazar mensaje temporal o evitar duplicados
          if (prev.some(m => m.id === mappedMessage.id)) return prev;
          return [mappedMessage, ...prev];
        });
      }
    };

    socketService.on('new_message', handleNewMessage);
    socketService.on('message_sent', handleMessageSent);

    return () => {
      socketService.off('new_message', handleNewMessage);
      socketService.off('message_sent', handleMessageSent);
    };
  }, [chatId]);

  const loadMessages = async () => {
    try {
      setLoading(true);
      const [data, user] = await Promise.all([
        apiService.getMessages(chatId),
        authService.getUser()
      ]);

      if (user) {
        currentUserIdRef.current = user.id;
      }
      
      if (data && Array.isArray(data)) {
        const mappedMessages = data.map(msg => ({
          id: msg.id,
          text: msg.mensaje,
          createdAt: msg.fechaCreacion,
          isMe: msg.remitenteId === user?.id
        })).reverse(); // Reverse to have newest first for Inverted FlatList
        setMessages(mappedMessages);

        if (user) {
          apiService.markConversationAsRead(chatId).then(() => {
            // Trigger global refresh to update badges
            socketService.loadConversations();
          }).catch(err => 
            console.error('Error marking as read inside hook:', err)
          );
        }
      }
    } catch (error) {
      console.error('Error loading messages:', error);
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async (text: string) => {
    if (!text.trim()) return;
    try {
      setSending(true);

      // Guardar via REST (persiste en BD)
      const newMessage = await apiService.sendMessage(chatId, text);
      
      const mappedMessage = {
        id: newMessage.id,
        text: newMessage.mensaje,
        createdAt: newMessage.fechaCreacion,
        isMe: true
      };
      
      // Prepend message because FlatList is inverted (Index 0 is at bottom)
      setMessages(prev => [mappedMessage, ...prev]);

      // Emitir vía WebSocket para entrega en tiempo real al destinatario
      socketService.sendMessage(chatId, text).catch(err =>
        console.error('Error sending via WebSocket:', err)
      );
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setSending(false);
    }
  };

  return {
    messages,
    loading,
    sending,
    sendMessage
  };
}
