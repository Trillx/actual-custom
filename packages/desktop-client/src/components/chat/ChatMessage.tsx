import React from 'react';

import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import type { ChatMessage as ChatMessageType } from './types';

type ChatMessageProps = {
  message: ChatMessageType;
};

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';

  return (
    <View
      style={{
        alignSelf: isUser ? 'flex-end' : 'flex-start',
        maxWidth: '85%',
        marginBottom: 8,
      }}
    >
      <View
        style={{
          backgroundColor: isUser
            ? theme.buttonPrimaryBackground
            : theme.cardBackground,
          color: isUser ? theme.buttonPrimaryText : theme.pageText,
          padding: '10px 14px',
          borderRadius: 12,
          borderBottomRightRadius: isUser ? 4 : 12,
          borderBottomLeftRadius: isUser ? 12 : 4,
          border: isUser ? 'none' : `1px solid ${theme.cardBorder}`,
        }}
      >
        <Text
          style={{
            fontSize: 13,
            lineHeight: '1.5',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            color: 'inherit',
          }}
        >
          {message.content}
        </Text>
      </View>
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
