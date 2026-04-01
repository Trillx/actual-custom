import React, { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@actual-app/components/button';
import { useResponsive } from '@actual-app/components/hooks/useResponsive';
import {
  SvgClose,
  SvgTrash,
  SvgSend,
} from '@actual-app/components/icons/v1';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import { v4 as uuidv4 } from 'uuid';

import { parseAction, parseQueryAction, sendChatMessage, stripActionBlock } from './aiService';
import { ChatMessage, shouldShowTimestamp } from './ChatMessage';
import {
  clearSessionMessages,
  getSessionMessages,
  setSessionMessages,
} from './chatState';
import { executeAction } from './executeAction';
import type { BudgetContext, ChatMessage as ChatMessageType } from './types';
import { useBudgetContext } from './useBudgetContext';

import { useLocalPref } from '@desktop-client/hooks/useLocalPref';

const SUGGESTION_CHIPS = [
  'Show my budget summary',
  'Top spending categories',
  'Where am I overspending?',
  'Recent transactions',
];

type ChatPanelProps = {
  onClose: () => void;
};

function TypingIndicator() {
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        backgroundColor: theme.cardBackground,
        border: `1px solid ${theme.cardBorder}`,
        padding: '12px 16px',
        borderRadius: 16,
        borderBottomLeftRadius: 4,
        flexDirection: 'row',
        gap: 4,
        alignItems: 'center',
        flexShrink: 0,
      }}
    >
      {[0, 1, 2].map(i => (
        <div
          key={i}
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            backgroundColor: theme.pageTextSubdued,
            opacity: 0.5,
            animation: `chatBounce 1.2s ease-in-out ${i * 0.15}s infinite`,
          }}
        />
      ))}
      <style>{`
        @keyframes chatBounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-6px); opacity: 0.9; }
        }
      `}</style>
    </View>
  );
}

