/**
 * FloatingMicButton - Draggable floating action button for voice commands
 *
 * - Visible on all tabs
 * - Draggable with finger (PanGesture + Reanimated)
 * - Snaps to nearest horizontal edge on release
 * - Tap opens VoiceCommandSheet
 */

import React from 'react';
import { Dimensions, StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/colors';

const BUTTON_SIZE = 56;
const MARGIN = 16;
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface FloatingMicButtonProps {
  onPress: () => void;
  tabBarHeight: number;
  isRecording?: boolean;
}

export function FloatingMicButton({ onPress, tabBarHeight, isRecording }: FloatingMicButtonProps) {
  // Position shared values (bottom-right default)
  const translateX = useSharedValue(SCREEN_WIDTH - TOTAL_SIZE - MARGIN + HALO_PADDING);
  const translateY = useSharedValue(SCREEN_HEIGHT - tabBarHeight - TOTAL_SIZE - MARGIN + HALO_PADDING);

  // Context for gesture start position
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const isDragging = useSharedValue(false);

  const panGesture = Gesture.Pan()
    .onBegin(() => {
      startX.value = translateX.value;
      startY.value = translateY.value;
      isDragging.value = false;
    })
    .onUpdate((event) => {
      // Mark as dragging after small movement threshold
      if (Math.abs(event.translationX) > 5 || Math.abs(event.translationY) > 5) {
        isDragging.value = true;
      }
      translateX.value = startX.value + event.translationX;
      translateY.value = startY.value + event.translationY;
    })
    .onEnd(() => {
      // Snap to nearest horizontal edge
      const midX = SCREEN_WIDTH / 2;
      const currentCenterX = translateX.value + TOTAL_SIZE / 2;

      if (currentCenterX < midX) {
        translateX.value = withSpring(MARGIN - HALO_PADDING);
      } else {
        translateX.value = withSpring(SCREEN_WIDTH - TOTAL_SIZE - MARGIN + HALO_PADDING);
      }

      // Clamp Y within screen bounds
      const minY = MARGIN + 50; // below status bar
      const maxY = SCREEN_HEIGHT - tabBarHeight - TOTAL_SIZE - MARGIN + HALO_PADDING;
      if (translateY.value < minY) {
        translateY.value = withSpring(minY);
      } else if (translateY.value > maxY) {
        translateY.value = withSpring(maxY);
      }
    });

  const tapGesture = Gesture.Tap()
    .onEnd(() => {
      if (!isDragging.value) {
        runOnJS(onPress)();
      }
    });

  // Pan takes priority over tap; tap only fires if no drag occurred
  const composedGesture = Gesture.Simultaneous(panGesture, tapGesture);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
    ],
  }));

  return (
    <GestureDetector gesture={composedGesture}>
      <Animated.View style={[fabStyles.halo, animatedStyle]}>
        <Animated.View style={[fabStyles.button, isRecording && fabStyles.recording]}>
          <Ionicons
            name={isRecording ? 'mic' : 'mic-outline'}
            size={26}
            color={colors.white}
          />
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

const HALO_PADDING = 8;
const TOTAL_SIZE = BUTTON_SIZE + HALO_PADDING * 2;

const fabStyles = StyleSheet.create({
  halo: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: TOTAL_SIZE,
    height: TOTAL_SIZE,
    borderRadius: TOTAL_SIZE / 2,
    backgroundColor: 'rgba(255, 255, 255, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  button: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    backgroundColor: colors.green,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  recording: {
    backgroundColor: colors.error,
  },
});
