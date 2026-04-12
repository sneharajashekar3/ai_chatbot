import { useState, useEffect, useRef } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { ChatArea } from '@/components/ChatArea';
import { SettingsDialog } from '@/components/SettingsDialog';
import { storageService, Chat, Message } from '@/lib/storage';
import { streamChat } from '@/lib/gemini';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import { Moon, Sun, PanelLeftOpen, LogIn, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AnimatePresence, motion } from 'motion/react';

function MainApp() {
  const [showIntro, setShowIntro] = useState(true);
  
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('dark');
  const [guardrailsEnabled, setGuardrailsEnabled] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowIntro(false);
    }, 700);
    return () => clearTimeout(timer);
  }, []);

  const isCreatingChat = useRef(false);

  useEffect(() => {
    const unsubscribe = storageService.subscribeToChats(async (fetchedChats) => {
      setChats(fetchedChats);
      if (fetchedChats.length > 0 && !currentChatId) {
        setCurrentChatId(fetchedChats[0].id);
      } else if (fetchedChats.length === 0 && !isCreatingChat.current) {
        isCreatingChat.current = true;
        try {
          const newChatId = await storageService.createChat();
          setCurrentChatId(newChatId);
        } catch (error) {
          console.error("Failed to auto-create chat", error);
        } finally {
          isCreatingChat.current = false;
        }
      }
    });

    return () => unsubscribe();
  }, [currentChatId]);

  useEffect(() => {
    if (!currentChatId) {
      setMessages([]);
      return;
    }

    const unsubscribe = storageService.subscribeToMessages(currentChatId, (fetchedMessages) => {
      setMessages(fetchedMessages);
    });

    return () => unsubscribe();
  }, [currentChatId]);

  useEffect(() => {
    // Theme setup
    const root = window.document.documentElement;
    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      root.classList.remove('light', 'dark');
      root.classList.add(systemTheme);
    } else {
      root.classList.remove('light', 'dark');
      root.classList.add(theme);
    }
  }, [theme]);

  const toggleTheme = (newTheme?: 'light' | 'dark' | 'system') => {
    const root = window.document.documentElement;
    const targetTheme = newTheme || (theme === 'dark' ? 'light' : 'dark');
    
    if (targetTheme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      root.classList.remove('light', 'dark');
      root.classList.add(systemTheme);
    } else {
      root.classList.remove('light', 'dark');
      root.classList.add(targetTheme);
    }
    setTheme(targetTheme);
  };

  const currentChat = chats.find((c) => c.id === currentChatId);

  const handleNewChat = async () => {
    try {
      const newChatId = await storageService.createChat();
      setCurrentChatId(newChatId);
    } catch (error) {
      toast.error('Failed to create new chat');
    }
  };

  const handleDeleteChat = async (id: string) => {
    try {
      await storageService.deleteChat(id);
      if (currentChatId === id) {
        setCurrentChatId(chats.length > 1 ? chats.find(c => c.id !== id)?.id || null : null);
      }
    } catch (error) {
      toast.error('Failed to delete chat');
    }
  };

  const handleUpdateChatTitle = async (id: string, newTitle: string) => {
    try {
      await storageService.updateChat(id, { title: newTitle });
    } catch (error) {
      toast.error('Failed to update chat title');
    }
  };

  const handleSelectModel = async (model: string) => {
    if (currentChatId) {
      try {
        await storageService.updateChat(currentChatId, { model });
      } catch (error) {
        toast.error('Failed to update model');
      }
    }
  };

  const generateResponse = async (chatId: string, model: string, history: { role: 'user' | 'model'; text: string }[], text: string, attachment?: { data: string, mimeType: string }) => {
    setIsGenerating(true);
    try {
      if (['gemini-3.1-flash-image-preview', 'veo-3.1-fast-generate-preview', 'lyria-3-clip-preview'].includes(model)) {
        if (typeof window !== 'undefined' && (window as any).aistudio) {
          const hasKey = await (window as any).aistudio.hasSelectedApiKey();
          if (!hasKey) {
            await (window as any).aistudio.openSelectKey();
          }
        }
      }

      const stream = streamChat(model, history, text, attachment, guardrailsEnabled);
      const modelMessage = await storageService.addMessage(chatId, { role: 'model', text: '' });
      
      let fullText = '';
      let mediaUrl = '';
      let mediaType: 'image' | 'video' | 'audio' | undefined;
      let groundingUrls: string[] = [];

      for await (const chunk of stream) {
        if (chunk.text) fullText += chunk.text;
        if (chunk.mediaUrl) mediaUrl = chunk.mediaUrl;
        if (chunk.mediaType) mediaType = chunk.mediaType;
        if (chunk.groundingUrls) {
          groundingUrls = Array.from(new Set([...groundingUrls, ...chunk.groundingUrls]));
        }

        setMessages(prev => {
          const newMsgs = [...prev];
          const idx = newMsgs.findIndex(m => m.id === modelMessage.id);
          if (idx !== -1) {
            newMsgs[idx] = { 
              ...newMsgs[idx], 
              text: fullText,
              mediaUrl: mediaUrl || undefined,
              mediaType: mediaType || undefined,
              groundingUrls: groundingUrls.length > 0 ? groundingUrls : undefined
            };
          }
          return newMsgs;
        });
      }
      
      await storageService.updateMessageText(chatId, modelMessage.id, fullText);
      if (mediaUrl && mediaType) {
        await storageService.updateMessageMedia(chatId, modelMessage.id, mediaUrl, mediaType);
      }
      if (groundingUrls.length > 0) {
        await storageService.updateMessageGrounding(chatId, modelMessage.id, groundingUrls);
      }
      
    } catch (error: any) {
      console.error('Chat error:', error);
      toast.error(error.message || 'Failed to generate response. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSendMessage = async (text: string, attachment?: { data: string, mimeType: string }) => {
    if (!currentChatId || !currentChat || (!text.trim() && !attachment)) return;

    await storageService.addMessage(currentChatId, { 
      role: 'user', 
      text,
      mediaUrl: attachment ? `data:${attachment.mimeType};base64,${attachment.data}` : undefined,
      mediaType: attachment ? (attachment.mimeType.startsWith('image/') ? 'image' : attachment.mimeType.startsWith('video/') ? 'video' : 'audio') : undefined
    });

    const history = messages.map(m => ({ role: m.role, text: m.text }));
    await generateResponse(currentChatId, currentChat.model, history, text, attachment);
  };

  const handleRegenerate = async () => {
    if (!currentChatId || !currentChat || messages.length < 2) return;
    
    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role === 'model') {
       await storageService.deleteMessage(currentChatId, lastMessage.id);
    }
    
    const lastUserMessage = messages.slice().reverse().find(m => m.role === 'user');
    if (!lastUserMessage) return;

    const history = messages.slice(0, messages.findIndex(m => m.id === lastUserMessage.id)).map(m => ({ role: m.role, text: m.text }));
    
    let attachment: { data: string, mimeType: string } | undefined;
    if (lastUserMessage.mediaUrl && lastUserMessage.mediaUrl.startsWith('data:')) {
       const match = lastUserMessage.mediaUrl.match(/^data:(.*?);base64,(.*)$/);
       if (match) {
         attachment = { mimeType: match[1], data: match[2] };
       }
    }

    await generateResponse(currentChatId, currentChat.model, history, lastUserMessage.text, attachment);
  };

  const handleEditMessage = async (messageId: string, newText: string) => {
    if (!currentChatId || !currentChat) return;
    
    const messageIndex = messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1) return;

    const editedMessage = messages[messageIndex];
    
    // Delete all messages after this one
    const messagesToDelete = messages.slice(messageIndex + 1);
    for (const msg of messagesToDelete) {
      await storageService.deleteMessage(currentChatId, msg.id);
    }

    // Update the edited message
    await storageService.updateMessageText(currentChatId, messageId, newText);

    // Generate new response
    const history = messages.slice(0, messageIndex).map(m => ({ role: m.role, text: m.text }));
    
    let attachment: { data: string, mimeType: string } | undefined;
    if (editedMessage.mediaUrl && editedMessage.mediaUrl.startsWith('data:')) {
       const match = editedMessage.mediaUrl.match(/^data:(.*?);base64,(.*)$/);
       if (match) {
         attachment = { mimeType: match[1], data: match[2] };
       }
    }

    await generateResponse(currentChatId, currentChat.model, history, newText, attachment);
  };

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setIsSidebarOpen(prev => !prev);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'r') {
        e.preventDefault();
        if (!isGenerating) {
          handleRegenerate();
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isGenerating, messages, currentChatId, currentChat]);

  if (showIntro) {
    return (
      <AnimatePresence>
        <motion.div 
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-background text-foreground"
        >
          <motion.div 
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="w-32 h-32 rounded-3xl bg-primary/10 flex items-center justify-center"
          >
            <span className="text-5xl font-bold text-primary tracking-tighter">AI</span>
          </motion.div>
        </motion.div>
      </AnimatePresence>
    );
  }

  return (
    <div className="flex h-screen w-full bg-background text-foreground overflow-hidden">
      {isSidebarOpen && (
        <Sidebar
          chats={chats}
          currentChatId={currentChatId}
          onSelectChat={setCurrentChatId}
          onNewChat={handleNewChat}
          onDeleteChat={handleDeleteChat}
          onUpdateChatTitle={handleUpdateChatTitle}
          onOpenSettings={() => setIsSettingsOpen(true)}
          toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        />
      )}
      
      <main className="flex-1 flex flex-col relative">
        
        {currentChat ? (
          <ChatArea
            messages={messages}
            isGenerating={isGenerating}
            onSendMessage={handleSendMessage}
            onRegenerate={handleRegenerate}
            onEditMessage={handleEditMessage}
            selectedModel={currentChat.model}
            onSelectModel={handleSelectModel}
            chats={chats}
            currentChatId={currentChatId}
            onSelectChat={setCurrentChatId}
            onNewChat={handleNewChat}
            onDeleteChat={handleDeleteChat}
            onUpdateChatTitle={handleUpdateChatTitle}
            onOpenSettings={() => setIsSettingsOpen(true)}
            isSidebarOpen={isSidebarOpen}
            toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-6 p-4 text-center">
            {!isSidebarOpen && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="absolute top-4 left-4 hidden md:flex h-9 w-9 text-muted-foreground hover:text-foreground" 
                onClick={() => setIsSidebarOpen(true)}
              >
                <PanelLeftOpen className="w-5 h-5" />
              </Button>
            )}
            <div className="w-24 h-24 sm:w-32 sm:h-32 mb-4 relative flex items-center justify-center">
              <div className="absolute inset-0 bg-primary/20 rounded-full blur-2xl animate-pulse"></div>
              <Sparkles className="w-12 h-12 sm:w-16 sm:h-16 text-primary relative z-10" />
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
              Welcome to BK's AI Chat!
            </h1>
            <p className="text-muted-foreground max-w-md mb-4">
              Experience the power of multiple AI models, voice dictation, and seamless file attachments in one place.
            </p>
            <Button onClick={handleNewChat} size="lg" className="rounded-full px-8">
              Start a new chat
            </Button>
          </div>
        )}
      </main>
      <Toaster />
      <SettingsDialog 
        open={isSettingsOpen} 
        onOpenChange={setIsSettingsOpen} 
        theme={theme}
        onThemeChange={toggleTheme}
        guardrailsEnabled={guardrailsEnabled}
        onGuardrailsChange={setGuardrailsEnabled}
      />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <MainApp />
    </ErrorBoundary>
  );
}
