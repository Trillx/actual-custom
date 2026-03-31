import React, { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@actual-app/components/button';
import { useResponsive } from '@actual-app/components/hooks/useResponsive';
import { SvgClose } from '@actual-app/components/icons/v1';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import { v4 as uuidv4 } from 'uuid';

import { parseAction, parseQueryAction, sendChatMessage, stripActionBlock } from './aiService';
import { ChatMessage } from './ChatMessage';
import {
  getSessionMessages,
  setSessionMessages,
} from './chatState';
import { executeAction } from './executeAction';
import type { BudgetContext, ChatMessage as ChatMessageType } from './types';
import { useBudgetContext } from './useBudgetContext';

import { useLocalPref } from '@desktop-client/hooks/useLocalPref';

type ChatPanelProps = {
  onClose: () => void;
};

export function ChatPanel({ onClose }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessageType[]>(
    getSessionMessages,
  );
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [apiKey] = useLocalPref('ai.apiKey');
  const [endpointUrl] = useLocalPref('ai.endpointUrl');
  const [modelName] = useLocalPref('ai.modelName');
  const { gatherContext, runQuery } = useBudgetContext();
  const { isNarrowWidth } = useResponsive();

  useEffect(() => {
    setSessionMessages(messages);
  }, [messages]);

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
        'Please set your API key in Settings to use the AI assistant.',
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
      let rawResponse = await sendChatMessage(
        apiKey,
        newMessages,
        context,
        endpointUrl || undefined,
        modelName || undefined,
      );

      let action = parseAction(rawResponse);
      let currentMessages = newMessages;
      let currentContext = context;
      const MAX_QUERY_ROUNDS = 2;

      for (let round = 0; round < MAX_QUERY_ROUNDS; round++) {
        const queryAction = action ? parseQueryAction(action) : null;
        if (!queryAction || !action) break;

        const queryResult = await runQuery(queryAction, currentContext);

        currentContext = {
          ...currentContext,
          queryResult,
        };

        const queryDescription = action.description || 'Looking up data...';
        const queryInfoMessage: ChatMessageType = {
          id: uuidv4(),
          role: 'assistant',
          content: `Querying: ${queryDescription}`,
          timestamp: Date.now(),
        };

        currentMessages = [...currentMessages, queryInfoMessage];
        setMessages(currentMessages);

        rawResponse = await sendChatMessage(
          apiKey,
          currentMessages,
          currentContext,
          endpointUrl || undefined,
          modelName || undefined,
        );

        action = parseAction(rawResponse);
      }

      const stripped = stripActionBlock(rawResponse);
      const isWriteAction = action && action.type !== 'query';
      const displayContent = stripped || (isWriteAction ? action!.description : rawResponse);

      const assistantMessage: ChatMessageType = {
        id: uuidv4(),
        role: 'assistant',
        content: displayContent,
        timestamp: Date.now(),
        pendingAction: isWriteAction ? action! : undefined,
        actionStatus: isWriteAction ? 'pending' : undefined,
      };
      setMessages(prev => [...prev, assistantMessage]);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to get AI response',
      );
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, apiKey, endpointUrl, modelName, messages, gatherContext, runQuery]);

  const handleConfirmAction = useCallback(
    async (messageId: string) => {
      const msg = messages.find(m => m.id === messageId);
      if (!msg?.pendingAction) return;

      setError(null);
      setMessages(prev =>
        prev.map(m =>
          m.id === messageId ? { ...m, actionStatus: 'confirmed' } : m,
        ),
      );

      try {
        const result = await executeAction(msg.pendingAction);
        const resultMessage: ChatMessageType = {
          id: uuidv4(),
          role: 'assistant',
          content: result,
          timestamp: Date.now(),
        };
        setMessages(prev => {
          const updated = prev.map(m =>
            m.id === messageId ? { ...m, actionStatus: 'executed' as const } : m,
          );
          return [...updated, resultMessage];
        });
      } catch (err) {
        const errorMsg =
          err instanceof Error ? err.message : 'Action failed';
        setError(errorMsg);
        setMessages(prev =>
          prev.map(m =>
            m.id === messageId ? { ...m, actionStatus: 'failed' } : m,
          ),
        );
      }
    },
    [messages],
  );

  const handleRejectAction = useCallback((messageId: string) => {
    setMessages(prev =>
      prev.map(m =>
        m.id === messageId ? { ...m, actionStatus: 'rejected' } : m,
      ),
    );
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const sendDisabled = isLoading || !input.trim() || !apiKey;

  const panelStyle = isNarrowWidth
    ? {
        position: 'fixed' as const,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 2000,
        backgroundColor: theme.pageBackground,
        display: 'flex',
        flexDirection: 'column' as const,
      }
    : {
        width: 380,
        height: '100%',
        borderLeft: `1px solid ${theme.tableBorder}`,
        backgroundColor: theme.pageBackground,
        display: 'flex',
        flexDirection: 'column' as const,
      };

  return (
    <View style={panelStyle}>
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
          padding: isNarrowWidth ? '12px 10px' : 16,
          paddingBottom: isNarrowWidth ? 20 : 16,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
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
              categories. I can also help you search transactions, analyze
              spending patterns, compare budget vs actual, and find your top
              payees!
            </Text>
          </View>
        )}

        {messages.map(msg => (
          <ChatMessage
            key={msg.id}
            message={msg}
            isNarrowWidth={isNarrowWidth}
            onConfirmAction={handleConfirmAction}
            onRejectAction={handleRejectAction}
          />
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
              padding: '8px 12px',
              borderRadius: 8,
              marginTop: 4,
              border: `1px solid ${theme.errorBorder}`,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
            }}
          >
            <Text style={{ fontSize: 12, color: theme.errorText, flex: 1 }}>
              {error}
            </Text>
            <Button
              variant="bare"
              onPress={() => setError(null)}
              aria-label="Dismiss error"
              style={{ flexShrink: 0 }}
            >
              <SvgClose style={{ width: 12, height: 12, color: theme.errorText }} />
            </Button>
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
