import React, { createContext, useCallback, useContext, useState } from 'react';

type PendingMessage = {
  text: string;
  id: number;
} | null;

type ChatContextType = {
  chatOpen: boolean;
  toggleChat: () => void;
  closeChat: () => void;
  openChatWithMessage: (message: string) => void;
  pendingMessage: PendingMessage;
  clearPendingMessage: (id: number) => void;
};

const ChatContext = createContext<ChatContextType>({
  chatOpen: false,
  toggleChat: () => {},
  closeChat: () => {},
  openChatWithMessage: () => {},
  pendingMessage: null,
  clearPendingMessage: () => {},
});

let pendingIdCounter = 0;

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [chatOpen, setChatOpen] = useState(false);
  const [pendingMessage, setPendingMessage] = useState<PendingMessage>(null);
  const toggleChat = useCallback(() => setChatOpen(prev => !prev), []);
  const closeChat = useCallback(() => setChatOpen(false), []);

  const openChatWithMessage = useCallback((message: string) => {
    setPendingMessage({ text: message, id: ++pendingIdCounter });
    setChatOpen(true);
  }, []);

  const clearPendingMessage = useCallback((id: number) => {
    setPendingMessage(prev => (prev && prev.id === id ? null : prev));
  }, []);

  return (
    <ChatContext.Provider value={{ chatOpen, toggleChat, closeChat, openChatWithMessage, pendingMessage, clearPendingMessage }}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  return useContext(ChatContext);
}
