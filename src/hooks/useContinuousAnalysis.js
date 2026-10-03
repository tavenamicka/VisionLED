import { useCallback, useEffect, useRef, useState } from 'react';
import { extractPixelColor } from '../utils/pixelExtraction';
import { detectColor } from '../utils/colorDetection';

// Délai minimal entre le début d'un cycle et le début du suivant (un cycle
// prend de toute façon plus longtemps que ça à s'exécuter — capture+crop+
// resize+décodage — donc ceci fixe un plancher, pas la cadence réelle).
const SCAN_INTERVAL_MS = 200;

/**
 * Boucle de scan continu : recapture et ré-analyse la couleur en boucle
 * (choix de conception — scans throttlés, pas du frame processing temps réel à
 * 30-60fps qui nécessiterait de sortir d'Expo Go). Chaque cycle attend la fin
 * du précédent avant de se replanifier, pour ne jamais empiler des captures
 * en parallèle si un cycle prend plus de temps que prévu.
 */
export function useContinuousAnalysis(cameraRef, region, containerLayout) {
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  // true pendant la capture/traitement d'un cycle : le résultat affiché date
  // du cycle précédent tant que ce flag est actif — utile pour que l'UI
  // signale qu'une lecture est en retard sur la position actuelle du
  // téléphone (déplacer le téléphone puis lire le résultat trop vite montre
  // encore l'ancienne position).
  const [isCapturing, setIsCapturing] = useState(false);

  const runningRef = useRef(false);
  const timeoutRef = useRef(null);
  // Cycle en cours (promesse), pour pouvoir attendre sa fin avant de prendre
  // une photo manuelle : deux takePictureAsync simultanés se gênent.
  const inFlightRef = useRef(null);
  // Muté en place (pas de nouvel objet littéral) à chaque rendu : App
  // re-rend à chaque cycle de scan (~5×/s), inutile d'allouer un objet neuf
  // ici alors que la boucle ne lit ces champs qu'au moment de son prochain
  // tick.
  const stateRef = useRef({ cameraRef, region, containerLayout });
  stateRef.current.cameraRef = cameraRef;
  stateRef.current.region = region;
  stateRef.current.containerLayout = containerLayout;

  const loop = useCallback(async () => {
    if (!runningRef.current) return;

    setIsCapturing(true);
    const { cameraRef: camRef, region: reg, containerLayout: layout } = stateRef.current;
    try {
      const pending = extractPixelColor(camRef, reg, layout);
      inFlightRef.current = pending.catch(() => {});
      const { r, g, b } = await pending;
      setResult({ r, g, b, color: detectColor(r, g, b), capturedAt: Date.now() });
      setError(null);
    } catch (err) {
      // Les rejets natifs (caméra, image-manipulator) ne sont pas toujours de
      // vraies instances Error — éviter d'afficher "undefined" à l'écran.
      setError(err?.message ?? String(err));
    } finally {
      setIsCapturing(false);
    }

    if (runningRef.current) {
      timeoutRef.current = setTimeout(loop, SCAN_INTERVAL_MS);
    }
  }, []);

  const start = useCallback(() => {
    if (runningRef.current) return;
    runningRef.current = true;
    setIsRunning(true);
    loop();
  }, [loop]);

  const stop = useCallback(() => {
    runningRef.current = false;
    setIsRunning(false);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const stopAndSettle = useCallback(async () => {
    stop();
    await inFlightRef.current;
  }, [stop]);

  useEffect(() => stop, [stop]);

  return { result, error, isRunning, isCapturing, start, stop, stopAndSettle };
}
