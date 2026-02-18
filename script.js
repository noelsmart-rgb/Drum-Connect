/**
 * Drum Connect — Shared real drum samples (same as Essential Rhythms)
 * Script version: 5 — technique uses loaded snare buffer + AudioContext resume
 */
window.DrumConnectSamples = (function () {
  'use strict';
  const BASE = 'https://cdn.jsdelivr.net/gh/wesbos/JavaScript30@master/01%20-%20JavaScript%20Drum%20Kit/sounds/';
  const CLAP_URL = 'https://cdn.jsdelivr.net/gh/fluid-music/open-drums@main/tr-909/TR909all/HANDCLP1.WAV';
  const METRONOME_CLICK_URL = 'https://cdn.jsdelivr.net/gh/fluid-music/open-drums@main/tr-909/TR909all/RIM63.WAV';
  let ctx = null;
  let kick = null, snare = null, hihat = null;
  let loading = null;
  var extraBuffers = {};

  function getCtx() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    return ctx;
  }

  function load() {
    if (kick && snare && hihat) return Promise.resolve({ kick: kick, snare: snare, hihat: hihat });
    if (loading) return loading;
    var c = getCtx();
    if (c.state === 'suspended' && typeof c.resume === 'function') {
      loading = c.resume().then(function () { return doLoad(c); });
    } else {
      loading = doLoad(c);
    }
    return loading;
  }

  function fetchDecodeOne(c, filename) {
    return fetch(BASE + filename).then(function (r) {
      if (!r.ok) throw new Error('Failed to load ' + filename);
      return r.arrayBuffer();
    }).then(function (buf) { return c.decodeAudioData(buf); }).then(function (decoded) {
      extraBuffers[filename] = decoded;
      return decoded;
    });
  }

  function doLoad(c) {
    function fetchDecode(name) {
      return fetch(BASE + name).then(function (r) {
        if (!r.ok) throw new Error('Failed to load ' + name);
        return r.arrayBuffer();
      }).then(function (buf) { return c.decodeAudioData(buf); });
    }
    return Promise.all([ fetchDecode('kick.wav'), fetchDecode('snare.wav'), fetchDecode('hihat.wav') ]).then(function (bufs) {
      kick = bufs[0];
      snare = bufs[1];
      hihat = bufs[2];
      return { kick: kick, snare: snare, hihat: hihat };
    });
  }

  // Play any buffer at a given time (used so technique section always uses the buffer from load() result)
  function playBufferAt(ctx, buffer, when, gain, sourceList) {
    if (!buffer) return null;
    var src = ctx.createBufferSource();
    src.buffer = buffer;
    var g = ctx.createGain();
    g.gain.setValueAtTime(gain !== undefined ? gain : 0.75, when);
    src.connect(g);
    g.connect(ctx.destination);
    src.start(when);
    src.stop(when + buffer.duration);
    if (sourceList) sourceList.push(src);
    return src;
  }

  // Same snare playback as Essential Rhythms (uses internal snare buffer)
  function playSnareAt(ctx, when, gain, sourceList) {
    return playBufferAt(ctx, snare, when, gain, sourceList);
  }

  function loadSound(filename) {
    if (extraBuffers[filename]) return Promise.resolve(extraBuffers[filename]);
    var c = getCtx();
    if (c.state === 'suspended' && typeof c.resume === 'function') {
      return c.resume().then(function () { return fetchDecodeOne(c, filename); });
    }
    return fetchDecodeOne(c, filename);
  }

  function loadFromUrl(url) {
    if (extraBuffers[url]) return Promise.resolve(extraBuffers[url]);
    var c = getCtx();
    function doFetch() {
      return fetch(url).then(function (r) {
        if (!r.ok) throw new Error('Failed to load ' + url);
        return r.arrayBuffer();
      }).then(function (buf) { return c.decodeAudioData(buf); }).then(function (decoded) {
        extraBuffers[url] = decoded;
        return decoded;
      });
    }
    if (c.state === 'suspended' && typeof c.resume === 'function') {
      return c.resume().then(doFetch);
    }
    return doFetch();
  }

  function getClickBuffer() { return extraBuffers[METRONOME_CLICK_URL] || null; }

  return { load: load, getCtx: getCtx, getKick: function () { return kick; }, getSnare: function () { return snare; }, getHihat: function () { return hihat; }, getClickBuffer: getClickBuffer, playSnareAt: playSnareAt, playBufferAt: playBufferAt, loadSound: loadSound, loadFromUrl: loadFromUrl, CLAP_URL: CLAP_URL, METRONOME_CLICK_URL: METRONOME_CLICK_URL };
})();

