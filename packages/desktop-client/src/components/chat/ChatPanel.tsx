import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import { Button } from '@actual-app/components/button';
import { useResponsive } from '@actual-app/components/hooks/useResponsive';
import { SvgClose, SvgTrash, SvgSend } from '@actual-app/components/icons/v1';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import { v4 as uuidv4 } from 'uuid';

import {
  parseAction,
  parseAllActions,
  parseQueryAction,
  sendChatMessage,
  stripActionBlock,
  stripAllActionBlocks,
} from './aiService';
import { useChat } from './ChatContext';
import { ChatMessage, shouldShowTimestamp } from './ChatMessage';
import {
  clearSessionMessages,
  getSessionMessages,
  setSessionMessages,
} from './chatState';
import { executeAction } from './executeAction';
import { MemoryPanel } from './MemoryPanel';
import type {
  BudgetAction,
  BudgetContext,
  ChatMessage as ChatMessageType,
  QueuedAction,
} from './types';
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
  const [messages, setMessages] =
    useState<ChatMessageType[]>(getSessionMessages);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputFocused, setInputFocused] = useState(false);
  const [showMemoryPanel, setShowMemoryPanel] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const requestIdRef = useRef(0);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const [apiKey] = useLocalPref('ai.apiKey');
  const [endpointUrl] = useLocalPref('ai.endpointUrl');
  const [modelName] = useLocalPref('ai.modelName');
  const { gatherContext, runQuery, initBudgetScope } = useBudgetContext();
  const { isNarrowWidth } = useResponsive();
  const { pendingMessage, clearPendingMessage } = useChat();
  const lastProcessedPendingId = useRef(0);

  useEffect(() => {
    setSessionMessages(messages);
  }, [messages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  useEffect(() => {
    inputRef.current?.focus();
    void gatherContext();
  }, []);

  const handleSend = useCallback(
    async (directMessage?: string) => {
      const trimmed = directMessage?.trim() || input.trim();
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
      if (!directMessage) setInput('');
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

        const WAITING_PATTERN =
          /(?:please\s+hold|let\s+me\s+(?:gather|look|analyze|check|pull|fetch|find|get)|hold\s+on\s+while|I\s+will\s+(?:analyze|look|gather|check|pull|fetch|find|get)|while\s+I\s+(?:gather|look|analyze|check|pull|fetch|find|get)|I'?m\s+(?:gathering|looking|analyzing|checking|pulling|fetching|finding|getting))/i;
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
            content:
              'You must emit the query action block now. Do not describe what you will do — use the appropriate query type and respond with the ```action block immediately.',
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

        let lastQueryType: string | null = null;
        let sameQueryCount = 0;

        for (let round = 0; round < MAX_QUERY_ROUNDS; round++) {
          const queryAction = action ? parseQueryAction(action) : null;
          if (!queryAction || !action) break;

          const queryKey = `${queryAction.queryType}:${JSON.stringify(
            queryAction.filters || {},
          )}`;
          if (queryKey === lastQueryType) {
            sameQueryCount++;
            if (sameQueryCount >= 1) break;
          } else {
            lastQueryType = queryKey;
            sameQueryCount = 0;
          }

          let queryResult: string;
          try {
            queryResult = await runQuery(queryAction, currentContext);
          } catch (queryErr) {
            queryResult = `Query failed: ${
              queryErr instanceof Error ? queryErr.message : 'Unknown error'
            }. The data could not be retrieved.`;
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
              finalResult = `Query failed: ${
                queryErr instanceof Error ? queryErr.message : 'Unknown error'
              }. The data could not be retrieved.`;
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
            content:
              'STOP issuing query actions. The data has already been fetched. You MUST now present the query results to the user in a clear, formatted response. Do NOT emit any action blocks. Just summarize the data.',
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

        const autoExecTypes = ['list-memories', 'list-rules'];
        const allActions = parseAllActions(rawResponse);
        const autoExecActions = allActions.filter(a =>
          autoExecTypes.includes(a.type),
        );
        const writeActions = allActions.filter(
          a => a.type !== 'query' && !autoExecTypes.includes(a.type),
        );

        if (
          autoExecActions.length > 0 &&
          action &&
          autoExecTypes.includes(action.type)
        ) {
          try {
            for (const autoAction of autoExecActions) {
              const autoResult = await executeAction(autoAction);
              currentContext = { ...currentContext, queryResult: autoResult };
            }
            const strippedText = stripActionBlock(rawResponse);
            const statusLabel =
              action.type === 'list-rules'
                ? 'Let me check your rules.'
                : 'Let me check your memories.';
            const autoStatusMsg: ChatMessageType = {
              id: uuidv4(),
              role: 'assistant',
              content: strippedText || statusLabel,
              timestamp: Date.now(),
            };
            displayMessages = [...displayMessages, autoStatusMsg];
            if (currentRequestId !== requestIdRef.current) return;
            setMessages(displayMessages);
            apiHistory = [...apiHistory, autoStatusMsg];

            if (writeActions.length === 0) {
              rawResponse = await sendChatMessage(
                apiKey,
                apiHistory,
                currentContext,
                endpointUrl || undefined,
                modelName || undefined,
              );
              action = parseAction(rawResponse);
            }
          } catch (autoErr) {
            const autoErrMsg =
              autoErr instanceof Error
                ? autoErr.message
                : `Failed to execute ${action?.type || 'action'}.`;
            if (currentRequestId !== requestIdRef.current) return;
            setMessages(prev => [
              ...prev,
              {
                id: uuidv4(),
                role: 'assistant',
                content: autoErrMsg,
                timestamp: Date.now(),
              },
            ]);
            return;
          }
        }
        const stripped = stripAllActionBlocks(rawResponse);
        const hasWriteActions = writeActions.length > 0;
        let displayContent: string;
        if (action && action.type === 'query') {
          if (currentContext.queryResult) {
            const truncated =
              currentContext.queryResult.length > 5000
                ? currentContext.queryResult.substring(0, 5000) +
                  '\n... (data truncated for display)'
                : currentContext.queryResult;
            displayContent = `Here are the results from your query:\n\n${truncated}`;
          } else {
            displayContent =
              stripped ||
              'I was unable to complete the data lookup. Please try rephrasing your question.';
          }
        } else if (hasWriteActions && writeActions.length === 1) {
          displayContent = stripped || writeActions[0].description;
        } else if (hasWriteActions) {
          displayContent =
            stripped || writeActions.map(a => a.description).join('\n');
        } else {
          displayContent = stripped || rawResponse;
        }

        const queuedActions: QueuedAction[] | undefined = hasWriteActions
          ? writeActions.map(a => ({
              id: uuidv4(),
              action: a,
              status: 'pending' as const,
            }))
          : undefined;

        const assistantMessage: ChatMessageType = {
          id: uuidv4(),
          role: 'assistant',
          content: displayContent,
          timestamp: Date.now(),
          pendingAction:
            hasWriteActions && writeActions.length === 1
              ? writeActions[0]
              : undefined,
          actionStatus:
            hasWriteActions && writeActions.length === 1
              ? 'pending'
              : undefined,
          pendingActions: queuedActions,
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
    },
    [
      input,
      isLoading,
      apiKey,
      endpointUrl,
      modelName,
      messages,
      gatherContext,
      runQuery,
    ],
  );

  const handleConfirmAction = useCallback(async (messageId: string) => {
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
      const errorMsg = err instanceof Error ? err.message : 'Action failed';
      setError(errorMsg);
      setMessages(prev =>
        prev.map(m =>
          m.id === messageId ? { ...m, actionStatus: 'failed' } : m,
        ),
      );
    }
  }, []);

  const handleRejectAction = useCallback((messageId: string) => {
    setMessages(prev =>
      prev.map(m =>
        m.id === messageId ? { ...m, actionStatus: 'rejected' } : m,
      ),
    );
  }, []);

  const applyExecutionContext = useCallback(
    (action: BudgetAction, ctx: Record<string, string>): BudgetAction => {
      if (Object.keys(ctx).length === 0) return action;

      const resolvedParams = { ...action.params };
      for (const [paramKey, paramValue] of Object.entries(resolvedParams)) {
        if (typeof paramValue === 'string') {
          let resolved = paramValue;
          for (const [ctxKey, ctxValue] of Object.entries(ctx)) {
            resolved = resolved.replace(`{{${ctxKey}}}`, ctxValue);
          }
          resolvedParams[paramKey] = resolved;
        }
      }
      return { ...action, params: resolvedParams };
    },
    [],
  );

  const executeQueuedAction = useCallback(
    async (
      messageId: string,
      qa: QueuedAction,
      executionContext: Record<string, string>,
    ): Promise<Record<string, string>> => {
      setMessages(prev =>
        prev.map(m =>
          m.id === messageId
            ? {
                ...m,
                pendingActions: m.pendingActions?.map(a =>
                  a.id === qa.id ? { ...a, status: 'executing' as const } : a,
                ),
              }
            : m,
        ),
      );

      try {
        const resolvedAction = applyExecutionContext(
          qa.action,
          executionContext,
        );
        const result = await executeAction(resolvedAction);
        const updatedContext = { ...executionContext };
        const resultIdMatch = result.match(
          /(?:id|ID)[:\s]+([a-f0-9-]{36}|[a-f0-9]{8,})/i,
        );
        if (resultIdMatch) {
          updatedContext[`${qa.action.type}_result_id`] = resultIdMatch[1];
        }
        updatedContext[`action_${qa.id}_result`] = result;

        setMessages(prev =>
          prev.map(m =>
            m.id === messageId
              ? {
                  ...m,
                  pendingActions: m.pendingActions?.map(a =>
                    a.id === qa.id
                      ? { ...a, status: 'executed' as const, result }
                      : a,
                  ),
                }
              : m,
          ),
        );
        return updatedContext;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Action failed';
        setMessages(prev =>
          prev.map(m =>
            m.id === messageId
              ? {
                  ...m,
                  pendingActions: m.pendingActions?.map(a =>
                    a.id === qa.id
                      ? { ...a, status: 'failed' as const, result: errorMsg }
                      : a,
                  ),
                }
              : m,
          ),
        );
        return executionContext;
      }
    },
    [applyExecutionContext],
  );

  const queueExecutingRef = useRef<Set<string>>(new Set());

  const buildContextFromPriorActions = useCallback(
    (actions: QueuedAction[], beforeIndex: number): Record<string, string> => {
      const ctx: Record<string, string> = {};
      for (let i = 0; i < beforeIndex; i++) {
        const a = actions[i];
        if (a.status === 'executed' && a.result) {
          const resultIdMatch = a.result.match(
            /(?:id|ID)[:\s]+([a-f0-9-]{36}|[a-f0-9]{8,})/i,
          );
          if (resultIdMatch) {
            ctx[`${a.action.type}_result_id`] = resultIdMatch[1];
          }
          ctx[`action_${a.id}_result`] = a.result;
        }
      }
      return ctx;
    },
    [],
  );

  const handleConfirmQueuedAction = useCallback(
    async (messageId: string, actionId: string) => {
      const msg = messagesRef.current.find(m => m.id === messageId);
      if (!msg?.pendingActions) return;
      if (queueExecutingRef.current.has(messageId)) return;

      const actionIndex = msg.pendingActions.findIndex(a => a.id === actionId);
      if (actionIndex < 0) return;

      const queuedAction = msg.pendingActions[actionIndex];
      if (queuedAction.status !== 'pending') return;

      const hasPriorPending = msg.pendingActions
        .slice(0, actionIndex)
        .some(a => a.status === 'pending' || a.status === 'executing');
      if (hasPriorPending) return;

      const ctx = buildContextFromPriorActions(msg.pendingActions, actionIndex);
      await executeQueuedAction(messageId, queuedAction, ctx);
    },
    [executeQueuedAction, buildContextFromPriorActions],
  );

  const handleRejectQueuedAction = useCallback(
    (messageId: string, actionId: string) => {
      const msg = messagesRef.current.find(m => m.id === messageId);
      if (!msg?.pendingActions) return;
      if (queueExecutingRef.current.has(messageId)) return;

      const actionIndex = msg.pendingActions.findIndex(a => a.id === actionId);
      if (actionIndex < 0) return;

      const hasPriorPending = msg.pendingActions
        .slice(0, actionIndex)
        .some(a => a.status === 'pending' || a.status === 'executing');
      if (hasPriorPending) return;

      setMessages(prev =>
        prev.map(m =>
          m.id === messageId
            ? {
                ...m,
                pendingActions: m.pendingActions?.map(a =>
                  a.id === actionId ? { ...a, status: 'rejected' as const } : a,
                ),
              }
            : m,
        ),
      );
    },
    [],
  );

  const handleConfirmAllActions = useCallback(
    async (messageId: string) => {
      if (queueExecutingRef.current.has(messageId)) return;

      const msg = messagesRef.current.find(m => m.id === messageId);
      if (!msg?.pendingActions) return;

      const pendingActions = msg.pendingActions.filter(
        a => a.status === 'pending',
      );
      if (pendingActions.length === 0) return;

      queueExecutingRef.current.add(messageId);

      try {
        let executionContext: Record<string, string> =
          buildContextFromPriorActions(
            msg.pendingActions,
            msg.pendingActions.findIndex(a => a.status === 'pending'),
          );

        for (const qa of pendingActions) {
          executionContext = await executeQueuedAction(
            messageId,
            qa,
            executionContext,
          );
        }
      } finally {
        queueExecutingRef.current.delete(messageId);
      }
    },
    [executeQueuedAction, buildContextFromPriorActions],
  );

  const handleRejectAllActions = useCallback((messageId: string) => {
    if (queueExecutingRef.current.has(messageId)) return;

    setMessages(prev =>
      prev.map(m =>
        m.id === messageId
          ? {
              ...m,
              pendingActions: m.pendingActions?.map(a =>
                a.status === 'pending'
                  ? { ...a, status: 'rejected' as const }
                  : a,
              ),
            }
          : m,
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

  useEffect(() => {
    if (!pendingMessage) return;
    if (pendingMessage.id <= lastProcessedPendingId.current) return;
    lastProcessedPendingId.current = pendingMessage.id;
    const msgText = pendingMessage.text;
    const msgId = pendingMessage.id;
    clearPendingMessage(msgId);
    void handleSend(msgText);
  }, [pendingMessage, clearPendingMessage, handleSend]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const sendDisabled = isLoading || !input.trim() || !apiKey;

  const PANEL_MIN = 300;
  const PANEL_MAX = 700;
  const PANEL_DEFAULT = 380;
  const STORAGE_KEY = 'chat-panel-width';

  const [panelWidth, setPanelWidth] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const n = parseInt(stored, 10);
      if (!isNaN(n) && n >= PANEL_MIN && n <= PANEL_MAX) return n;
    }
    return PANEL_DEFAULT;
  });

  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(PANEL_DEFAULT);
  const panelWidthRef = useRef(panelWidth);
  panelWidthRef.current = panelWidth;

  useLayoutEffect(() => {
    if (isNarrowWidth) return;

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      e.preventDefault();
      const delta = dragStartX.current - e.clientX;
      const newWidth = Math.min(
        PANEL_MAX,
        Math.max(PANEL_MIN, dragStartWidth.current + delta),
      );
      setPanelWidth(newWidth);
    };

    const onMouseUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      localStorage.setItem(STORAGE_KEY, String(panelWidthRef.current));
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [isNarrowWidth]);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    dragStartX.current = e.clientX;
    dragStartWidth.current = panelWidthRef.current;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

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
        width: panelWidth,
        minWidth: PANEL_MIN,
        maxWidth: PANEL_MAX,
        height: '100%',
        backgroundColor: theme.pageBackground,
        display: 'flex',
        flexDirection: 'column' as const,
        overflow: 'hidden',
        position: 'relative' as const,
      };

  return (
    <View style={panelStyle}>
      {!isNarrowWidth && (
        <div
          onMouseDown={handleResizeStart}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: 5,
            cursor: 'col-resize',
            zIndex: 10,
            borderLeft: `1px solid ${theme.tableBorder}`,
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLDivElement).style.borderLeft =
              `2px solid ${theme.pageTextPositive}`;
          }}
          onMouseLeave={e => {
            if (!isDragging.current)
              (e.currentTarget as HTMLDivElement).style.borderLeft =
                `1px solid ${theme.tableBorder}`;
          }}
        />
      )}
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
          <Button
            variant="bare"
            onPress={() => setShowMemoryPanel(prev => !prev)}
            aria-label="AI Memories"
          >
            <Text
              style={{
                fontSize: 15,
                lineHeight: '1',
                opacity: showMemoryPanel ? 1 : 0.6,
              }}
            >
              {'🧠'}
            </Text>
          </Button>
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

      {showMemoryPanel ? (
        <MemoryPanel
          onClose={() => setShowMemoryPanel(false)}
          isNarrowWidth={isNarrowWidth}
        />
      ) : (
        <>
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
                onConfirmQueuedAction={handleConfirmQueuedAction}
                onRejectQueuedAction={handleRejectQueuedAction}
                onConfirmAllActions={handleConfirmAllActions}
                onRejectAllActions={handleRejectAllActions}
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
                  <SvgClose
                    style={{ width: 12, height: 12, color: theme.errorText }}
                  />
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
                border: `1px solid ${
                  inputFocused
                    ? String(theme.buttonPrimaryBackground)
                    : String(theme.formInputBorder)
                }`,
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
        </>
      )}
    </View>
  );
}
