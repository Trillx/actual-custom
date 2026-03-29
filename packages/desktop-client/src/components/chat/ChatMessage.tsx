import React from 'react';

import { Button } from '@actual-app/components/button';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { formatActionDetails } from './executeAction';
import type { ChatMessage as ChatMessageType } from './types';

type ChatMessageProps = {
  message: ChatMessageType;
  isNarrowWidth?: boolean;
  onConfirmAction?: (messageId: string) => void;
  onRejectAction?: (messageId: string) => void;
};

export function ChatMessage({
  message,
  isNarrowWidth = false,
  onConfirmAction,
  onRejectAction,
}: ChatMessageProps) {
  const isUser = message.role === 'user';

  const maxBubbleWidth = isNarrowWidth ? '80%' : '85%';

  return (
    <View
      style={{
        alignSelf: isUser ? 'flex-end' : 'flex-start',
        maxWidth: maxBubbleWidth,
        width: 'fit-content',
        marginBottom: 8,
        minWidth: 0,
      }}
    >
      <View
        style={{
          backgroundColor: isUser
            ? theme.buttonPrimaryBackground
            : theme.cardBackground,
          color: isUser ? theme.buttonPrimaryText : theme.pageText,
          padding: isNarrowWidth ? '8px 12px' : '10px 14px',
          borderRadius: 12,
          borderBottomRightRadius: isUser ? 4 : 12,
          borderBottomLeftRadius: isUser ? 12 : 4,
          border: isUser ? 'none' : `1px solid ${theme.cardBorder}`,
          minWidth: 0,
          overflow: 'hidden',
        }}
      >
        <Text
          style={{
            fontSize: isNarrowWidth ? 14 : 13,
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
      </View>

      {message.pendingAction && message.actionStatus === 'pending' && (
        <View
          style={{
            marginTop: 6,
            padding: '8px 12px',
            backgroundColor: theme.noticeBackground,
            border: `1px solid ${theme.noticeBorder}`,
            borderRadius: 8,
            minWidth: 0,
            overflow: 'hidden',
          }}
        >
          <Text
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: theme.noticeText,
              marginBottom: 4,
            }}
          >
            Proposed action:
          </Text>
          {formatActionDetails(message.pendingAction).map((line, i) => (
            <Text
              key={i}
              style={{
                fontSize: 11,
                color: theme.noticeText,
                lineHeight: '1.6',
                fontFamily: 'monospace',
                overflowWrap: 'break-word',
                wordBreak: 'break-word',
              }}
            >
              {line}
            </Text>
          ))}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
            <Button
              variant="primary"
              onPress={() => onConfirmAction?.(message.id)}
              style={{ fontSize: 12 }}
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
            borderRadius: 4,
          }}
        >
          <Text style={{ fontSize: 11, color: theme.noticeText }}>
            Action executed
          </Text>
        </View>
      )}

      {message.pendingAction && message.actionStatus === 'rejected' && (
        <View
          style={{
            marginTop: 4,
            padding: '4px 8px',
            borderRadius: 4,
          }}
        >
          <Text style={{ fontSize: 11, color: theme.pageTextSubdued }}>
            Action cancelled
          </Text>
        </View>
      )}

      <Text
        style={{
          fontSize: 10,
          color: theme.pageTextSubdued,
          marginTop: 2,
          alignSelf: isUser ? 'flex-end' : 'flex-start',
          paddingInline: 4,
        }}
      >
        {new Date(message.timestamp).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        })}
      </Text>
    </View>
  );
}
