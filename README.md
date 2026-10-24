# ⚽ ballball - Reconstitution & Clone

> Reconstitution fidèle et performante du jeu multijoueur [ballball.club](https://ballball.club) en **TypeScript**, **Vite** et **HTML5 Canvas 2D**.

![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue?logo=typescript)
![Vite](https://img.shields.io/badge/Vite-6.0-646CFF?logo=vite)
![Physics](https://img.shields.io/badge/Physics-120Hz%20(480Hz%20Substep)-brightgreen)
![Tactics AI](https://img.shields.io/badge/Tactics%20AI-Tiki--Taka%20%7C%203%20Levels-orange)
![License](https://img.shields.io/badge/License-MIT-yellow)

---

## 🌟 Présentation

Ce projet est une réimplémentation complète du jeu en ligne **ballball.club**, développée à partir de l'analyse dynamique et statique du client original via REA (*Reverse Engineer Anything*).

Le projet intègre :
- Le modèle physique exact à **120 Hz** déterministe avec sous-échantillonnage 4x (480 Hz).
- L'aérodynamique complète avec **effet Magnus** (trajectoires brossées) et roulement 3D par quaternions.
- Les **lignes blanches élastiques des buts** avec déformation dynamique et rebond trampoline naturel.
- Une **IA tactique avancée inspirée du vrai football** (Buteur en pivot, ailiers centreurs, défenseur relanceur, gardien libéro à la Manuel Neuer, rotation 2v2 sans gardien fixe, appels en une-deux Tiki-Taka, et sécurité absolue anti-CSC).
- **3 modes de caméra** (⚽ Ballon, 👤 Joueur sans zoom artificiel, 🏟 Terrain complet).
- Un système de **ralenti automatique (Goal Replay)** avec overlay de diffusion TV et célébration.
- Un **menu Pause complet** permettant de basculer la difficulté de l'IA (🟢 Facile, 🟡 Moyen, 🔴 Difficile) en temps réel.

---

## 🎮 Commandes de Jeu

| Contrôle | Action | Détails |
|---|---|---|
| **ZQSD / Flèches** | Déplacement | Oriente le vecteur de direction et la visée du joueur |
| **Espace / Clic Gauche** | Frappe (Kick) | Tir puissant avec transfert d'élan et spin |
| **Shift / B / Clic Droit** | Boost | Impulsion instantanée de +300 px/s (3 charges max, recharge 5s) |
| **Clic Molette** | Frappe + Boost | Déclenche simultanément le kick et le boost avec recul |
| **Touche C** | Changer de Caméra | Alterne entre Caméra Ballon, Caméra Joueur et Vue Terrain |
| **Échap / Touche P** | Menu Pause | Suspend la simulation et ouvre le panneau des options / difficulté |
| **Espace / Touche V** | Passer le Replay | Passe instantanément le ralenti du but vers l'engagement |
| **Manette** | Stick Gauche + A/B | Prise en charge native de l'API Gamepad |

---

## 🎥 Modes de Caméra

Vous pouvez alterner de caméra à tout moment via la touche **`C`** ou le bouton dédié dans l'en-tête :
1. **⚽ Caméra Ballon** : Suit les déplacements du ballon avec une légère avance dynamique vers l'action.
2. **👤 Caméra Joueur** : Centrée sur votre avatar à échelle naturelle (1:1 sans zoom excessif), idéale pour le jeu individuel et le démarquage.
3. **🏟 Caméra Terrain** : Vue panoramique fixe englobant la totalité du stade pour une vision tactique globale.

---

## 🧠 IA Tactique & Difficultés

### 1. Trois Niveaux de Difficulté (Ajustables en Pause)
- 🟢 **Facile (`easy`)** : Temps de réaction de perception réaliste (~116 ms de latence), légères imprécisions de frappe (~11°), passes plus prudentes et boost modéré.
- 🟡 **Moyen (`medium`)** : Jeu équilibré, vision tactique solide (au moins 90 px de démarquage requis pour passer), centres et replis rapides.
- 🔴 **Difficile (`hard`)** : Réaction instantanée à 120 Hz, anticipation mathématique des rebonds, finition chirurgicale dans les angles, sorties libéro tranchantes et passes millimétrées.

### 2. Rôles et Formations (1v1 à 5v5)
- **1v1 (`duelist`)** : Duel d'attaque-défense complète.
- **2v2 (Rotation dynamique)** : Aucun gardien fixe ! Le joueur le plus proche presse le ballon tandis que le second couvre l'axe défensif. Les rôles permutent continuellement selon le ballon.
- **3v3** : Gardien Libéro + Milieu axial + Buteur.
- **4v4** : Gardien Libéro + Défenseur central + Ailier + Buteur.
- **5v5** :
  - **⚽ Buteur en Pivot (`striker`)** : Se rend constamment disponible dans les espaces libres entre les lignes, joue dos au but avec remises en une touche et termine avec puissance.
  - **🏃‍♂️ Ailiers gauche & droit (`left_winger`, `right_winger`)** : Prennent la largeur le long de la ligne de touche, débordent et adressent des centres brossés au cœur de la surface.
  - **🛡️ Défenseur Central (`center_back`)** : Forme un mur sur la ligne de tir adverse, effectue des récupérations propres et relance sur les ailes ou en profondeur.
  - **🧤 Gardien Libéro (`sweeper_keeper`)** : Monte soutenir la circulation en phase d'attaque, jaillit hors de sa surface pour couper les longs ballons en profondeur non contestés, mais reste impérativement sur sa ligne en phase défensive.

### 3. Réalisme de Football Avancé
- **Anticipation des passes imparfaites (*Aller à la rencontre*)** : Si une passe est légèrement décalée ou sous-dosée, le joueur cible lit la trajectoire et jaillit pour attaquer le ballon au point d'interception.
- **Tiki-Taka & Appels en Une-Deux (*Give-and-Go*)** : Dès qu'un bot distribue une passe, il enclenche un appel vers l'avant dans l'espace libre pour offrir une remise immédiate.
- **Zéro CSC (Anti-But contre son camp strict)** :
  - Raycast géométrique : toute frappe ou passe dont la trajectoire croise les propres cages de l'équipe est **strictement bloquée**.
  - Contournement sécurisé : lors des replis, le défenseur s'enroule par la touche pour toujours aborder le ballon face au jeu.
  - Dégagements d'urgence diagonaux vers les lignes de touche.
- **Suppression du piège en triangle** : La force de répulsion spatiale est amortie à proximité de la balle, garantissant qu'un joueur attaque toujours un ballon libre situé entre plusieurs coéquipiers.

---

## 🔬 Caractéristiques Techniques

### 1. Moteur Physique Déterministe à 120 Hz
- **Fréquence Fixe** : 120 ticks par seconde (`dt = 1/120s = 8.333ms`) avec accumulateur de temps indépendant du framerate d'affichage.
- **Sous-échantillonnage 4x (480 Hz)** : Chaque tick est découpé en 4 sous-étapes d'intégration pour éliminer tout phénomène de traversée (*tunneling*) lors des tirs à grande vitesse.
- **Bridage de Vitesse Rigoureux** : Utilisation de `clampSpeed` bridant strictement le vecteur vitesse `(vx, vy)` sans restreindre la liberté de positionnement sur l'arène 5v5 (1840 × 1040 px).
- **Constantes Physiques Reconstituées** :
  - Joueur : rayon `23`, accélération `1250`, frottement en course `4.35`, vitesse max `650`, masse inverse `0.35`.
  - Ballon : rayon `12`, masse inverse `2.8` (joueur 8x plus lourd), vitesse de tir `620`, restitution mur `0.62`, vitesse max `880`.
  - Poteaux : 4 poteaux circulaires fixes de rayon `7` aux angles des cages.

### 2. Filets de But Élastiques & Rebond Trampoline
- **Simulation dynamique par nœuds oscillants** : Le contour blanc des buts se déforme élastiquement sous l'énergie cinétique du ballon.
- **Rebond naturel** : Sur frappe lourde, l'élasticité renvoie le ballon vers l'avant sur le terrain ; sur frappe douce, le ballon s'amortit délicatement au fond des cages.

### 3. Aérodynamique & Frappes Brossées (Effet Magnus)
- **Calcul du Spin** : L'impact tangentiel entre le joueur et le ballon convertit la vitesse relative en vitesse angulaire (`Wr`).
- **Courbure Magnus** : Le spin défléchit continuellement la trajectoire en vol.
- **Rotation 3D Réaliste par Quaternions** : Orientation intégrée par quaternions 4D `[x, y, z, w]` synchronisée avec la surface du terrain.

### 4. Ralenti Automatique (Goal Replay)
- **Buffer Circulaire Glissant** : Enregistrement continu des 480 derniers ticks (4 secondes d'action à 120 Hz).
- **Célébration & Diffusion TV** : Célébration libre post-but, ralenti cinématique avec caméra resserrée, voyant clignotant `● REPLAY`, bandeau de l'équipe et bouton pour passer.

---

## 📁 Structure du Projet

```
BALLBALL/
├── index.html                   # Interface, sélection de format, sélecteur de caméra et modal Pause
├── package.json                 # Dépendances et scripts de build Vite
├── tsconfig.json                # Options strictes du compilateur TypeScript
├── vite.config.ts               # Configuration du serveur Vite
├── src/
│   ├── main.ts                  # Boucle de jeu principale, gestion des phases et intégration UI
│   ├── style.css                # Styles modernes de l'arène, du bandeau et du modal Pause
│   ├── engine/
│   │   ├── constants.ts         # Constantes physiques (120Hz, vitesses, drag, masses)
│   │   ├── types.ts             # Types TypeScript stricts (GameState, Player, Ball, etc.)
│   │   ├── math.ts              # Algèbre vectorielle, bridage clampSpeed et quaternions
│   │   ├── stadium.ts           # Dimensions des terrains selon le format (1v1 à 5v5)
│   │   ├── spin.ts              # Calcul du spin et effet Magnus
│   │   ├── collisions.ts        # Résolution des collisions cercles, murs, poteaux et buts
│   │   ├── physics.ts           # Boucle de simulation 120Hz et physique du contour des buts
│   │   ├── gameState.ts         # Fabrique d'initialisation du match
│   │   └── replay.ts            # Moteur de buffer circulaire et lecture des ralentis
│   ├── render/
│   │   └── renderer.ts          # Rendu Canvas 2D multi-calques, 3 modes de caméra et HUD
│   ├── input/
│   │   └── inputManager.ts      # Gestionnaire d'entrées (clavier ZQSD, souris, manettes)
│   ├── ai/
│   │   ├── tactics.ts           # Manager tactique (rôles, passes sécurisées, poches de démarquage)
│   │   └── botController.ts     # Contrôleur d'IA avec 3 difficultés et comportements football
│   └── audio/
│       └── soundManager.ts      # Synthétiseur de sons procéduraux (Web Audio API)
└── decompiled/                  # Fichiers sources extraits pour référence
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
   Ouvrez ensuite [http://localhost:3000](http://localhost:3000) (ou le port affiché) dans votre navigateur.

4. **Compiler pour la production** :
   ```bash
   npm run build
   ```

---

## 🗺️ Feuilles de Route (Roadmap)

- [x] Rétro-ingénierie complète de l'architecture et des formules physiques.
- [x] Moteur physique 120 Hz déterministe avec sous-échantillonnage 4x (480 Hz).
- [x] Simulation de l'effet Magnus (courbe) et roulement 3D par quaternions.
- [x] Filets blancs élastiques avec déformation dynamique et rebond trampoline naturel.
- [x] Système de ralenti automatique post-but (*Goal Replay*) avec overlay TV.
- [x] 3 Modes de caméra dynamiques (Ballon, Joueur 1:1, Vue Terrain complète).
- [x] Menu Pause avec sélecteur de difficulté (Facile, Moyen, Difficile) en temps réel.
- [x] IA tactique avancée inspirée du vrai football (Buteur en pivot, ailiers, gardien libéro, rotation 2v2).
- [x] Anticipation des passes imparfaites (*aller à la rencontre du ballon*) et appels en une-deux.
- [x] Sécurité absolue anti-but contre son camp et protection de balle sous pressing.
- [x] Prise en charge intégrale des formats 1v1, 2v2, 3v3, 4v4, 5v5.
- [ ] Serveur multijoueur en temps réel (WebSocket + prédiction Rollback).
- [ ] Support des shaders d'arrière-plan WebGL 2 (dunes de sable et caustiques sous-marines).

---

## 📄 Licence

Ce projet est sous licence MIT - voir le fichier [LICENSE](LICENSE) pour plus de détails.  
Inspiré par le jeu web original [ballball.club](https://ballball.club).
