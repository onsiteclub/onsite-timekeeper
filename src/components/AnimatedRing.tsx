/**
 * AnimatedRing - Spinning ring indicator for timer
 *
 * States (v3.0 - Enterprise Theme):
 * - idle: Neutral gray (#98A2B3), no animation
 * - active: Green (#0F766E), smooth spinning
 * - paused: Amber (#C58B1B), slower spinning
 */

import React, { useEffect, useRef } from 'react';
import { View, Animated, Easing, StyleSheet } from 'react-native';
import { colors } from '../constants/colors';

type RingState = 'idle' | 'active' | 'paused';

interface AnimatedRingProps {
  state: RingState;
  size?: number;
  strokeWidth?: number;
  children?: React.ReactNode;
}

const COLORS = {
  idle: colors.timerIdle,      // Neutral gray - IDLE/STOPPED (#98A2B3)
  active: colors.timerActive,  // Green - RUNNING (#0F766E)
  paused: colors.timerPaused,  // Amber - PAUSED (#C58B1B)
};

const SPEEDS = {
  idle: 0,              // No rotation
  active: 2000,         // 2s per rotation - smooth
  paused: 4000,         // 4s per rotation - slower
};

export function AnimatedRing({
  state,
  size = 200,
  strokeWidth = 8,
  children
}: AnimatedRingProps) {
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const animationRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    // Stop any existing animation
    if (animationRef.current) {
      animationRef.current.stop();
    }

    if (state === 'idle') {
      // Reset to 0 and stop
      rotateAnim.setValue(0);
      return;
    }

    // Start spinning animation
    const duration = SPEEDS[state];

    const spin = () => {
      rotateAnim.setValue(0);
      animationRef.current = Animated.timing(rotateAnim, {
        toValue: 1,
        duration,
        easing: Easing.linear,
        useNativeDriver: true,
      });

      animationRef.current.start(({ finished }) => {
        if (finished) {
          spin(); // Loop
        }
      });
    };

    spin();

    return () => {
      if (animationRef.current) {
        animationRef.current.stop();
      }
    };
  }, [state, rotateAnim]);

  const rotation = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const color = COLORS[state];
  const innerSize = size - strokeWidth * 2;

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      {/* Static background ring - neutral gray track */}
      <View
        pointerEvents="none"
        style={[
          styles.backgroundRing,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: strokeWidth,
            borderColor: colors.timerRingTrack,  // Neutral gray track (#E3E7EE)
          },
        ]}
      />

      {/* Animated Ring - Use Animated wrapper for transform, inner View for border */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          width: size,
          height: size,
          transform: [{ rotate: rotation }],
        }}
      >
        {/* Inner View with border - NOT animated, just styled */}
        <View
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: strokeWidth,
            borderColor: color,
            opacity: 0.5,  // 50% transparência
          }}
        />
      </Animated.View>

      {/* Content container */}
      <View style={[styles.content, { width: innerSize, height: innerSize }]}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  backgroundRing: {
    position: 'absolute',
  },
  ring: {
    position: 'absolute',
  },
  content: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default AnimatedRing;
