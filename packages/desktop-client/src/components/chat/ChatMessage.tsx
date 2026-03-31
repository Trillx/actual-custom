import React from 'react';

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
import type { ChatMessage as ChatMessageType } from './types';

type ChatMessageProps = {
  message: ChatMessageType;
  isNarrowWidth?: boolean;
  showTimestamp?: boolean;
  onConfirmAction?: (messageId: string) => void;
  onRejectAction?: (messageId: string) => void;
};

export function ChatMessage({
  message,
  isNarrowWidth = false,
  showTimestamp = true,
  onConfirmAction,
  onRejectAction,
}: ChatMessageProps) {
  const isUser = message.role === 'user';
  const maxBubbleWidth = isNarrowWidth ? '85%' : '88%';
  const fontSize = isNarrowWidth ? 14 : 13;

  return (
    <View
      style={{
        alignSelf: isUser ? 'flex-end' : 'flex-start',
        maxWidth: maxBubbleWidth,
        width: 'fit-content',
        marginBottom: showTimestamp ? 10 : 4,
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

      {message.pendingAction && message.actionStatus === 'pending' && (
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
              Confirm action
            </Text>
          </View>
          {formatActionDetails(message.pendingAction).map((line, i) => (
            <Text
              key={i}
              style={{
                fontSize: 11,
                color: theme.pageTextSubdued,
                lineHeight: '1.6',
                fontFamily: 'monospace',
                overflowWrap: 'break-word',
                wordBreak: 'break-word',
              }}
            >
              {line}
            </Text>
          ))}
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

      {message.pendingAction && message.actionStatus === 'executed' && (
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

      {message.pendingAction && message.actionStatus === 'rejected' && (
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

      {message.pendingAction && message.actionStatus === 'failed' && (
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
    !prev || prev.role !== current.role ||
    current.timestamp - prev.timestamp > 2 * 60 * 1000;

  const isLastInGroup =
    !next || next.role !== current.role ||
    next.timestamp - current.timestamp > 2 * 60 * 1000;

  return isFirstInGroup || isLastInGroup;
}
