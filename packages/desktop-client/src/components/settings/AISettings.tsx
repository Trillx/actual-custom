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
  const [endpointUrl, setEndpointUrlPref] = useLocalPref('ai.endpointUrl');
  const [keyInput, setKeyInput] = useState(apiKey || '');
  const [urlInput, setUrlInput] = useState(endpointUrl || '');
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setApiKeyPref(keyInput.trim());
    setEndpointUrlPref(urlInput.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleClear = () => {
    setApiKeyPref('');
    setEndpointUrlPref('');
    setKeyInput('');
    setUrlInput('');
    setSaved(false);
  };

  return (
    <Setting>
      <Text>
        <Trans>
          <strong>AI Assistant</strong> uses OpenAI to help you understand your
          budget through natural language conversation. It can also set budget
          amounts, add transactions, and create categories on your behalf (with
          confirmation). Enter your OpenAI API key below to enable the chat
          assistant in the sidebar.
        </Trans>
      </Text>
      <View style={{ gap: 10, width: '100%' }}>
        <View style={{ gap: 4 }}>
          <Text style={{ fontSize: 12, fontWeight: 500, color: theme.pageText }}>
            <Trans>API Key</Trans>
          </Text>
          <Input
            value={keyInput}
            onChangeValue={setKeyInput}
            placeholder={t('sk-...')}
            type="password"
          />
        </View>
        <View style={{ gap: 4 }}>
          <Text style={{ fontSize: 12, fontWeight: 500, color: theme.pageText }}>
            <Trans>Endpoint URL (optional)</Trans>
          </Text>
          <Input
            value={urlInput}
            onChangeValue={setUrlInput}
            placeholder={t('https://api.openai.com/v1/chat/completions')}
          />
          <Text style={{ fontSize: 11, color: theme.pageTextSubdued }}>
            <Trans>
              Leave empty to use OpenAI. Set a custom URL for compatible APIs
              (e.g., Azure OpenAI, local models).
            </Trans>
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
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
            <Trans>Settings saved successfully.</Trans>
          </Text>
        )}
        {apiKey && !saved && (
          <Text style={{ color: theme.pageTextSubdued, fontSize: 12 }}>
            <Trans>
              API key is configured. Use the chat icon in the sidebar to start a
              conversation.
            </Trans>
          </Text>
        )}
      </View>
    </Setting>
  );
}