export function ChatPanel({ onClose }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessageType[]>(
    getSessionMessages,
  );
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputFocused, setInputFocused] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const requestIdRef = useRef(0);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
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
  }, [messages, isLoading]);

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
    const currentRequestId = ++requestIdRef.current;

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
      let displayMessages = newMessages;
      let apiHistory = newMessages;
      let currentContext = context;
      const MAX_QUERY_ROUNDS = 4;

      const WAITING_PATTERN = /(?:please\s+hold|let\s+me\s+(?:gather|look|analyze|check|pull|fetch|find|get)|hold\s+on\s+while|I\s+will\s+(?:analyze|look|gather|check|pull|fetch|find|get)|while\s+I\s+(?:gather|look|analyze|check|pull|fetch|find|get)|I'?m\s+(?:gathering|looking|analyzing|checking|pulling|fetching|finding|getting))/i;
      if (!action && WAITING_PATTERN.test(rawResponse)) {
        const statusMsg: ChatMessageType = {
          id: uuidv4(),
          role: 'assistant',
          content: 'Querying: Gathering your data...',
          timestamp: Date.now(),
        };
        displayMessages = [...displayMessages, statusMsg];
        if (currentRequestId !== requestIdRef.current) return;
        setMessages(displayMessages);

        const narrativeMsg: ChatMessageType = {
          id: uuidv4(),
          role: 'assistant',
          content: rawResponse,
          timestamp: Date.now(),
        };
        apiHistory = [...apiHistory, narrativeMsg];

        const retryMsg: ChatMessageType = {
          id: uuidv4(),
          role: 'user',
          content: 'You must emit the query action block now. Do not describe what you will do — use the appropriate query type and respond with the ```action block immediately.',
          timestamp: Date.now(),
        };
        apiHistory = [...apiHistory, retryMsg];

        rawResponse = await sendChatMessage(
          apiKey,
          apiHistory,
          currentContext,
          endpointUrl || undefined,
          modelName || undefined,
        );
        action = parseAction(rawResponse);
      }

      for (let round = 0; round < MAX_QUERY_ROUNDS; round++) {
        const queryAction = action ? parseQueryAction(action) : null;
        if (!queryAction || !action) break;

        let queryResult: string;
        try {
          queryResult = await runQuery(queryAction, currentContext);
        } catch (queryErr) {
          queryResult = `Query failed: ${queryErr instanceof Error ? queryErr.message : 'Unknown error'}. The data could not be retrieved.`;
        }
        currentContext = { ...currentContext, queryResult };

        const queryDescription = action.description || 'Looking up data...';
        const strippedAiText = stripActionBlock(rawResponse);

        const displayMsg: ChatMessageType = {
          id: uuidv4(),
          role: 'assistant',
          content: `Querying: ${queryDescription}`,
          timestamp: Date.now(),
        };
        displayMessages = [...displayMessages, displayMsg];
        if (currentRequestId !== requestIdRef.current) return;
        setMessages(displayMessages);

        const historyMsg: ChatMessageType = {
          ...displayMsg,
          content: strippedAiText || `I looked up: ${queryDescription}`,
        };
        apiHistory = [...apiHistory, historyMsg];

        rawResponse = await sendChatMessage(
          apiKey,
          apiHistory,
          currentContext,
          endpointUrl || undefined,
          modelName || undefined,
        );
        action = parseAction(rawResponse);
      }

      if (action && action.type === 'query') {
        const finalQuery = parseQueryAction(action);
        if (finalQuery) {
          let finalResult: string;
          try {
            finalResult = await runQuery(finalQuery, currentContext);
          } catch (queryErr) {
            finalResult = `Query failed: ${queryErr instanceof Error ? queryErr.message : 'Unknown error'}. The data could not be retrieved.`;
          }
          currentContext = { ...currentContext, queryResult: finalResult };

          const desc = action.description || 'Looking up data...';
          const strippedText = stripActionBlock(rawResponse);

          const displayMsg: ChatMessageType = {
            id: uuidv4(),
            role: 'assistant',
            content: `Querying: ${desc}`,
            timestamp: Date.now(),
          };
          displayMessages = [...displayMessages, displayMsg];
          if (currentRequestId !== requestIdRef.current) return;
          setMessages(displayMessages);

          const historyMsg: ChatMessageType = {
            ...displayMsg,
            content: strippedText || `I looked up: ${desc}`,
          };
          apiHistory = [...apiHistory, historyMsg];

          rawResponse = await sendChatMessage(
            apiKey,
            apiHistory,
            currentContext,
            endpointUrl || undefined,
            modelName || undefined,
          );
          action = parseAction(rawResponse);
        }
      }

      if (action && action.type === 'query' && currentContext.queryResult) {
        const forceSummarizeMsg: ChatMessageType = {
          id: uuidv4(),
          role: 'assistant',
          content: stripActionBlock(rawResponse) || 'I have the data.',
          timestamp: Date.now(),
        };
        apiHistory = [...apiHistory, forceSummarizeMsg];

        const forceMsg: ChatMessageType = {
          id: uuidv4(),
          role: 'user',
          content: 'STOP issuing query actions. The data has already been fetched. You MUST now present the query results to the user in a clear, formatted response. Do NOT emit any action blocks. Just summarize the data.',
          timestamp: Date.now(),
        };
        apiHistory = [...apiHistory, forceMsg];

        if (currentRequestId !== requestIdRef.current) return;

        rawResponse = await sendChatMessage(
          apiKey,
          apiHistory,
          currentContext,
          endpointUrl || undefined,
          modelName || undefined,
        );
        action = parseAction(rawResponse);
      }

      const stripped = stripActionBlock(rawResponse);
      const isWriteAction = action && action.type !== 'query';
      let displayContent: string;
      if (action && action.type === 'query') {
        if (stripped) {
          displayContent = stripped;
        } else if (currentContext.queryResult) {
          const truncated = currentContext.queryResult.length > 3000
            ? currentContext.queryResult.substring(0, 3000) + '\n... (data truncated for display)'
            : currentContext.queryResult;
          displayContent = `Here are the results from your query:\n\n${truncated}`;
        } else {
          displayContent = 'I was unable to complete the data lookup. Please try rephrasing your question.';
        }
      } else {
        displayContent = stripped || (isWriteAction ? action!.description : rawResponse);
      }

      const assistantMessage: ChatMessageType = {
        id: uuidv4(),
        role: 'assistant',
        content: displayContent,
        timestamp: Date.now(),
        pendingAction: isWriteAction ? action! : undefined,
        actionStatus: isWriteAction ? 'pending' : undefined,
      };
      if (currentRequestId !== requestIdRef.current) return;
      setMessages(prev => [...prev, assistantMessage]);
    } catch (err) {
      if (currentRequestId !== requestIdRef.current) return;
      setError(
        err instanceof Error ? err.message : 'Failed to get AI response',
      );
    } finally {
      if (currentRequestId === requestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [input, isLoading, apiKey, endpointUrl, modelName, messages, gatherContext, runQuery]);

  const handleConfirmAction = useCallback(
    async (messageId: string) => {
      const msg = messagesRef.current.find(m => m.id === messageId);
      if (!msg?.pendingAction) return;

      const pendingAction = msg.pendingAction;
      setError(null);
      setMessages(prev =>
        prev.map(m =>
          m.id === messageId ? { ...m, actionStatus: 'confirmed' as const } : m,
        ),
      );

      try {
        const result = await executeAction(pendingAction);
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
    [],
  );

  const handleRejectAction = useCallback((messageId: string) => {
    setMessages(prev =>
      prev.map(m =>
        m.id === messageId ? { ...m, actionStatus: 'rejected' } : m,
      ),
    );
  }, []);

  const handleClearChat = useCallback(() => {
    if (!window.confirm('Clear chat history?')) return;
    requestIdRef.current++;
    setMessages([]);
    clearSessionMessages();
    setError(null);
    setIsLoading(false);
  }, []);

  const handleChipClick = useCallback((text: string) => {
    setInput(text);
    inputRef.current?.focus();
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
        minWidth: 380,
        maxWidth: 380,
        height: '100%',
        borderLeft: `1px solid ${theme.tableBorder}`,
        backgroundColor: theme.pageBackground,
        display: 'flex',
        flexDirection: 'column' as const,
        overflow: 'hidden',
      };

  return (
    <View style={panelStyle}>
      <View
        style={{
          padding: '10px 12px 10px 16px',
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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          {messages.length > 0 && (
            <Button
              variant="bare"
              onPress={handleClearChat}
              aria-label="Clear chat"
            >
              <SvgTrash
                style={{
                  width: 14,
                  height: 14,
                  color: theme.pageTextSubdued,
                }}
              />
            </Button>
          )}
          <Button variant="bare" onPress={onClose} aria-label="Close chat">
            <SvgClose style={{ width: 16, height: 16 }} />
          </Button>
        </View>
      </View>

      <View
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: isNarrowWidth ? '12px 10px' : '12px 14px',
          paddingBottom: isNarrowWidth ? 24 : 16,
        }}
      >
        {messages.length === 0 && (
          <View
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 16,
              gap: 16,
            }}
          >
            <Text
              style={{
                color: theme.pageTextSubdued,
                fontSize: 13,
                textAlign: 'center',
                lineHeight: '1.6',
              }}
            >
              Ask me anything about your budget, spending, or categories.
            </Text>
            <View
              style={{
                display: 'flex',
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: 8,
                justifyContent: 'center',
                maxWidth: 320,
              }}
            >
              {SUGGESTION_CHIPS.map(chip => (
                <button
                  key={chip}
                  onClick={() => handleChipClick(chip)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 16,
                    border: `1px solid ${theme.tableBorder}`,
                    backgroundColor: 'transparent',
                    color: theme.pageText,
                    fontSize: 12,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    transition: 'background-color 0.15s',
                  }}
                  onMouseEnter={e => {
                    (e.target as HTMLElement).style.backgroundColor =
                      String(theme.tableRowBackgroundHover);
                  }}
                  onMouseLeave={e => {
                    (e.target as HTMLElement).style.backgroundColor =
                      'transparent';
                  }}
                >
                  {chip}
                </button>
              ))}
            </View>
          </View>
        )}

        {messages.map((msg, idx) => (
          <ChatMessage
            key={msg.id}
            message={msg}
            isNarrowWidth={isNarrowWidth}
            showTimestamp={shouldShowTimestamp(messages, idx)}
            onConfirmAction={handleConfirmAction}
            onRejectAction={handleRejectAction}
          />
        ))}

        {isLoading && <TypingIndicator />}

        {error && (
          <View
            style={{
              backgroundColor: theme.errorBackground,
              padding: '8px 12px',
              borderRadius: 10,
              marginTop: 4,
              border: `1px solid ${theme.errorBorder}`,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              flexShrink: 0,
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
          padding: '10px 12px',
          borderTop: `1px solid ${theme.tableBorder}`,
          flexShrink: 0,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            gap: 8,
            alignItems: 'flex-end',
            backgroundColor: theme.formInputBackground,
            border: `1px solid ${inputFocused ? String(theme.buttonPrimaryBackground) : String(theme.formInputBorder)}`,
            borderRadius: 20,
            padding: '4px 4px 4px 14px',
            transition: 'border-color 0.15s',
          }}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            placeholder={
              apiKey
                ? 'Ask about your budget...'
                : 'Set API key in Settings first'
            }
            disabled={!apiKey}
            rows={1}
            style={{
              flex: 1,
              padding: '6px 0',
              border: 'none',
              backgroundColor: 'transparent',
              color: theme.formInputText,
              fontSize: 13,
              fontFamily: 'inherit',
              resize: 'none',
              outline: 'none',
              minHeight: 28,
              maxHeight: 100,
            }}
          />
          <button
            onClick={() => void handleSend()}
            disabled={sendDisabled}
            aria-label="Send message"
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              border: 'none',
              backgroundColor: sendDisabled
                ? String(theme.buttonNormalDisabledBackground)
                : String(theme.buttonPrimaryBackground),
              color: sendDisabled
                ? String(theme.buttonNormalDisabledText)
                : String(theme.buttonPrimaryText),
              cursor: sendDisabled ? 'default' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              transition: 'background-color 0.15s',
            }}
          >
            <SvgSend style={{ width: 14, height: 14 }} />
          </button>
        </View>
      </View>
    </View>
  );
}
