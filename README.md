# Tic Tac Toe

**Play it live: https://tic-tac-toe-seven-chi-77.vercel.app**

A quiet, hand-drawn game of tic tac toe on ivory paper. It's plain HTML, CSS and JavaScript with no build step and no dependencies.

## Features

- **Editorial look**: ivory paper with a fine grain, Newsreader serif, ink-black crosses and terracotta noughts
- **Hand-drawn marks**: the grid, crosses and noughts are drawn with a pen stroke, with a bowed strike-through on a win
- **Calm celebrations**: a sunburst behind the winning mark and a slow flutter of paper confetti
- **Versus Computer**: Easy, Medium and **Unbeatable** (minimax with alpha-beta pruning)
- **Two Players**: Crosses vs Noughts, pass-and-play
- **Sound**: pen scratches and soft piano notes, synthesised with the Web Audio API (no audio files), with a mute toggle
- **Persistent scores** per mode and difficulty (localStorage)
- **Keyboard play**: `1`–`9` place a mark, `R` starts a new round
- Responsive, and respects `prefers-reduced-motion`

## Run locally

Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
```

Then visit http://localhost:8000.

## Deploy

It's a static site, so it works as-is on Vercel, Netlify or GitHub Pages.
