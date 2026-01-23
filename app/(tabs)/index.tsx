/**
 * Home Screen - OnSite Timekeeper
 *
 * v2.0: Enhanced manual entry UX
 * - Date picker with visual indicator
 * - Time picker modals (tap-to-select)
 * - Real-time total hours calculation
 * - Improved visual hierarchy
 */

import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  TextInput,
  ViewStyle,
  Image,
  Linking,
  ScrollView,
  Platform,
  Animated,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker'; // Keep for date picker only

import { Card } from '../../src/components/ui/Button';
import { colors } from '../../src/constants/colors';
import type { WorkLocation } from '../../src/stores/locationStore';

import { useHomeScreen } from '../../src/screens/home/hooks';
import { styles, fixedStyles } from '../../src/screens/home/styles';
import { HomePermissionBanner } from '../../src/components/PermissionBanner';
import { useSettingsStore } from '../../src/stores/settingsStore';

// Helper to format date
function formatDate(date: Date): string {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return 'Today';
  } else if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  } else {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
  }
}

// Helper to format date with day
function formatDateWithDay(date: Date): string {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}`;
}

// Calculate total hours
function calculateTotalHours(entryH: string, entryM: string, exitH: string, exitM: string, pauseMin: string): string {
  const entryHour = parseInt(entryH) || 0;
  const entryMinute = parseInt(entryM) || 0;
  const exitHour = parseInt(exitH) || 0;
  const exitMinute = parseInt(exitM) || 0;
  const pause = parseInt(pauseMin) || 0;

  if (!entryH || !exitH) return '--';

  const entryTotal = entryHour * 60 + entryMinute;
  const exitTotal = exitHour * 60 + exitMinute;
  let worked = exitTotal - entryTotal;

  if (worked < 0) worked += 24 * 60; // Handle overnight shifts
  worked -= pause;

  if (worked < 0) return '--';

  const hours = Math.floor(worked / 60);
  const minutes = worked % 60;

  if (hours === 0) return `${minutes}min`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}min`;
}

