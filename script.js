(() => {
  'use strict';

  const LINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
  ];

  const $ = (sel) => document.querySelector(sel);
  const boardEl = $('#board');
  const wrapEl = $('.board-wrap');
  const lineSvg = $('#winline');
  const statusEl = $('#status');
  const resultEl = $('#result');

  // ---------- Persistence (best effort) ----------

  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {}
    },
  };

  const prefs = store.get('ttt:prefs', { mode: 'ai', difficulty: 'hard', sound: true });

  const state = {
    board: Array(9).fill(null),
    turn: 'X',
    starter: 'X',
    over: false,
    busy: false,
    lastLine: null,
    mode: prefs.mode === 'pvp' ? 'pvp' : 'ai',
    difficulty: ['easy', 'medium', 'hard'].includes(prefs.difficulty) ? prefs.difficulty : 'hard',
    sound: prefs.sound !== false,
    scores: store.get('ttt:scores', {}),
  };

  let aiTimer = 0;
  let resultTimer = 0;

  const other = (p) => (p === 'X' ? 'O' : 'X');
  const scoreKey = () => (state.mode === 'ai' ? `ai-${state.difficulty}` : 'pvp');
  const scores = () => (state.scores[scoreKey()] ??= { X: 0, O: 0, draw: 0 });
  const isAiTurn = () => state.mode === 'ai' && state.turn === 'O' && !state.over;
  const cellName = (i) => `Row ${Math.floor(i / 3) + 1}, column ${(i % 3) + 1}`;
  const savePrefs = () => store.set('ttt:prefs', { mode: state.mode, difficulty: state.difficulty, sound: state.sound });

  // ---------- Sound (synthesised, no assets) ----------

  const sfx = (() => {
    let ctx;
    function tone(freq, { dur = 0.15, type = 'sine', vol = 0.12, at = 0, slide } = {}) {
      if (!state.sound) return;
      try {
        ctx ??= new (window.AudioContext || window.webkitAudioContext)();
        if (ctx.state === 'suspended') ctx.resume();
        const t = ctx.currentTime + at;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, t);
        if (slide) osc.frequency.exponentialRampToValueAtTime(slide, t + dur);
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(vol, t + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + dur + 0.05);
      } catch {}
    }
    return {
      place: (p) => (p === 'X'
        ? tone(620, { type: 'triangle', slide: 920, dur: 0.14 })
        : tone(480, { type: 'sine', slide: 340, dur: 0.2, vol: 0.16 })),
      click: () => tone(1400, { dur: 0.04, type: 'square', vol: 0.025 }),
      win: () => [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, { at: i * 0.09, dur: 0.32, type: 'triangle', vol: 0.12 })),
      lose: () => [392, 329.63, 261.63].forEach((f, i) => tone(f, { at: i * 0.15, dur: 0.38, type: 'sawtooth', vol: 0.045 })),
      draw: () => [440, 415.3].forEach((f, i) => tone(f, { at: i * 0.13, dur: 0.26, vol: 0.1 })),
    };
  })();

  // ---------- Confetti ----------

  const confetti = (() => {
    const canvas = $('#confetti');
    const ctx = canvas.getContext('2d');
    const colors = ['#ff3d8b', '#22d3ee', '#8b5cf6', '#fbbf24', '#ffffff', '#a3e635'];
    let parts = [];
    let raf = 0;
    let dpr = 1;

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = innerWidth * dpr;
      canvas.height = innerHeight * dpr;
    }
    addEventListener('resize', resize);
    resize();

    function burst() {
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const w = innerWidth;
      const h = innerHeight;
      for (let k = 0; k < 180; k++) {
        const left = k % 2 === 0;
        parts.push({
          x: left ? -10 : w + 10,
          y: h * 0.7,
          vx: (left ? 1 : -1) * (3 + Math.random() * 10),
          vy: -(8 + Math.random() * 13),
          w: 6 + Math.random() * 7,
          h: 9 + Math.random() * 9,
          rot: Math.random() * Math.PI * 2,
          vr: (Math.random() - 0.5) * 0.35,
          color: colors[k % colors.length],
          round: Math.random() < 0.3,
          life: 0,
        });
      }
      if (!raf) raf = requestAnimationFrame(tick);
    }

    function tick() {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      parts = parts.filter((p) => p.y < innerHeight + 40 && p.life < 360);
      for (const p of parts) {
        p.life++;
        p.vy += 0.3;
        p.vx *= 0.99;
        p.vy *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = Math.min(1, (360 - p.life) / 60);
        ctx.fillStyle = p.color;
        if (p.round) {
          ctx.beginPath();
          ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.scale(1, Math.cos(p.life * 0.15));
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        }
        ctx.restore();
      }
      raf = parts.length ? requestAnimationFrame(tick) : 0;
    }

    return { burst };
  })();

  // ---------- Game logic ----------

  function getResult(b) {
    for (const line of LINES) {
      const [a, c, d] = line;
      if (b[a] && b[a] === b[c] && b[a] === b[d]) return { player: b[a], line };
    }
    return b.every(Boolean) ? { player: null, line: null } : null;
  }

  function minimax(b, player, ai, depth, alpha, beta) {
    const r = getResult(b);
    if (r) {
      if (r.player === ai) return 10 - depth;
      if (r.player) return depth - 10;
      return 0;
    }
    const maximizing = player === ai;
    let best = maximizing ? -Infinity : Infinity;
    for (let i = 0; i < 9; i++) {
      if (b[i]) continue;
      b[i] = player;
      const score = minimax(b, other(player), ai, depth + 1, alpha, beta);
      b[i] = null;
      if (maximizing) {
        best = Math.max(best, score);
        alpha = Math.max(alpha, score);
      } else {
        best = Math.min(best, score);
        beta = Math.min(beta, score);
      }
      if (beta <= alpha) break;
    }
    return best;
  }

  function bestMove(b, ai) {
    let best = -Infinity;
    let moves = [];
    for (let i = 0; i < 9; i++) {
      if (b[i]) continue;
      b[i] = ai;
      const score = minimax(b, other(ai), ai, 1, -Infinity, Infinity);
      b[i] = null;
      if (score > best) {
        best = score;
        moves = [i];
      } else if (score === best) {
        moves.push(i);
      }
    }
    return moves[Math.floor(Math.random() * moves.length)];
  }

  function chooseAiMove() {
    const empty = state.board.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
    const skill = { easy: 0.25, medium: 0.7, hard: 1 }[state.difficulty];
    if (Math.random() < skill) return bestMove(state.board.slice(), 'O');
    return empty[Math.floor(Math.random() * empty.length)];
  }

  // ---------- Rendering helpers ----------

  function markSVG(p, cls = '') {
    return p === 'X'
      ? `<svg viewBox="0 0 100 100" class="x-mark ${cls}" aria-hidden="true"><path class="mark x" pathLength="1" d="M22 22L78 78"/><path class="mark x second" pathLength="1" d="M78 22L22 78"/></svg>`
      : `<svg viewBox="0 0 100 100" class="o-mark ${cls}" aria-hidden="true"><path class="mark o" pathLength="1" d="M50 20a30 30 0 1 1 0 60a30 30 0 1 1 0-60"/></svg>`;
  }

  const ICON_SOUND_ON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/></svg>';
  const ICON_SOUND_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="m22 9-6 6"/><path d="m16 9 6 6"/></svg>';

  const cells = Array.from({ length: 9 }, (_, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cell';
    btn.dataset.i = i;
    btn.style.setProperty('--d', i);
    btn.setAttribute('aria-label', `${cellName(i)}, empty`);
    boardEl.append(btn);
    return btn;
  });

  function setupSeg(el, key, onChange) {
    const btns = [...el.querySelectorAll('button')];
    el.style.setProperty('--n', btns.length);
    el.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn || btn.dataset.value === state[key]) return;
      state[key] = btn.dataset.value;
      savePrefs();
      sfx.click();
      onChange();
    });
    return () => {
      const idx = btns.findIndex((b) => b.dataset.value === state[key]);
      el.style.setProperty('--i', idx);
      btns.forEach((b, i) => {
        b.classList.toggle('active', i === idx);
        b.setAttribute('aria-pressed', String(i === idx));
      });
    };
  }

  const onSettingsChange = () => {
    state.starter = 'X';
    newRound({ alternate: false });
  };
  const renderMode = setupSeg($('#mode'), 'mode', onSettingsChange);
  const renderDifficulty = setupSeg($('#difficulty'), 'difficulty', onSettingsChange);

  function bump(key) {
    const el = $(`#value-${key.toLowerCase()}`);
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  }

  function statusHTML() {
    const ai = state.mode === 'ai';
    const who = (p) => `<span class="who-${p.toLowerCase()}">${p}</span>`;
    if (state.over) {
      const r = getResult(state.board);
      if (!r.player) return "It's a draw!";
      if (ai) return r.player === 'X' ? `${who('X')} You win!` : `${who('O')} Computer wins`;
      return `Player ${who(r.player)} wins!`;
    }
    if (ai) {
      return state.turn === 'X'
        ? `Your move ${who('X')}`
        : `Computer is thinking<span class="thinking"><span>.</span><span>.</span><span>.</span></span>`;
    }
    return `Player ${who(state.turn)}'s turn`;
  }

  function render() {
    const ai = state.mode === 'ai';
    const s = scores();
    $('#label-x').textContent = ai ? 'You' : 'Player X';
    $('#label-o').textContent = ai ? 'Computer' : 'Player O';
    $('#value-x').textContent = s.X;
    $('#value-o').textContent = s.O;
    $('#value-draw').textContent = s.draw;
    $('#score-x').classList.toggle('active', !state.over && state.turn === 'X');
    $('#score-o').classList.toggle('active', !state.over && state.turn === 'O');
    $('#difficulty-wrap').classList.toggle('collapsed', !ai);

    boardEl.classList.toggle('turn-x', state.turn === 'X');
    boardEl.classList.toggle('turn-o', state.turn === 'O');
    boardEl.classList.toggle('locked', state.over || state.busy || isAiTurn());

    statusEl.innerHTML = statusHTML();

    const soundBtn = $('#sound');
    soundBtn.innerHTML = state.sound ? ICON_SOUND_ON : ICON_SOUND_OFF;
    soundBtn.setAttribute('aria-pressed', String(state.sound));

    renderMode();
    renderDifficulty();
  }

  function drawWinLine(line, player, instant = false) {
    const wr = wrapEl.getBoundingClientRect();
    const center = (i) => {
      const r = cells[i].getBoundingClientRect();
      return [r.left + r.width / 2 - wr.left, r.top + r.height / 2 - wr.top];
    };
    let [x1, y1] = center(line[0]);
    let [x2, y2] = center(line[2]);
    const len = Math.hypot(x2 - x1, y2 - y1);
    const ext = cells[0].offsetWidth * 0.36;
    const ux = (x2 - x1) / len;
    const uy = (y2 - y1) / len;
    x1 -= ux * ext; y1 -= uy * ext;
    x2 += ux * ext; y2 += uy * ext;
    lineSvg.classList.toggle('instant', instant);
    lineSvg.setAttribute('viewBox', `0 0 ${wr.width} ${wr.height}`);
    lineSvg.innerHTML = `<line class="${player.toLowerCase()}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" style="--len:${len + ext * 2}"/>`;
  }

  function showResult(r) {
    const ai = state.mode === 'ai';
    const markEl = $('#result-mark');
    const title = $('#result-title');
    const sub = $('#result-sub');

    if (r.player) {
      markEl.className = 'result-mark';
      markEl.innerHTML = markSVG(r.player);
      title.className = r.player.toLowerCase();
      if (ai) {
        title.textContent = r.player === 'X' ? 'You win!' : 'Computer wins';
        sub.textContent = r.player === 'X'
          ? (state.difficulty === 'easy' ? 'Nicely done. Try a harder level?' : 'Outsmarted the machine!')
          : 'The machine prevails. Rematch?';
      } else {
        title.textContent = `${r.player} wins!`;
        sub.textContent = `Player ${other(r.player)}, want revenge?`;
      }
    } else {
      markEl.className = 'result-mark pair';
      markEl.innerHTML = markSVG('X') + markSVG('O');
      title.className = 'draw';
      title.textContent = "It's a draw";
      sub.textContent = ai && state.difficulty === 'hard' ? "That's the best anyone can do here." : 'Evenly matched.';
    }

    resultEl.classList.add('show');
    resultEl.setAttribute('aria-hidden', 'false');
    $('#again').focus({ preventScroll: true });
  }

  function hideResult() {
    resultEl.classList.remove('show');
    resultEl.setAttribute('aria-hidden', 'true');
  }

  // ---------- Flow ----------

  function play(i) {
    const p = state.turn;
    state.board[i] = p;
    const cell = cells[i];
    cell.innerHTML = markSVG(p);
    cell.classList.add('filled', 'pop');
    cell.setAttribute('aria-label', `${cellName(i)}, ${p}`);
    sfx.place(p);

    const r = getResult(state.board);
    if (r) {
      finish(r);
      return;
    }
    state.turn = other(p);
    render();
    if (isAiTurn()) queueAi();
  }

  function humanMove(i) {
    if (state.over || state.busy || state.board[i] || isAiTurn()) return;
    play(i);
  }

  function queueAi() {
    state.busy = true;
    render();
    aiTimer = setTimeout(() => {
      state.busy = false;
      play(chooseAiMove());
    }, 450 + Math.random() * 400);
  }

  function finish(r) {
    state.over = true;
    state.busy = false;
    const s = scores();

    if (r.player) {
      s[r.player]++;
      bump(r.player);
      state.lastLine = { line: r.line, player: r.player };
      r.line.forEach((i) => cells[i].classList.add('win', r.player.toLowerCase()));
      drawWinLine(r.line, r.player);
      const humanWon = !(state.mode === 'ai' && r.player === 'O');
      if (humanWon) {
        sfx.win();
        setTimeout(confetti.burst, 350);
      } else {
        sfx.lose();
      }
    } else {
      s.draw++;
      bump('draw');
      boardEl.classList.add('shake');
      sfx.draw();
    }

    store.set('ttt:scores', state.scores);
    boardEl.classList.add('game-over');
    render();
    resultTimer = setTimeout(() => showResult(r), r.player ? 1200 : 800);
  }

  function newRound({ alternate = true } = {}) {
    clearTimeout(aiTimer);
    clearTimeout(resultTimer);
    if (alternate) state.starter = other(state.starter);
    state.board.fill(null);
    state.turn = state.starter;
    state.over = false;
    state.busy = false;
    state.lastLine = null;
    cells.forEach((c, i) => {
      c.innerHTML = '';
      c.className = 'cell';
      c.setAttribute('aria-label', `${cellName(i)}, empty`);
    });
    boardEl.classList.remove('game-over', 'shake');
    lineSvg.innerHTML = '';
    hideResult();
    render();
    if (isAiTurn()) queueAi();
  }

  // ---------- Events ----------

  boardEl.addEventListener('click', (e) => {
    const cell = e.target.closest('.cell');
    if (cell) humanMove(Number(cell.dataset.i));
  });

  $('#restart').addEventListener('click', () => {
    sfx.click();
    newRound();
  });
  $('#again').addEventListener('click', () => {
    sfx.click();
    newRound();
  });

  $('#reset').addEventListener('click', () => {
    sfx.click();
    state.scores[scoreKey()] = { X: 0, O: 0, draw: 0 };
    store.set('ttt:scores', state.scores);
    ['x', 'o', 'draw'].forEach(bump);
    state.starter = 'X';
    newRound({ alternate: false });
  });

  $('#sound').addEventListener('click', () => {
    state.sound = !state.sound;
    savePrefs();
    sfx.click();
    render();
  });

  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (/^[1-9]$/.test(e.key)) {
      humanMove(Number(e.key) - 1);
    } else if (e.key === 'r' || e.key === 'R') {
      newRound();
    }
  });

  addEventListener('resize', () => {
    if (state.lastLine) drawWinLine(state.lastLine.line, state.lastLine.player, true);
  });

  newRound({ alternate: false });
})();
