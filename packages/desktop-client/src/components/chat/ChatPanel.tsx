import React, { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@actual-app/components/button';
import { SvgClose } from '@actual-app/components/icons/v1';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import { v4 as uuidv4 } from 'uuid';

import { sendChatMessage } from './aiService';
import { ChatMessage } from './ChatMessage';
import type { ChatMessage as ChatMessageType } from './types';
import { useBudgetContext } from './useBudgetContext';

import { useLocalPref } from '@desktop-client/hooks/useLocalPref';

type ChatPanelProps = {
  onClose: () => void;
};

export function ChatPanel({ onClose }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [apiKey] = useLocalPref('ai.apiKey');
  const { gatherContext } = useBudgetContext();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    if (!apiKey) {
      setError(
        'Please set your OpenAI API key in Settings to use the AI assistant.',
      );
      return;
    }

    const userMessage: ChatMessageType = {
      id: uuidv4(),
      role: 'user',
      content: trimmed,
      timestamp: Date.now(),
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setError(null);
    setIsLoading(true);

    try {
      const context = await gatherContext();
      const response = await sendChatMessage(apiKey, newMessages, context);
      const assistantMessage: ChatMessageType = {
        id: uuidv4(),
        role: 'assistant',
        content: response,
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, assistantMessage]);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to get AI response',
      );
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, apiKey, messages, gatherContext]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const sendDisabled = isLoading || !input.trim() || !apiKey;

  return (
    <View
      style={{
        width: 380,
        height: '100%',
        borderLeft: `1px solid ${theme.tableBorder}`,
        backgroundColor: theme.pageBackground,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <View
        style={{
          padding: '12px 16px',
          borderBottom: `1px solid ${theme.tableBorder}`,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <Text
          style={{
            fontWeight: 600,
            fontSize: 15,
            color: theme.pageText,
          }}
        >
          AI Budget Assistant
        </Text>
        <Button variant="bare" onPress={onClose} aria-label="Close chat">
          <SvgClose style={{ width: 16, height: 16 }} />
        </Button>
      </View>

      <View
        style={{
          flex: 1,
          overflow: 'auto',
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {messages.length === 0 && (
          <View
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 20,
            }}
          >
            <Text
              style={{
                color: theme.pageTextSubdued,
                fontSize: 13,
                textAlign: 'center',
                lineHeight: '1.5',
              }}
            >
              Ask me anything about your budget, spending, accounts, or
              categories. I can help you understand your finances!
            </Text>
          </View>
        )}

        {messages.map(msg => (
          <ChatMessage key={msg.id} message={msg} />
        ))}

        {isLoading && (
          <View
            style={{
              alignSelf: 'flex-start',
              backgroundColor: theme.cardBackground,
              border: `1px solid ${theme.cardBorder}`,
              padding: '10px 14px',
              borderRadius: 12,
              borderBottomLeftRadius: 4,
            }}
          >
            <Text style={{ fontSize: 13, color: theme.pageTextSubdued }}>
              Thinking...
            </Text>
          </View>
        )}

        {error && (
          <View
            style={{
              backgroundColor: theme.errorBackground,
              color: theme.errorText,
              padding: '8px 12px',
              borderRadius: 8,
              marginTop: 4,
              border: `1px solid ${theme.errorBorder}`,
            }}
          >
            <Text style={{ fontSize: 12, color: theme.errorText }}>
              {error}
            </Text>
          </View>
        )}

        <div ref={messagesEndRef} />
      </View>

      <View
        style={{
          padding: 12,
          borderTop: `1px solid ${theme.tableBorder}`,
          flexShrink: 0,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            gap: 8,
            alignItems: 'flex-end',
          }}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              apiKey
                ? 'Ask about your budget...'
                : 'Set API key in Settings first'
            }
            disabled={!apiKey}
            rows={1}
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: 8,
              border: `1px solid ${theme.formInputBorder}`,
              backgroundColor: theme.formInputBackground,
              color: theme.formInputText,
              fontSize: 13,
              fontFamily: 'inherit',
              resize: 'none',
              outline: 'none',
              minHeight: 36,
              maxHeight: 100,
            }}
          />
          <Button
            variant="primary"
            onPress={() => void handleSend()}
            isDisabled={sendDisabled}
            style={{ flexShrink: 0, height: 36 }}
          >
            Send
          </Button>
        </View>
      </View>
    </View>
  );
}
