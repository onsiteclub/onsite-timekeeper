/**
 * OnboardingTour - First-time tooltip tour for the Log screen.
 *
 * Shows 3 steps highlighting key UI elements with an overlay + tooltip.
 * Appears ONCE per user lifetime (AsyncStorage flag).
 *
 * Usage in reports.tsx:
 *   <OnboardingTour
 *     refs={{ dateChip: dateChipRef, timeCards: timeCardsRef, timerBar: timerBarRef }}
 *     scrollViewRef={scrollViewRef}
 *   />
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  Animated,
  StyleSheet,
  Dimensions,
  TouchableWithoutFeedback,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PressableOpacity } from './ui/PressableOpacity';

// ============================================
// CONSTANTS
// ============================================

const STORAGE_KEY = '@onsite:onboardingLogSeen';
const OVERLAY_OPACITY = 0.6;
const FADE_DURATION = 200;
const PULSE_DURATION = 600;
const PULSE_ITERATIONS = 2;
const HIGHLIGHT_PADDING = 6;
const HIGHLIGHT_RADIUS = 14;
const ARROW_SIZE = 12;
const TOOLTIP_MARGIN = 14;

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// ============================================
// STEP CONFIG
// ============================================

interface StepConfig {
  targetKey: 'dateChip' | 'timeCards' | 'timerBar';
  text: string;
  button: string;
  /** Tooltip sits below (arrow points up) or above (arrow points down) the target */
  tooltipSide: 'below' | 'above';
  /** Arrow horizontal alignment relative to the target */
  arrowAlign: 'left' | 'center' | 'right';
}

const STEPS: StepConfig[] = [
  {
    targetKey: 'dateChip',
    text: 'Tap here to see your calendar. You can view, edit, and adjust your hours for any day.',
    button: 'Next →',
    tooltipSide: 'below',
    arrowAlign: 'right', // points at the date chip (right side of row)
  },
  {
    targetKey: 'timeCards',
    text: 'Set your start and end time here to log your hours manually.',
    button: 'Next →',
    tooltipSide: 'below',
    arrowAlign: 'center', // centered between IN and OUT
  },
  {
    targetKey: 'timerBar',
    text: 'Turn this on to start logging your hours automatically when you arrive at your jobsite.',
    button: 'Got it ✓',
    tooltipSide: 'above',
    arrowAlign: 'right', // points at the toggle switch (right side)
  },
];

// ============================================
// TYPES
// ============================================

