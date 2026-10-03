import React, { useCallback, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useCameraPermissions } from 'expo-camera';
import CameraView from './src/components/CameraView';
import AdjustableViewfinder from './src/components/AdjustableViewfinder';
import PhotoZonePicker from './src/components/PhotoZonePicker';
import HueSpectrumBar from './src/components/HueSpectrumBar';
import { useContinuousAnalysis } from './src/hooks/useContinuousAnalysis';
import { rgbToHex, detectColor } from './src/utils/colorDetection';
import { capturePhoto, extractZoneColor } from './src/utils/pixelExtraction';

const CHART_WIDTH = 250;
// Palette façon phyphox : chaque grandeur garde la même couleur entre la
// lecture numérique et la barre de spectre.
const HUE_COLOR = '#ff9500';
const SATURATION_COLOR = '#00e676';
const LIGHTNESS_COLOR = '#ffffff';
const PANEL_TOP_FALLBACK = 40;
const GAP_ABOVE_VIEWFINDER = 20;

export default function App() {
  const [permission, requestPermission] = useCameraPermissions();
  const [region, setRegion] = useState(null);
  const [containerLayout, setContainerLayout] = useState({ width: 0, height: 0 });
  const [cameraReady, setCameraReady] = useState(false);
  const [panelHeight, setPanelHeight] = useState(0);
  const cameraRef = useRef(null);
  // Mode photo : image figée + zone sélectionnée au doigt (résultat séparé du scan live).
  const [photo, setPhoto] = useState(null);
  const [photoResult, setPhotoResult] = useState(null);
  const [photoError, setPhotoError] = useState(null);
  const [photoBusy, setPhotoBusy] = useState(false);

  // Positionne le panneau juste au-dessus du viseur (dont la position réelle
  // est déjà connue via `region`), plutôt qu'un décalage fixe deviné — reste
  // correct quelle que soit la taille d'écran ou la hauteur du panneau.
  const panelTop =
    !photo && region && panelHeight
      ? Math.max(PANEL_TOP_FALLBACK, region.centerY - region.height / 2 - GAP_ABOVE_VIEWFINDER - panelHeight)
      : PANEL_TOP_FALLBACK;

  const { result: liveResult, error: liveError, isRunning, isCapturing: liveCapturing, start, stop, stopAndSettle } = useContinuousAnalysis(
    cameraRef,
    region,
    containerLayout
  );

  // Identité stable : App re-rend à chaque cycle de scan (~5×/s) dès que
  // `result`/`isCapturing` changent. Sans useCallback, CameraView (composant
  // natif mémoïsé, cf. CameraView.js) recevrait une fonction différente à
  // chaque rendu et se re-rendrait inutilement malgré React.memo.
  const result = photo ? photoResult : liveResult;
  const error = photo ? photoError : liveError;
  const isCapturing = photo ? photoBusy : liveCapturing;

  const handleTakePhoto = useCallback(async () => {
    setPhotoBusy(true);
    try {
      await stopAndSettle();
      const taken = await capturePhoto(cameraRef);
      setPhotoResult(null);
      setPhotoError(null);
      setPhoto(taken);
    } catch (err) {
      setPhotoError(err?.message ?? String(err));
    } finally {
      setPhotoBusy(false);
    }
  }, [stopAndSettle]);

  const handleCloseLive = useCallback(() => {
    setPhoto(null);
    setPhotoResult(null);
    setPhotoError(null);
  }, []);

  const handleSelectZone = useCallback(
    async (rect) => {
      if (!photo) return;
      setPhotoBusy(true);
      try {
        const { r, g, b } = await extractZoneColor(photo, rect, containerLayout);
        setPhotoResult({ r, g, b, color: detectColor(r, g, b) });
        setPhotoError(null);
      } catch (err) {
        setPhotoError(err?.message ?? String(err));
      } finally {
        setPhotoBusy(false);
      }
    },
    [photo, containerLayout]
  );

  const handleCameraReady = useCallback(() => setCameraReady(true), []);

  if (!permission) {
    return <View style={styles.container} />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>VisionLED a besoin d'accéder à la caméra</Text>
        <Pressable onPress={requestPermission}>
          <Text style={styles.link}>Autoriser la caméra</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container} onLayout={(e) => setContainerLayout(e.nativeEvent.layout)}>
      <CameraView ref={cameraRef} onCameraReady={handleCameraReady} />
      <AdjustableViewfinder onRegionChange={setRegion} />
      {photo && <PhotoZonePicker uri={photo.uri} onSelect={handleSelectZone} />}
      {photo && !photoResult && (
        <Text style={styles.hint} pointerEvents="none">Glissez depuis le centre pour tracer un cercle</Text>
      )}

      {result && (
        <View
          style={[styles.resultPanel, { top: panelTop }, isCapturing && styles.resultPanelCapturing]}
          onLayout={(e) => setPanelHeight(e.nativeEvent.layout.height)}
          pointerEvents="none"
        >
          <View style={styles.swatchRow}>
            <View style={[styles.swatch, { backgroundColor: `rgb(${result.r}, ${result.g}, ${result.b})` }]} />
            <View style={[styles.freshnessDot, isCapturing && styles.freshnessDotActive]} />
          </View>
          <Text style={styles.colorName}>{result.color.name}</Text>

          <View style={{ width: CHART_WIDTH }}>
            <View style={styles.readoutRow}>
              <Text style={[styles.readoutLabel, { color: HUE_COLOR }]}>Teinte (fréquence)</Text>
              <Text style={[styles.readoutValue, { color: HUE_COLOR }]}>{result.color.hue.toFixed(1)}°</Text>
            </View>
            <View style={styles.readoutRow}>
              <Text style={[styles.readoutLabel, { color: SATURATION_COLOR }]}>Saturation</Text>
              <Text style={[styles.readoutValue, { color: SATURATION_COLOR }]}>{Math.round(result.color.saturation)}%</Text>
            </View>
            <View style={styles.readoutRow}>
              <Text style={[styles.readoutLabel, { color: LIGHTNESS_COLOR }]}>Luminosité</Text>
              <Text style={[styles.readoutValue, { color: LIGHTNESS_COLOR }]}>{Math.round(result.color.lightness)}%</Text>
            </View>
          </View>

          <HueSpectrumBar width={CHART_WIDTH} hue={result.color.hue} />

          <Text style={styles.detail}>
            {rgbToHex(result.r, result.g, result.b)} · rgb({result.r}, {result.g}, {result.b})
          </Text>
          <Text style={styles.freshnessLabel}>
            {isCapturing ? 'Nouvelle lecture…' : 'À jour'}
          </Text>
        </View>
      )}
      {error && <Text style={styles.debugError}>{error}</Text>}

      <View style={styles.buttonRow}>
        {photo ? (
          <Pressable style={styles.scanButton} onPress={handleCloseLive}>
            <Text style={styles.scanButtonText}>Retour caméra</Text>
          </Pressable>
        ) : (
          <>
            <Pressable
              style={[styles.scanButton, isRunning && styles.scanButtonActive]}
              onPress={isRunning ? stop : start}
              disabled={!cameraReady}
            >
              <Text style={styles.scanButtonText}>{isRunning ? 'Stop' : 'Scanner'}</Text>
            </Pressable>
            <Pressable
              style={[styles.scanButton, styles.photoButton]}
              onPress={handleTakePhoto}
              disabled={!cameraReady || photoBusy}
            >
              <Text style={styles.scanButtonText}>Photo</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e', alignItems: 'center', justifyContent: 'center' },
  text: { color: '#fff', marginBottom: 12, textAlign: 'center', paddingHorizontal: 24 },
  link: { color: '#00ff00', textDecorationLine: 'underline', fontSize: 16 },
  resultPanel: {
    position: 'absolute',
    alignSelf: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(26,26,46,0.85)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  resultPanelCapturing: { opacity: 0.6 },
  swatchRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  swatch: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: '#fff',
  },
  freshnessDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#00ff00',
    marginLeft: 8,
  },
  freshnessDotActive: { backgroundColor: '#e94560' },
  colorName: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 8 },
  readoutRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  readoutLabel: { fontSize: 13 },
  readoutValue: { fontSize: 15, fontWeight: 'bold' },
  detail: { color: '#00ff00', fontSize: 12, marginTop: 8 },
  freshnessLabel: { color: '#888', fontSize: 10, marginTop: 2 },
  debugError: {
    position: 'absolute',
    top: 60,
    alignSelf: 'center',
    color: '#e94560',
    fontSize: 12,
    paddingHorizontal: 16,
    textAlign: 'center',
  },
  buttonRow: {
    position: 'absolute',
    bottom: 130,
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  hint: {
    position: 'absolute',
    top: 60,
    alignSelf: 'center',
    color: '#fff',
    backgroundColor: 'rgba(26,26,46,0.85)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    fontSize: 13,
  },
  photoButton: { backgroundColor: '#ff9500' },
  scanButton: {
    backgroundColor: '#00ff00',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  scanButtonActive: { backgroundColor: '#e94560' },
  scanButtonText: { color: '#1a1a2e', fontSize: 16, fontWeight: 'bold' },
});
