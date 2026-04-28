import React from 'react';
import { Platform } from 'react-native';

type WebPickerOverlayProps = {
  mode: 'time' | 'date';
  value: Date;
  onChange: (next: Date) => void;
};

export function WebPickerOverlay({ mode, value, onChange }: WebPickerOverlayProps) {
  if (Platform.OS !== 'web') return null;

  const pad = (n: number) => String(n).padStart(2, '0');
  const formatted = mode === 'time'
    ? `${pad(value.getHours())}:${pad(value.getMinutes())}`
    : `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;

  const handleChange = (e: any) => {
    const v: string = e?.target?.value;
    if (!v) return;
    const next = new Date(value);
    if (mode === 'time') {
      const [h, m] = v.split(':').map(Number);
      if (Number.isFinite(h) && Number.isFinite(m)) {
        next.setHours(h, m, 0, 0);
        onChange(next);
      }
    } else {
      const [y, mo, da] = v.split('-').map(Number);
      if (Number.isFinite(y) && Number.isFinite(mo) && Number.isFinite(da)) {
        next.setFullYear(y, mo - 1, da);
        onChange(next);
      }
    }
  };

  return React.createElement('input', {
    type: mode,
    value: formatted,
    onChange: handleChange,
    style: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      width: '100%',
      height: '100%',
      opacity: 0,
      cursor: 'pointer',
      border: 0,
      padding: 0,
      margin: 0,
      background: 'transparent',
      zIndex: 10,
    },
  });
}
