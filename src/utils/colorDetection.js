import { COLOR_DATABASE } from '../constants/colorDatabase';

// La teinte (h) correspond directement à la fréquence/longueur d'onde
// dominante perçue sur le cercle chromatique — c'est le signal le plus fiable
// pour identifier une couleur saturée, bien plus robuste que les niveaux RGB
// bruts qui varient fortement avec l'exposition/balance des blancs de la
// caméra. En dessous du seuil de saturation ACHROMATIC_SATURATION_MAX, la
// teinte devient du bruit (cas gris/blanc/noir) : on bascule alors sur un
// classement par luminosité pure.
const ACHROMATIC_SATURATION_MAX = 15;
const WARM_WHITE_SATURATION_MAX = 35;
const HUE_MATCH_MAX_DISTANCE = 35;
const HUE_WEIGHT = 1;
const RGB_TIEBREAK_WEIGHT = 0.15;

const ACHROMATIC_KEYS = new Set(['noir', 'gris-foncé', 'gris', 'gris-clair', 'blanc', 'blanc-chaud']);

export function rgbToHsl(r, g, b) {
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;

  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === rNorm) {
      h = 60 * (((gNorm - bNorm) / delta) % 6);
    } else if (max === gNorm) {
      h = 60 * ((bNorm - rNorm) / delta + 2);
    } else {
      h = 60 * ((rNorm - gNorm) / delta + 4);
    }
  }
  if (h < 0) h += 360;

  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));

  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

export function rgbToHex(r, g, b) {
  const toByte = (v) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${[r, g, b].map((v) => toByte(v).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

export function hslToRgb(h, s, l) {
  const sNorm = s / 100;
  const lNorm = l / 100;

  const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lNorm - c / 2;

  let rPrime = 0;
  let gPrime = 0;
  let bPrime = 0;

  if (h < 60) [rPrime, gPrime, bPrime] = [c, x, 0];
  else if (h < 120) [rPrime, gPrime, bPrime] = [x, c, 0];
  else if (h < 180) [rPrime, gPrime, bPrime] = [0, c, x];
  else if (h < 240) [rPrime, gPrime, bPrime] = [0, x, c];
  else if (h < 300) [rPrime, gPrime, bPrime] = [x, 0, c];
  else [rPrime, gPrime, bPrime] = [c, 0, x];

  return {
    r: Math.round((rPrime + m) * 255),
    g: Math.round((gPrime + m) * 255),
    b: Math.round((bPrime + m) * 255),
  };
}

export function rgbDistance(r1, g1, b1, r2, g2, b2) {
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

// Distance angulaire entre une teinte et une plage [hMin, hMax], en tenant
// compte du bouclage 0°/360° (ex: rouge = teintes proches de 0° ET de 360°).
function circularHueDistance(h, hMin, hMax) {
  if (h >= hMin && h <= hMax) return 0;
  const distToMin = Math.min(Math.abs(h - hMin), 360 - Math.abs(h - hMin));
  const distToMax = Math.min(Math.abs(h - hMax), 360 - Math.abs(h - hMax));
  return Math.min(distToMin, distToMax);
}

function matchAchromaticByLightness(l) {
  if (l < 20) return 'noir';
  if (l < 35) return 'gris-foncé';
  if (l < 68) return 'gris';
  if (l < 86) return 'gris-clair';
  return 'blanc';
}

function isWarmWhite(h, s, l) {
  return s >= 10 && s <= WARM_WHITE_SATURATION_MAX && l >= 65 && h >= 20 && h <= 55;
}

function buildResult(name, colorDatabase, h, s, l) {
  return {
    name,
    description: colorDatabase[name]?.description ?? null,
    hue: h,
    saturation: s,
    lightness: l,
  };
}

// `detectColor()` tourne en boucle toutes les ~200ms en scan continu : les
// plages hMin/hMax/rMid/gMid/bMid de chaque couleur chromatique sont figées
// (dérivées de COLOR_DATABASE, constant), donc on les précalcule une seule
// fois par référence de base de couleurs plutôt qu'à chaque appel — évite de
// reconstruire `Object.entries(...)` et de refaire les moyennes rMid/gMid/
// bMid 5 fois par seconde pour un résultat identique. La WeakMap garde ça
// valide même si une base de couleurs différente est injectée (tests).
const chromaticCandidatesCache = new WeakMap();

function getChromaticCandidates(colorDatabase) {
  let candidates = chromaticCandidatesCache.get(colorDatabase);
  if (!candidates) {
    candidates = Object.entries(colorDatabase)
      .filter(([name]) => !ACHROMATIC_KEYS.has(name))
      .map(([name, range]) => ({
        name,
        hMin: range.hMin,
        hMax: range.hMax,
        rMid: (range.rMin + range.rMax) / 2,
        gMid: (range.gMin + range.gMax) / 2,
        bMid: (range.bMin + range.bMax) / 2,
      }));
    chromaticCandidatesCache.set(colorDatabase, candidates);
  }
  return candidates;
}

// Couleur chromatique la plus proche par teinte (fréquence perçue), la
// distance RGB au point milieu de la plage ne servant qu'à départager les
// couleurs dont les plages de teinte se chevauchent (ex: orange vs marron,
// qui se distinguent surtout par la luminosité, pas par la teinte).
function findBestChromaticMatch(r, g, b, h, colorDatabase) {
  let best = null;
  let bestScore = -Infinity;

  for (const candidate of getChromaticCandidates(colorDatabase)) {
    const hueDistance = circularHueDistance(h, candidate.hMin, candidate.hMax);
    if (hueDistance > HUE_MATCH_MAX_DISTANCE) continue;

    const rgbTiebreak = rgbDistance(r, g, b, candidate.rMid, candidate.gMid, candidate.bMid);
    const score = -(hueDistance * HUE_WEIGHT) - rgbTiebreak * RGB_TIEBREAK_WEIGHT;

    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  return best;
}

export function detectColor(r, g, b, colorDatabase = COLOR_DATABASE) {
  const { h, s, l } = rgbToHsl(r, g, b);

  // Blanc chaud : saturation faible mais non nulle, teinte tirant sur le
  // orangé — cas particulier fréquent sur les LED, à distinguer du blanc pur
  // et du gris avant la bascule achromatique générale ci-dessous.
  if (isWarmWhite(h, s, l)) {
    return buildResult('blanc-chaud', colorDatabase, h, s, l);
  }

  // Achromatique : en dessous de ce seuil de saturation, la teinte mesurée
  // est essentiellement du bruit capteur — on classe uniquement par
  // luminosité (noir → gris → blanc).
  if (s < ACHROMATIC_SATURATION_MAX) {
    return buildResult(matchAchromaticByLightness(l), colorDatabase, h, s, l);
  }

  const best = findBestChromaticMatch(r, g, b, h, colorDatabase);
  if (!best) {
    return { name: 'Non identifiée', description: null, hue: h, saturation: s, lightness: l };
  }

  return buildResult(best.name, colorDatabase, h, s, l);
}
