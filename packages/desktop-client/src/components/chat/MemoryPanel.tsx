import React, { useCallback, useState } from 'react';

import { Button } from '@actual-app/components/button';
import { SvgClose, SvgTrash } from '@actual-app/components/icons/v1';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import {
  addMemory,
  clearMemories,
  deleteMemory,
  getMemories,
} from './memoryStorage';
import type { Memory, MemoryCategory } from './memoryStorage';

type MemoryPanelProps = {
  onClose: () => void;
  isNarrowWidth?: boolean;
};

const CATEGORY_LABELS: Record<MemoryCategory, string> = {
  categorization: 'Categorization',
  preference: 'Preference',
  context: 'Context',
};

const CATEGORY_COLORS: Record<MemoryCategory, string> = {
  categorization: '#4f9da6',
  preference: '#a67f4f',
  context: '#7f6faf',
};

export function MemoryPanel({ onClose, isNarrowWidth = false }: MemoryPanelProps) {
  const [memories, setMemories] = useState<Memory[]>(getMemories);
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState<MemoryCategory>('preference');
  const [showAddForm, setShowAddForm] = useState(false);

  const refreshMemories = useCallback(() => {
    setMemories(getMemories());
  }, []);

  const handleDelete = useCallback(
    (id: string) => {
      deleteMemory(id);
      refreshMemories();
    },
    [refreshMemories],
  );

  const handleClearAll = useCallback(() => {
    if (!window.confirm('Delete all memories? This cannot be undone.')) return;
    clearMemories();
    refreshMemories();
  }, [refreshMemories]);

  const handleAdd = useCallback(() => {
    const trimmed = newContent.trim();
    if (!trimmed) return;
    addMemory({ content: trimmed, category: newCategory, source: 'user' });
    setNewContent('');
    setShowAddForm(false);
    refreshMemories();
  }, [newContent, newCategory, refreshMemories]);

  return (
    <View
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ fontSize: 16 }}>🧠</Text>
          <Text
            style={{
              fontWeight: 600,
              fontSize: 15,
              color: theme.pageText,
            }}
          >
            AI Memories
          </Text>
          <Text
            style={{
              fontSize: 11,
              color: theme.pageTextSubdued,
              backgroundColor: theme.tableRowBackgroundHover,
              padding: '1px 6px',
              borderRadius: 8,
            }}
          >
            {memories.length}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          {memories.length > 0 && (
            <Button
              variant="bare"
              onPress={handleClearAll}
              aria-label="Clear all memories"
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
          <Button variant="bare" onPress={onClose} aria-label="Back to chat">
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
        }}
      >
        {memories.length === 0 && !showAddForm && (
          <View
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 24,
              gap: 12,
            }}
          >
            <Text style={{ fontSize: 28 }}>🧠</Text>
            <Text
              style={{
                color: theme.pageTextSubdued,
                fontSize: 13,
                textAlign: 'center',
                lineHeight: '1.6',
                maxWidth: 280,
              }}
            >
              No memories yet. Teach the AI your preferences by chatting
              naturally, or add them manually below.
            </Text>
          </View>
        )}

        {memories.map(memory => (
          <View
            key={memory.id}
            style={{
              padding: '8px 10px',
              backgroundColor: theme.cardBackground,
              border: `1px solid ${theme.cardBorder}`,
              borderRadius: 10,
              marginBottom: 8,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 4,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text
                  style={{
                    fontSize: 10,
                    color: CATEGORY_COLORS[memory.category],
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                  }}
                >
                  {CATEGORY_LABELS[memory.category]}
                </Text>
                <Text
                  style={{
                    fontSize: 10,
                    color: theme.pageTextSubdued,
                    opacity: 0.6,
                  }}
                >
                  {memory.source === 'ai' ? 'via AI' : 'manual'}
                </Text>
              </View>
              <Button
                variant="bare"
                onPress={() => handleDelete(memory.id)}
                aria-label="Delete memory"
              >
                <SvgClose
                  style={{
                    width: 12,
                    height: 12,
                    color: theme.pageTextSubdued,
                  }}
                />
              </Button>
            </View>
            <Text
              style={{
                fontSize: 12,
                color: theme.pageText,
                lineHeight: '1.5',
              }}
            >
              {memory.content}
            </Text>
            <Text
              style={{
                fontSize: 10,
                color: theme.pageTextSubdued,
                marginTop: 4,
                opacity: 0.5,
              }}
            >
              {new Date(memory.createdAt).toLocaleDateString()}
            </Text>
          </View>
        ))}

        {showAddForm && (
          <View
            style={{
              padding: '10px 12px',
              backgroundColor: theme.cardBackground,
              border: `1px solid ${theme.cardBorder}`,
              borderRadius: 10,
              marginBottom: 8,
              gap: 8,
            }}
          >
            <textarea
              value={newContent}
              onChange={e => setNewContent(e.target.value)}
              placeholder="e.g., Starbucks transactions should be categorized as Dining Out"
              autoFocus
              rows={2}
              style={{
                width: '100%',
                padding: '8px 10px',
                border: `1px solid ${theme.formInputBorder}`,
                borderRadius: 8,
                backgroundColor: theme.formInputBackground,
                color: theme.formInputText,
                fontSize: 12,
                fontFamily: 'inherit',
                resize: 'vertical',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
              <select
                value={newCategory}
                onChange={e => setNewCategory(e.target.value as MemoryCategory)}
                style={{
                  padding: '4px 8px',
                  border: `1px solid ${theme.formInputBorder}`,
                  borderRadius: 6,
                  backgroundColor: theme.formInputBackground,
                  color: theme.formInputText,
                  fontSize: 11,
                  fontFamily: 'inherit',
                }}
              >
                <option value="categorization">Categorization</option>
                <option value="preference">Preference</option>
                <option value="context">Context</option>
              </select>
              <View style={{ flex: 1 }} />
              <Button
                variant="bare"
                onPress={() => {
                  setShowAddForm(false);
                  setNewContent('');
                }}
                style={{ fontSize: 11 }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onPress={handleAdd}
                style={{ fontSize: 11, borderRadius: 6 }}
              >
                Save
              </Button>
            </View>
          </View>
        )}
      </View>

      <View
        style={{
          padding: '10px 12px',
          borderTop: `1px solid ${theme.tableBorder}`,
          flexShrink: 0,
        }}
      >
        {!showAddForm && (
          <Button
            variant="bare"
            onPress={() => setShowAddForm(true)}
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: 8,
              border: `1px dashed ${theme.tableBorder}`,
              fontSize: 12,
              color: theme.pageTextSubdued,
              justifyContent: 'center',
            }}
          >
            + Add memory manually
          </Button>
        )}
        {!showAddForm && (
          <Text
            style={{
              fontSize: 11,
              color: theme.pageTextSubdued,
              textAlign: 'center',
              marginTop: 8,
            }}
          >
            {memories.length} / 100 memories
          </Text>
        )}
      </View>
    </View>
  );
}
