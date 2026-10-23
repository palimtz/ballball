# ⚽ ballball - Reconstitution & Clone

> Reconstitution fidèle et performante du jeu multijoueur [ballball.club](https://ballball.club) en **TypeScript**, **Vite** et **HTML5 Canvas 2D**.

![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue?logo=typescript)
![Vite](https://img.shields.io/badge/Vite-6.0-646CFF?logo=vite)
![Physics](https://img.shields.io/badge/Physics-120Hz%20(480Hz%20Substep)-brightgreen)
![License](https://img.shields.io/badge/License-MIT-yellow)

---

## 🌟 Présentation

Ce projet est une réimplémentation complète du jeu en ligne **ballball.club**, développée à partir de l'analyse dynamique et statique du client original via REA (*Reverse Engineer Anything*).

Le projet intègre fidèlement le modèle physique exact à **120 Hz**, la simulation d'**effet Magnus** pour les tirs brossés, un système complet de **ralenti automatique (Goal Replay)**, l'IA des bots et un rendu Canvas 2D avec caméra fluide.

---

## 🎮 Commandes de Jeu

| Contrôle | Action | Détails |
|---|---|---|
| **ZQSD / Flèches** | Déplacement | Oriente le vecteur de direction et la visée du joueur |
| **Espace / Clic Gauche** | Frappe (Kick) | Tir puissant avec transfert d'élan et spin |
| **Shift / B / Clic Droit** | Boost | Impulsion instantanée de +300 unités/s pendant 18 ticks (3 charges max, recharge 5s) |
| **Clic Molette** | Frappe + Boost | Déclenche simultanément le kick et le boost avec recul |
| **Espace / V / Clic** | Passer le Replay | Passe instantanément le ralenti du but vers l'engagement |
| **Manette** | Stick Gauche + A/B | Prise en charge native de l'API Gamepad |

---

## 🔬 Caractéristiques Techniques

### 1. Moteur Physique Déterministe à 120 Hz
- **Fréquence Fixe** : 120 ticks par seconde (`dt = 1/120s = 8.333ms`) avec accumulateur de temps indépendant du taux de rafraîchissement de l'écran.
- **Sous-échantillonnage 4x (480 Hz)** : Chaque tick est découpé en 4 sous-étapes d'intégration (`dt = 2.083ms`) pour éliminer tout phénomène de traversée (*tunneling*) lors des tirs ultra-rapides.
- **Constantes Physiques Reconstituées** :
  - Joueur : rayon `23`, accélération `1250`, frottement en course `4.35`, frottement en roue libre `3.7`, vitesse max `650`, masse inverse `0.35`.
  - Ballon : rayon `12`, masse inverse `2.8` (le joueur est 8x plus lourd), vitesse de tir `620`, restitution mur `0.62`, vitesse max `880`.
  - Poteaux : 4 poteaux circulaires fixes de rayon `7` aux angles des cages de but.

### 2. Aérodynamique & Frappes Brossées (Effet Magnus)
- **Calcul du Spin** : L'impact tangentiel entre le joueur et le ballon convertit la vitesse relative en vitesse angulaire (`Wr`).
- **Incurvation de la Trajectoire** : Le spin angulaire défléchit continuellement le vecteur vitesse du ballon en vol via le coefficient Magnus (`q5`).
- **Rotation 3D Réaliste par Quaternions** : L'orientation de la sphère dans l'espace est intégrée à chaque image avec des quaternions 4D `[x, y, z, w]` pour un roulement visuel synchronisé avec la surface.

### 3. Système de Ralenti Automatique (Goal Replay)
- **Buffer Circulaire Glissant** : Enregistrement continu des 480 derniers ticks (4 secondes d'action à 120 Hz).
- **Déclenchement sur But** : Célébration dynamique courte (0,75s) puis bascule automatique vers la lecture du ralenti.
- **Overlay de Diffusion TV** : Voyant d'enregistrement rouge clignotant `● REPLAY`, bandeau de l'équipe buteuse, barre de progression animée et raccourci pour passer (*skip*).

### 4. IA des Bots & Formats de Match
- **Comportement des Bots** : Prise de décision autonome selon la position du ballon, couverture défensive des cages, anticipation de trajectoire et décision de boost.
- **Formats Modulaires** : Terrains et dimensions adaptés en un clic pour **1v1**, **2v2**, **3v3**, **4v4** et **5v5**.
- **Synthèse Sonore Web Audio API** : Bruitages procéduraux temps réel (frappes, impacts de balle, sifflet de but, boost) sans dépendance vers des fichiers audio externes.

---

## 📁 Structure du Projet

```
BALLBALL/
├── index.html                   # Interface et toile Canvas principale
├── package.json                 # Configuration des dépendances
├── tsconfig.json                # Options strictes du compilateur TypeScript
├── vite.config.ts               # Configuration du serveur de développement Vite
├── src/
│   ├── main.ts                  # Boucle de jeu principale, gestion des phases et du replay
│   ├── style.css                # Styles épurés de l'arène et du bandeau de contrôle
│   ├── engine/
│   │   ├── constants.ts         # Constantes physiques (120Hz, vitesses, drag, masses)
│   │   ├── types.ts             # Types TypeScript stricts (GameState, Player, Ball, etc.)
│   │   ├── math.ts              # Algèbre vectorielle et intégration de quaternions
│   │   ├── stadium.ts           # Dimensions des terrains selon le format (1v1 à 5v5)
│   │   ├── spin.ts              # Calcul du spin et effet Magnus
│   │   ├── collisions.ts        # Résolution des collisions cercles, murs, poteaux et buts
│   │   ├── physics.ts           # Boucle de simulation 120Hz et sous-étapes 480Hz
│   │   ├── gameState.ts         # Fabrique d'initialisation de l'état du match
│   │   └── replay.ts            # Moteur de buffer circulaire et playback des ralentis
│   ├── render/
│   │   └── renderer.ts          # Rendu Canvas 2D multi-calques, caméra fluide et HUD
│   ├── input/
│   │   └── inputManager.ts      # Gestionnaire d'entrées (clavier ZQSD, souris, manettes)
│   ├── ai/
│   │   └── botController.ts     # IA des bots adverses et alliés
│   └── audio/
│       └── soundManager.ts      # Synthétiseur de sons procéduraux (Web Audio API)
└── decompiled/                  # Fichiers JavaScript, shaders et styles d'origine extraits
```

---

## 🚀 Installation & Lancement Local

### Prérequis
- [Node.js](https://nodejs.org/) (version 18 ou supérieure)
- [npm](https://www.npmjs.com/)

### Étapes

1. **Cloner le dépôt** :
   ```bash
   git clone git@github.com:palimtz/ballball.git
   cd ballball
   ```

2. **Installer les dépendances** :
   ```bash
   npm install
   ```

3. **Lancer le serveur de développement local** :
   ```bash
   npm run dev
   ```
   Ouvrez ensuite [http://localhost:3000](http://localhost:3000) dans votre navigateur.

4. **Compiler pour la production** :
   ```bash
   npm run build
   ```

---

## 🗺️ Feuilles de Route (Roadmap)

- [x] Rétro-ingénierie complète de l'architecture et des formules physiques.
- [x] Moteur physique 120 Hz déterministe avec sous-échantillonnage 4x.
- [x] Simulation de l'effet Magnus (courbe) et roulement par quaternions.
- [x] Rendu Canvas 2D avec caméra de suivi (*Director Cam*).
- [x] Système de ralenti automatique post-but (*Goal Replay*) avec overlay TV.
- [x] Prise en charge des formats 1v1, 2v2, 3v3, 4v4, 5v5.
- [ ] Serveur multijoueur en temps réel (WebSocket + prédiction Rollback).
- [ ] Support des shaders d'arrière-plan WebGL 2 (dunes de sable et caustiques sous-marines).

---

## 📄 Licence

Ce projet est sous licence MIT - voir le fichier [LICENSE](LICENSE) pour plus de détails.
Inspiré par le jeu web original [ballball.club](https://ballball.club).
