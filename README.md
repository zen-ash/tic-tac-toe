# Neon Tic Tac Toe

**Play it live: https://tic-tac-toe-seven-chi-77.vercel.app**

A glowing, animated take on tic tac toe. It's plain HTML, CSS and JavaScript with no build step and no dependencies.

## Features

- **Neon glass UI**: floating gradient orbs, a retro grid floor, frosted-glass panels and a rotating glow around the board
- **Animated marks**: X and O draw themselves stroke by stroke, with a neon glow
- **Win effects**: an animated strike-through, pulsing winning cells, confetti cannons and a result card
- **vs Computer**: Easy, Medium and **Unbeatable** (minimax with alpha-beta pruning)
- **2 Players**: local pass-and-play
- **Synthesised sound effects** (Web Audio API, no audio files) with a mute toggle
- **Persistent scores** per mode and difficulty (localStorage)
- **Keyboard play**: `1`–`9` place a mark, `R` starts a new round
- Responsive, touch-friendly, and respects `prefers-reduced-motion`

## Run locally

Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
```

Then visit http://localhost:8000.

## Deploy

It's a static site, so it works as-is on Vercel, Netlify or GitHub Pages.
