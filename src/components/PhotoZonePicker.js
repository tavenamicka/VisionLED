import React, { useMemo, useRef, useState } from 'react';
import { Image, PanResponder, StyleSheet, View } from 'react-native';

const MIN_RADIUS = 6;
// Un simple appui (sans glisser) sélectionne un petit cercle autour du point touché.
const TAP_RADIUS = 14;

// La couleur est moyennée sur le carré inscrit dans le cercle (côté r·√2) :
// un crop rectangulaire ne peut pas être rond, et le carré circonscrit
// ramènerait les coins hors du cercle (donc hors de ce que l'utilisateur voit).
function inscribedSquare({ cx, cy, r }) {
  const side = r * Math.SQRT2;
  return { x: cx - side / 2, y: cy - side / 2, width: side, height: side };
}

/**
 * Photo figée plein écran (même cadrage "cover" que la preview caméra, ce qui
 * permet de réutiliser le mapping écran→photo) sur laquelle l'utilisateur
 * glisse depuis le centre voulu pour tracer un cercle (comme le viseur du live).
 * `onSelect(rect)` reçoit, au relâchement, le carré inscrit en coordonnées écran.
 */
export default function PhotoZonePicker({ uri, onSelect }) {
  const [circle, setCircle] = useState(null);
  const startRef = useRef({ x: 0, y: 0 });
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => {
          startRef.current = { x: e.nativeEvent.locationX, y: e.nativeEvent.locationY };
          setCircle({ cx: startRef.current.x, cy: startRef.current.y, r: 0 });
        },
        onPanResponderMove: (_, g) => {
          const { x, y } = startRef.current;
          setCircle({ cx: x, cy: y, r: Math.hypot(g.dx, g.dy) });
        },
        onPanResponderRelease: (_, g) => {
          const { x, y } = startRef.current;
          const dragged = Math.hypot(g.dx, g.dy);
          const final = { cx: x, cy: y, r: dragged < MIN_RADIUS ? TAP_RADIUS : dragged };
          setCircle(final);
          onSelectRef.current?.(inscribedSquare(final));
        },
      }),
    []
  );

  return (
    <View style={StyleSheet.absoluteFill} {...panResponder.panHandlers}>
      <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" pointerEvents="none" />
      {circle && (
        <>
          <View
            pointerEvents="none"
            style={[
              styles.ring,
              { left: circle.cx - circle.r, top: circle.cy - circle.r, width: circle.r * 2, height: circle.r * 2 },
            ]}
          />
          <View pointerEvents="none" style={[styles.centerDot, { left: circle.cx - 3, top: circle.cy - 3 }]} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  ring: {
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
});