/**
 * Drum Connect — Metronome & UI (uses same real drum sounds as Essential Rhythms)
 */
(function () {
  'use strict';

  var samples = window.DrumConnectSamples;

  // Metronome state
  let metronomeInterval = null;
  let isPlaying = false;
  let currentBpm = 80;
  let tapTimes = [];

  const bpmValueEl = document.getElementById('bpmValue');
  const bpmSliderEl = document.getElementById('bpmSlider');
  const metronomeToggleBtn = document.getElementById('metronomeToggle');
  const tapBpmBtn = document.getElementById('tapBpm');
  const tapHintEl = document.getElementById('tapHint');
  const metronomeBox = document.querySelector('.metronome-box');
  const bpmDown = document.getElementById('bpmDown');
  const bpmDown1 = document.getElementById('bpmDown1');
  const bpmUp1 = document.getElementById('bpmUp1');
  const bpmUp = document.getElementById('bpmUp');

  if (!bpmValueEl || !bpmSliderEl || !metronomeToggleBtn || !tapBpmBtn) return;

  function setBpm(value) {
    currentBpm = Math.max(40, Math.min(200, Math.round(value)));
    bpmValueEl.textContent = currentBpm;
    bpmSliderEl.value = currentBpm;
  }
  function getBpm() { return currentBpm; }

  function playClick() {
    var ctx = samples.getCtx();
    var when = ctx.currentTime;
    var buf = samples.getClickBuffer() || samples.getHihat();
    if (buf) {
      var src = ctx.createBufferSource();
      src.buffer = buf;
      var gain = ctx.createGain();
      gain.gain.setValueAtTime(buf === samples.getClickBuffer() ? 0.5 : 0.22, when);
      src.connect(gain);
      gain.connect(ctx.destination);
      src.start(when);
      src.stop(when + Math.min(buf.duration, 0.12));
    } else {
      var osc = ctx.createOscillator();
      var gn = ctx.createGain();
      osc.connect(gn);
      gn.connect(ctx.destination);
      osc.frequency.value = 1000;
      osc.type = 'sine';
      gn.gain.setValueAtTime(0.15, when);
      gn.gain.exponentialRampToValueAtTime(0.01, when + 0.05);
      osc.start(when);
      osc.stop(when + 0.05);
    }
  }

  // Visual beat flash
  function flashBeat() {
    if (metronomeBox) {
      metronomeBox.classList.add('beat');
      setTimeout(function () {
        metronomeBox.classList.remove('beat');
      }, 100);
    }
  }

  function tick() {
    playClick();
    flashBeat();
  }

  function startMetronome() {
    if (metronomeInterval) clearInterval(metronomeInterval);
    const ms = 60000 / getBpm();
    tick();
    metronomeInterval = setInterval(tick, ms);
    isPlaying = true;
    metronomeToggleBtn.innerHTML = '<i class="bi bi-stop-fill me-2"></i>Stop';
    metronomeToggleBtn.classList.remove('btn-primary');
    metronomeToggleBtn.classList.add('btn-danger');
  }

  function stopMetronome() {
    if (metronomeInterval) {
      clearInterval(metronomeInterval);
      metronomeInterval = null;
    }
    isPlaying = false;
    metronomeToggleBtn.innerHTML = '<i class="bi bi-play-fill me-2"></i>Start';
    metronomeToggleBtn.classList.remove('btn-danger');
    metronomeToggleBtn.classList.add('btn-primary');
  }

  function toggleMetronome() {
    if (isPlaying) {
      stopMetronome();
    } else {
      Promise.all([ samples.load(), samples.loadFromUrl(samples.METRONOME_CLICK_URL) ]).then(function () {
        startMetronome();
      }).catch(function () {
        startMetronome();
      });
    }
  }

  // Tap tempo: record tap times and compute BPM from last 4+ taps
  function onTapBpm() {
    const now = Date.now();
    tapTimes.push(now);
    if (tapTimes.length > 8) tapTimes.shift();
    if (tapTimes.length >= 4) {
      const gaps = [];
      for (let i = 1; i < tapTimes.length; i++) {
        gaps.push(tapTimes[i] - tapTimes[i - 1]);
      }
      const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      const bpm = Math.round(60000 / avgGap);
      const clamped = Math.max(40, Math.min(200, bpm));
      setBpm(clamped);
      if (tapHintEl) tapHintEl.textContent = 'BPM set to ' + clamped;
    } else if (tapHintEl) {
      tapHintEl.textContent = (4 - tapTimes.length) + ' more tap(s) to detect tempo';
    }
  }

  // Reset tap hint after a delay
  function resetTapHint() {
    setTimeout(function () {
      if (tapHintEl) tapHintEl.textContent = 'Tap 4+ times to detect tempo';
    }, 3000);
  }

  // When BPM changes while playing, restart interval
  function onBpmChange() {
    setBpm(Number(bpmSliderEl.value));
    if (isPlaying) {
      clearInterval(metronomeInterval);
      const ms = 60000 / getBpm();
      metronomeInterval = setInterval(tick, ms);
    }
  }

  // Event listeners
  metronomeToggleBtn.addEventListener('click', toggleMetronome);
  tapBpmBtn.addEventListener('click', function () {
    onTapBpm();
    resetTapHint();
  });

  bpmSliderEl.addEventListener('input', onBpmChange);

  if (bpmDown) bpmDown.addEventListener('click', function () {
    setBpm(getBpm() - 10);
    if (isPlaying) onBpmChange();
  });
  if (bpmDown1) bpmDown1.addEventListener('click', function () {
    setBpm(getBpm() - 1);
    if (isPlaying) onBpmChange();
  });
  if (bpmUp1) bpmUp1.addEventListener('click', function () {
    setBpm(getBpm() + 1);
    if (isPlaying) onBpmChange();
  });
  if (bpmUp) bpmUp.addEventListener('click', function () {
    setBpm(getBpm() + 10);
    if (isPlaying) onBpmChange();
  });

  // Smooth scroll for anchor links (Bootstrap handles most; ensure no conflict)
  document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
    anchor.addEventListener('click', function (e) {
      const href = this.getAttribute('href');
      if (href === '#') return;
      const target = document.querySelector(href);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // Optional: collapse navbar on mobile after link click
  const navLinks = document.querySelectorAll('.navbar-collapse .nav-link');
  const navbarCollapse = document.querySelector('.navbar-collapse');
  if (navLinks.length && navbarCollapse && typeof bootstrap !== 'undefined') {
    navLinks.forEach(function (link) {
      link.addEventListener('click', function () {
        if (window.getComputedStyle(navbarCollapse).display !== 'none') {
          const bsCollapse = bootstrap.Collapse.getInstance(navbarCollapse);
          if (bsCollapse) bsCollapse.hide();
        }
      });
    });
  }
})();

/**
 * Rhythm Player — Essential Rhythms (uses shared real drum sounds)
 */
(function () {
  'use strict';

  var samples = window.DrumConnectSamples;

  let rhythmInterval = null;
  let currentRhythmBtn = null;

  const RHYTHMS = {
    backbeat: { steps: 8, stepsPerBar: 8, k: [0, 4], s: [2, 6], h: [] },
    eighth:   { steps: 8, stepsPerBar: 8, k: [0, 4], s: [2, 6], h: [0, 1, 2, 3, 4, 5, 6, 7] },
    shuffle:  { steps: 12, stepsPerBar: 12, k: [0, 6], s: [3, 9], h: [0, 2, 4, 6, 8, 10] },
    halftime: { steps: 8, stepsPerBar: 8, k: [0, 4], s: [6], h: [0, 1, 2, 3, 4, 5, 6, 7] }
  };

  function getRhythmCtx() {
    return samples.getCtx();
  }

  function loadSamples() {
    return samples.load();
  }

  function playSample(ctx, buffer, when, gainAmount) {
    if (!buffer) return;
    var src = ctx.createBufferSource();
    src.buffer = buffer;
    var gain = ctx.createGain();
    gain.gain.setValueAtTime(gainAmount !== undefined ? gainAmount : 1, when);
    src.connect(gain);
    gain.connect(ctx.destination);
    src.start(when);
    src.stop(when + buffer.duration);
  }

  function playKick(ctx, when) {
    playSample(ctx, samples.getKick(), when, 0.9);
  }
  function playSnare(ctx, when) {
    samples.playSnareAt(ctx, when, 0.75);
  }
  function playHiHat(ctx, when) {
    playSample(ctx, samples.getHihat(), when, 0.35);
  }

  function getRhythmBpm() {
    const el = document.getElementById('rhythmBpm');
    return el ? Math.max(60, Math.min(120, Number(el.value) || 90)) : 90;
  }

  function runRhythm(id) {
    const def = RHYTHMS[id];
    if (!def) return;
    const ctx = getRhythmCtx();
    const bpm = getRhythmBpm();
    const stepsPerBeat = def.steps / 4;
    const stepTime = 60 / bpm / stepsPerBeat;

    let step = 0;
    function tick() {
      const when = ctx.currentTime + 0.05;
      if (def.k.indexOf(step) !== -1) playKick(ctx, when);
      if (def.s.indexOf(step) !== -1) playSnare(ctx, when);
      if (def.h.indexOf(step) !== -1) playHiHat(ctx, when);
      step = (step + 1) % def.stepsPerBar;
    }

    rhythmInterval = setInterval(tick, stepTime * 1000);
    tick();
  }

  function stopRhythm() {
    if (rhythmInterval) {
      clearInterval(rhythmInterval);
      rhythmInterval = null;
    }
    if (currentRhythmBtn) {
      currentRhythmBtn.querySelector('.btn-text').textContent = 'Play';
      currentRhythmBtn.querySelector('i').className = 'bi bi-play-fill me-1';
      currentRhythmBtn.classList.remove('rhythm-playing');
      currentRhythmBtn = null;
    }
  }

  function setPlaying(btn) {
    document.querySelectorAll('.rhythm-play-btn').forEach(function (b) {
      if (b !== btn) {
        b.querySelector('.btn-text').textContent = 'Play';
        b.querySelector('i').className = 'bi bi-play-fill me-1';
        b.classList.remove('rhythm-playing');
      }
    });
    if (btn) {
      btn.querySelector('.btn-text').textContent = 'Stop';
      btn.querySelector('i').className = 'bi bi-stop-fill me-1';
      btn.classList.add('rhythm-playing');
      currentRhythmBtn = btn;
    }
  }

  document.querySelectorAll('.rhythm-play-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const card = this.closest('[data-rhythm]');
      const id = card ? card.getAttribute('data-rhythm') : null;
      if (currentRhythmBtn === this && rhythmInterval) {
        stopRhythm();
        return;
      }
      stopRhythm();
      if (id && RHYTHMS[id]) {
        const self = this;
        const textEl = this.querySelector('.btn-text');
        if (!samples.getKick()) {
          textEl.textContent = 'Loading…';
          this.disabled = true;
        }
        loadSamples().then(function () {
          self.disabled = false;
          runRhythm(id);
          setPlaying(self);
        }).catch(function () {
          self.disabled = false;
          textEl.textContent = 'Play';
          if (typeof console !== 'undefined' && console.error) {
            console.error('Could not load drum samples.');
          }
        });
      }
    });
  });

  const rhythmBpmEl = document.getElementById('rhythmBpm');
  const rhythmBpmValueEl = document.getElementById('rhythmBpmValue');
  if (rhythmBpmEl && rhythmBpmValueEl) {
    rhythmBpmEl.addEventListener('input', function () {
      rhythmBpmValueEl.textContent = this.value + ' BPM';
      if (rhythmInterval && currentRhythmBtn) {
        const card = currentRhythmBtn.closest('[data-rhythm]');
        const id = card ? card.getAttribute('data-rhythm') : null;
        if (id) {
          const btn = currentRhythmBtn;
          stopRhythm();
          runRhythm(id);
          setPlaying(btn);
        }
      }
    });
    rhythmBpmValueEl.textContent = rhythmBpmEl.value + ' BPM';
  }
})();

