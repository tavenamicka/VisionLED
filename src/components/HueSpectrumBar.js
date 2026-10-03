import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { hslToRgb } from '../utils/colorDetection';

const TICKS = [0, 60, 120, 180, 240, 300, 360];
const STOP_COUNT = 12;

// Dégradé du cercle chromatique complet (S=100%, L=50%), échantillonné tous
// les 30° — façon phyphox : sert de repère visuel pour situer la teinte
// mesurée sur le spectre, sans faire un rendu Canvas/SVG pixel par pixel.
const GRADIENT_COLORS = Array.from({ length: STOP_COUNT + 1 }, (_, i) => {
  const { r, g, b } = hslToRgb((360 * i) / STOP_COUNT, 100, 50);
  return `rgb(${r}, ${g}, ${b})`;
});
const GRADIENT_LOCATIONS = GRADIENT_COLORS.map((_, i) => i / STOP_COUNT);

export default function HueSpectrumBar({ width, hue }) {
  const markerLeft = hue != null ? (hue / 360) * width : null;

  return (
    <View style={{ width }}>
      <View style={styles.barWrapper}>
        <LinearGradient
          colors={GRADIENT_COLORS}
          locations={GRADIENT_LOCATIONS}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.bar}
        />
        {markerLeft != null && (
          <View style={[styles.marker, { left: Math.max(0, Math.min(width - 2, markerLeft)) }]} />
        )}
      </View>
      <View style={styles.tickRow}>
        {TICKS.map((tick) => (
          <Text key={tick} style={styles.tickLabel}>
            {tick}°
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  barWrapper: { height: 14, borderRadius: 4, overflow: 'hidden' },
  bar: { flex: 1 },
  marker: {
    position: 'absolute',
    top: -2,
    width: 2,
    height: 18,
    backgroundColor: '#fff',
  },
  tickRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  tickLabel: { color: '#888', fontSize: 9 },
});
