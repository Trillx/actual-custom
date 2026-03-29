import React, { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { Input } from '@actual-app/components/input';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { Setting } from './UI';

import { useLocalPref } from '@desktop-client/hooks/useLocalPref';

export function AISettings() {
  const { t } = useTranslation();
  const [apiKey, setApiKeyPref] = useLocalPref('ai.apiKey');
  const [inputValue, setInputValue] = useState(apiKey || '');
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setApiKeyPref(inputValue.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleClear = () => {
    setApiKeyPref('');
    setInputValue('');
    setSaved(false);
  };

  return (
    <Setting>
      <Text>
        <Trans>
          <strong>AI Assistant</strong> uses OpenAI to help you understand your
          budget through natural language conversation. Enter your OpenAI API key
          below to enable the chat assistant in the sidebar.
        </Trans>
      </Text>
      <View style={{ gap: 10, width: '100%' }}>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <Input
            value={inputValue}
            onChangeValue={setInputValue}
            placeholder={t('sk-...')}
            type="password"
            style={{ flex: 1 }}
          />
          <Button onPress={handleSave} variant="primary">
            <Trans>Save</Trans>
          </Button>
          {apiKey && (
            <Button onPress={handleClear}>
              <Trans>Clear</Trans>
            </Button>
          )}
        </View>
        {saved && (
          <Text style={{ color: theme.noticeText, fontSize: 12 }}>
            <Trans>API key saved successfully.</Trans>
          </Text>
        )}
        {apiKey && !saved && (
          <Text style={{ color: theme.pageTextSubdued, fontSize: 12 }}>
            <Trans>API key is configured. Use the chat icon in the sidebar to start a conversation.</Trans>
          </Text>
        )}
      </View>
    </Setting>
  );
}
