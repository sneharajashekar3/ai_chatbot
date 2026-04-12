import { v4 as uuidv4 } from 'uuid';

export type Role = 'user' | 'model';

export interface Message {
  id: string;
  role: Role;
  text: string;
  createdAt: number;
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'audio';
  groundingUrls?: string[];
}

export interface Chat {
  id: string;
  title: string;
  model: string;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
}

const STORAGE_KEY = 'ai_chat_sessions';

function getChatsFromStorage(): Chat[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) {
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('Failed to parse chats from local storage', e);
  }
  return [];
}

function saveChatsToStorage(chats: Chat[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
  } catch (e) {
    console.error('Failed to save chats to local storage', e);
  }
}

// Simple event emitter for local storage changes
type Listener = () => void;
const listeners: Set<Listener> = new Set();

function notifyListeners() {
  listeners.forEach(listener => listener());
}

export const storageService = {
  subscribeToChats: (callback: (chats: Chat[]) => void) => {
    const listener = () => {
      const chats = getChatsFromStorage();
      // Sort by updatedAt desc
      chats.sort((a, b) => b.updatedAt - a.updatedAt);
      // Return chats without messages for the list
      callback(chats.map(c => ({ ...c, messages: [] })));
    };
    
    listeners.add(listener);
    listener(); // Initial call
    
    return () => {
      listeners.delete(listener);
    };
  },

  subscribeToMessages: (chatId: string, callback: (messages: Message[]) => void) => {
    const listener = () => {
      const chats = getChatsFromStorage();
      const chat = chats.find(c => c.id === chatId);
      if (chat) {
        // Sort by createdAt asc
        const messages = [...chat.messages].sort((a, b) => a.createdAt - b.createdAt);
        callback(messages);
      } else {
        callback([]);
      }
    };
    
    listeners.add(listener);
    listener(); // Initial call
    
    return () => {
      listeners.delete(listener);
    };
  },

  createChat: async (model: string = 'gemini-3-flash-preview'): Promise<string> => {
    const chats = getChatsFromStorage();
    const chatId = uuidv4();
    const newChat: Chat = {
      id: chatId,
      title: 'New Chat',
      model,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
    };
    chats.push(newChat);
    saveChatsToStorage(chats);
    notifyListeners();
    return chatId;
  },

  updateChat: async (chatId: string, updates: Partial<Chat>) => {
    const chats = getChatsFromStorage();
    const chatIndex = chats.findIndex(c => c.id === chatId);
    if (chatIndex !== -1) {
      chats[chatIndex] = {
        ...chats[chatIndex],
        ...updates,
        updatedAt: Date.now(),
      };
      saveChatsToStorage(chats);
      notifyListeners();
    }
  },

  deleteChat: async (chatId: string) => {
    let chats = getChatsFromStorage();
    chats = chats.filter(c => c.id !== chatId);
    saveChatsToStorage(chats);
    notifyListeners();
  },

  addMessage: async (chatId: string, message: Omit<Message, 'id' | 'createdAt'>): Promise<Message> => {
    const chats = getChatsFromStorage();
    const chatIndex = chats.findIndex(c => c.id === chatId);
    
    if (chatIndex !== -1) {
      const messageId = uuidv4();
      const newMessage: Message = {
        ...message,
        id: messageId,
        createdAt: Date.now(),
      };
      
      chats[chatIndex].messages.push(newMessage);
      chats[chatIndex].updatedAt = Date.now();
      
      // Auto-generate title if it's the first user message
      if (chats[chatIndex].title === 'New Chat' && message.role === 'user') {
        chats[chatIndex].title = message.text.slice(0, 30) + (message.text.length > 30 ? '...' : '');
      }
      
      saveChatsToStorage(chats);
      notifyListeners();
      return newMessage;
    }
    throw new Error('Chat not found');
  },
  
  updateMessageText: async (chatId: string, messageId: string, text: string) => {
    const chats = getChatsFromStorage();
    const chatIndex = chats.findIndex(c => c.id === chatId);
    if (chatIndex !== -1) {
      const msgIndex = chats[chatIndex].messages.findIndex(m => m.id === messageId);
      if (msgIndex !== -1) {
        chats[chatIndex].messages[msgIndex].text = text;
        saveChatsToStorage(chats);
        notifyListeners();
      }
    }
  },

  updateMessageMedia: async (chatId: string, messageId: string, mediaUrl: string, mediaType: 'image' | 'video' | 'audio') => {
    const chats = getChatsFromStorage();
    const chatIndex = chats.findIndex(c => c.id === chatId);
    if (chatIndex !== -1) {
      const msgIndex = chats[chatIndex].messages.findIndex(m => m.id === messageId);
      if (msgIndex !== -1) {
        chats[chatIndex].messages[msgIndex].mediaUrl = mediaUrl;
        chats[chatIndex].messages[msgIndex].mediaType = mediaType;
        saveChatsToStorage(chats);
        notifyListeners();
      }
    }
  },

  updateMessageGrounding: async (chatId: string, messageId: string, groundingUrls: string[]) => {
    const chats = getChatsFromStorage();
    const chatIndex = chats.findIndex(c => c.id === chatId);
    if (chatIndex !== -1) {
      const msgIndex = chats[chatIndex].messages.findIndex(m => m.id === messageId);
      if (msgIndex !== -1) {
        chats[chatIndex].messages[msgIndex].groundingUrls = groundingUrls;
        saveChatsToStorage(chats);
        notifyListeners();
      }
    }
  },

  deleteMessage: async (chatId: string, messageId: string) => {
    const chats = getChatsFromStorage();
    const chatIndex = chats.findIndex(c => c.id === chatId);
    if (chatIndex !== -1) {
      chats[chatIndex].messages = chats[chatIndex].messages.filter(m => m.id !== messageId);
      saveChatsToStorage(chats);
      notifyListeners();
    }
  }
};
