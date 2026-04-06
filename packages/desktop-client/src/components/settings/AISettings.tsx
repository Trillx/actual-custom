import React, { useCallback, useEffect, useRef, useState } from 'react';

import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { Input } from '@actual-app/components/input';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { Setting } from './UI';

import { useSyncedPref } from '@desktop-client/hooks/useSyncedPref';

const PROVIDERS = [
  {
    id: 'openai',
    label: 'OpenAI',
    endpoint: '',
    defaultModel: 'gpt-4o-mini',
    keyPlaceholder: 'sk-...',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    defaultModel: 'openai/gpt-4o-mini',
    keyPlaceholder: 'sk-or-...',
  },
  {
    id: 'custom',
    label: 'Custom',
    endpoint: '',
    defaultModel: '',
    keyPlaceholder: 'API key',
  },
] as const;

type ProviderId = (typeof PROVIDERS)[number]['id'];

function detectProvider(endpoint: string): ProviderId {
  if (!endpoint) return 'openai';
  if (endpoint.includes('openrouter.ai')) return 'openrouter';
  return 'custom';
}

export function AISettings() {
  const { t } = useTranslation();
  const [apiKey, setApiKeyPref] = useSyncedPref('ai.apiKey');
  const [endpointUrl, setEndpointUrlPref] = useSyncedPref('ai.endpointUrl');
  const [modelName, setModelNamePref] = useSyncedPref('ai.modelName');
  const [keyInput, setKeyInput] = useState(apiKey || '');
  const [urlInput, setUrlInput] = useState(endpointUrl || '');
  const [modelInput, setModelInput] = useState(modelName || '');
  const [provider, setProvider] = useState<ProviderId>(
    detectProvider(endpointUrl || ''),
  );
  const [saved, setSaved] = useState(false);

  const prevApiKey = useRef(apiKey);
  const prevEndpointUrl = useRef(endpointUrl);
  const prevModelName = useRef(modelName);

  useEffect(() => {
    if (apiKey !== prevApiKey.current) {
      prevApiKey.current = apiKey;
      setKeyInput(apiKey || '');
    }
    if (endpointUrl !== prevEndpointUrl.current) {
      prevEndpointUrl.current = endpointUrl;
      setUrlInput(endpointUrl || '');
      setProvider(detectProvider(endpointUrl || ''));
    }
    if (modelName !== prevModelName.current) {
      prevModelName.current = modelName;
      setModelInput(modelName || '');
    }
  }, [apiKey, endpointUrl, modelName]);

  const currentProvider = PROVIDERS.find(p => p.id === provider)!;

  const handleProviderChange = useCallback(
    (newProviderId: ProviderId) => {
      setProvider(newProviderId);
      const newProvider = PROVIDERS.find(p => p.id === newProviderId)!;
      setUrlInput(newProvider.endpoint);
      if (!modelInput || modelInput === currentProvider.defaultModel) {
        setModelInput(newProvider.defaultModel);
      }
    },
    [modelInput, currentProvider.defaultModel],
  );

  const handleSave = () => {
    setApiKeyPref(keyInput.trim());
    setEndpointUrlPref(urlInput.trim());
    setModelNamePref(modelInput.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleClear = () => {
    setApiKeyPref('');
    setEndpointUrlPref('');
    setModelNamePref('');
    setKeyInput('');
    setUrlInput('');
    setModelInput('');
    setProvider('openai');
    setSaved(false);
  };

  return (
    <Setting>
      <Text>
        <Trans>
          <strong>AI Assistant</strong> helps you understand your budget through
          conversation. It can read your financial data and perform actions like
          setting budgets and adding transactions (with your confirmation).
        </Trans>
      </Text>
      <View style={{ gap: 10, width: '100%' }}>
        <View style={{ gap: 4 }}>
          <Text
            style={{ fontSize: 12, fontWeight: 500, color: theme.pageText }}
          >
            <Trans>Provider</Trans>
          </Text>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {PROVIDERS.map(p => (
              <button
                key={p.id}
                onClick={() => handleProviderChange(p.id)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 6,
                  border: `1px solid ${provider === p.id ? theme.buttonPrimaryBackground : theme.formInputBorder}`,
                  backgroundColor:
                    provider === p.id
                      ? theme.buttonPrimaryBackground
                      : theme.formInputBackground,
                  color:
                    provider === p.id
                      ? theme.buttonPrimaryText
                      : theme.pageText,
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: provider === p.id ? 600 : 400,
                  fontFamily: 'inherit',
                }}
              >
                {p.label}
              </button>
            ))}
          </View>
        </View>

        <View style={{ gap: 4 }}>
          <Text
            style={{ fontSize: 12, fontWeight: 500, color: theme.pageText }}
          >
            <Trans>API Key</Trans>
          </Text>
          <Input
            value={keyInput}
            onChangeValue={setKeyInput}
            placeholder={t(currentProvider.keyPlaceholder)}
            type="password"
          />
        </View>

        <View style={{ gap: 4 }}>
          <Text
            style={{ fontSize: 12, fontWeight: 500, color: theme.pageText }}
          >
            <Trans>Model</Trans>
          </Text>
          <Input
            value={modelInput}
            onChangeValue={setModelInput}
            placeholder={currentProvider.defaultModel || t('Model name')}
          />
          <Text style={{ fontSize: 11, color: theme.pageTextSubdued }}>
            {provider === 'openai' && (
              <Trans>
                Leave empty for gpt-4o-mini. Other options: gpt-4o, gpt-4-turbo.
              </Trans>
            )}
            {provider === 'openrouter' && (
              <Trans>
                Browse models at openrouter.ai/models. Examples:
                anthropic/claude-3.5-sonnet, google/gemini-pro,
                meta-llama/llama-3-70b-instruct.
              </Trans>
            )}
            {provider === 'custom' && (
              <Trans>Enter the model name supported by your endpoint.</Trans>
            )}
          </Text>
        </View>

        {provider === 'custom' && (
          <View style={{ gap: 4 }}>
            <Text
              style={{ fontSize: 12, fontWeight: 500, color: theme.pageText }}
            >
              <Trans>Endpoint URL</Trans>
            </Text>
            <Input
              value={urlInput}
              onChangeValue={setUrlInput}
              placeholder={t(
                'https://your-api.example.com/v1/chat/completions',
              )}
            />
            <Text style={{ fontSize: 11, color: theme.pageTextSubdued }}>
              <Trans>
                Must be an OpenAI-compatible chat completions endpoint.
              </Trans>
            </Text>
          </View>
        )}

        <Text style={{ fontSize: 11, color: theme.warningText }}>
          <Trans>
            Privacy note: Your budget data will be sent to the selected provider
            when using the chat assistant.
          </Trans>
        </Text>

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