export default function HomeScreen() {
  const router = useRouter();
  const [showLogoTooltip, setShowLogoTooltip] = useState(false);
  const [showLocationDropdown, setShowLocationDropdown] = useState(false);

  // Date picker state (use hook's state for unified handling)
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showDateDropdown, setShowDateDropdown] = useState(false);


  // Break dropdown state
  const [showBreakDropdown, setShowBreakDropdown] = useState(false);
  const [showBreakCustomInput, setShowBreakCustomInput] = useState(false);

  // AM/PM state for time inputs
  const [entryPeriod, setEntryPeriod] = useState<'AM' | 'PM'>('AM');
  const [exitPeriod, setExitPeriod] = useState<'PM' | 'AM'>('PM');

  // Success modal state (after save)
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  // Toast notification for future dates
  const [toastMessage, setToastMessage] = useState('');
  const toastOpacity = useRef(new Animated.Value(0)).current;

  // Send to modal state
  const [showSendToModal, setShowSendToModal] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [recentContacts] = useState<{ name: string; phone: string }[]>([]);

  const {
    userName,
    locations,
    currentSession,
    activeLocation,
    canRestart,
    isGeofencingActive,
    timer,
    isPaused,
    pauseTimer,
    activeLocations,
    locationCardsData,
    manualDate,
    setManualDate,
    manualLocationId,
    setManualLocationId,
    manualEntryH,
    setManualEntryH,
    manualEntryM,
    setManualEntryM,
    manualExitH,
    setManualExitH,
    manualExitM,
    setManualExitM,
    manualPause,
    setManualPause,
    handlePause,
    handleResume,
    handleStop,
    handleRestart,
    handleSaveManual,
    getSuggestedTimes,
    sendToFavorite,
  } = useHomeScreen();

  // Get favorite contact from settings store
  const { favoriteContact } = useSettingsStore();

  // Helper to set time with AM/PM from 24h format
  const setTimeWithAmPm = (
    hour24: string,
    setHour: (h: string) => void,
    setPeriod: (p: 'AM' | 'PM') => void
  ) => {
    const h = parseInt(hour24, 10);
    if (h >= 12) {
      setPeriod('PM');
      setHour(h === 12 ? '12' : String(h - 12).padStart(2, '0'));
    } else {
      setPeriod('AM');
      setHour(h === 0 ? '12' : String(h).padStart(2, '0'));
    }
  };

  useEffect(() => {
    if (locations.length > 0 && !manualLocationId) {
      const firstLocationId = locations[0].id;
      setManualLocationId(firstLocationId);
      const suggested = getSuggestedTimes?.(firstLocationId);
      if (suggested) {
        setTimeWithAmPm(suggested.entryH, setManualEntryH, setEntryPeriod);
        setManualEntryM(suggested.entryM);
        setTimeWithAmPm(suggested.exitH, setManualExitH, setExitPeriod);
        setManualExitM(suggested.exitM);
      } else {
        setManualEntryH('09');
        setManualEntryM('00');
        setEntryPeriod('AM');
        setManualExitH('05');
        setManualExitM('00');
        setExitPeriod('PM');
      }
    }
  }, [locations]);

  const handleLocationChange = (locationId: string) => {
    setManualLocationId(locationId);
    setShowLocationDropdown(false);
    const suggested = getSuggestedTimes?.(locationId);
    if (suggested) {
      setTimeWithAmPm(suggested.entryH, setManualEntryH, setEntryPeriod);
      setManualEntryM(suggested.entryM);
      setTimeWithAmPm(suggested.exitH, setManualExitH, setExitPeriod);
      setManualExitM(suggested.exitM);
    }
  };

  const handleBreakSelect = (minutes: string) => {
    if (minutes === 'custom') {
      setShowBreakCustomInput(true);
      setShowBreakDropdown(false);
    } else {
      setManualPause(minutes);
      setShowBreakDropdown(false);
      setShowBreakCustomInput(false);
    }
  };

  const selectedLocation = locations.find((l: WorkLocation) => l.id === manualLocationId);

  // Show toast notification
  const showToast = (message: string) => {
    setToastMessage(message);
    Animated.sequence([
      Animated.timing(toastOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.delay(2500),
      Animated.timing(toastOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => setToastMessage(''));
  };

  // Date selection handlers (using hook's manualDate for unified state)
  const handleDateSelect = (option: 'today' | 'yesterday' | 'custom') => {
    const newDate = new Date();
    if (option === 'yesterday') {
      newDate.setDate(newDate.getDate() - 1);
    } else if (option === 'custom') {
      setShowDatePicker(true);
      setShowDateDropdown(false);
      return;
    }
    setManualDate(newDate);
    setShowDateDropdown(false);
  };

  const onDateChange = (event: any, date?: Date) => {
    setShowDatePicker(false);
    if (date && event.type === 'set') {
      // Check if date is in the future
      const today = new Date();
      today.setHours(23, 59, 59, 999); // End of today

      if (date > today) {
        showToast('⚠️ Cannot log hours for future dates');
        return;
      }

      setManualDate(date);
    }
  };


  // Smart time handlers - convert 24h to 12h automatically
  const handleEntryHourChange = (text: string) => {
    const cleaned = text.replace(/[^0-9]/g, '').slice(0, 2);
    const hour = parseInt(cleaned, 10);

    if (!isNaN(hour) && hour >= 13 && hour <= 23) {
      // 24h format detected - convert to 12h
      setManualEntryH(String(hour - 12).padStart(2, '0'));
      setEntryPeriod('PM');
    } else if (!isNaN(hour) && hour === 12) {
      setManualEntryH('12');
      setEntryPeriod('PM');
    } else if (!isNaN(hour) && hour === 0) {
      setManualEntryH('12');
      setEntryPeriod('AM');
    } else {
      setManualEntryH(cleaned);
    }
  };

  const handleExitHourChange = (text: string) => {
    const cleaned = text.replace(/[^0-9]/g, '').slice(0, 2);
    const hour = parseInt(cleaned, 10);

    if (!isNaN(hour) && hour >= 13 && hour <= 23) {
      // 24h format detected - convert to 12h
      setManualExitH(String(hour - 12).padStart(2, '0'));
      setExitPeriod('PM');
    } else if (!isNaN(hour) && hour === 12) {
      setManualExitH('12');
      setExitPeriod('PM');
    } else if (!isNaN(hour) && hour === 0) {
      setManualExitH('12');
      setExitPeriod('AM');
    } else {
      setManualExitH(cleaned);
    }
  };

  // Convert 12h to 24h for calculation and saving
  const get24Hour = (hour12: string, period: 'AM' | 'PM'): number => {
    const h = parseInt(hour12, 10) || 0;
    if (period === 'AM') {
      return h === 12 ? 0 : h;
    } else {
      return h === 12 ? 12 : h + 12;
    }
  };

  // Calculate total hours in real-time (using 24h internally)
  const entryH24 = get24Hour(manualEntryH, entryPeriod);
  const exitH24 = get24Hour(manualExitH, exitPeriod);
  const totalHours = calculateTotalHours(
    String(entryH24).padStart(2, '0'),
    manualEntryM,
    String(exitH24).padStart(2, '0'),
    manualExitM,
    manualPause
  );

  // Save with AM/PM conversion to 24h format
  const handleSaveManualWithAmPm = async () => {
    // Convert to 24h format before saving
    const entry24 = get24Hour(manualEntryH, entryPeriod);
    const exit24 = get24Hour(manualExitH, exitPeriod);

    // Temporarily set 24h values for the save function
    setManualEntryH(String(entry24).padStart(2, '0'));
    setManualExitH(String(exit24).padStart(2, '0'));

    // Small delay to ensure state is updated
    await new Promise(resolve => setTimeout(resolve, 50));

    // Call the original save function
    await handleSaveManual();

    // Reset to 12h display values
    const displayEntryH = entry24 > 12 ? entry24 - 12 : (entry24 === 0 ? 12 : entry24);
    const displayExitH = exit24 > 12 ? exit24 - 12 : (exit24 === 0 ? 12 : exit24);
    setManualEntryH(String(displayEntryH).padStart(2, '0'));
    setManualExitH(String(displayExitH).padStart(2, '0'));
  };

  // Send to modal handlers
  const handleSelectContact = (contact: { name: string; phone: string }) => {
    setPhoneNumber(contact.phone);
  };

  const handleSendToWhatsApp = async () => {
    if (!phoneNumber.trim()) {
      showToast('⚠️ Please enter a phone number');
      return;
    }

    try {
      // Format report message
      const reportText = `📊 OnSite Work Report

📍 Location: ${selectedLocation?.name || 'Unknown Location'}
📅 Date: ${formatDate(manualDate)}

⏰ Entry: ${manualEntryH.padStart(2, '0')}:${manualEntryM.padStart(2, '0')}
⏰ Exit: ${manualExitH.padStart(2, '0')}:${manualExitM.padStart(2, '0')}
☕ Break: ${manualPause ? `${manualPause} min` : 'None'}

⏱️ Total: ${totalHours}

Sent via OnSite Timekeeper 📱`;

      // Clean phone number (remove all non-digits)
      const cleanPhone = phoneNumber.replace(/\D/g, '');
      
      // Add country code if not present (assuming Canada)
      const formattedPhone = cleanPhone.startsWith('1') ? cleanPhone : `1${cleanPhone}`;

      // Open WhatsApp
      const whatsappUrl = `whatsapp://send?phone=${formattedPhone}&text=${encodeURIComponent(reportText)}`;
      
      await Linking.openURL(whatsappUrl);
      setShowSendToModal(false);
      showToast('✅ Opening WhatsApp...');
    } catch (error) {
      showToast('❌ Could not open WhatsApp');
      console.error('Error opening WhatsApp:', error);
    }
  };

  return (
    <View style={fixedStyles.container}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
      >
      {/* HEADER */}
      <View style={fixedStyles.header}>
        <TouchableOpacity
          style={styles.headerLogoContainer}
          onPress={() => setShowLogoTooltip(true)}
          activeOpacity={0.7}
        >
          <Image
            source={require('../../assets/logo_onsite.png')}
            style={fixedStyles.headerLogo}
            resizeMode="contain"
          />
        </TouchableOpacity>

        <View style={styles.headerUserContainer}>
          <Text style={styles.headerUserName} numberOfLines={1}>
            {userName || 'User'}
          </Text>
          <View style={styles.headerUserAvatar}>
            <Ionicons name="person" size={14} color={colors.textSecondary} />
          </View>
        </View>
      </View>

      {/* PERMISSION BANNER */}
      <HomePermissionBanner />

      {/* LOGO TOOLTIP MODAL */}
      <Modal
        visible={showLogoTooltip}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLogoTooltip(false)}
      >
        <TouchableOpacity
          style={styles.tooltipOverlay}
          activeOpacity={1}
          onPress={() => setShowLogoTooltip(false)}
        >
          <View style={styles.tooltipContainer}>
            <View style={styles.tooltipArrow} />
            <View style={styles.tooltipContent}>
              <Ionicons name="globe-outline" size={20} color={colors.primary} />
              <Text style={styles.tooltipText}>Visit our website</Text>
              <TouchableOpacity
                style={styles.tooltipButton}
                onPress={() => {
                  setShowLogoTooltip(false);
                  Linking.openURL('https://onsiteclub.com');
                }}
              >
                <Text style={styles.tooltipButtonText}>Open</Text>
                <Ionicons name="open-outline" size={14} color={colors.white} />
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ============================================ */}
      {/* LOCATION CARDS - Moved above form */}
      {/* ============================================ */}
      <View style={fixedStyles.locationsSection}>
        {activeLocations.length === 0 ? (
          <TouchableOpacity
            style={fixedStyles.emptyLocations}
            onPress={() => router.push('/(tabs)/map')}
          >
            <Ionicons name="location-outline" size={18} color={colors.textMuted} />
            <Text style={fixedStyles.emptyLocationsText}>Add location</Text>
          </TouchableOpacity>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={fixedStyles.locationCardsRow}
          >
            {locationCardsData.slice(0, 5).map(loc => (
              <TouchableOpacity
                key={loc.id}
                style={[
                  fixedStyles.locationCard,
                  manualLocationId === loc.id && fixedStyles.locationCardSelected
                ]}
                onPress={() => handleLocationChange(loc.id)}
                onLongPress={() => router.push(`/(tabs)/map?locationId=${loc.id}`)}
                activeOpacity={0.7}
              >
                <View style={fixedStyles.locationCardHeader}>
                  <Ionicons name="location" size={14} color={loc.color || colors.primary} />
                  <Text style={fixedStyles.locationCardName} numberOfLines={1}>{loc.name}</Text>
                </View>
                {loc.hasActiveSession ? (
                  <Text style={fixedStyles.locationCardActive}>● Active</Text>
                ) : (
                  <Text style={fixedStyles.locationCardTotal}>{loc.totalFormatted}</Text>
                )}
              </TouchableOpacity>
            ))}

            {/* Add location card */}
            <TouchableOpacity
              style={fixedStyles.addLocationCardInline}
              onPress={() => router.push('/(tabs)/map')}
              activeOpacity={0.7}
            >
              <Ionicons name="add" size={20} color={colors.primary} />
            </TouchableOpacity>
          </ScrollView>
        )}
      </View>

      {/* ============================================ */}
      {/* LOG HOURS FORM - Enhanced */}
      {/* ============================================ */}
      <Card style={fixedStyles.formSection}>
        {/* Date Selector */}
        <TouchableOpacity
          style={fixedStyles.dateSelector}
          onPress={() => setShowDateDropdown(!showDateDropdown)}
        >
          <View style={fixedStyles.dateSelectorContent}>
            <Ionicons name="calendar-outline" size={16} color={colors.textSecondary} />
            <Text style={fixedStyles.dateSelectorText}>{formatDateWithDay(manualDate)}</Text>
          </View>
          <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
        </TouchableOpacity>

        {/* Date Dropdown */}
        {showDateDropdown && (
          <View style={fixedStyles.dateDropdown}>
            <TouchableOpacity
              style={fixedStyles.dateOption}
              onPress={() => handleDateSelect('today')}
            >
              <Ionicons name="today-outline" size={16} color={colors.text} />
              <Text style={fixedStyles.dateOptionText}>Today</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={fixedStyles.dateOption}
              onPress={() => handleDateSelect('yesterday')}
            >
              <Ionicons name="arrow-back-outline" size={16} color={colors.text} />
              <Text style={fixedStyles.dateOptionText}>Yesterday</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={fixedStyles.dateOption}
              onPress={() => handleDateSelect('custom')}
            >
              <Ionicons name="calendar" size={16} color={colors.text} />
              <Text style={fixedStyles.dateOptionText}>Choose date...</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ENTRY TIME - Text inputs with AM/PM */}
        <View style={fixedStyles.timeRow}>
          <Text style={fixedStyles.timeLabel}>Entry</Text>
          <View style={homeInputStyles.timeInputGroup}>
            <TextInput
              style={homeInputStyles.timeInput}
              value={manualEntryH}
              onChangeText={handleEntryHourChange}
              keyboardType="number-pad"
              placeholder="HH"
              placeholderTextColor={colors.textMuted}
              maxLength={2}
              selectTextOnFocus
            />
            <Text style={homeInputStyles.timeSeparator}>:</Text>
            <TextInput
              style={homeInputStyles.timeInput}
              value={manualEntryM}
              onChangeText={(t) => setManualEntryM(t.replace(/[^0-9]/g, '').slice(0, 2))}
              keyboardType="number-pad"
              placeholder="MM"
              placeholderTextColor={colors.textMuted}
              maxLength={2}
              selectTextOnFocus
            />
            <View style={homeInputStyles.ampmToggle}>
              <TouchableOpacity
                style={[homeInputStyles.ampmBtn, entryPeriod === 'AM' && homeInputStyles.ampmBtnActive]}
                onPress={() => setEntryPeriod('AM')}
              >
                <Text style={[homeInputStyles.ampmText, entryPeriod === 'AM' && homeInputStyles.ampmTextActive]}>AM</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[homeInputStyles.ampmBtn, entryPeriod === 'PM' && homeInputStyles.ampmBtnActive]}
                onPress={() => setEntryPeriod('PM')}
              >
                <Text style={[homeInputStyles.ampmText, entryPeriod === 'PM' && homeInputStyles.ampmTextActive]}>PM</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* EXIT TIME - Text inputs with AM/PM */}
        <View style={fixedStyles.timeRow}>
          <Text style={fixedStyles.timeLabel}>Exit</Text>
          <View style={homeInputStyles.timeInputGroup}>
            <TextInput
              style={homeInputStyles.timeInput}
              value={manualExitH}
              onChangeText={handleExitHourChange}
              keyboardType="number-pad"
              placeholder="HH"
              placeholderTextColor={colors.textMuted}
              maxLength={2}
              selectTextOnFocus
            />
            <Text style={homeInputStyles.timeSeparator}>:</Text>
            <TextInput
              style={homeInputStyles.timeInput}
              value={manualExitM}
              onChangeText={(t) => setManualExitM(t.replace(/[^0-9]/g, '').slice(0, 2))}
              keyboardType="number-pad"
              placeholder="MM"
              placeholderTextColor={colors.textMuted}
              maxLength={2}
              selectTextOnFocus
            />
            <View style={homeInputStyles.ampmToggle}>
              <TouchableOpacity
                style={[homeInputStyles.ampmBtn, exitPeriod === 'AM' && homeInputStyles.ampmBtnActive]}
                onPress={() => setExitPeriod('AM')}
              >
                <Text style={[homeInputStyles.ampmText, exitPeriod === 'AM' && homeInputStyles.ampmTextActive]}>AM</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[homeInputStyles.ampmBtn, exitPeriod === 'PM' && homeInputStyles.ampmBtnActive]}
                onPress={() => setExitPeriod('PM')}
              >
                <Text style={[homeInputStyles.ampmText, exitPeriod === 'PM' && homeInputStyles.ampmTextActive]}>PM</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* BREAK - Dropdown with presets */}
        <View style={fixedStyles.timeRow}>
          <Text style={fixedStyles.timeLabel}>Break</Text>
          {showBreakCustomInput ? (
            <View style={fixedStyles.timeInputGroup}>
              <TextInput
                style={fixedStyles.breakInput}
                placeholder="0"
                placeholderTextColor={colors.textMuted}
                value={manualPause}
                onChangeText={(t) => setManualPause(t.replace(/[^0-9]/g, '').slice(0, 3))}
                keyboardType="number-pad"
                maxLength={3}
                selectTextOnFocus
                autoFocus
                onBlur={() => setShowBreakCustomInput(false)}
              />
              <Text style={fixedStyles.breakUnit}>min</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={fixedStyles.breakDropdownButton}
              onPress={() => setShowBreakDropdown(!showBreakDropdown)}
            >
              <Text style={fixedStyles.breakDropdownText}>
                {manualPause ? `${manualPause} min` : 'None'}
              </Text>
              <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Break Dropdown Menu */}
        {showBreakDropdown && (
          <View style={fixedStyles.breakDropdownMenu}>
            <TouchableOpacity
              style={fixedStyles.breakOption}
              onPress={() => handleBreakSelect('0')}
            >
              <Text style={fixedStyles.breakOptionText}>None</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={fixedStyles.breakOption}
              onPress={() => handleBreakSelect('15')}
            >
              <Text style={fixedStyles.breakOptionText}>15 min</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={fixedStyles.breakOption}
              onPress={() => handleBreakSelect('30')}
            >
              <Text style={fixedStyles.breakOptionText}>30 min</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={fixedStyles.breakOption}
              onPress={() => handleBreakSelect('45')}
            >
              <Text style={fixedStyles.breakOptionText}>45 min</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={fixedStyles.breakOption}
              onPress={() => handleBreakSelect('60')}
            >
              <Text style={fixedStyles.breakOptionText}>60 min</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[fixedStyles.breakOption, fixedStyles.breakOptionLast]}
              onPress={() => handleBreakSelect('custom')}
            >
              <Ionicons name="create-outline" size={16} color={colors.primary} />
              <Text style={[fixedStyles.breakOptionText, { color: colors.primary }]}>Custom...</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* TOTAL HOURS - Simplified text */}
        <View style={fixedStyles.totalRowSimple}>
          <Text style={fixedStyles.totalSimple}>
            Total: <Text style={fixedStyles.totalSimpleValue}>{totalHours}</Text>
          </Text>
        </View>

        {/* Save Button */}
        <TouchableOpacity
          style={fixedStyles.saveButton}
          onPress={async () => {
            await handleSaveManualWithAmPm();
            setShowSuccessModal(true);
          }}
        >
          <Ionicons name="checkmark-circle" size={20} color={colors.buttonPrimaryText} />
          <Text style={fixedStyles.saveButtonText}>Save Hours</Text>
        </TouchableOpacity>
      </Card>

      {/* ============================================ */}
      {/* TIMER - 25% (VERTICAL LAYOUT - buttons below) */}
      {/* ============================================ */}
      <Card style={[
        fixedStyles.timerSection,
        currentSession && fixedStyles.timerSectionActive,
      ].filter(Boolean) as ViewStyle[]}>
        {currentSession ? (
          <View style={fixedStyles.timerVertical}>
            {/* Badge + Timer */}
            <View style={fixedStyles.timerTopRow}>
              <View style={fixedStyles.activeBadge}>
                <View style={fixedStyles.activeBadgeDot} />
                <Text style={fixedStyles.activeBadgeText}>{currentSession.location_name}</Text>
              </View>
              <Text style={[fixedStyles.timerDisplay, isPaused && fixedStyles.timerPaused]}>{timer}</Text>
              <View style={fixedStyles.pausaInfo}>
                <Ionicons name="cafe-outline" size={14} color={colors.textSecondary} />
                <Text style={[fixedStyles.pausaTimer, isPaused && fixedStyles.pausaTimerActive]}>
                  {pauseTimer}
                </Text>
              </View>
            </View>

            {/* Buttons BELOW - centered */}
            <View style={fixedStyles.timerActionsRow}>
              {isPaused ? (
                <TouchableOpacity style={fixedStyles.resumeBtn} onPress={handleResume}>
                  <Ionicons name="play" size={18} color={colors.buttonPrimaryText} />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={fixedStyles.pauseBtn} onPress={handlePause}>
                  <Ionicons name="pause" size={18} color={colors.text} />
                </TouchableOpacity>
              )}
              <TouchableOpacity style={fixedStyles.stopBtn} onPress={handleStop}>
                <Ionicons name="stop" size={18} color={colors.white} />
              </TouchableOpacity>
            </View>
          </View>
        ) : canRestart ? (
          <View style={fixedStyles.timerVertical}>
            <View style={fixedStyles.timerTopRow}>
              <View style={fixedStyles.idleBadge}>
                <View style={fixedStyles.idleBadgeDot} />
                <Text style={fixedStyles.idleBadgeText}>{activeLocation?.name}</Text>
              </View>
              <Text style={fixedStyles.timerIdle}>00:00:00</Text>
            </View>
            <View style={fixedStyles.timerActionsRow}>
              <TouchableOpacity style={fixedStyles.startBtn} onPress={handleRestart}>
                <Ionicons name="play" size={18} color={colors.buttonPrimaryText} />
                <Text style={fixedStyles.startBtnText}>Start</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={fixedStyles.timerWaiting}>
            <Ionicons name="location-outline" size={20} color={colors.textMuted} />
            <Text style={fixedStyles.timerWaitingText}>
              {isGeofencingActive ? 'Waiting for location...' : 'Monitoring inactive'}
            </Text>
          </View>
        )}
      </Card>

      {/* Date Picker (keep this - only for date selection) */}
      {showDatePicker && (
        <DateTimePicker
          value={manualDate}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onChange={onDateChange}
          maximumDate={new Date()}
        />
      )}
      </ScrollView>

      {/* ============================================ */}
      {/* SUCCESS MODAL (after save) */}
      {/* ============================================ */}
      <Modal
        visible={showSuccessModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSuccessModal(false)}
      >
        <TouchableOpacity
          style={homeInputStyles.successModalOverlay}
          activeOpacity={1}
          onPress={() => setShowSuccessModal(false)}
        >
          <View style={homeInputStyles.successModalContent}>
            <View style={homeInputStyles.successIcon}>
              <Ionicons name="checkmark-circle" size={48} color={colors.success || '#22C55E'} />
            </View>
            <Text style={homeInputStyles.successTitle}>Hours Saved!</Text>
            <Text style={homeInputStyles.successSubtitle}>
              {selectedLocation?.name} • {totalHours}
            </Text>

            {/* Send to WhatsApp option */}
            <TouchableOpacity
              style={homeInputStyles.successSendBtn}
              onPress={() => {
                setShowSuccessModal(false);
                setShowSendToModal(true);
              }}
            >
              <Ionicons name="logo-whatsapp" size={20} color={colors.white} />
              <Text style={homeInputStyles.successSendBtnText}>Send to WhatsApp</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={homeInputStyles.successCloseBtn}
              onPress={() => setShowSuccessModal(false)}
            >
              <Text style={homeInputStyles.successCloseBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ============================================ */}
      {/* SEND TO MODAL */}
      {/* ============================================ */}
      <Modal
        visible={showSendToModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSendToModal(false)}
      >
        <TouchableOpacity
          style={fixedStyles.sendToModalOverlay}
          activeOpacity={1}
          onPress={() => setShowSendToModal(false)}
        >
          <View style={fixedStyles.sendToModalContainer}>
            {/* Header */}
            <View style={fixedStyles.sendToModalHeader}>
              <Ionicons name="paper-plane" size={20} color={colors.accent} />
              <Text style={fixedStyles.sendToModalTitle}>Send Report</Text>
              <TouchableOpacity
                style={fixedStyles.sendToModalCloseButton}
                onPress={() => setShowSendToModal(false)}
              >
                <Ionicons name="close" size={16} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Phone Input */}
            <View style={fixedStyles.phoneInputContainer}>
              <Text style={fixedStyles.phoneInputLabel}>Phone Number</Text>
              <View style={fixedStyles.phoneInputRow}>
                <TextInput
                  style={fixedStyles.phoneInput}
                  placeholder="+55 11 99999-9999"
                  placeholderTextColor={colors.textMuted}
                  value={phoneNumber}
                  onChangeText={setPhoneNumber}
                  keyboardType="phone-pad"
                  autoFocus
                />
                <TouchableOpacity style={fixedStyles.contactsButton}>
                  <Ionicons name="person-add" size={18} color={colors.white} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Recent Contacts */}
            <View style={fixedStyles.recentContactsContainer}>
              <Text style={fixedStyles.recentContactsTitle}>Recent</Text>
              {recentContacts.length > 0 ? (
                recentContacts.map((contact, index) => (
                  <TouchableOpacity
                    key={index}
                    style={fixedStyles.recentContactItem}
                    onPress={() => handleSelectContact(contact)}
                  >
                    <View style={fixedStyles.recentContactInfo}>
                      <Text style={fixedStyles.recentContactName}>{contact.name}</Text>
                      <Text style={fixedStyles.recentContactPhone}>{contact.phone}</Text>
                    </View>
                    <TouchableOpacity
                      style={fixedStyles.recentContactSelect}
                      onPress={() => handleSelectContact(contact)}
                    >
                      <Ionicons name="checkmark" size={12} color={colors.white} />
                    </TouchableOpacity>
                  </TouchableOpacity>
                ))
              ) : (
                <Text style={fixedStyles.emptyContactsText}>
                  No recent contacts
                </Text>
              )}
            </View>

            {/* Actions */}
            <View style={fixedStyles.sendToModalActions}>
              <TouchableOpacity
                style={fixedStyles.sendToModalCancelButton}
                onPress={() => setShowSendToModal(false)}
              >
                <Text style={fixedStyles.sendToModalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={fixedStyles.sendToModalSendButton}
                onPress={handleSendToWhatsApp}
              >
                <Ionicons name="logo-whatsapp" size={16} color={colors.white} />
                <Text style={fixedStyles.sendToModalSendText}>WhatsApp</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Toast Notification */}
      {toastMessage !== '' && (
        <Animated.View
          style={[
            toastStyles.toast,
            { opacity: toastOpacity }
          ]}
        >
          <Text style={toastStyles.toastText}>{toastMessage}</Text>
        </Animated.View>
      )}
    </View>
  );
}

