import React, { createContext, useCallback, useContext, useState } from 'react';

type ChatContextType = {
  chatOpen: boolean;
  toggleChat: () => void;
  closeChat: () => void;
};

const ChatContext = createContext<ChatContextType>({
  chatOpen: false,
  toggleChat: () => {},
  closeChat: () => {},
});

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [chatOpen, setChatOpen] = useState(false);
  const toggleChat = useCallback(() => setChatOpen(prev => !prev), []);
  const closeChat = useCallback(() => setChatOpen(false), []);

  return (
    <ChatContext.Provider value={{ chatOpen, toggleChat, closeChat }}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  return useContext(ChatContext);
}
