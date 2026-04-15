/**
 * Shared auto-log toggle hook.
 *
 * Extracted from map hook so Log screen, Settings, and Locations
 * can all toggle auto-logging with consistent behavior.
 */

import { useState, useCallback } from 'react';
import { Alert } from 'react-native';
import { useSettingsStore } from '../stores/settingsStore';
import { useLocationStore } from '../stores/locationStore';

export function useAutoLogToggle() {
  const autoLoggingEnabled = useSettingsStore(s => s.autoLoggingEnabled);
  const updateSetting = useSettingsStore(s => s.updateSetting);
  const enableAutoLogging = useLocationStore(s => s.enableAutoLogging);
  const disableAutoLogging = useLocationStore(s => s.disableAutoLogging);

  const [isToggling, setIsToggling] = useState(false);

  const handleToggle = useCallback(async (value: boolean) => {
    if (value) {
      setIsToggling(true);
      try {
        updateSetting('autoStartEnabled', true);
        updateSetting('autoStopEnabled', true);
        await enableAutoLogging();
      } finally {
        setIsToggling(false);
      }
    } else {
      Alert.alert(
        'Turn off Auto-logging?',
        'This will disable background location detection. Your hours will no longer be logged automatically.\n\nYou can still log hours manually anytime.',
        [
          { text: 'Keep On', style: 'cancel' },
          {
            text: 'Turn Off',
            style: 'destructive',
            onPress: async () => {
              setIsToggling(true);
              try {
                await disableAutoLogging();
              } finally {
                setIsToggling(false);
              }
            },
          },
        ]
      );
    }
  }, [enableAutoLogging, disableAutoLogging, updateSetting]);

  return { autoLoggingEnabled, isToggling, handleToggle };
}