// Toast notification styles
const toastStyles = StyleSheet.create({
  toast: {
    position: 'absolute',
    bottom: 100,
    left: 20,
    right: 20,
    backgroundColor: colors.error,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 9999,
  },
  toastText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
});

// Time input styles (simple text inputs instead of picker)
const homeInputStyles = StyleSheet.create({
  timeInputGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  timeInput: {
    width: 48,
    height: 44,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
    paddingHorizontal: 4,
  },
  timeSeparator: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  // AM/PM Toggle
  ampmToggle: {
    flexDirection: 'row',
    marginLeft: 8,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 8,
    padding: 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ampmBtn: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  ampmBtnActive: {
    backgroundColor: colors.primary,
  },
  ampmText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  ampmTextActive: {
    color: colors.buttonPrimaryText,
  },
  // Success Modal
  successModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  successModalContent: {
    width: '100%',
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
  },
  successIcon: {
    marginBottom: 12,
  },
  successTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  successSubtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    marginBottom: 24,
  },
  successSendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    width: '100%',
    paddingVertical: 14,
    backgroundColor: '#25D366',
    borderRadius: 12,
    marginBottom: 12,
  },
  successSendBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.white,
  },
  successCloseBtn: {
    width: '100%',
    paddingVertical: 14,
    alignItems: 'center',
  },
  successCloseBtnText: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.textSecondary,
  },
});
