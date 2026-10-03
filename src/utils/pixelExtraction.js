import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { decodePngSinglePixel } from './pngDecoder';

const DEFAULT_PATCH_SIZE = 20;

/**
 * La preview caméra remplit son conteneur en mode "cover" (comportement natif
 * par défaut de CameraView) : le côté le plus grand du ratio photo est rogné à
 * l'affichage. On recalcule ce même facteur d'échelle pour retrouver, dans les
 * pixels de la photo capturée, le point visé à l'écran (centre de la fenêtre
 * de visée). Propriété mathématique utile : quel que soit `scale`, le centre
 * exact de l'écran retombe toujours sur le centre exact de la photo — la
 * fenêtre de visée restant toujours centrée (choix de conception), ce calcul se
 * simplifie donc en pratique à photoWidth/2, photoHeight/2. Testé sur device :
 * le décalage observé venait de `skipProcessing` (rotation EXIF sautée), pas
 * de ce calcul — voir le commentaire sur takePictureAsync ci-dessous.
 */
function mapScreenPointToPhoto(screenX, screenY, containerLayout, photoWidth, photoHeight) {
  const { width: screenW, height: screenH } = containerLayout;
  if (!screenW || !screenH) return null;

  const scale = Math.max(screenW / photoWidth, screenH / photoHeight);
  const displayedW = photoWidth * scale;
  const displayedH = photoHeight * scale;
  const offsetX = (displayedW - screenW) / 2;
  const offsetY = (displayedH - screenH) / 2;

  return {
    photoX: (screenX + offsetX) / scale,
    photoY: (screenY + offsetY) / scale,
  };
}

function computePatchRegion(centerX, centerY, patchSize, photoWidth, photoHeight) {
  const width = Math.min(patchSize, photoWidth);
  const height = Math.min(patchSize, photoHeight);
  const originX = Math.round(Math.min(Math.max(centerX - width / 2, 0), photoWidth - width));
  const originY = Math.round(Math.min(Math.max(centerY - height / 2, 0), photoHeight - height));
  return { originX, originY, width, height };
}

/**
 * Capture une photo, extrait la couleur moyenne d'un patch fixe centré sur la
 * fenêtre de visée (indépendant de sa taille dessinée par l'utilisateur — voir
 * choix de conception), et renvoie le RGB final.
 */
export async function extractPixelColor(cameraRef, region, containerLayout, patchSize = DEFAULT_PATCH_SIZE) {
  if (!cameraRef?.current) {
    throw new Error('Caméra non prête');
  }
  if (!region || !containerLayout?.width || !containerLayout?.height) {
    throw new Error('Zone de visée non initialisée');
  }

  // skipProcessing SUPPRIMÉ : sur Android il saute la correction de rotation
  // EXIF, ce qui peut renvoyer un buffer dont l'orientation réelle des pixels
  // ne correspond plus à photo.width/photo.height (confirmé par test device —
  // patch systématiquement décalé du point visé malgré téléphone immobile).
  // On repasse par le pipeline par défaut, qui corrige l'orientation ; le
  // format/qualité final n'est de toute façon pas celui de ce fichier
  // intermédiaire, seulement du crop PNG produit ensuite par manipulateAsync.
  const photo = await cameraRef.current.takePictureAsync({ shutterSound: false });

  const mapped = mapScreenPointToPhoto(
    region.centerX,
    region.centerY,
    containerLayout,
    photo.width,
    photo.height
  );
  if (!mapped) {
    throw new Error('Impossible de mapper la zone de visée sur la photo');
  }

  const patch = computePatchRegion(mapped.photoX, mapped.photoY, patchSize, photo.width, photo.height);

  // Un seul appel crop+resize→1×1 (mode scan continu : la latence par cycle compte).
  const result = await manipulateAsync(
    photo.uri,
    [{ crop: patch }, { resize: { width: 1, height: 1 } }],
    { format: SaveFormat.PNG, base64: true }
  );

  if (!result.base64) {
    throw new Error("Échec de l'extraction du pixel (base64 manquant)");
  }

  const { r, g, b } = decodePngSinglePixel(result.base64);
  return { r, g, b };
}

/**
 * Prend une photo figée (pour le mode "Photo" : l'utilisateur sélectionne
 * ensuite une zone dessus). Même pipeline que le scan continu, sans
 * skipProcessing (rotation EXIF corrigée).
 */
export async function capturePhoto(cameraRef) {
  if (!cameraRef?.current) {
    throw new Error('Caméra non prête');
  }
  return cameraRef.current.takePictureAsync({ shutterSound: false });
}

const AVERAGE_STEP = 4;

/**
 * Couleur moyenne d'un rectangle écran sur une photo affichée en "cover"
 * plein conteneur. Le redimensionnement est fait par paliers de ×4 plutôt
 * qu'en un seul saut vers 1×1 : un filtre bilinéaire sur un très gros
 * facteur n'échantillonne que quelques pixels au lieu de moyenner toute la
 * zone. Latence sans importance ici (une seule capture, pas de boucle).
 */
export async function extractZoneColor(photo, rect, containerLayout) {
  const topLeft = mapScreenPointToPhoto(rect.x, rect.y, containerLayout, photo.width, photo.height);
  const bottomRight = mapScreenPointToPhoto(
    rect.x + rect.width,
    rect.y + rect.height,
    containerLayout,
    photo.width,
    photo.height
  );
  if (!topLeft || !bottomRight) {
    throw new Error('Impossible de mapper la zone sur la photo');
  }

  const centerX = (topLeft.photoX + bottomRight.photoX) / 2;
  const centerY = (topLeft.photoY + bottomRight.photoY) / 2;
  const zoneW = Math.max(1, Math.round(bottomRight.photoX - topLeft.photoX));
  const zoneH = Math.max(1, Math.round(bottomRight.photoY - topLeft.photoY));
  const cropW = Math.min(zoneW, photo.width);
  const cropH = Math.min(zoneH, photo.height);
  const crop = {
    width: cropW,
    height: cropH,
    originX: Math.round(Math.min(Math.max(centerX - cropW / 2, 0), photo.width - cropW)),
    originY: Math.round(Math.min(Math.max(centerY - cropH / 2, 0), photo.height - cropH)),
  };

  const actions = [{ crop }];
  let w = crop.width;
  let h = crop.height;
  while (w > 1 || h > 1) {
    w = Math.max(1, Math.ceil(w / AVERAGE_STEP));
    h = Math.max(1, Math.ceil(h / AVERAGE_STEP));
    actions.push({ resize: { width: w, height: h } });
  }

  const result = await manipulateAsync(photo.uri, actions, { format: SaveFormat.PNG, base64: true });
  if (!result.base64) {
    throw new Error("Échec de l'extraction de la zone (base64 manquant)");
  }
  const { r, g, b } = decodePngSinglePixel(result.base64);
  return { r, g, b };
}
