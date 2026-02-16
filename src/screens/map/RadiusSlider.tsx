/**
 * RadiusSlider - Snap slider for geofence radius selection
 *
 * Horizontal track with labeled snap points.
 * User drags thumb, it snaps to the nearest value on release.
 */

import React, { useRef, useCallback, useState } from 'react';
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
  const trackWidth = useRef(0);
  const [thumbX, setThumbX] = useState(0);
  const currentIndex = RADIUS_OPTIONS.indexOf(value);
  const activeIndex = currentIndex >= 0 ? currentIndex : 0;

  const getXForIndex = useCallback((index: number) => {
    if (trackWidth.current === 0) return 0;
    const segmentWidth = trackWidth.current / (RADIUS_OPTIONS.length - 1);
    return segmentWidth * index;
  }, []);

  const getIndexForX = useCallback((x: number) => {
    if (trackWidth.current === 0) return 0;
    const segmentWidth = trackWidth.current / (RADIUS_OPTIONS.length - 1);
    const index = Math.round(x / segmentWidth);
    return Math.max(0, Math.min(RADIUS_OPTIONS.length - 1, index));
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (_, gestureState) => {
        // On touch start, snap to nearest based on touch position
        const touchX = gestureState.x0;
        // touchX is relative to screen, we need relative to track
        // We'll handle this via the move handler instead
      },
      onPanResponderMove: (_, gestureState) => {
        const startX = getXForIndex(activeIndex);
        const newX = Math.max(0, Math.min(trackWidth.current, startX + gestureState.dx));
        setThumbX(newX);
      },
      onPanResponderRelease: (_, gestureState) => {
        const startX = getXForIndex(activeIndex);
        const finalX = Math.max(0, Math.min(trackWidth.current, startX + gestureState.dx));
        const snapIndex = getIndexForX(finalX);
        const snapX = getXForIndex(snapIndex);
        setThumbX(snapX);
        if (RADIUS_OPTIONS[snapIndex] !== value) {
          onValueChange(RADIUS_OPTIONS[snapIndex]);
        }
      },
    })
  ).current;

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    trackWidth.current = width;
    setThumbX(getXForIndex(activeIndex));
  }, [activeIndex, getXForIndex]);

  // When value changes externally, update thumb position
  const computedThumbX = thumbX || getXForIndex(activeIndex);

  // Fill percentage
  const fillWidth = trackWidth.current > 0
    ? (computedThumbX / trackWidth.current) * 100
    : (activeIndex / (RADIUS_OPTIONS.length - 1)) * 100;

  return (
    <View style={sliderStyles.container}>
      {/* Labels */}
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

      {/* Track */}
      <View
        style={sliderStyles.trackContainer}
        onLayout={handleLayout}
        {...panResponder.panHandlers}
      >
        {/* Background track */}
        <View style={sliderStyles.track} />

        {/* Filled track */}
        <View style={[sliderStyles.trackFill, { width: `${fillWidth}%` }]} />

        {/* Tick marks */}
        {RADIUS_OPTIONS.map((r, i) => {
          const tickLeft = trackWidth.current > 0
            ? getXForIndex(i)
            : (i / (RADIUS_OPTIONS.length - 1)) * 100;
          const isActive = RADIUS_OPTIONS.indexOf(value) >= i;
          return (
            <View
              key={r}
              style={[
                sliderStyles.tick,
                isActive && sliderStyles.tickActive,
                {
                  left: trackWidth.current > 0
                    ? tickLeft - 4
                    : `${tickLeft}%` as unknown as number,
                },
              ]}
            />
          );
        })}

        {/* Thumb */}
        <View
          style={[
            sliderStyles.thumb,
            { left: computedThumbX - 14 },
          ]}
        />
      </View>
    </View>
  );
}

const sliderStyles = StyleSheet.create({
  container: {
    marginBottom: 10,
    marginTop: 4,
  },
  labelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingHorizontal: 0,
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary,
    textAlign: 'center',
    minWidth: 36,
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
  trackContainer: {
    height: 40,
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
    top: 16, // centered on 40px track container
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
    top: 6, // centered on 40px track container
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 4,
  },
});
