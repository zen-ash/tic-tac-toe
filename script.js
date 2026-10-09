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
    let noise;

    function audio() {
      if (!state.sound) return null;
      try {
        ctx ??= new (window.AudioContext || window.webkitAudioContext)();
        if (ctx.state === 'suspended') ctx.resume();
        return ctx;
      } catch {
        return null;
      }
    }

    // Soft, piano-ish note: a sine with a faint octave overtone and a long tail.
    function note(freq, { at = 0, dur = 1.2, vol = 0.05 } = {}) {
      const ac = audio();
      if (!ac) return;
      const t = ac.currentTime + at;
      [[freq, vol], [freq * 2, vol * 0.18]].forEach(([f, v]) => {
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.frequency.value = f;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(v, t + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.connect(gain).connect(ac.destination);
        osc.start(t);
        osc.stop(t + dur + 0.05);
      });
    }

    // Filtered noise burst, like a nib dragging across paper.
    function scratch({ freq = 2600, dur = 0.12, vol = 0.07, at = 0 } = {}) {
      const ac = audio();
      if (!ac) return;
      if (!noise) {
        noise = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate);
        const data = noise.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      }
      const t = ac.currentTime + at;
      const src = ac.createBufferSource();
      const filter = ac.createBiquadFilter();
      const gain = ac.createGain();
      src.buffer = noise;
      filter.type = 'bandpass';
      filter.frequency.value = freq;
      filter.Q.value = 0.9;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(vol, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(filter).connect(gain).connect(ac.destination);
      src.start(t, Math.random() * 0.3);
      src.stop(t + dur + 0.02);
    }

    return {
      place: (p) => (p === 'X'
        ? (scratch({ dur: 0.1 }), scratch({ dur: 0.1, at: 0.22, freq: 2900 }))
        : scratch({ dur: 0.32, freq: 2100, vol: 0.06 })),
      click: () => scratch({ freq: 4200, dur: 0.035, vol: 0.04 }),
      win: () => [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => note(f, { at: i * 0.11, dur: 1.6 })),
      lose: () => [440, 349.23, 293.66].forEach((f, i) => note(f, { at: i * 0.18, dur: 1.4, vol: 0.045 })),
      draw: () => [392, 523.25].forEach((f, i) => note(f, { at: i * 0.16, dur: 1.3, vol: 0.045 })),
    };
  })();

  // ---------- Paper flutter ----------

  const confetti = (() => {
    const canvas = $('#confetti');
    const ctx = canvas.getContext('2d');
    const colors = ['#c15f3c', '#1a1915', '#b08d57', '#7d8b6a', '#d9cfb6', '#c15f3c'];
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
      for (let k = 0; k < 90; k++) {
        parts.push({
          x: Math.random() * w,
          y: -20 - Math.random() * innerHeight * 0.6,
          vy: 0.9 + Math.random() * 1.4,
          sway: 0.6 + Math.random() * 1.2,
          phase: Math.random() * Math.PI * 2,
          w: 5 + Math.random() * 6,
          h: 8 + Math.random() * 8,
          rot: Math.random() * Math.PI * 2,
          vr: (Math.random() - 0.5) * 0.06,
          color: colors[k % colors.length],
          life: 0,
        });
      }
      if (!raf) raf = requestAnimationFrame(tick);
    }

    function tick() {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      parts = parts.filter((p) => p.y < innerHeight + 30);
      for (const p of parts) {
        p.life++;
        p.y += p.vy;
        p.x += Math.sin(p.phase + p.life * 0.03) * p.sway;
        p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = p.color;
        ctx.scale(Math.cos(p.phase + p.life * 0.05), 1);
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
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

  // Slightly irregular paths so the marks read as hand-drawn with a pen.
  function markSVG(p) {
    return p === 'X'
      ? '<svg viewBox="0 0 100 100" aria-hidden="true"><path class="mark x" pathLength="1" d="M27 25C42 41 58 57 75 76"/><path class="mark x second" pathLength="1" d="M74 26C57 42 43 58 26 75"/></svg>'
      : '<svg viewBox="0 0 100 100" aria-hidden="true"><path class="mark o" pathLength="1" d="M58 23C40 19 23 31 23 51C23 68 36 78 51 78C67 78 78 66 77 49C76 33 64 22 47 24"/></svg>';
  }

  function burstSVG(p) {
    const rays = Array.from({ length: 16 }, (_, k) => {
      const a = (k / 16) * Math.PI * 2;
      const r1 = k % 2 ? 62 : 56;
      const r2 = k % 2 ? 74 : 82;
      const pt = (r) => `${(85 + Math.cos(a) * r).toFixed(1)} ${(85 + Math.sin(a) * r).toFixed(1)}`;
      return `<path pathLength="1" d="M${pt(r1)}L${pt(r2)}"/>`;
    }).join('');
    return `<svg class="burst ${p.toLowerCase()}" viewBox="0 0 170 170" aria-hidden="true">${rays}</svg>`;
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

  const SIDE = { X: 'Crosses', O: 'Noughts' };

  function statusHTML() {
    const ai = state.mode === 'ai';
    const who = (p, text = SIDE[p]) => `<span class="who-${p.toLowerCase()}">${text}</span>`;
    if (state.over) {
      const r = getResult(state.board);
      if (!r.player) return 'Honours even.';
      if (ai) return r.player === 'X' ? 'Well played.' : 'The computer takes it.';
      return `${who(r.player)} take the game.`;
    }
    if (ai) {
      return state.turn === 'X'
        ? `Your move, ${who('X', 'Crosses')}.`
        : 'The computer considers<span class="ellipsis"><span>.</span><span>.</span><span>.</span></span>';
    }
    return `${who(state.turn)} to play.`;
  }

  function render() {
    const ai = state.mode === 'ai';
    const s = scores();
    $('#label-x').textContent = ai ? 'You' : 'Crosses';
    $('#label-o').textContent = ai ? 'Computer' : 'Noughts';
    $('#value-x').textContent = s.X;
    $('#value-o').textContent = s.O;
    $('#value-draw').textContent = s.draw;
    $('#score-x').classList.toggle('active', !state.over && state.turn === 'X');
    $('#score-o').classList.toggle('active', !state.over && state.turn === 'O');
    $('#difficulty-wrap').classList.toggle('collapsed', !ai);

    boardEl.classList.toggle('turn-x', state.turn === 'X');
    boardEl.classList.toggle('turn-o', state.turn === 'O');
    boardEl.classList.toggle('locked', state.over || state.busy || isAiTurn());

    const html = statusHTML();
    if (statusEl.innerHTML !== html) {
      statusEl.innerHTML = html;
      statusEl.classList.remove('swap');
      void statusEl.offsetWidth;
      statusEl.classList.add('swap');
    }

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
    // A gentle bow in the middle keeps the strike looking hand-drawn.
    const mx = (x1 + x2) / 2 - uy * 4;
    const my = (y1 + y2) / 2 + ux * 4;
    lineSvg.innerHTML = `<path class="${player.toLowerCase()}" d="M${x1} ${y1}Q${mx} ${my} ${x2} ${y2}" style="--len:${len + ext * 2 + 4}"/>`;
  }

  function showResult(r) {
    const ai = state.mode === 'ai';
    const markEl = $('#result-mark');
    const title = $('#result-title');
    const sub = $('#result-sub');

    if (r.player) {
      markEl.className = 'result-mark';
      markEl.innerHTML = burstSVG(r.player) + markSVG(r.player);
      title.className = r.player === 'X' ? 'x-won' : '';
      if (ai) {
        title.innerHTML = r.player === 'X' ? 'You <em>win.</em>' : 'The machine <em>prevails.</em>';
        sub.textContent = r.player === 'X'
          ? (state.difficulty === 'easy' ? 'A fine start · Perhaps a harder level' : 'Splendidly done')
          : 'A rematch, perhaps';
      } else {
        title.innerHTML = `${SIDE[r.player]} <em>win.</em>`;
        sub.textContent = `${SIDE[other(r.player)]} may demand a rematch`;
      }
    } else {
      markEl.className = 'result-mark pair';
      markEl.innerHTML = markSVG('X') + markSVG('O');
      title.className = '';
      title.innerHTML = 'A <em>draw.</em>';
      sub.textContent = ai && state.difficulty === 'hard' ? 'The best anyone can do here' : 'Evenly matched';
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
