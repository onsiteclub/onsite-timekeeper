/**
 * RadiusSlider - Snap slider for geofence radius selection
 *
 * Horizontal track with labeled snap points.
 * Drag thumb or tap track to snap to nearest value.
 */

import React, { useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  PanResponder,
  LayoutChangeEvent,
} from 'react-native';
import { colors } from '../../constants/colors';
import { RADIUS_OPTIONS } from './constants';

interface RadiusSliderProps {
  value: number;
  onValueChange: (value: number) => void;
}

export function RadiusSlider({ value, onValueChange }: RadiusSliderProps) {
  const trackWidthRef = useRef(0);
  const trackLeftRef = useRef(0);
  const valueRef = useRef(value);
  const onChangeRef = useRef(onValueChange);

  // Keep refs in sync with props
  valueRef.current = value;
  onChangeRef.current = onValueChange;

  const activeIndex = Math.max(0, RADIUS_OPTIONS.indexOf(value));

  const getXForIndex = useCallback((index: number) => {
    if (trackWidthRef.current === 0) return 0;
    return (trackWidthRef.current / (RADIUS_OPTIONS.length - 1)) * index;
  }, []);

  const getIndexForX = useCallback((x: number) => {
    if (trackWidthRef.current === 0) return 0;
    const seg = trackWidthRef.current / (RADIUS_OPTIONS.length - 1);
    return Math.max(0, Math.min(RADIUS_OPTIONS.length - 1, Math.round(x / seg)));
  }, []);

  const panResponder = useMemo(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        // Tap: snap to nearest position based on touch X
        const touchX = evt.nativeEvent.locationX;
        const snapIndex = getIndexForX(touchX);
        const snapValue = RADIUS_OPTIONS[snapIndex];
        if (snapValue !== valueRef.current) {
          onChangeRef.current(snapValue);
        }
      },
      onPanResponderMove: (evt) => {
        // Drag: continuously update to nearest snap point
        const touchX = evt.nativeEvent.locationX;
        const clampedX = Math.max(0, Math.min(trackWidthRef.current, touchX));
        const snapIndex = getIndexForX(clampedX);
        const snapValue = RADIUS_OPTIONS[snapIndex];
        if (snapValue !== valueRef.current) {
          onChangeRef.current(snapValue);
        }
      },
      onPanResponderRelease: () => {
        // Already snapped during move, nothing to do
      },
    }),
  [getIndexForX]);

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    trackWidthRef.current = event.nativeEvent.layout.width;
    trackLeftRef.current = event.nativeEvent.layout.x;
  }, []);

  // Compute positions
  const thumbX = getXForIndex(activeIndex);
  const fillPercent = (activeIndex / (RADIUS_OPTIONS.length - 1)) * 100;

  return (
    <View style={sliderStyles.container}>
      {/* Track + thumb */}
      <View
        style={sliderStyles.trackContainer}
        onLayout={handleLayout}
        {...panResponder.panHandlers}
      >
        {/* Background track */}
        <View style={sliderStyles.track} />

        {/* Filled track */}
        <View style={[sliderStyles.trackFill, { width: `${fillPercent}%` }]} />

        {/* Tick marks */}
        {RADIUS_OPTIONS.map((r, i) => {
          const isActive = activeIndex >= i;
          const pct = (i / (RADIUS_OPTIONS.length - 1)) * 100;
          return (
            <View
              key={r}
              style={[
                sliderStyles.tick,
                isActive && sliderStyles.tickActive,
                { left: `${pct}%`, marginLeft: -4 },
              ]}
            />
          );
        })}

        {/* Thumb */}
        <View
          style={[
            sliderStyles.thumb,
            { left: thumbX - 14 },
          ]}
        />
      </View>

      {/* Labels below track */}
      <View style={sliderStyles.labelsRow}>
        {RADIUS_OPTIONS.map((r, i) => (
          <Text
            key={r}
            style={[
              sliderStyles.label,
              r === value && sliderStyles.labelActive,
              i === 0 && sliderStyles.labelFirst,
              i === RADIUS_OPTIONS.length - 1 && sliderStyles.labelLast,
            ]}
          >
            {r}m
          </Text>
        ))}
      </View>
    </View>
  );
}

const sliderStyles = StyleSheet.create({
  container: {
    marginBottom: 6,
    marginTop: 2,
  },
  trackContainer: {
    height: 36,
    justifyContent: 'center',
    position: 'relative',
  },
  track: {
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
  },
  trackFill: {
    position: 'absolute',
    left: 0,
    height: 4,
    backgroundColor: colors.amber,
    borderRadius: 2,
  },
  tick: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
    top: 14,
  },
  tickActive: {
    backgroundColor: colors.amber,
  },
  thumb: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 3,
    borderColor: colors.amber,
    top: 4,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 4,
  },
  labelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  label: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.textSecondary,
    textAlign: 'center',
    minWidth: 32,
  },
  labelActive: {
    color: colors.amber,
    fontWeight: '700',
  },
  labelFirst: {
    textAlign: 'left',
  },
  labelLast: {
    textAlign: 'right',
  },
});
