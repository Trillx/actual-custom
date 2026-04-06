import React, { useState } from 'react';

import { Button } from '@actual-app/components/button';
import {
  SvgCheckmark,
  SvgClose,
  SvgExclamationOutline,
} from '@actual-app/components/icons/v1';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { formatActionDetails } from './executeAction';
import { MarkdownText } from './MarkdownText';
import type {
  ChatMessage as ChatMessageType,
  DisplayContext,
  FormattedActionResult,
  QueuedAction,
} from './types';

type ChatMessageProps = {
  message: ChatMessageType;
  displayContext?: DisplayContext;
  isNarrowWidth?: boolean;
  showTimestamp?: boolean;
  onConfirmAction?: (messageId: string) => void;
  onRejectAction?: (messageId: string) => void;
  onConfirmQueuedAction?: (messageId: string, actionId: string) => void;
  onRejectQueuedAction?: (messageId: string, actionId: string) => void;
  onConfirmAllActions?: (messageId: string) => void;
  onRejectAllActions?: (messageId: string) => void;
};

function ActionStatusBadge({
  status,
  result,
}: {
  status: QueuedAction['status'];
  result?: string;
}) {
  if (status === 'executed') {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <SvgCheckmark
          style={{ width: 10, height: 10, color: theme.noticeTextDark }}
        />
        <Text style={{ fontSize: 10, color: theme.noticeTextDark }}>Done</Text>
      </View>
    );
  }
  if (status === 'failed') {
    return (
      <View style={{ gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <SvgExclamationOutline
            style={{ width: 10, height: 10, color: theme.errorText }}
          />
          <Text style={{ fontSize: 10, color: theme.errorText }}>Failed</Text>
        </View>
        {result && (
          <Text
            style={{
              fontSize: 10,
              color: theme.errorText,
              fontStyle: 'italic',
            }}
          >
            {result}
          </Text>
        )}
      </View>
    );
  }
  if (status === 'rejected') {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <SvgClose
          style={{ width: 10, height: 10, color: theme.pageTextSubdued }}
        />
        <Text style={{ fontSize: 10, color: theme.pageTextSubdued }}>
          Skipped
        </Text>
      </View>
    );
  }
  if (status === 'executing') {
    return (
      <Text
        style={{
          fontSize: 10,
          color: theme.pageTextSubdued,
          fontStyle: 'italic',
        }}
      >
        Running...
      </Text>
    );
  }
  if (status === 'expired') {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Text style={{ fontSize: 10, color: theme.pageTextSubdued }}>
          Expired
        </Text>
      </View>
    );
  }
  return null;
}

function ActionDetailLines({ result }: { result: FormattedActionResult }) {
  const [showAll, setShowAll] = useState(false);

  const lineStyle = {
    fontSize: 11,
    color: theme.pageTextSubdued,
    lineHeight: '1.6' as const,
    fontFamily: 'monospace' as const,
    overflowWrap: 'break-word' as const,
    wordBreak: 'break-word' as const,
  };

  return (
    <>
      {result.summaryLines.map((line, i) => (
        <Text key={`s-${i}`} style={lineStyle}>
          {line}
        </Text>
      ))}
      {result.isGrouped && result.detailLines && (
        <>
          <Text
            style={{
              fontSize: 11,
              color: theme.pageTextLink,
              cursor: 'pointer',
              marginTop: 4,
              userSelect: 'none',
            }}
            onClick={() => setShowAll(!showAll)}
          >
            {showAll
              ? '▼ Hide details'
              : `▶ Show all ${result.detailLines.length} transactions`}
          </Text>
          {showAll &&
            result.detailLines.map((line, i) => (
              <Text key={`d-${i}`} style={lineStyle}>
                {line}
              </Text>
            ))}
        </>
      )}
    </>
  );
}

