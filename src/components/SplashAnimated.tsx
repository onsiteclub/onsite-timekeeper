/**
 * Splash Screen Animada - OnSite Timekeeper
 * 
 * - Logo cresce do centro
 * - Som de abertura
 * - Transição suave para o app
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Image,
  StyleSheet,
  Animated,
  Dimensions,
  StatusBar,
} from 'react-native';
import { Audio } from 'expo-av';
import { colors } from '../constants/colors';

const { width, height } = Dimensions.get('window');

interface SplashAnimatedProps {
  onFinish: () => void;
}

export function SplashAnimated({ onFinish }: SplashAnimatedProps) {
  const scaleAnim = useRef(new Animated.Value(0.5)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const fadeOutAnim = useRef(new Animated.Value(1)).current;
  const [soundLoaded, setSoundLoaded] = useState(false);

  useEffect(() => {
    let sound: Audio.Sound | null = null;

    const playSound = async () => {
      try {
        // Configura o modo de áudio
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          shouldDuckAndroid: true,
        });

        // Carrega e toca o som
        const { sound: loadedSound } = await Audio.Sound.createAsync(
          require('../../assets/sounds/timekeeper_start.wav'),
          { shouldPlay: true, volume: 0.7 }
        );
        sound = loadedSound;
        setSoundLoaded(true);
      } catch (error) {
        console.log('Erro ao carregar som:', error);
        // Continua mesmo sem som
        setSoundLoaded(true);
      }
    };

    const startAnimation = () => {
      // Fade in + Scale up
      Animated.parallel([
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 4,
          tension: 40,
          useNativeDriver: true,
        }),
      ]).start(() => {
        // Aguarda um pouco e depois faz fade out
        setTimeout(() => {
          Animated.timing(fadeOutAnim, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }).start(() => {
            onFinish();
          });
        }, 1500); // Tempo que a logo fica visível
      });
    };

    // Inicia som e animação
    playSound();
    startAnimation();

    // Cleanup
    return () => {
      if (sound) {
        sound.unloadAsync();
      }
    };
  }, []);

  return (
    <Animated.View style={[styles.container, { opacity: fadeOutAnim }]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />
      
      <Animated.View
        style={[
          styles.logoContainer,
          {
            opacity: opacityAnim,
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        <Image
          source={require('../../assets/splash-icon.png')}
          style={styles.logo}
          resizeMode="contain"
        />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    width: width * 0.5,
    height: width * 0.5,
  },
});
