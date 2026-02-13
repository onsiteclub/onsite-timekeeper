/**
 * react-native-maps web shim
 *
 * Empty module that replaces react-native-maps on web platform.
 * react-native-maps is native-only and crashes on web import.
 */

import React from 'react';
import { View } from 'react-native';

const noop = () => null;
const NoopComponent = React.forwardRef((props, ref) =>
  React.createElement(View, { ...props, ref })
);
NoopComponent.displayName = 'MapViewWebShim';

export default NoopComponent;
export const Marker = NoopComponent;
export const Circle = NoopComponent;
export const Polygon = NoopComponent;
export const Polyline = NoopComponent;
export const Callout = NoopComponent;
export const Overlay = NoopComponent;
export const Heatmap = NoopComponent;
export const Geojson = NoopComponent;
export const PROVIDER_DEFAULT = null;
export const PROVIDER_GOOGLE = 'google';