export function ChatMessage({
  message,
  displayContext,
  isNarrowWidth = false,
  showTimestamp = true,
  onConfirmAction,
  onRejectAction,
  onConfirmQueuedAction,
  onRejectQueuedAction,
  onConfirmAllActions,
  onRejectAllActions,
}: ChatMessageProps) {
  const isUser = message.role === 'user';
  const maxBubbleWidth = isNarrowWidth ? '85%' : '88%';
  const fontSize = isNarrowWidth ? 14 : 13;

  const hasMultipleActions =
    message.pendingActions && message.pendingActions.length > 1;
  const hasPendingInQueue = message.pendingActions?.some(
    a => a.status === 'pending',
  );
  const hasExecutingInQueue = message.pendingActions?.some(
    a => a.status === 'executing',
  );
  const allQueueSettled =
    message.pendingActions &&
    !message.pendingActions.some(
      a => a.status === 'pending' || a.status === 'executing',
    );

  return (
    <View
      style={{
        alignSelf: isUser ? 'flex-end' : 'flex-start',
        maxWidth: maxBubbleWidth,
        width: 'fit-content',
        marginBottom: showTimestamp ? 10 : 4,
        flexShrink: 0,
      }}
    >
      <View
        style={{
          backgroundColor: isUser
            ? theme.buttonPrimaryBackground
            : theme.cardBackground,
          color: isUser ? theme.buttonPrimaryText : theme.pageText,
          padding: isNarrowWidth ? '10px 14px' : '10px 14px',
          borderRadius: 16,
          borderBottomRightRadius: isUser ? 4 : 16,
          borderBottomLeftRadius: isUser ? 16 : 4,
          border: isUser ? 'none' : `1px solid ${theme.cardBorder}`,
          overflowWrap: 'anywhere',
        }}
      >
        {isUser ? (
          <Text
            style={{
              fontSize,
              lineHeight: '1.5',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              overflowWrap: 'break-word',
              color: 'inherit',
              minWidth: 0,
            }}
          >
            {message.content}
          </Text>
        ) : (
          <MarkdownText
            text={message.content}
            style={{
              fontSize,
              lineHeight: '1.55',
              wordBreak: 'break-word',
              overflowWrap: 'break-word',
              color: 'inherit',
              minWidth: 0,
            }}
          />
        )}
      </View>

      {message.pendingAction &&
        message.actionStatus === 'pending' &&
        !hasMultipleActions && (
          <View
            style={{
              marginTop: 6,
              padding: '10px 12px',
              backgroundColor: theme.cardBackground,
              border: `1px solid ${theme.tableBorder}`,
              borderRadius: 12,
              minWidth: 0,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                marginBottom: 6,
              }}
            >
              <SvgExclamationOutline
                style={{
                  width: 13,
                  height: 13,
                  color: theme.warningText,
                  flexShrink: 0,
                }}
              />
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: theme.pageText,
                }}
              >
                {message.pendingAction?.description || 'Confirm action'}
              </Text>
            </View>
            <ActionDetailLines
              result={formatActionDetails(
                message.pendingAction,
                displayContext,
              )}
            />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <Button
                variant="primary"
                onPress={() => onConfirmAction?.(message.id)}
                style={{ fontSize: 12, borderRadius: 8 }}
              >
                Confirm
              </Button>
              <Button
                variant="bare"
                onPress={() => onRejectAction?.(message.id)}
                style={{ fontSize: 12 }}
              >
                Cancel
              </Button>
            </View>
          </View>
        )}

      {message.pendingAction &&
        message.actionStatus === 'executed' &&
        !hasMultipleActions && (
          <View
            style={{
              marginTop: 4,
              padding: '4px 8px',
              borderRadius: 6,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <SvgCheckmark
              style={{
                width: 10,
                height: 10,
                color: theme.noticeTextDark,
              }}
            />
            <Text style={{ fontSize: 11, color: theme.noticeTextDark }}>
              Action completed
            </Text>
          </View>
        )}

      {message.pendingAction &&
        message.actionStatus === 'rejected' &&
        !hasMultipleActions && (
          <View
            style={{
              marginTop: 4,
              padding: '4px 8px',
              borderRadius: 6,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <SvgClose
              style={{
                width: 10,
                height: 10,
                color: theme.pageTextSubdued,
              }}
            />
            <Text style={{ fontSize: 11, color: theme.pageTextSubdued }}>
              Action cancelled
            </Text>
          </View>
        )}

      {message.pendingAction &&
        message.actionStatus === 'failed' &&
        !hasMultipleActions && (
          <View
            style={{
              marginTop: 4,
              padding: '4px 8px',
              borderRadius: 6,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <SvgExclamationOutline
              style={{
                width: 10,
                height: 10,
                color: theme.errorText,
              }}
            />
            <Text style={{ fontSize: 11, color: theme.errorText }}>
              Action failed
            </Text>
          </View>
        )}

      {message.pendingAction &&
        message.actionStatus === 'expired' &&
        !hasMultipleActions && (
          <View
            style={{
              marginTop: 4,
              padding: '4px 8px',
              borderRadius: 6,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <Text style={{ fontSize: 11, color: theme.pageTextSubdued }}>
              Action expired
            </Text>
          </View>
        )}

      {hasMultipleActions && (
        <View
          style={{
            marginTop: 6,
            padding: '10px 12px',
            backgroundColor: theme.cardBackground,
            border: `1px solid ${theme.tableBorder}`,
            borderRadius: 12,
            minWidth: 0,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              marginBottom: 8,
            }}
          >
            <SvgExclamationOutline
              style={{
                width: 13,
                height: 13,
                color: theme.warningText,
                flexShrink: 0,
              }}
            />
            <Text
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: theme.pageText,
              }}
            >
              {allQueueSettled
                ? `${
                    message.pendingActions!.filter(a => a.status === 'executed')
                      .length
                  } of ${message.pendingActions!.length} actions completed`
                : `${message.pendingActions!.length} actions to confirm`}
            </Text>
          </View>

          {message.pendingActions!.map((qa, idx) => (
            <View
              key={qa.id}
              style={{
                padding: '8px 10px',
                marginBottom: idx < message.pendingActions!.length - 1 ? 6 : 0,
                backgroundColor:
                  qa.status === 'executed'
                    ? 'rgba(0, 160, 0, 0.04)'
                    : qa.status === 'failed'
                      ? 'rgba(200, 0, 0, 0.04)'
                      : 'transparent',
                border: `1px solid ${
                  qa.status === 'executed'
                    ? 'rgba(0, 160, 0, 0.15)'
                    : qa.status === 'failed'
                      ? 'rgba(200, 0, 0, 0.15)'
                      : String(theme.tableBorder)
                }`,
                borderRadius: 8,
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  marginBottom: qa.status === 'pending' ? 4 : 0,
                }}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: theme.pageText,
                      marginBottom: 2,
                    }}
                  >
                    {`${idx + 1}. ${qa.action.description || qa.action.type}`}
                  </Text>
                  <ActionDetailLines
                    result={formatActionDetails(qa.action, displayContext)}
                  />
                </View>
                <View style={{ flexShrink: 0 }}>
                  <ActionStatusBadge status={qa.status} result={qa.result} />
                </View>
              </View>

              {qa.status === 'pending' &&
                (() => {
                  const isFirstPending = message
                    .pendingActions!.slice(0, idx)
                    .every(
                      a => a.status !== 'pending' && a.status !== 'executing',
                    );
                  return isFirstPending ? (
                    <View
                      style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}
                    >
                      <Button
                        variant="primary"
                        onPress={() =>
                          onConfirmQueuedAction?.(message.id, qa.id)
                        }
                        style={{
                          fontSize: 11,
                          borderRadius: 6,
                          padding: '3px 10px',
                        }}
                      >
                        Confirm
                      </Button>
                      <Button
                        variant="bare"
                        onPress={() =>
                          onRejectQueuedAction?.(message.id, qa.id)
                        }
                        style={{ fontSize: 11 }}
                      >
                        Skip
                      </Button>
                    </View>
                  ) : (
                    <Text
                      style={{
                        fontSize: 10,
                        color: theme.pageTextSubdued,
                        fontStyle: 'italic',
                        marginTop: 4,
                      }}
                    >
                      Waiting for previous actions...
                    </Text>
                  );
                })()}
            </View>
          ))}

          {hasPendingInQueue && (
            <View
              style={{
                flexDirection: 'row',
                gap: 8,
                marginTop: 10,
                borderTop: `1px solid ${theme.tableBorder}`,
                paddingTop: 10,
              }}
            >
              <Button
                variant="primary"
                onPress={() => onConfirmAllActions?.(message.id)}
                isDisabled={hasExecutingInQueue}
                style={{ fontSize: 12, borderRadius: 8 }}
              >
                {hasExecutingInQueue ? 'Executing...' : 'Confirm All'}
              </Button>
              <Button
                variant="bare"
                onPress={() => onRejectAllActions?.(message.id)}
                isDisabled={hasExecutingInQueue}
                style={{ fontSize: 12 }}
              >
                Cancel All
              </Button>
            </View>
          )}
        </View>
      )}

      {showTimestamp && (
        <Text
          style={{
            fontSize: 10,
            color: theme.pageTextSubdued,
            marginTop: 2,
            alignSelf: isUser ? 'flex-end' : 'flex-start',
            paddingInline: 4,
            opacity: 0.7,
          }}
        >
          {new Date(message.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </Text>
      )}
    </View>
  );
}

export function shouldShowTimestamp(
  messages: ChatMessageType[],
  index: number,
): boolean {
  const current = messages[index];
  const prev = messages[index - 1];
  const next = messages[index + 1];

  const isFirstInGroup =
    !prev ||
    prev.role !== current.role ||
    current.timestamp - prev.timestamp > 2 * 60 * 1000;

  const isLastInGroup =
    !next ||
    next.role !== current.role ||
    next.timestamp - current.timestamp > 2 * 60 * 1000;

  return isFirstInGroup || isLastInGroup;
}
