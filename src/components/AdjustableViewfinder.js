import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, PanResponder, StyleSheet } from 'react-native';

const DEFAULT_SIZE = 90;
const MIN_SIZE = 40;
const HANDLE_HITBOX = 36;
// Point d'ancrage fixe du viseur : centré horizontalement, décalé vers le bas
// verticalement pour ne pas être recouvert par le panneau de résultat (qui a
// grandi avec les graphiques d'historique). Toujours un point fixe (pas de
// déplacement libre, décision de conception), juste plus bas que le
// centre géométrique de l'écran.
const ANCHOR_Y_RATIO = 0.62;

const CORNERS = [
  { key: 'topLeft', signX: -1, signY: -1 },
  { key: 'topRight', signX: 1, signY: -1 },
  { key: 'bottomLeft', signX: -1, signY: 1 },
  { key: 'bottomRight', signX: 1, signY: 1 },
];

// Mémoïsé : le parent (App.js) re-rend à chaque cycle de scan continu
// (~5×/s) dès qu'un résultat arrive, alors que ce composant gère son propre
// état interne (taille, layout) et ne dépend que d'`onRegionChange` — stable
// puisque c'est toujours le setter de useState côté App. Sans memo, les 4
// PanResponder et tout le rendu du viseur seraient recalculés pour rien à
// chaque nouvelle couleur détectée.
function AdjustableViewfinder({ onRegionChange }) {
  const [containerLayout, setContainerLayout] = useState({ width: 0, height: 0 });
  const [size, setSize] = useState(DEFAULT_SIZE);

  const sizeRef = useRef(size);
  const startSizeRef = useRef(size);

  const maxSize = containerLayout.width && containerLayout.height
    ? Math.min(containerLayout.width, containerLayout.height) * 0.9
    : DEFAULT_SIZE * 3;

  const clamp = useCallback((value) => Math.max(MIN_SIZE, Math.min(maxSize, value)), [maxSize]);

  const anchorX = containerLayout.width / 2;
  const anchorY = containerLayout.height * ANCHOR_Y_RATIO;

  const updateSize = useCallback((next) => {
    sizeRef.current = next;
    setSize(next);
  }, []);

  // Émet la région dès que le viseur a une position/taille valide — y compris
  // au tout premier rendu, sans attendre une interaction (glisser une
  // poignée) — sinon le scan continu échoue tant que l'utilisateur n'a pas
  // touché le viseur au moins une fois.
  useEffect(() => {
    if (!containerLayout.width || !containerLayout.height) return;
    onRegionChange?.({ centerX: anchorX, centerY: anchorY, width: size, height: size });
  }, [size, anchorX, anchorY, containerLayout.width, containerLayout.height, onRegionChange]);

  const panResponders = useMemo(
    () =>
      CORNERS.reduce((acc, { key, signX, signY }) => {
        acc[key] = PanResponder.create({
          onStartShouldSetPanResponder: () => true,
          onMoveShouldSetPanResponder: () => true,
          onPanResponderGrant: () => {
            startSizeRef.current = sizeRef.current;
          },
          onPanResponderMove: (_, gestureState) => {
            const { dx, dy } = gestureState;
            updateSize(clamp(startSizeRef.current + (signX * dx + signY * dy)));
          },
        });
        return acc;
      }, {}),
    [clamp, updateSize]
  );

  const left = anchorX - size / 2;
  const top = anchorY - size / 2;

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="box-none"
      onLayout={(e) => setContainerLayout(e.nativeEvent.layout)}
    >
      {containerLayout.width > 0 && (
        <>
          <View pointerEvents="none" style={[styles.frame, { left, top, width: size, height: size }]} />
          <View pointerEvents="none" style={[styles.centerDot, { left: anchorX - 3, top: anchorY - 3 }]} />

          {CORNERS.map(({ key, signX, signY }) => {
            const handleLeft = left + (signX > 0 ? size : 0) - HANDLE_HITBOX / 2;
            const handleTop = top + (signY > 0 ? size : 0) - HANDLE_HITBOX / 2;
            return (
              <View
                key={key}
                {...panResponders[key].panHandlers}
                style={[styles.handle, { left: handleLeft, top: handleTop }]}
              >
                <View style={styles.handleDot} />
              </View>
            );
          })}
        </>
      )}
    </View>
  );
}

export default memo(AdjustableViewfinder);

const styles = StyleSheet.create({
  frame: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: '#00ff00',
    borderRadius: 9999,
  },
  centerDot: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#00ff00',
  },
  handle: {
    position: 'absolute',
    width: HANDLE_HITBOX,
    height: HANDLE_HITBOX,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handleDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#00ff00',
    borderWidth: 2,
    borderColor: '#1a1a2e',
  },
});
