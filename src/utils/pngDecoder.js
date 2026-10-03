import { inflate } from 'pako';

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const CHANNELS_BY_COLOR_TYPE = { 0: 1, 2: 3, 4: 2, 6: 4 };
const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

// decodePngSinglePixel() tourne à chaque cycle du scan continu (~200ms) :
// construire cette table de correspondance à chaque appel serait une
// allocation inutile pour un résultat toujours identique — calculée une
// seule fois au chargement du module.
const BASE64_LOOKUP = new Uint8Array(256);
for (let i = 0; i < BASE64_CHARS.length; i++) BASE64_LOOKUP[BASE64_CHARS.charCodeAt(i)] = i;

function base64ToUint8Array(base64) {
  const clean = base64.replace(/=+$/, '');
  const byteLength = Math.floor((clean.length * 6) / 8);
  const bytes = new Uint8Array(byteLength);

  let bitBuffer = 0;
  let bitCount = 0;
  let outIndex = 0;

  for (let i = 0; i < clean.length; i++) {
    bitBuffer = (bitBuffer << 6) | BASE64_LOOKUP[clean.charCodeAt(i)];
    bitCount += 6;
    if (bitCount >= 8) {
      bitCount -= 8;
      bytes[outIndex++] = (bitBuffer >> bitCount) & 0xff;
    }
  }

  return bytes;
}

// `>>> 0` force une lecture non signée : sans ça, une longueur de chunk
// corrompue ≥ 0x80000000 serait interprétée comme un entier négatif par les
// opérateurs bitwise JS, et `offset` ci-dessous pourrait ne plus jamais
// dépasser `bytes.length` — boucle infinie sur un PNG malformé.
function readUInt32BE(bytes, offset) {
  return (
    ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0
  );
}

function parseChunks(bytes) {
  if (bytes.length < PNG_SIGNATURE.length) {
    throw new Error('Données PNG tronquées (signature incomplète)');
  }
  for (let i = 0; i < PNG_SIGNATURE.length; i++) {
    if (bytes[i] !== PNG_SIGNATURE[i]) throw new Error('Signature PNG invalide');
  }

  let offset = 8;
  let ihdr = null;
  const idatParts = [];

  // Chaque chunk a un en-tête fixe de 8 octets (longueur + type) : s'arrêter
  // dès qu'il n'en reste plus assez plutôt que de lire des octets hors
  // limites (renverrait `undefined`, silencieusement transformé en 0 par les
  // opérateurs bitwise, et produirait un parsing incohérent sans erreur).
  while (offset + 8 <= bytes.length) {
    const length = readUInt32BE(bytes, offset);
    const type = String.fromCharCode(
      bytes[offset + 4],
      bytes[offset + 5],
      bytes[offset + 6],
      bytes[offset + 7]
    );
    const dataStart = offset + 8;

    if (type === 'IHDR') {
      ihdr = {
        width: readUInt32BE(bytes, dataStart),
        height: readUInt32BE(bytes, dataStart + 4),
        bitDepth: bytes[dataStart + 8],
        colorType: bytes[dataStart + 9],
      };
    } else if (type === 'IDAT') {
      idatParts.push(bytes.slice(dataStart, dataStart + length));
    } else if (type === 'IEND') {
      break;
    }

    offset = dataStart + length + 4; // + CRC
  }

  if (!ihdr) throw new Error('Chunk IHDR manquant');
  if (idatParts.length === 0) throw new Error('Chunk IDAT manquant');

  const idat = new Uint8Array(idatParts.reduce((sum, part) => sum + part.length, 0));
  let pos = 0;
  for (const part of idatParts) {
    idat.set(part, pos);
    pos += part.length;
  }

  return { ihdr, idat };
}

/**
 * Décode le pixel (0,0) d'un PNG couleur vraie 8 bits (RGB/RGBA), tel que produit
 * par expo-image-manipulator après un resize→1×1. Pour ce premier pixel de la
 * première ligne, les 5 filtres PNG (None/Sub/Up/Average/Paeth) reviennent tous à
 * une simple copie car les références gauche/haut valent 0 — pas besoin de les
 * réimplémenter en toute généralité pour ce cas à un seul pixel.
 */
export function decodePngSinglePixel(base64) {
  const bytes = base64ToUint8Array(base64);
  const { ihdr, idat } = parseChunks(bytes);

  if (ihdr.bitDepth !== 8) {
    throw new Error(`Profondeur PNG non supportée: ${ihdr.bitDepth} bits`);
  }
  const channels = CHANNELS_BY_COLOR_TYPE[ihdr.colorType];
  if (!channels || channels < 3) {
    throw new Error(`Type couleur PNG non supporté: ${ihdr.colorType}`);
  }

  const raw = inflate(idat);
  // raw[0] = octet de filtre de la ligne unique (ignoré, cf. commentaire ci-dessus)
  return { r: raw[1], g: raw[2], b: raw[3] };
}
