# 🎨 VisionLED - Analyseur de Couleurs pour Daltoniens

**Application Android pour identifier les couleurs LED en temps réel - Développée avec Claude Code**

<p align="center">
  <img alt="VisionLED" src="https://img.shields.io/badge/Platform-Android-green" />
  <img alt="React Native" src="https://img.shields.io/badge/Built%20with-React%20Native-61dafb" />
  <img alt="Expo" src="https://img.shields.io/badge/Expo-57-000" />
  <img alt="Statut" src="https://img.shields.io/badge/Statut-APK%20install%C3%A9%20sur%20device-success" />
</p>

> Ce README décrit l'app **telle qu'elle est aujourd'hui**, pas le plan initial.

---

## 🎯 Objectif

Aider à identifier la couleur d'une LED (état d'un appareil électronique) sans avoir à
se fier à sa perception des couleurs — via :

- **Scan continu en temps réel** — vise la LED, la couleur se met à jour en boucle
- **Nom de couleur + code RGB/HEX + teinte/saturation/luminosité** affichés en direct
- **Mode Photo** — fige une photo, trace un cercle sur la zone voulue, affiche sa couleur moyenne
- **Barre de spectre 0-360°** avec marqueur sur la teinte mesurée (repère visuel)

---

## 📱 État actuel

L'app tourne en **build APK autonome** (compilé via EAS Build, plus besoin d'Expo Go)
et a été validée sur un vrai téléphone Android. Le cœur fonctionnel :

1. **Viseur** (cercle, taille ajustable par les poignées, position fixe à l'écran)
2. **Scan continu** (bouton "Scanner"/"Stop") : capture → extrait la couleur du centre
   du viseur → identifie la couleur → affiche le résultat, en boucle (~200ms+/cycle)
3. **Mode Photo** (bouton "Photo") : fige l'image ; glisser depuis le centre voulu trace un
   cercle (le rayon = la distance glissée, un appui = petit cercle) ; la couleur est la moyenne
   de la zone sélectionnée. "Retour caméra" revient au live
4. **Détection par teinte** : la teinte (fréquence/longueur d'onde perçue) est le critère
   principal pour les couleurs saturées — bien plus stable que les niveaux RGB bruts
   face aux variations d'exposition de la caméra. En dessous de 15% de saturation,
   classement par luminosité seule (noir/gris/blanc)

**Volontairement pas fait / retiré après test** :
- Pas de synthèse vocale ni de vibration — codées et testées, retirées car jugées
  redondantes avec l'affichage (le nom de couleur est déjà bien visible à l'écran)
- Pas de mode rectangle pour le viseur — seul le cercle a été gardé
- Pas d'historique des scans, pas de graphiques temps réel (ces derniers ajoutés puis
  retirés)
- Pas de lecture vidéo live façon caméra pro (frame processors) — scan par photos
  répétées, choix assumé pour rester compatible Expo Go en dev

---

## 🚀 Démarrage

```bash
git clone https://github.com/tavenamicka/VisionLED.git
cd VisionLED
npm install
npm start
```

Scanner le QR code affiché avec l'app **Expo Go** (Android) pour tester en dev — l'app
et le téléphone doivent avoir la **même version de SDK Expo** (actuellement 57), et le
téléphone doit être sur le **même réseau** que le PC (sinon écran blanc + rond qui tourne ;
test : `http://<IP_PC>:8081/status` dans le navigateur du téléphone, ou `npx expo start --tunnel`).

### Builder un APK installable (hors Expo Go)

```bash
npx eas-cli login          # compte Expo requis, une fois
npm run build:android      # profil "preview" → .apk, build cloud EAS (~10-15 min)
```

Le lien de téléchargement (+ QR code) s'affiche à la fin dans le terminal.

---

## 🏗️ Architecture

### Stack
```
Expo 57 / React Native 0.86 / React 19
    ├── expo-camera          → capture photo (pas de preview vidéo live)
    ├── expo-image-manipulator → crop + resize→1×1 du patch de couleur
    ├── expo-linear-gradient  → barre de spectre teinte
    └── pako                  → inflate zlib (décodage PNG maison, voir plus bas)
```
`expo-haptics`/`expo-speech` restent en dépendances (code retiré, pourraient resservir
si l'accessibilité est retravaillée sous une autre forme).

### Structure du code
```
App.js                              → écran unique : viseur + panneau résultat + bouton scan
src/
├── components/
│   ├── CameraView.js               → preview caméra (React.memo)
│   ├── PhotoZonePicker.js          → photo figée + tracé du cercle de sélection (mode Photo)
│   ├── AdjustableViewfinder.js     → viseur cercle, redimensionnable, position fixe (React.memo)
│   └── HueSpectrumBar.js           → barre de dégradé 0-360° + marqueur
├── hooks/
│   └── useContinuousAnalysis.js    → boucle de scan (capture → détection → résultat)
├── utils/
│   ├── colorDetection.js           → rgbToHsl/hslToRgb/rgbToHex, detectColor() (teinte-primaire)
│   ├── pixelExtraction.js          → capture caméra → crop → couleur (live) ; capturePhoto/extractZoneColor (mode Photo)
│   └── pngDecoder.js               → décodeur PNG minimal fait main (pas de dépendance native)
└── constants/
    └── colorDatabase.js            → 26 couleurs (plages teinte/RGB/saturation)
```

### Pipeline du mode Photo
```
takePictureAsync() (scan stoppé avant) → photo figée affichée en "cover"
    ↓
Cercle tracé au doigt → carré inscrit (côté r·√2) → mapping écran → pixels photo
    ↓
Crop + resize par paliers ×4 jusqu'à 1×1 (vraie moyenne de la zone) → PNG → décodage
    ↓
Même détection et même panneau résultat que le live
```

### Pipeline de scan (un cycle)
```
takePictureAsync()
    ↓
Mapping du centre du viseur → coordonnées pixel de la photo
    ↓
Crop d'un patch fixe ~20×20px centré + resize→1×1 (moyenne du patch)
    ↓
Décodage du pixel PNG résultant (parseur PNG maison + pako)
    ↓
RGB → HSL
    ↓
detectColor() :
  - saturation < 15% → classement par luminosité (noir/gris/blanc)
  - sinon → couleur la plus proche par teinte (tie-break par distance RGB
    si plusieurs plages de teinte se chevauchent, ex. orange/marron)
    ↓
Affichage : nom, RGB, HEX, teinte/saturation/luminosité, barre de spectre
```

---

## ⚠️ Points connus / limites

- Cas limite documenté : une couleur pile à la frontière entre deux plages de teinte
  (ex. ~10-20° entre rouge et orange) peut basculer d'un côté ou de l'autre — non
  bloquant (seuils ajustables dans `colorDetection.js` / `colorDatabase.js`)
- Scan par photos répétées (pas de flux vidéo live) : la fluidité dépend du temps de
  capture+traitement de chaque cycle (~200ms+ selon le téléphone)

---

## 📜 License

MIT © 2026 tavenamicka — voir [`LICENSE`](./LICENSE)

---

## 🎉 Fait avec Claude Code

Développement itératif entièrement en pair-programming avec Claude Code.
