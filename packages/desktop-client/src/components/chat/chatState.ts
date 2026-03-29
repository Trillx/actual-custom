import type { ChatMessage } from './types';

let sessionMessages: ChatMessage[] = [];

export function getSessionMessages(): ChatMessage[] {
  return sessionMessages;
}

export function setSessionMessages(messages: ChatMessage[]): void {
  sessionMessages = messages;
}

export function addSessionMessage(message: ChatMessage): void {
  sessionMessages = [...sessionMessages, message];
}

export function updateSessionMessage(
  id: string,
  updates: Partial<ChatMessage>,
): void {
  sessionMessages = sessionMessages.map(m =>
    m.id === id ? { ...m, ...updates } : m,
  );
}

export function clearSessionMessages(): void {
  sessionMessages = [];
}