/**
 * Technique Audio — Roll sticking patterns (same real snare as Essential Rhythms)
 */
(function () {
  'use strict';

  var samples = window.DrumConnectSamples;
  const TECH_BPM = 84;
  const STEP_16 = (60 / TECH_BPM) / 4;

  let techSources = [];
  let techStopTimeout = null;
  let currentTechBtn = null;

  function getTechCtx() {
    return samples.getCtx();
  }

  function setAllTechButtonsToListen() {
    document.querySelectorAll('.technique-listen-btn').forEach(function (b) {
      b.disabled = false;
      var textEl = b.querySelector('.btn-text');
      if (textEl) textEl.textContent = 'Listen';
      var icon = b.querySelector('i');
      if (icon) icon.className = 'bi bi-volume-up me-1';
    });
    currentTechBtn = null;
  }

  function clearTechPlayback() {
    techSources.forEach(function (s) {
      try { s.stop(0); } catch (e) {}
    });
    techSources = [];
    if (techStopTimeout) {
      clearTimeout(techStopTimeout);
      techStopTimeout = null;
    }
  }

  function stopTechPlayback() {
    clearTechPlayback();
    setAllTechButtonsToListen();
  }

  // One bar = 16 steps (16th notes). Value: 0 = rest, 1 = one hit, 2 = two hits, or { c: 1, g: 0.3 } for ghost
  const TECHNIQUES = {
    single:    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    double:    [2,0,2,0,2,0,2,0,2,0,2,0,2,0,2,0],
    paradiddle:[1,1,1,2,1,1,1,2,1,1,1,2,1,1,1,2],
    ghost:     [{g:1},{g:0.28},{g:1},{g:0.28},{g:1},{g:0.28},{g:1},{g:0.28},{g:1},{g:0.28},{g:1},{g:0.28},{g:1},{g:0.28},{g:1},{g:0.28}],
    five:      [1,1,0,0,1,1,0,0,1,0,0,0,0,0,0,0],
    six:       [1,0,1,0,1,1,1,0,1,0,0,0,0,0,0,0],
    seven:     [1,1,0,0,1,1,0,0,1,1,0,0,1,0,0,0],
    buzz:      [2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2],
    nine:      [1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0],
    ten:       [1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0],
    eleven:    [1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0],
    twelve:    [1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0],
    thirteen:  [1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0],
    fourteen:  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0],
    fifteen:   [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0]
  };

  const DOUBLE_OFFSET = 0.032;

  function playTechnique(id, snareBuffer) {
    const pattern = TECHNIQUES[id];
    if (!pattern || !snareBuffer) return;
    var ctx = getTechCtx();
    clearTechPlayback();
    const start = ctx.currentTime + 0.05;
    for (let bar = 0; bar < 2; bar++) {
      for (let i = 0; i < 16; i++) {
        const t = start + (bar * 16 + i) * STEP_16;
        const v = pattern[i];
        if (typeof v === 'object' && v.g != null) {
          samples.playBufferAt(ctx, snareBuffer, t, v.g * 0.75, techSources);
        } else if (v === 1) {
          samples.playBufferAt(ctx, snareBuffer, t, 0.75, techSources);
        } else if (v === 2) {
          samples.playBufferAt(ctx, snareBuffer, t, 0.75, techSources);
          samples.playBufferAt(ctx, snareBuffer, t + DOUBLE_OFFSET, 0.75, techSources);
        }
      }
    }
    const duration = 32 * STEP_16 * 1000 + 400;
    techStopTimeout = setTimeout(function () {
      techStopTimeout = null;
      setAllTechButtonsToListen();
    }, duration);
  }

  document.querySelectorAll('.technique-listen-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const id = this.getAttribute('data-technique');
      if (!id || !TECHNIQUES[id]) return;
      if (currentTechBtn === this) {
        stopTechPlayback();
        return;
      }
      stopTechPlayback();
      currentTechBtn = this;
      var textEl = this.querySelector('.btn-text');
      var icon = this.querySelector('i');
      if (textEl) textEl.textContent = 'Stop';
      if (icon) icon.className = 'bi bi-stop-fill me-1';
      document.querySelectorAll('.technique-listen-btn').forEach(function (b) {
        if (b !== currentTechBtn) {
          b.disabled = true;
          var t = b.querySelector('.btn-text');
          if (t) t.textContent = 'Listen';
        }
      });
      var audioCtx = samples.getCtx();
      if (audioCtx.state === 'suspended' && typeof audioCtx.resume === 'function') {
        audioCtx.resume();
      }
      var soundSelect = document.getElementById('techniqueSound');
      var soundChoice = (soundSelect && soundSelect.value) ? soundSelect.value : 'snare';
      function runWithBuffer(buf) {
        if (buf) playTechnique(id, buf);
        else setAllTechButtonsToListen();
      }
      if (soundChoice === 'snare') {
        samples.load().then(function (loaded) {
          runWithBuffer((loaded && loaded.snare) || samples.getSnare());
        }).catch(function () { setAllTechButtonsToListen(); });
        return;
      }
      if (soundChoice === 'clap') {
        samples.loadFromUrl(samples.CLAP_URL).then(runWithBuffer).catch(function () { setAllTechButtonsToListen(); });
        return;
      }
      var file = soundChoice + '.wav';
      samples.loadSound(file).then(runWithBuffer).catch(function () { setAllTechButtonsToListen(); });
    });
  });
})();