interface TargetLayout {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface OnboardingTourProps {
  refs: {
    dateChip: React.RefObject<any>;
    timeCards: React.RefObject<any>;
    timerBar: React.RefObject<any>;
  };
  scrollViewRef?: React.RefObject<any>;
}

// ============================================
// COMPONENT
// ============================================

export function OnboardingTour({ refs, scrollViewRef }: OnboardingTourProps) {
  const [step, setStep] = useState(0); // 0 = not started/finished, 1-3 = active
  const [targetLayout, setTargetLayout] = useState<TargetLayout | null>(null);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const tooltipFade = useRef(new Animated.Value(0)).current;

  // ============================================
  // INIT — check AsyncStorage flag
  // ============================================

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((val) => {
      if (!val) {
        // First time — start tour after a short delay so layout settles
        setTimeout(() => setStep(1), 800);
      }
    });
  }, []);

  // ============================================
  // MEASURE TARGET & ANIMATE
  // ============================================

  useEffect(() => {
    if (step === 0) return;

    const config = STEPS[step - 1];
    const ref = refs[config.targetKey];

    if (!ref?.current) {
      advance();
      return;
    }

    const measureAndAnimate = () => {
      ref.current.measureInWindow(
        (x: number, y: number, width: number, height: number) => {
          if (width === 0 && height === 0) {
            if (scrollViewRef?.current && config.targetKey === 'timerBar') {
              scrollViewRef.current.scrollToEnd({ animated: true });
              setTimeout(measureAndAnimate, 400);
              return;
            }
            advance();
            return;
          }

          setTargetLayout({ x, y, width, height });

          // Fade in overlay
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: FADE_DURATION,
            useNativeDriver: true,
          }).start();

          // Fade in tooltip
          Animated.timing(tooltipFade, {
            toValue: 1,
            duration: FADE_DURATION,
            useNativeDriver: true,
          }).start();

          // Pulse highlight
          pulseAnim.setValue(0);
          Animated.loop(
            Animated.sequence([
              Animated.timing(pulseAnim, {
                toValue: 1,
                duration: PULSE_DURATION,
                useNativeDriver: false,
              }),
              Animated.timing(pulseAnim, {
                toValue: 0,
                duration: PULSE_DURATION,
                useNativeDriver: false,
              }),
            ]),
            { iterations: PULSE_ITERATIONS }
          ).start();
        }
      );
    };

    setTimeout(measureAndAnimate, 100);
  }, [step]);

  // ============================================
  // ADVANCE / DISMISS
  // ============================================

  const advance = useCallback(() => {
    Animated.timing(tooltipFade, {
      toValue: 0,
      duration: FADE_DURATION / 2,
      useNativeDriver: true,
    }).start(() => {
      if (step >= 3) {
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: FADE_DURATION,
          useNativeDriver: true,
        }).start(() => {
          setStep(0);
          setTargetLayout(null);
        });
        AsyncStorage.setItem(STORAGE_KEY, 'true');
      } else {
        setTargetLayout(null);
        setStep(step + 1);
      }
    });
  }, [step]);

  // ============================================
  // RENDER
  // ============================================

  if (step === 0 || !targetLayout) return null;

  const config = STEPS[step - 1];

  // Highlight position (with padding)
  const hlX = targetLayout.x - HIGHLIGHT_PADDING;
  const hlY = targetLayout.y - HIGHLIGHT_PADDING;
  const hlW = targetLayout.width + HIGHLIGHT_PADDING * 2;
  const hlH = targetLayout.height + HIGHLIGHT_PADDING * 2;

  // Tooltip position — sits adjacent to target, never overlapping
  // For 'above': use a container from top:0 to just above the highlight,
  // with justifyContent:'flex-end' so the tooltip body sits at the bottom.
  // This avoids the `bottom` positioning mismatch when the parent (SafeAreaView)
  // doesn't extend to the full screen bottom (tab bar, nav bar).
  let tooltipTop: number;
  let tooltipMaxHeight: number | undefined;
  let tooltipJustify: 'flex-start' | 'flex-end' = 'flex-start';

  if (config.tooltipSide === 'below') {
    tooltipTop = hlY + hlH + TOOLTIP_MARGIN;
  } else {
    tooltipTop = 0;
    tooltipMaxHeight = hlY - TOOLTIP_MARGIN;
    tooltipJustify = 'flex-end';
  }

  // Arrow horizontal position relative to tooltip (left: 20, right: 20)
  const tooltipLeft = 20;
  const tooltipRight = 20;
  const tooltipWidth = SCREEN_W - tooltipLeft - tooltipRight;

  let arrowLeftPos: number;
  if (config.arrowAlign === 'left') {
    // Arrow on left side — point at left edge of target
    arrowLeftPos = Math.max(targetLayout.x - tooltipLeft + targetLayout.width * 0.3, 16);
  } else if (config.arrowAlign === 'right') {
    // Arrow on right side — point at right edge of target
    arrowLeftPos = Math.min(
      targetLayout.x + targetLayout.width * 0.7 - tooltipLeft,
      tooltipWidth - 36
    );
  } else {
    // Arrow centered on target
    arrowLeftPos = targetLayout.x + targetLayout.width / 2 - tooltipLeft - ARROW_SIZE;
  }
  // Clamp
  arrowLeftPos = Math.max(16, Math.min(arrowLeftPos, tooltipWidth - 36));

  // Pulse border color
  const pulseBorderColor = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(197, 139, 27, 0)', 'rgba(197, 139, 27, 0.8)'],
  });

  return (
    <>
      {/* Dark overlay */}
      <Animated.View
        style={[styles.overlay, { opacity: Animated.multiply(fadeAnim, OVERLAY_OPACITY) }]}
        pointerEvents="box-none"
      >
        <TouchableWithoutFeedback onPress={advance}>
          <View style={StyleSheet.absoluteFill} />
        </TouchableWithoutFeedback>
      </Animated.View>

      {/* Highlight — amber pulse around target */}
      <Animated.View
        style={[
          styles.highlight,
          {
            top: hlY,
            left: hlX,
            width: hlW,
            height: hlH,
            borderColor: pulseBorderColor,
            opacity: fadeAnim,
          },
        ]}
        pointerEvents="none"
      />

      {/* Tooltip */}
      <Animated.View
        style={[
          styles.tooltip,
          {
            top: tooltipTop,
            left: tooltipLeft,
            right: tooltipRight,
            opacity: tooltipFade,
            justifyContent: tooltipJustify,
            ...(tooltipMaxHeight ? { maxHeight: tooltipMaxHeight } : {}),
          },
        ]}
        pointerEvents="box-none"
      >
        {/* Arrow pointing UP (tooltip is below target) */}
        {config.tooltipSide === 'below' && (
          <View style={[styles.arrowUp, { left: arrowLeftPos }]} />
        )}

        <View style={styles.tooltipBody}>
          <Text style={styles.tooltipText}>{config.text}</Text>
          <PressableOpacity
            style={styles.tooltipButton}
            onPress={advance}
            activeOpacity={0.7}
          >
            <Text style={styles.tooltipButtonText}>{config.button}</Text>
          </PressableOpacity>
        </View>

        {/* Arrow pointing DOWN (tooltip is above target) */}
        {config.tooltipSide === 'above' && (
          <View style={[styles.arrowDown, { left: arrowLeftPos }]} />
        )}
      </Animated.View>
    </>
  );
}

// ============================================
// STYLES
// ============================================

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
    zIndex: 100,
  },
  highlight: {
    position: 'absolute',
    zIndex: 101,
    borderRadius: HIGHLIGHT_RADIUS,
    borderWidth: 2.5,
    backgroundColor: 'transparent',
  },
  tooltip: {
    position: 'absolute',
    zIndex: 102,
  },
  tooltipBody: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  tooltipText: {
    fontSize: 14,
    color: '#1A1A1A',
    lineHeight: 20,
    marginBottom: 12,
  },
  tooltipButton: {
    alignSelf: 'flex-end',
  },
  tooltipButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#C58B1B',
  },
  arrowUp: {
    position: 'absolute',
    top: -ARROW_SIZE,
    width: 0,
    height: 0,
    borderLeftWidth: ARROW_SIZE,
    borderRightWidth: ARROW_SIZE,
    borderBottomWidth: ARROW_SIZE,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#FFFFFF',
    zIndex: 103,
  },
  arrowDown: {
    position: 'absolute',
    bottom: -ARROW_SIZE,
    width: 0,
    height: 0,
    borderLeftWidth: ARROW_SIZE,
    borderRightWidth: ARROW_SIZE,
    borderTopWidth: ARROW_SIZE,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#FFFFFF',
    zIndex: 103,
  },
});
