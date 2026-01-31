/**
 * Contexto UA — клієнт гри
 * API: /api/words, /api/secret, /api/guess, /api/hint, /api/reveal
 * Якщо сервер недоступний — працює демо-режим (без сервера).
 */
(function () {
  const API_BASE = window.API_BASE || '/api';

  // Слова для демо-режиму (коли сервер не запущений)
  const DEMO_WORDS = [
    'вода', 'земля', 'небо', 'сонце', 'місяць', 'вітер', 'вогонь', 'дерево', 'камінь', 'людина',
    'дім', 'місто', 'село', 'дорога', 'ріка', 'гора', 'ліс', 'поле', 'квітка', 'хліб',
    'книга', 'слово', 'музика', 'колір', 'час', 'день', 'ніч', 'рік', 'життя', 'кохання',
    'мама', 'тато', 'дитина', 'друг', 'родина', 'школа', 'робота', 'відпочинок', 'подорож', 'здорова',
    'великий', 'малий', 'новий', 'старий', 'добрий', 'красивий', 'сильний', 'швидкий', 'теплий', 'світлий',
    'йти', 'бачити', 'думати', 'говорити', 'працювати', 'вчити', 'грати', 'співати', 'писати', 'читати',
    'коло', 'квадрат', 'трикутник', 'картина', 'фото', 'зображення', 'природа', 'тварина', 'птах', 'риба',
  ];

  const STORAGE_KEY = 'contexto_ua_progress';

  const state = {
    level: 2,
    seedDate: new Date().toISOString().slice(0, 10),
    guesses: [],
    wordsList: [],
    coins: 650,
    hintsUsed: 0,
    hintLettersRevealed: 0,
    secretWord: null,
    gameEnded: false,
    demoMode: false,
  };

  function saveProgress() {
    if (state.gameEnded) {
      try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        level: state.level,
        seedDate: state.seedDate,
        guesses: state.guesses,
        coins: state.coins,
        hintsUsed: state.hintsUsed,
        demoMode: state.demoMode,
      }));
    } catch (e) {}
  }

  function loadProgress(level, seedDate) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const saved = JSON.parse(raw);
      if (saved.level !== level || saved.seedDate !== seedDate || saved.gameEnded) return false;
      if (!Array.isArray(saved.guesses)) return false;
      state.guesses = saved.guesses;
      if (saved.coins !== undefined) state.coins = saved.coins;
      if (saved.hintsUsed !== undefined) state.hintsUsed = saved.hintsUsed;
      if (saved.demoMode !== undefined) state.demoMode = saved.demoMode;
      return true;
    } catch (e) {
      return false;
    }
  }

  const $ = (id) => document.getElementById(id);
  const $mainMenu = $('main-menu');
  const $gameScreen = $('game-screen');
  const $screenTitle = $('screen-title');
  const $guessInput = $('guess-input');
  const $guessesList = $('guesses-list');
  const $lastGuessWrap = $('last-guess-wrap');
  const $coinsValue = $('coins-value');
  const $hintBadge = $('hint-badge');
  const $overlayMenu = $('overlay-menu');
  const $modalGiveUp = $('modal-give-up');
  const $revealedWord = $('revealed-word');

  function showScreen(screen) {
    $mainMenu.classList.toggle('hidden', screen !== 'menu');
    $gameScreen.classList.toggle('hidden', screen !== 'game');
    $screenTitle.textContent = screen === 'menu' ? 'CONTEXTO' : 'Рівень ' + state.level;
  }

  function positionColor(position) {
    if (position <= 300) return 'green';
    if (position <= 1500) return 'orange';
    return 'red';
  }

  function barWidth(position) {
    if (position <= 300) return Math.max(10, 80 - (position / 300) * 50) + '%';
    if (position <= 1500) return Math.max(5, 40 - ((position - 300) / 1200) * 30) + '%';
    return Math.max(2, 15 - Math.min(position / 5000, 10)) + '%';
  }

  function guessRowHtml(g, opts) {
    const isWin = g.position === 1;
    const color = positionColor(g.position);
    const width = barWidth(g.position);
    const recent = opts && opts.recent;
    return `
      <div class="guess-row ${recent ? 'recent' : ''} ${isWin ? 'win' : ''}">
        <span class="guess-word">${escapeHtml(g.word)}</span>
        <div class="guess-bar-wrap">
          <div class="guess-bar ${color}" style="width:${width}"></div>
        </div>
        <span class="guess-pos">${g.position}</span>
      </div>
    `;
  }

  function renderGuesses() {
    const last = state.guesses.length > 0 ? state.guesses[state.guesses.length - 1] : null;

    // Останнє введене слово — під строкою вводу (підсвічуємо)
    if (last) {
      $lastGuessWrap.innerHTML = guessRowHtml(last, { recent: true });
      $lastGuessWrap.classList.remove('hidden');
    } else {
      $lastGuessWrap.innerHTML = '';
      $lastGuessWrap.classList.add('hidden');
    }

    // Усі здогадки — нижче, відсортовані за близькістю; останнє введене дублюється в списку і теж підсвічується
    const sorted = [...state.guesses].sort((a, b) => a.position - b.position);
    $guessesList.innerHTML = sorted
      .map((g) => guessRowHtml(g, { recent: g === last }))
      .join('');
  }

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function addGuess(word, position) {
    state.guesses.push({ word, position });
    renderGuesses();
    if (position === 1) {
      state.gameEnded = true;
      state.coins += 50;
      $coinsValue.textContent = state.coins;
      saveProgress();
    } else {
      saveProgress();
    }
  }

  async function api(path, options = {}) {
    const url = API_BASE.replace(/\/$/, '') + path;
    const res = await fetch(url, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || res.statusText || 'Помилка мережі');
    }
    return res.json();
  }

  function demoSecretIndex() {
    let h = 0;
    const s = 'contexto_ua_' + state.level + '_' + state.seedDate;
    for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    return Math.abs(h) % DEMO_WORDS.length;
  }

  function demoPosition(guessWord) {
    const secretIdx = demoSecretIndex();
    const secret = DEMO_WORDS[secretIdx].toLowerCase();
    const guess = guessWord.toLowerCase();
    if (guess === secret) return 1;
    let h = 0;
    for (let i = 0; i < guess.length; i++) h = ((h << 5) - h + guess.charCodeAt(i)) | 0;
    return 2 + (Math.abs(h) % 2500);
  }

  async function submitGuess(word) {
    const normalized = word.trim().toLowerCase();
    if (!normalized) return;
    if (state.demoMode) {
      const pos = demoPosition(normalized);
      addGuess(normalized, pos);
      $guessInput.value = '';
      $guessInput.focus();
      return;
    }
    try {
      const data = await api('/guess', {
        method: 'POST',
        body: JSON.stringify({
          level: state.level,
          seed_date: state.seedDate,
          word: normalized,
        }),
      });
      addGuess(data.normalized_word, data.position);
      $guessInput.value = '';
      $guessInput.focus();
    } catch (e) {
      alert(e.message || 'Слово не знайдено в словнику. Спробуйте інше.');
    }
  }

  function openOverlay() {
    $overlayMenu.classList.remove('hidden');
  }

  function closeOverlay() {
    $overlayMenu.classList.add('hidden');
  }

  async function useHint() {
    if (state.gameEnded) return;
    if (state.demoMode) {
      const secretIdx = demoSecretIndex();
      const hintIdx = (secretIdx + 50 + state.hintsUsed * 30) % DEMO_WORDS.length;
      const hintWord = DEMO_WORDS[hintIdx];
      const pos = demoPosition(hintWord);
      addGuess(hintWord.toLowerCase(), pos);
      state.hintsUsed++;
      state.coins = Math.max(0, state.coins - 20);
      $coinsValue.textContent = state.coins;
      $hintBadge.textContent = Math.max(0, 4 - state.hintsUsed);
      closeOverlay();
      return;
    }
    try {
      const hintData = await api('/hint', {
        method: 'POST',
        body: JSON.stringify({ level: state.level, seed_date: state.seedDate }),
      });
      const guessData = await api('/guess', {
        method: 'POST',
        body: JSON.stringify({
          level: state.level,
          seed_date: state.seedDate,
          word: hintData.word,
        }),
      });
      addGuess(guessData.normalized_word, guessData.position);
      state.hintsUsed++;
      state.coins = Math.max(0, state.coins - 20);
      $coinsValue.textContent = state.coins;
      $hintBadge.textContent = Math.max(0, 4 - state.hintsUsed);
      closeOverlay();
    } catch (e) {
      alert(e.message || 'Не вдалося отримати підказку.');
    }
  }

  async function giveUp() {
    if (state.demoMode) {
      const secretIdx = demoSecretIndex();
      state.secretWord = DEMO_WORDS[secretIdx];
      state.gameEnded = true;
      $revealedWord.textContent = state.secretWord;
      $modalGiveUp.classList.remove('hidden');
      closeOverlay();
      saveProgress();
      return;
    }
    try {
      const data = await api('/reveal', {
        method: 'POST',
        body: JSON.stringify({ level: state.level, seed_date: state.seedDate }),
      });
      state.secretWord = data.word;
      state.gameEnded = true;
      $revealedWord.textContent = data.word;
      $modalGiveUp.classList.remove('hidden');
      closeOverlay();
      saveProgress();
    } catch (e) {
      alert(e.message || 'Помилка.');
    }
  }

  function startGame(level, seedDateOptional) {
    state.level = level;
    state.seedDate = seedDateOptional && /^\d{4}-\d{2}-\d{2}$/.test(seedDateOptional)
      ? seedDateOptional
      : new Date().toISOString().slice(0, 10);
    state.gameEnded = false;
    state.secretWord = null;

    const restored = loadProgress(state.level, state.seedDate);
    if (!restored) {
      state.guesses = [];
      state.hintsUsed = 0;
    }

    $guessInput.value = '';
    $hintBadge.textContent = Math.max(0, 4 - state.hintsUsed);
    $coinsValue.textContent = state.coins;
    renderGuesses();
    showScreen('game');
    $guessInput.focus();
  }

  function goHome() {
    saveProgress();
    showScreen('menu');
  }

  // Level dots
  document.querySelectorAll('.level-dot').forEach((el) => {
    el.addEventListener('click', () => {
      document.querySelectorAll('.level-dot').forEach((d) => d.classList.remove('active'));
      el.classList.add('active');
      const level = parseInt(el.dataset.level, 10);
      state.level = level;
      $('btn-start').textContent = 'Рівень ' + level;
    });
  });

  $('btn-start').addEventListener('click', () => startGame(state.level));

  $('btn-submit').addEventListener('click', () => {
    submitGuess($guessInput.value);
  });

  $guessInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitGuess($guessInput.value);
    }
  });

  $('btn-settings').addEventListener('click', openOverlay);

  $('overlay-backdrop').addEventListener('click', closeOverlay);
  $('menu-hint').addEventListener('click', useHint);
  $('menu-give-up').addEventListener('click', giveUp);
  $('menu-settings').addEventListener('click', () => {
    closeOverlay();
    alert('Налаштування (мова тощо) — у наступній версії.');
  });
  $('menu-previous').addEventListener('click', () => {
    closeOverlay();
    const date = prompt('Введіть дату (РРРР-ММ-ДД) для попередньої гри:', state.seedDate);
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      startGame(state.level, date);
    }
  });

  $('nav-hint').addEventListener('click', useHint);
  $('nav-home').addEventListener('click', goHome);

  $('give-up-backdrop').addEventListener('click', () => $modalGiveUp.classList.add('hidden'));
  $('btn-close-give-up').addEventListener('click', () => {
    $modalGiveUp.classList.add('hidden');
    goHome();
  });

  // Перевірка: якщо сервер недоступний — увімкнути демо-режим
  fetch(API_BASE.replace(/\/$/, '') + '/health', { method: 'GET' })
    .then((r) => (r.ok ? r.json() : Promise.reject()))
    .then((data) => {
      state.wordsList = [];
      return api('/words');
    })
    .then((data) => {
      state.wordsList = data.words || [];
    })
    .catch(() => {
      state.demoMode = true;
      state.wordsList = DEMO_WORDS;
      console.log('Contexto UA: сервер недоступний — гра в демо-режимі (слова з обмеженого списку).');
    });

  showScreen('menu');
})();
