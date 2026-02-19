/**
 * Legal Screen - OnSite Timekeeper
 * Privacy Policy and Terms of Service
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors } from '../src/constants/colors';

// URLs for external links
const PRIVACY_URL = 'https://www.onsiteclub.ca/legal/timekeeper-privacy';
const TERMS_URL = 'https://www.onsiteclub.ca/legal/timekeeper-terms';

type TabType = 'privacy' | 'terms';

export default function LegalScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabType>('privacy');

  const openExternalLink = () => {
    const url = activeTab === 'privacy' ? PRIVACY_URL : TERMS_URL;
    Linking.openURL(url);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Legal</Text>
        <TouchableOpacity
          style={styles.externalButton}
          onPress={openExternalLink}
        >
          <Ionicons name="open-outline" size={22} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'privacy' && styles.tabActive]}
          onPress={() => setActiveTab('privacy')}
        >
          <Text style={[styles.tabText, activeTab === 'privacy' && styles.tabTextActive]}>
            Privacy Policy
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'terms' && styles.tabActive]}
          onPress={() => setActiveTab('terms')}
        >
          <Text style={[styles.tabText, activeTab === 'terms' && styles.tabTextActive]}>
            Terms of Service
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {activeTab === 'privacy' ? <PrivacyContent /> : <TermsContent />}
      </ScrollView>
    </SafeAreaView>
  );
}

// ============================================
// PRIVACY POLICY CONTENT
// ============================================

function PrivacyContent() {
  return (
    <View>
      <Text style={styles.title}>OnSite Timekeeper - Privacy Policy</Text>
      <Text style={styles.lastUpdated}>Last Updated: February 19, 2026</Text>

      <Text style={styles.paragraph}>
        OnSite Club ("we," "our," or "us") operates the OnSite Timekeeper mobile application (the "App"). This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our App.
      </Text>

      <Text style={styles.sectionTitle}>1. Information We Collect</Text>

      <Text style={styles.subTitle}>1.1 Personal Information</Text>
      <Text style={styles.paragraph}>When you create an account, we collect:</Text>
      <Text style={styles.bulletItem}>• Email address - Used for authentication and account recovery</Text>
      <Text style={styles.bulletItem}>• Name and surname - Used to identify you within the App</Text>
      <Text style={styles.bulletItem}>• User ID - A unique identifier assigned to your account</Text>

      <Text style={styles.subTitle}>1.2 Location Data</Text>
      <Text style={styles.paragraph}>Our App collects location data to provide its core functionality:</Text>
      <Text style={styles.bulletItem}>• Precise GPS coordinates - Collected when you use the map feature or when geofencing is enabled</Text>
      <Text style={styles.bulletItem}>• Background location - With your explicit permission, we collect location data even when the App is closed or not in use. This is essential for automatically detecting when you arrive at or leave your work location, recording accurate work entry and exit times, and providing geofence-based time tracking.</Text>
      <Text style={styles.paragraph}>We use geofencing technology, NOT continuous GPS tracking. Location is only processed when you enter or exit a defined work zone.</Text>

      <Text style={styles.subTitle}>1.3 Work Session Data</Text>
      <Text style={styles.bulletItem}>• Entry and exit timestamps</Text>
      <Text style={styles.bulletItem}>• Work location names</Text>
      <Text style={styles.bulletItem}>• Session duration and break times</Text>
      <Text style={styles.bulletItem}>• Notes attached to work sessions</Text>

      <Text style={styles.subTitle}>1.4 Device and Usage Information</Text>
      <Text style={styles.bulletItem}>• Device type and operating system version</Text>
      <Text style={styles.bulletItem}>• App version</Text>
      <Text style={styles.bulletItem}>• Timezone settings</Text>
      <Text style={styles.bulletItem}>• Anonymous usage analytics (features used, session duration)</Text>
      <Text style={styles.bulletItem}>• Crash reports and error logs (via Sentry - no PII included)</Text>

      <Text style={styles.sectionTitle}>2. How We Use Your Information</Text>
      <Text style={styles.paragraph}>We use the collected information for the following purposes:</Text>
      <Text style={styles.bulletItem}>• Account Management - Email, name, user ID</Text>
      <Text style={styles.bulletItem}>• Time Tracking - Location data, timestamps</Text>
      <Text style={styles.bulletItem}>• Geofencing - Background location, work locations</Text>
      <Text style={styles.bulletItem}>• Work Reports - Session data, timestamps</Text>
      <Text style={styles.bulletItem}>• App Improvement - Anonymous usage data, crash reports</Text>
      <Text style={styles.bulletItem}>• Customer Support - Email, session data</Text>

      <Text style={styles.paragraph}>We do NOT use your data for advertising or marketing to third parties, selling to data brokers, tracking your movements outside of work-related geofences, or building advertising profiles.</Text>

      <Text style={styles.sectionTitle}>3. Location Data - Detailed Disclosure</Text>

      <Text style={styles.subTitle}>3.1 Why We Need Background Location</Text>
      <Text style={styles.paragraph}>
        OnSite Timekeeper is a work time tracking application. The geofencing feature requires detecting when you physically arrive at or leave your designated work location. This functionality requires background location access because you may arrive at work with your phone in your pocket (App not open), you may leave work without manually opening the App, and automatic time tracking requires continuous geofence monitoring.
      </Text>
      <Text style={styles.importantText}>
        IMPORTANT: Background location is ONLY required for the premium geofencing feature. The free tier (manual time entry) does NOT require any location access.
      </Text>

      <Text style={styles.subTitle}>3.2 How Background Location Works</Text>
      <Text style={styles.bulletItem}>• We use geofencing technology (not continuous GPS tracking)</Text>
      <Text style={styles.bulletItem}>• Location is only processed when you enter or exit a defined work zone</Text>
      <Text style={styles.bulletItem}>• We do NOT track your location continuously throughout the day</Text>
      <Text style={styles.bulletItem}>• Location data is processed locally on your device first</Text>
      <Text style={styles.bulletItem}>• Only entry/exit events are recorded and optionally synced</Text>

      <Text style={styles.subTitle}>3.3 Your Control Over Location</Text>
      <Text style={styles.paragraph}>You can at any time:</Text>
      <Text style={styles.bulletItem}>• Disable background location in your device settings</Text>
      <Text style={styles.bulletItem}>• Remove work locations from the App</Text>
      <Text style={styles.bulletItem}>• Switch to manual time entry mode (no location required)</Text>
      <Text style={styles.bulletItem}>• Delete all stored location data</Text>
      <Text style={styles.bulletItem}>• Revoke location permission entirely (manual entry still works)</Text>

      <Text style={styles.sectionTitle}>4. Data Storage and Security</Text>

      <Text style={styles.subTitle}>4.1 Local Storage (Offline-First)</Text>
      <Text style={styles.paragraph}>Your data is stored locally on your device using SQLite database for offline functionality and secure storage for authentication tokens. Your data is NEVER lost, even without internet connection.</Text>

      <Text style={styles.subTitle}>4.2 Cloud Storage (Optional Sync)</Text>
      <Text style={styles.paragraph}>When you are online, data may sync to our cloud servers:</Text>
      <Text style={styles.bulletItem}>• Provider: Supabase (hosted on AWS)</Text>
      <Text style={styles.bulletItem}>• Location: United States / Canada</Text>
      <Text style={styles.bulletItem}>• Encryption: TLS 1.3 in transit, AES-256 at rest</Text>
      <Text style={styles.bulletItem}>• Access Control: Row Level Security (RLS) ensures you can only access your own data</Text>

      <Text style={styles.subTitle}>4.3 Security Measures</Text>
      <Text style={styles.bulletItem}>• All data transmission uses HTTPS/TLS encryption</Text>
      <Text style={styles.bulletItem}>• Authentication tokens are stored in device secure storage</Text>
      <Text style={styles.bulletItem}>• Database access requires authentication</Text>
      <Text style={styles.bulletItem}>• Row-level security on all cloud tables</Text>
      <Text style={styles.bulletItem}>• We implement industry-standard security practices</Text>

      <Text style={styles.sectionTitle}>5. Data Sharing and Disclosure</Text>

      <Text style={styles.subTitle}>5.1 We Do NOT Sell Your Data</Text>
      <Text style={styles.paragraph}>We do not sell, trade, or rent your personal information to third parties.</Text>

      <Text style={styles.subTitle}>5.2 Limited Sharing</Text>
      <Text style={styles.paragraph}>We may share your data only in these circumstances:</Text>
      <Text style={styles.bulletItem}>• Your Employer/Manager - Only if you explicitly grant access via the Team Sharing feature (work hours and session times only)</Text>
      <Text style={styles.bulletItem}>• Service Providers - Infrastructure and hosting (encrypted data only)</Text>
      <Text style={styles.bulletItem}>• Legal Authorities - If required by law or valid legal process</Text>

      <Text style={styles.subTitle}>5.3 Team Sharing Feature</Text>
      <Text style={styles.paragraph}>If you choose to share your timesheet with a manager or employer:</Text>
      <Text style={styles.bulletItem}>• You explicitly grant access via a sharing code or QR code</Text>
      <Text style={styles.bulletItem}>• You can revoke access at any time</Text>
      <Text style={styles.bulletItem}>• Shared data includes: work hours, entry/exit times, location names</Text>
      <Text style={styles.bulletItem}>• Shared data does NOT include: precise GPS coordinates, personal device info</Text>

      <Text style={styles.sectionTitle}>6. Third-Party Services</Text>
      <Text style={styles.paragraph}>Our App uses the following third-party services:</Text>
      <Text style={styles.bulletItem}>• Supabase - Authentication, database, and cloud sync</Text>
      <Text style={styles.bulletItem}>• Google Maps - Map display and geocoding</Text>
      <Text style={styles.bulletItem}>• Expo - App framework and push notifications</Text>
      <Text style={styles.bulletItem}>• Sentry - Error monitoring and crash reporting (no PII collected)</Text>
      <Text style={styles.paragraph}>Each third-party provider has their own privacy policy. We require that all third-party partners provide equivalent or greater data protection.</Text>

      <Text style={styles.sectionTitle}>7. Data Retention</Text>
      <Text style={styles.bulletItem}>• Account information - Until you delete your account</Text>
      <Text style={styles.bulletItem}>• Work session records - 2 years (for legal/tax compliance)</Text>
      <Text style={styles.bulletItem}>• Location audit logs - 90 days</Text>
      <Text style={styles.bulletItem}>• Error logs and crash reports - 30 days</Text>
      <Text style={styles.bulletItem}>• Anonymous analytics - 12 months</Text>
      <Text style={styles.paragraph}>After these periods, data is automatically deleted from our servers.</Text>

      <Text style={styles.sectionTitle}>8. Account Deletion</Text>
      <Text style={styles.paragraph}>You can delete your account at any time through:</Text>
      <Text style={styles.bulletItem}>• In-App: Settings {'>'} Account {'>'} Delete Account</Text>
      <Text style={styles.bulletItem}>• Email: privacy@onsiteclub.ca</Text>
      <Text style={styles.paragraph}>Upon deletion, your account is permanently deactivated, all personal data is deleted from our servers within 30 days, local data on your device is cleared immediately, anonymized aggregated data may be retained for analytics, and shared access (Team Sharing) is automatically revoked.</Text>

      <Text style={styles.sectionTitle}>9. Your Rights</Text>

      <Text style={styles.subTitle}>9.1 Under GDPR (European Users)</Text>
      <Text style={styles.paragraph}>Legal basis for processing: Consent (location data), Legitimate Interest (service provision), Contract (account management). You have the right to:</Text>
      <Text style={styles.bulletItem}>• Access - Request a copy of your data</Text>
      <Text style={styles.bulletItem}>• Rectification - Correct inaccurate data</Text>
      <Text style={styles.bulletItem}>• Erasure - Request deletion of your data ("right to be forgotten")</Text>
      <Text style={styles.bulletItem}>• Portability - Export your data in a standard format (PDF, CSV)</Text>
      <Text style={styles.bulletItem}>• Restriction - Limit how we process your data</Text>
      <Text style={styles.bulletItem}>• Objection - Object to certain processing activities</Text>
      <Text style={styles.bulletItem}>• Withdraw Consent - Revoke previously given consent at any time</Text>

      <Text style={styles.subTitle}>9.2 Under CCPA (California Users)</Text>
      <Text style={styles.paragraph}>You have the right to know what personal information we collect, request deletion of your personal information, opt-out of the sale of personal information (we don't sell data), and non-discrimination for exercising your rights.</Text>

      <Text style={styles.subTitle}>9.3 Under LGPD (Brazilian Users)</Text>
      <Text style={styles.paragraph}>You have equivalent rights to access, correct, delete, and port your data, as well as the right to information about data sharing and the identity of the data protection officer.</Text>

      <Text style={styles.subTitle}>9.4 How to Exercise Your Rights</Text>
      <Text style={styles.paragraph}>Contact us at:</Text>
      <Text style={styles.bulletItem}>• Email: privacy@onsiteclub.ca</Text>
      <Text style={styles.bulletItem}>• In-App: Settings {'>'} Privacy {'>'} Request Data / Delete Account</Text>
      <Text style={styles.paragraph}>We will respond to your request within 30 days.</Text>

      <Text style={styles.sectionTitle}>10. Children's Privacy</Text>
      <Text style={styles.paragraph}>
        OnSite Timekeeper is not intended for use by children under 16 years of age. We do not knowingly collect personal information from children. If you believe we have collected data from a child, please contact us immediately at privacy@onsiteclub.ca.
      </Text>

      <Text style={styles.sectionTitle}>11. Changes to This Privacy Policy</Text>
      <Text style={styles.paragraph}>
        We may update this Privacy Policy from time to time. We will notify you of changes by posting the new Privacy Policy in the App, updating the "Last Updated" date, and sending an email notification for significant changes.
      </Text>
      <Text style={styles.paragraph}>Your continued use of the App after changes constitutes acceptance of the updated policy.</Text>

      <Text style={styles.sectionTitle}>12. Contact Us</Text>
      <Text style={styles.paragraph}>If you have questions or concerns about this Privacy Policy or our data practices, please contact us:</Text>
      <Text style={styles.bulletItem}>OnSite Club</Text>
      <Text style={styles.bulletItem}>• Privacy: privacy@onsiteclub.ca</Text>
      <Text style={styles.bulletItem}>• Support: support@onsiteclub.ca</Text>
      <Text style={styles.bulletItem}>• Website: https://onsiteclub.ca</Text>
      <Text style={styles.paragraph}>Located in Ontario, Canada.</Text>

      <Text style={styles.sectionTitle}>13. Consent</Text>
      <Text style={styles.paragraph}>
        By using OnSite Timekeeper, you consent to the collection and use of your information as described in this Privacy Policy. For location data, we request explicit consent through your device's permission system before any collection begins. You may withdraw consent at any time by disabling permissions in your device settings.
      </Text>

      <View style={styles.summaryBox}>
        <Text style={styles.summaryTitle}>Summary of Key Points:</Text>
        <Text style={styles.summaryItem}>✓ We collect location data only for work time tracking</Text>
        <Text style={styles.summaryItem}>✓ We do NOT sell your data</Text>
        <Text style={styles.summaryItem}>✓ We do NOT track you outside of work geofences</Text>
        <Text style={styles.summaryItem}>✓ You control your data and can delete it anytime</Text>
        <Text style={styles.summaryItem}>✓ All data is encrypted in transit and at rest</Text>
        <Text style={styles.summaryItem}>✓ Free tier works without any location access</Text>
        <Text style={styles.summaryItem}>✓ Account deletion available in-app and via email</Text>
      </View>

      <Text style={styles.copyright}>© 2026 OnSite Club. All rights reserved.</Text>
    </View>
  );
}

// ============================================
// TERMS OF SERVICE CONTENT
// ============================================

function TermsContent() {
  return (
    <View>
      <Text style={styles.title}>OnSite Timekeeper - Terms of Service</Text>
      <Text style={styles.lastUpdated}>Last Updated: February 19, 2026</Text>

      <Text style={styles.paragraph}>
        Please read these Terms of Service ("Terms," "Agreement") carefully before using the OnSite Timekeeper mobile application ("App") operated by OnSite Club ("Company," "we," "our," or "us").
      </Text>
      <Text style={styles.paragraph}>
        By downloading, installing, or using the App, you agree to be bound by these Terms. If you do not agree to these Terms, do not use the App.
      </Text>

      <Text style={styles.sectionTitle}>1. Acceptance of Terms</Text>

      <Text style={styles.subTitle}>1.1 Agreement to Terms</Text>
      <Text style={styles.paragraph}>By accessing or using OnSite Timekeeper, you confirm that:</Text>
      <Text style={styles.bulletItem}>• You are at least 16 years of age</Text>
      <Text style={styles.bulletItem}>• You have the legal capacity to enter into this Agreement</Text>
      <Text style={styles.bulletItem}>• You will comply with these Terms and all applicable laws</Text>
      <Text style={styles.bulletItem}>• If using on behalf of an organization, you have authority to bind that organization</Text>

      <Text style={styles.subTitle}>1.2 Additional Policies</Text>
      <Text style={styles.paragraph}>These Terms incorporate by reference our Privacy Policy and any additional guidelines or rules posted within the App.</Text>

      <Text style={styles.sectionTitle}>2. Description of Service</Text>

      <Text style={styles.subTitle}>2.1 What OnSite Timekeeper Does</Text>
      <Text style={styles.paragraph}>OnSite Timekeeper is a mobile application designed to help users track their work hours. The App provides:</Text>
      <Text style={styles.bulletItem}>• Manual time entry - Record work hours by manually entering start and end times</Text>
      <Text style={styles.bulletItem}>• Location-based tracking - Save work locations for quick access</Text>
      <Text style={styles.bulletItem}>• Geofencing (Premium) - Automatically detect arrival and departure from work locations using background location</Text>
      <Text style={styles.bulletItem}>• Reports and exports - Generate timesheets in PDF and CSV formats</Text>
      <Text style={styles.bulletItem}>• Team sharing - Share your timesheet with employers or managers</Text>

      <Text style={styles.subTitle}>2.2 Service Tiers</Text>
      <Text style={styles.paragraph}>Free Tier:</Text>
      <Text style={styles.bulletItem}>• Manual time entry and editing</Text>
      <Text style={styles.bulletItem}>• Work session history and calendar view</Text>
      <Text style={styles.bulletItem}>• Basic reports</Text>
      <Text style={styles.bulletItem}>• Local data storage (offline-first)</Text>
      <Text style={styles.bulletItem}>• Cloud backup and sync</Text>
      <Text style={styles.paragraph}>Premium Tier (Geofencing):</Text>
      <Text style={styles.bulletItem}>• All Free features plus:</Text>
      <Text style={styles.bulletItem}>• Automatic entry/exit detection via GPS geofencing</Text>
      <Text style={styles.bulletItem}>• Multiple work location zones</Text>
      <Text style={styles.bulletItem}>• Background location monitoring</Text>
      <Text style={styles.bulletItem}>• Location audit trail</Text>

      <Text style={styles.subTitle}>2.3 Service Availability</Text>
      <Text style={styles.paragraph}>
        We strive to maintain continuous service availability. However, we do not guarantee that the App will be available at all times without interruption, free from errors, bugs, or security vulnerabilities, or compatible with all devices or operating systems.
      </Text>

      <Text style={styles.sectionTitle}>3. User Accounts</Text>

      <Text style={styles.subTitle}>3.1 Account Creation</Text>
      <Text style={styles.paragraph}>To use OnSite Timekeeper, you must create an account by providing a valid email address, a secure password, and your name (optional but recommended).</Text>

      <Text style={styles.subTitle}>3.2 Account Responsibilities</Text>
      <Text style={styles.paragraph}>You are responsible for:</Text>
      <Text style={styles.bulletItem}>• Maintaining the confidentiality of your login credentials</Text>
      <Text style={styles.bulletItem}>• All activities that occur under your account</Text>
      <Text style={styles.bulletItem}>• Notifying us immediately of any unauthorized access</Text>
      <Text style={styles.bulletItem}>• Ensuring your account information is accurate and current</Text>

      <Text style={styles.subTitle}>3.3 Account Security</Text>
      <Text style={styles.paragraph}>We implement industry-standard security measures, but you acknowledge that no system is completely secure. We are not liable for any loss resulting from unauthorized access to your account due to your failure to protect your credentials.</Text>

      <Text style={styles.subTitle}>3.4 Account Deletion</Text>
      <Text style={styles.paragraph}>You may delete your account at any time through:</Text>
      <Text style={styles.bulletItem}>• In-App: Settings {'>'} Account {'>'} Delete Account</Text>
      <Text style={styles.bulletItem}>• Email: privacy@onsiteclub.ca</Text>
      <Text style={styles.paragraph}>Upon deletion, your data will be permanently removed within 30 days. See our Privacy Policy for full details.</Text>

      <Text style={styles.sectionTitle}>4. Service Plans and Pricing</Text>

      <Text style={styles.subTitle}>4.1 Current Offering</Text>
      <Text style={styles.paragraph}>OnSite Timekeeper offers both free and premium features. The free tier includes manual time entry, reports, and cloud sync. Premium geofencing features may require a subscription.</Text>

      <Text style={styles.subTitle}>4.2 Future Changes</Text>
      <Text style={styles.paragraph}>
        We reserve the right to modify pricing or introduce new subscription plans. If we do, we will provide at least 30 days notice. Features that were free at the time you started using them will be communicated clearly if any changes apply.
      </Text>

      <Text style={styles.subTitle}>4.3 Payments and Refunds</Text>
      <Text style={styles.paragraph}>If applicable, subscriptions are processed through the Apple App Store or Google Play Store. Refund policies follow the respective store's policies. You may cancel your subscription at any time.</Text>

      <Text style={styles.sectionTitle}>5. Acceptable Use</Text>

      <Text style={styles.subTitle}>5.1 Permitted Uses</Text>
      <Text style={styles.paragraph}>You may use OnSite Timekeeper to track your own work hours, generate personal timesheets and reports, share your data with authorized parties (employers, managers), and export your data for personal or professional use.</Text>

      <Text style={styles.subTitle}>5.2 Prohibited Uses</Text>
      <Text style={styles.paragraph}>You agree NOT to:</Text>
      <Text style={styles.bulletItem}>• Use the App for any illegal purpose</Text>
      <Text style={styles.bulletItem}>• Falsify time records or location data</Text>
      <Text style={styles.bulletItem}>• Attempt to circumvent security features</Text>
      <Text style={styles.bulletItem}>• Reverse engineer, decompile, or disassemble the App</Text>
      <Text style={styles.bulletItem}>• Use automated systems to access the App (bots, scrapers)</Text>
      <Text style={styles.bulletItem}>• Interfere with or disrupt the App's functionality</Text>
      <Text style={styles.bulletItem}>• Impersonate another person or entity</Text>
      <Text style={styles.bulletItem}>• Share your account credentials with others</Text>
      <Text style={styles.bulletItem}>• Use the App to track other people without their consent</Text>

      <Text style={styles.subTitle}>5.3 Consequences of Violation</Text>
      <Text style={styles.paragraph}>Violation of these terms may result in suspension or termination of your account, loss of access to premium features without refund, and legal action if applicable.</Text>

      <Text style={styles.sectionTitle}>6. Location Services and Geofencing</Text>

      <Text style={styles.subTitle}>6.1 Location Data Collection</Text>
      <Text style={styles.paragraph}>When you enable location features, you understand and agree that the App collects precise GPS coordinates, background location may be collected when the App is not in use, location data is used to detect arrival/departure from work locations, you can disable location services at any time in your device settings, and location access is NOT required for manual time entry (free tier).</Text>

      <Text style={styles.subTitle}>6.2 Background Location Disclosure</Text>
      <Text style={styles.paragraph}>The App uses background location access to automatically detect when you arrive at or leave a work site, even when the App is closed or not in use. This data is used exclusively for geofence-based time tracking. Your location is never shared with advertisers or third parties. You can disable this at any time in your device settings.</Text>

      <Text style={styles.subTitle}>6.3 Geofencing Limitations</Text>
      <Text style={styles.paragraph}>You acknowledge that geofencing technology has inherent limitations:</Text>
      <Text style={styles.bulletItem}>• GPS Accuracy - Location accuracy varies based on device, environment, and signal strength</Text>
      <Text style={styles.bulletItem}>• Timing Delays - Entry/exit detection may be delayed by several minutes</Text>
      <Text style={styles.bulletItem}>• False Triggers - Occasional false positives or negatives may occur</Text>
      <Text style={styles.bulletItem}>• Battery Impact - Background location services consume battery</Text>
      <Text style={styles.bulletItem}>• Indoor Accuracy - GPS may be less accurate inside buildings</Text>

      <Text style={styles.subTitle}>6.4 No Guarantee of Accuracy</Text>
      <Text style={styles.importantText}>
        IMPORTANT: OnSite Timekeeper is a tool to assist with time tracking, NOT an official timekeeping system. You are responsible for verifying the accuracy of recorded times, making manual corrections when necessary, maintaining your own official records if required by law or employer, and reviewing time records before submission to employers.
      </Text>
      <Text style={styles.paragraph}>We are NOT liable for any disputes, losses, or damages arising from inaccurate time records.</Text>

      <Text style={styles.sectionTitle}>7. Data and Content</Text>

      <Text style={styles.subTitle}>7.1 Your Data</Text>
      <Text style={styles.paragraph}>You retain ownership of all data you input into the App, including work session records, location names and addresses, and personal information.</Text>

      <Text style={styles.subTitle}>7.2 License to Use Your Data</Text>
      <Text style={styles.paragraph}>By using the App, you grant us a limited license to store your data on our servers, process your data to provide the service, back up your data for recovery purposes, and display your data to you within the App.</Text>

      <Text style={styles.subTitle}>7.3 Data Export</Text>
      <Text style={styles.paragraph}>You may export your data at any time through the App's export features. We provide data in standard formats (PDF, CSV) for your convenience.</Text>

      <Text style={styles.subTitle}>7.4 Data Deletion</Text>
      <Text style={styles.paragraph}>You may delete your data and account at any time. Upon deletion, your account will be permanently deactivated, personal data will be deleted from servers within 30 days, local data on your device is cleared immediately, and anonymized, aggregated data may be retained for analytics.</Text>

      <Text style={styles.sectionTitle}>8. Intellectual Property</Text>

      <Text style={styles.subTitle}>8.1 Our Property</Text>
      <Text style={styles.paragraph}>OnSite Timekeeper and its original content, features, and functionality are owned by OnSite Club and are protected by copyright, trademark, and other intellectual property rights.</Text>

      <Text style={styles.subTitle}>8.2 Restrictions</Text>
      <Text style={styles.paragraph}>You may not copy, modify, or distribute the App, use our trademarks without permission, create derivative works based on the App, or remove any copyright or proprietary notices.</Text>

      <Text style={styles.subTitle}>8.3 Feedback</Text>
      <Text style={styles.paragraph}>If you provide suggestions, ideas, or feedback about the App, you grant us the right to use such feedback without compensation or attribution.</Text>

      <Text style={styles.sectionTitle}>9. Third-Party Services</Text>

      <Text style={styles.subTitle}>9.1 Third-Party Integrations</Text>
      <Text style={styles.paragraph}>The App may integrate with third-party services including Google Maps (map display and geocoding), Supabase (authentication and data storage), Sentry (error monitoring), and App Store / Google Play (distribution and payments).</Text>

      <Text style={styles.subTitle}>9.2 Third-Party Terms</Text>
      <Text style={styles.paragraph}>Your use of third-party services is subject to their respective terms and privacy policies. We are not responsible for third-party services.</Text>

      <Text style={styles.subTitle}>9.3 Links</Text>
      <Text style={styles.paragraph}>The App may contain links to external websites or services. We do not endorse or control these external resources.</Text>

      <Text style={styles.sectionTitle}>10. Disclaimers</Text>

      <Text style={styles.subTitle}>10.1 "As Is" Basis</Text>
      <Text style={styles.importantText}>
        THE APP IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT, OR ACCURACY OR RELIABILITY.
      </Text>

      <Text style={styles.subTitle}>10.2 No Professional Advice</Text>
      <Text style={styles.paragraph}>OnSite Timekeeper is a time tracking tool, not a substitute for professional HR or payroll systems, legal compliance systems, or official timekeeping required by law. Consult appropriate professionals for employment, legal, or tax matters.</Text>

      <Text style={styles.subTitle}>10.3 Service Interruptions</Text>
      <Text style={styles.paragraph}>We do not warrant that the App will be uninterrupted or error-free, that defects will be corrected, or that the App is free of viruses or harmful components.</Text>

      <Text style={styles.sectionTitle}>11. Limitation of Liability</Text>

      <Text style={styles.subTitle}>11.1 Exclusion of Damages</Text>
      <Text style={styles.importantText}>
        TO THE MAXIMUM EXTENT PERMITTED BY LAW, ONSITE CLUB SHALL NOT BE LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, OR CONSEQUENTIAL DAMAGES, LOSS OF PROFITS, REVENUE, OR DATA, BUSINESS INTERRUPTION, OR DAMAGES ARISING FROM USE OR INABILITY TO USE THE APP.
      </Text>

      <Text style={styles.subTitle}>11.2 Maximum Liability</Text>
      <Text style={styles.paragraph}>OUR TOTAL LIABILITY SHALL NOT EXCEED THE AMOUNT YOU PAID FOR THE APP IN THE 12 MONTHS PRECEDING THE CLAIM, OR $100 CAD, WHICHEVER IS GREATER.</Text>

      <Text style={styles.subTitle}>11.3 Exceptions</Text>
      <Text style={styles.paragraph}>Some jurisdictions do not allow limitation of liability for certain damages. In such cases, our liability is limited to the maximum extent permitted by law.</Text>

      <Text style={styles.sectionTitle}>12. Indemnification</Text>
      <Text style={styles.paragraph}>
        You agree to indemnify and hold harmless OnSite Club, its officers, directors, employees, and agents from any claims, damages, losses, or expenses (including legal fees) arising from your use of the App, your violation of these Terms, your violation of any third-party rights, and any dispute between you and your employer regarding time records.
      </Text>

      <Text style={styles.sectionTitle}>13. Termination</Text>

      <Text style={styles.subTitle}>13.1 Termination by You</Text>
      <Text style={styles.paragraph}>You may stop using the App and delete your account at any time.</Text>

      <Text style={styles.subTitle}>13.2 Termination by Us</Text>
      <Text style={styles.paragraph}>We may suspend or terminate your account if you violate these Terms, your account is inactive for more than 24 months, we discontinue the App (with reasonable notice), or if required by law.</Text>

      <Text style={styles.subTitle}>13.3 Effect of Termination</Text>
      <Text style={styles.paragraph}>Upon termination, your right to use the App ceases immediately, we may delete your data (subject to legal retention requirements), and provisions that should survive termination will remain in effect.</Text>

      <Text style={styles.sectionTitle}>14. Dispute Resolution</Text>

      <Text style={styles.subTitle}>14.1 Informal Resolution</Text>
      <Text style={styles.paragraph}>Before filing a formal dispute, you agree to contact us at legal@onsiteclub.ca to attempt informal resolution.</Text>

      <Text style={styles.subTitle}>14.2 Governing Law</Text>
      <Text style={styles.paragraph}>These Terms are governed by the laws of the Province of Ontario, Canada, without regard to conflict of law principles.</Text>

      <Text style={styles.subTitle}>14.3 Jurisdiction</Text>
      <Text style={styles.paragraph}>Any disputes shall be resolved in the courts located in Ontario, Canada. You consent to the personal jurisdiction of such courts.</Text>

      <Text style={styles.subTitle}>14.4 Class Action Waiver</Text>
      <Text style={styles.importantText}>
        YOU AGREE TO RESOLVE DISPUTES ONLY ON AN INDIVIDUAL BASIS AND NOT AS PART OF ANY CLASS OR REPRESENTATIVE ACTION.
      </Text>

      <Text style={styles.sectionTitle}>15. Changes to Terms</Text>

      <Text style={styles.subTitle}>15.1 Modifications</Text>
      <Text style={styles.paragraph}>We reserve the right to modify these Terms at any time. Changes become effective when posted unless otherwise specified.</Text>

      <Text style={styles.subTitle}>15.2 Notification</Text>
      <Text style={styles.paragraph}>We will notify you of material changes through in-app notification, email to your registered address, and notice on our website.</Text>

      <Text style={styles.subTitle}>15.3 Continued Use</Text>
      <Text style={styles.paragraph}>Your continued use of the App after changes constitutes acceptance of the modified Terms. If you do not agree, you must stop using the App.</Text>

      <Text style={styles.sectionTitle}>16. General Provisions</Text>

      <Text style={styles.subTitle}>16.1 Entire Agreement</Text>
      <Text style={styles.paragraph}>These Terms, together with our Privacy Policy, constitute the entire agreement between you and OnSite Club regarding the App.</Text>

      <Text style={styles.subTitle}>16.2 Severability</Text>
      <Text style={styles.paragraph}>If any provision of these Terms is found invalid or unenforceable, the remaining provisions remain in full effect.</Text>

      <Text style={styles.subTitle}>16.3 Waiver</Text>
      <Text style={styles.paragraph}>Our failure to enforce any provision does not constitute a waiver of that provision or any other provision.</Text>

      <Text style={styles.subTitle}>16.4 Assignment</Text>
      <Text style={styles.paragraph}>You may not assign your rights under these Terms. We may assign our rights to any affiliate or successor.</Text>

      <Text style={styles.subTitle}>16.5 Force Majeure</Text>
      <Text style={styles.paragraph}>We are not liable for delays or failures due to circumstances beyond our reasonable control (natural disasters, war, government actions, etc.).</Text>

      <Text style={styles.sectionTitle}>17. Contact Information</Text>
      <Text style={styles.paragraph}>For questions about these Terms, please contact us:</Text>
      <Text style={styles.bulletItem}>OnSite Club</Text>
      <Text style={styles.bulletItem}>• Legal: legal@onsiteclub.ca</Text>
      <Text style={styles.bulletItem}>• Support: support@onsiteclub.ca</Text>
      <Text style={styles.bulletItem}>• Website: https://onsiteclub.ca</Text>
      <Text style={styles.paragraph}>Located in Ontario, Canada.</Text>

      <Text style={styles.sectionTitle}>18. Acknowledgment</Text>
      <Text style={styles.importantText}>
        BY USING ONSITE TIMEKEEPER, YOU ACKNOWLEDGE THAT YOU HAVE READ, UNDERSTOOD, AND AGREE TO BE BOUND BY THESE TERMS OF SERVICE.
      </Text>
      <Text style={styles.paragraph}>If you do not agree to these Terms, please do not use the App.</Text>

      <View style={styles.summaryBox}>
        <Text style={styles.summaryTitle}>Summary of Key Points:</Text>
        <Text style={styles.summaryItem}>✓ Free tier available (manual time entry, no location required)</Text>
        <Text style={styles.summaryItem}>✓ Premium geofencing requires background location permission</Text>
        <Text style={styles.summaryItem}>✓ GPS/geofencing has inherent accuracy limitations</Text>
        <Text style={styles.summaryItem}>✓ You own your data and can export/delete it anytime</Text>
        <Text style={styles.summaryItem}>✓ App is a tool, not an official timekeeping system</Text>
        <Text style={styles.summaryItem}>✓ We are not liable for time record disputes</Text>
        <Text style={styles.summaryItem}>✓ Account deletion available in-app and via email</Text>
      </View>

      <Text style={styles.copyright}>© 2026 OnSite Club. All rights reserved.</Text>
    </View>
  );
}

// ============================================
// STYLES
// ============================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  externalButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: colors.surface,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: colors.white,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 40,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 8,
  },
  lastUpdated: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginTop: 24,
    marginBottom: 12,
  },
  subTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    marginTop: 16,
    marginBottom: 8,
  },
  paragraph: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 22,
    marginBottom: 12,
  },
  bulletItem: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 22,
    marginBottom: 6,
    paddingLeft: 8,
  },
  importantText: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 22,
    marginBottom: 12,
    fontWeight: '500',
    backgroundColor: colors.surface,
    padding: 12,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: colors.warning,
    overflow: 'hidden',
  },
  summaryBox: {
    backgroundColor: colors.primarySoft,
    padding: 16,
    borderRadius: 12,
    marginTop: 24,
    marginBottom: 16,
  },
  summaryTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  summaryItem: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 24,
  },
  copyright: {
    fontSize: 13,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: 24,
    marginBottom: 16,
  },
});
