"use strict";

// ==========================================
// 🎵 おとや ― 環境音ミキサー
// 音源ファイルを一切使わず、Web Audio API で環境音を
// リアルタイム合成して重ね掛け再生する。
// 純粋ロジックは js/mixer-core.js に分離している。
// ==========================================

const Core = window.OtoyaCore;
const STORAGE_KEY = Core.STORAGE_KEY;

// ==========================================
// 🔊 ノイズバッファ（全サウンドで共有）
// ==========================================

let cachedNoiseBuffer = null;

// 🔊 2秒のホワイトノイズバッファを作る
function createNoiseBuffer(ctx) {
  const length = ctx.sampleRate * 2;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

// 🔊 共有ノイズバッファを返す（サンプルレートが変わったら作り直す）
function sharedNoiseBuffer(ctx) {
  if (!cachedNoiseBuffer || cachedNoiseBuffer.sampleRate !== ctx.sampleRate) {
    cachedNoiseBuffer = createNoiseBuffer(ctx);
  }
  return cachedNoiseBuffer;
}

// 🔊 ループ再生用のノイズソースを作る
function loopingNoise(ctx) {
  const source = ctx.createBufferSource();
  source.buffer = sharedNoiseBuffer(ctx);
  source.loop = true;
  return source;
}

// 🔊 LFO（低周波オシレータ）をパラメータへ接続して開始する
function startLfo(ctx, frequency, depth, target) {
  const osc = ctx.createOscillator();
  osc.frequency.value = frequency;
  const gain = ctx.createGain();
  gain.gain.value = depth;
  osc.connect(gain).connect(target);
  osc.start();
  return osc;
}

// ==========================================
// 🎵 サウンド合成レシピ
// 各レシピは out（個別ゲイン）へ接続し、stop() を持つハンドルを返す。
// ==========================================

const BUILDERS = {
  // 🌧 雨：高域を残したホワイトノイズ
  rain(ctx, out) {
    const src = loopingNoise(ctx);
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 1600;
    const highpass = ctx.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.value = 350;
    src.connect(lowpass).connect(highpass).connect(out);
    src.start();
    return { stop() { try { src.stop(); } catch (e) {} } };
  },

  // 🌊 波：約12秒周期で寄せては返すうねりを LFO で付ける
  waves(ctx, out) {
    const src = loopingNoise(ctx);
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 420;
    lowpass.Q.value = 0.4;
    const swell = ctx.createGain();
    swell.gain.value = 0.5;
    const lfoGain = startLfo(ctx, 0.08, 0.38, swell.gain);
    const lfoFilter = startLfo(ctx, 0.055, 180, lowpass.frequency);
    src.connect(lowpass).connect(swell).connect(out);
    src.start();
    return {
      stop() {
        try { src.stop(); lfoGain.stop(); lfoFilter.stop(); } catch (e) {}
      },
    };
  },

  // 🍃 風：バンドパスの中心周波数を揺らして吹き抜ける感じにする
  wind(ctx, out) {
    const src = loopingNoise(ctx);
    const bandpass = ctx.createBiquadFilter();
    bandpass.type = "bandpass";
    bandpass.frequency.value = 480;
    bandpass.Q.value = 0.6;
    const level = ctx.createGain();
    level.gain.value = 0.8;
    const lfoFilter = startLfo(ctx, 0.09, 260, bandpass.frequency);
    const lfoGain = startLfo(ctx, 0.043, 0.25, level.gain);
    src.connect(bandpass).connect(level).connect(out);
    src.start();
    return {
      stop() {
        try { src.stop(); lfoFilter.stop(); lfoGain.stop(); } catch (e) {}
      },
    };
  },

  // 🔥 焚き火：低い唸り＋ランダムなパチパチ（バーストを焼き込んだループ）
  bonfire(ctx, out) {
    const rumble = loopingNoise(ctx);
    const rumbleFilter = ctx.createBiquadFilter();
    rumbleFilter.type = "lowpass";
    rumbleFilter.frequency.value = 260;
    const rumbleGain = ctx.createGain();
    rumbleGain.gain.value = 0.5;
    rumble.connect(rumbleFilter).connect(rumbleGain).connect(out);
    rumble.start();

    // 💥 3秒分のバッファに、不規則な間隔で減衰バーストを置く。
    // 末尾に掛かるバーストは先頭へ巻き戻して書き、ループの継ぎ目で
    // クリック音が出ないようにする。
    const length = ctx.sampleRate * 3;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let cursor = 0;
    while (cursor < length) {
      cursor += Math.floor(ctx.sampleRate * (0.03 + Math.random() * 0.45));
      const burstLength = Math.floor(ctx.sampleRate * (0.004 + Math.random() * 0.02));
      const amplitude = 0.35 + Math.random() * 0.6;
      for (let i = 0; i < burstLength; i++) {
        const decay = 1 - i / burstLength;
        data[(cursor + i) % length] += (Math.random() * 2 - 1) * amplitude * decay * decay;
      }
    }
    const crackle = ctx.createBufferSource();
    crackle.buffer = buffer;
    crackle.loop = true;
    const crackleFilter = ctx.createBiquadFilter();
    crackleFilter.type = "highpass";
    crackleFilter.frequency.value = 900;
    crackle.connect(crackleFilter).connect(out);
    crackle.start();

    return {
      stop() {
        try { rumble.stop(); crackle.stop(); } catch (e) {}
      },
    };
  },

  // 🚃 電車：走行ノイズ＋「ガタン・ゴトン」のリズムを焼き込んだループ
  train(ctx, out) {
    const base = loopingNoise(ctx);
    const baseFilter = ctx.createBiquadFilter();
    baseFilter.type = "lowpass";
    baseFilter.frequency.value = 160;
    const baseGain = ctx.createGain();
    baseGain.gain.value = 0.55;
    base.connect(baseFilter).connect(baseGain).connect(out);
    base.start();

    // 🥁 1.6秒に2組（0.24秒間隔）の継ぎ目音を入れる。
    // ノイズを一次ローパスでなまらせて「ドン」という質感にする。
    const duration = 1.6;
    const length = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    const raw = sharedNoiseBuffer(ctx).getChannelData(0);
    function thump(startSec, amplitude) {
      const start = Math.floor(startSec * ctx.sampleRate);
      const count = Math.floor(ctx.sampleRate * 0.09);
      let smooth = 0;
      for (let i = 0; i < count && start + i < length; i++) {
        smooth += 0.22 * (raw[(start + i) % raw.length] - smooth);
        const decay = 1 - i / count;
        data[start + i] += smooth * amplitude * decay;
      }
    }
    thump(0.0, 1.6);
    thump(0.24, 1.3);
    thump(0.8, 1.6);
    thump(1.04, 1.3);

    const rhythm = ctx.createBufferSource();
    rhythm.buffer = buffer;
    rhythm.loop = true;
    const rhythmFilter = ctx.createBiquadFilter();
    rhythmFilter.type = "lowpass";
    rhythmFilter.frequency.value = 420;
    rhythm.connect(rhythmFilter).connect(out);
    rhythm.start();

    return {
      stop() {
        try { base.stop(); rhythm.stop(); } catch (e) {}
      },
    };
  },

  // 🦗 夜の虫：サイン波の短いパルス列を不規則な間隔・定位で鳴らす
  insects(ctx, out) {
    let alive = true;
    let timer = null;

    function scheduleChirp() {
      if (!alive) return;
      const startAt = ctx.currentTime + 0.02;
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = 4000 + Math.random() * 900;
      const gain = ctx.createGain();
      gain.gain.value = 0;

      // 🔊 対応環境では左右へ少し振って広がりを出す
      const panner = typeof ctx.createStereoPanner === "function"
        ? ctx.createStereoPanner()
        : null;
      if (panner) {
        panner.pan.value = Math.random() * 1.4 - 0.7;
        osc.connect(gain).connect(panner).connect(out);
      } else {
        osc.connect(gain).connect(out);
      }

      // 🦗 3〜5回のパルスで「リリリッ」という鳴き声にする
      const pulses = 3 + Math.floor(Math.random() * 3);
      const volume = 0.12 + Math.random() * 0.1;
      for (let i = 0; i < pulses; i++) {
        const at = startAt + i * 0.07;
        gain.gain.setValueAtTime(0, at);
        gain.gain.linearRampToValueAtTime(volume, at + 0.015);
        gain.gain.linearRampToValueAtTime(0, at + 0.05);
      }
      osc.start(startAt);
      osc.stop(startAt + pulses * 0.07 + 0.1);
      timer = setTimeout(scheduleChirp, 250 + Math.random() * 1400);
    }
    scheduleChirp();

    return {
      stop() {
        alive = false;
        if (timer) clearTimeout(timer);
      },
    };
  },
};

// ==========================================
// 🗂️ 状態の読み書き
// ==========================================

let state = loadState();

// 💾 保存済み設定を読む（localStorage が使えない環境では初期状態）
function loadState() {
  let raw = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch (e) {
    raw = null;
  }
  return Core.parseState(raw);
}

// 💾 現在の設定を保存する（失敗しても再生は続ける）
function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, Core.serializeState(state));
  } catch (e) { /* 保存できない環境ではその場の設定として扱う */ }
}

// ==========================================
// 🔊 再生エンジン
// ==========================================

let audioCtx = null;
let masterBus = null;
const playing = new Map(); // id -> { handle, gainNode }

// 🔊 AudioContext とマスターバスを用意する（初回のみ）
function ensureContext() {
  if (!audioCtx) {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioCtor();
    masterBus = audioCtx.createGain();
    masterBus.gain.value = 0.9;
    // 🛡️ 全サウンド最大音量でも割れないよう、しきい値付近だけを
    // 強く抑えるコンプレッサーを安全弁として挟む。
    const guard = audioCtx.createDynamicsCompressor();
    guard.threshold.value = -2;
    guard.knee.value = 4;
    guard.ratio.value = 20;
    guard.attack.value = 0.002;
    guard.release.value = 0.25;
    masterBus.connect(guard);
    guard.connect(audioCtx.destination);
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

// ▶️ 1つのサウンドを開始する（開始は短いフェードイン）
function startSound(id) {
  if (playing.has(id)) return;
  ensureContext();
  const gainNode = audioCtx.createGain();
  gainNode.gain.value = 0;
  gainNode.connect(masterBus);
  const handle = BUILDERS[id](audioCtx, gainNode);
  gainNode.gain.setTargetAtTime(
    Core.volToGain(state[id].vol),
    audioCtx.currentTime,
    0.12
  );
  playing.set(id, { handle, gainNode });
}

// ⏹️ 1つのサウンドを止める（短くフェードアウトしてから解放）
function stopSound(id) {
  const entry = playing.get(id);
  if (!entry) return;
  playing.delete(id);
  const now = audioCtx.currentTime;
  try {
    entry.gainNode.gain.cancelScheduledValues(now);
    entry.gainNode.gain.setValueAtTime(entry.gainNode.gain.value, now);
    entry.gainNode.gain.setTargetAtTime(0, now, 0.07);
  } catch (e) { /* フェードできない場合も下の停止処理は行う */ }
  setTimeout(() => {
    try { entry.handle.stop(); } catch (e) {}
    try { entry.gainNode.disconnect(); } catch (e) {}
  }, 300);
}

// 🔊 再生中のサウンドへ音量変更を即時反映する
function applyLiveVolume(id) {
  const entry = playing.get(id);
  if (entry && audioCtx) {
    entry.gainNode.gain.setTargetAtTime(
      Core.volToGain(state[id].vol),
      audioCtx.currentTime,
      0.03
    );
  }
}

// 🔄 状態どおりに再生・停止と音量をそろえる
function syncPlayback() {
  for (const sound of Core.SOUNDS) {
    if (state[sound.id].on) {
      const wasPlaying = playing.has(sound.id);
      startSound(sound.id);
      if (wasPlaying) applyLiveVolume(sound.id);
    } else {
      stopSound(sound.id);
    }
  }
  refreshMasterButton();
}

// ⏹️ 全サウンドを OFF にして止める（スリープタイマー用）
function stopAll() {
  for (const sound of Core.SOUNDS) {
    state[sound.id].on = false;
    stopSound(sound.id);
  }
  saveState();
  refreshUI();
}

// ==========================================
// 🧩 UI 構築と更新
// ==========================================

const listEl = document.getElementById("soundList");
const masterBtn = document.getElementById("masterBtn");
const rowRefs = {};

// 🧩 サウンド行（スイッチ・名前・音量表示・スライダー）を組み立てる
function buildRows() {
  for (const sound of Core.SOUNDS) {
    const row = document.createElement("div");
    row.className = "sound-row";

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "sound-toggle";
    toggle.setAttribute("role", "switch");
    toggle.setAttribute("aria-label", sound.name + "のON/OFF");

    const name = document.createElement("span");
    name.className = "sound-name";
    name.textContent = sound.name;

    const value = document.createElement("span");
    value.className = "sound-value";

    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = "0";
    slider.max = "100";
    slider.step = "1";
    slider.setAttribute("aria-label", sound.name + "の音量");

    // 🔊 スイッチ: ON にしたとき音量 0 のままなら 60 へ戻す
    toggle.addEventListener("click", () => {
      state[sound.id].on = !state[sound.id].on;
      if (state[sound.id].on && state[sound.id].vol === 0) {
        state[sound.id].vol = 60;
      }
      saveState();
      syncPlayback();
      refreshUI();
    });

    // 🎚️ スライダー: 音量を上げたら自動で ON、再生中は即時反映
    slider.addEventListener("input", () => {
      state[sound.id].vol = Number(slider.value);
      if (state[sound.id].vol > 0 && !state[sound.id].on) {
        state[sound.id].on = true;
      }
      saveState();
      applyLiveVolume(sound.id);
      if (state[sound.id].on) startSound(sound.id);
      refreshUI();
    });

    row.append(toggle, name, value, slider);
    listEl.appendChild(row);
    rowRefs[sound.id] = { row, toggle, value, slider };
  }
}

// 🔄 各行の表示を状態へ合わせる
function refreshUI() {
  for (const sound of Core.SOUNDS) {
    const refs = rowRefs[sound.id];
    if (!refs) continue;
    refs.toggle.setAttribute("aria-checked", String(state[sound.id].on));
    refs.slider.value = String(state[sound.id].vol);
    refs.value.textContent = state[sound.id].vol + "%";
    refs.row.classList.toggle("off", !state[sound.id].on);
  }
  refreshMasterButton();
}

// ▶️ マスターボタンの表示（再生中のみ「すべて停止」）
function refreshMasterButton() {
  masterBtn.textContent = playing.size > 0 ? "⏸ すべて停止" : "▶ すべて再生";
}

// ▶️ マスター: 再生中なら全停止（ON/OFF 設定は保持）、停止中なら状態どおり再生
masterBtn.addEventListener("click", () => {
  if (playing.size > 0) {
    for (const id of Array.from(playing.keys())) stopSound(id);
    refreshMasterButton();
  } else {
    syncPlayback();
  }
});

// ==========================================
// 🎛️ プリセット
// ==========================================

document.querySelectorAll("[data-preset]").forEach((button) => {
  button.addEventListener("click", () => {
    const next = Core.applyPreset(state, button.dataset.preset);
    if (next === state) return;
    state = next;
    saveState();
    syncPlayback();
    refreshUI();
  });
});

// ==========================================
// ⏰ スリープタイマー
// ==========================================

const timerStatusEl = document.getElementById("timerStatus");
const timerChips = document.querySelectorAll("[data-timer]");
let timerDeadline = null;
let timerTicker = null;

// ⏰ アクティブなチップ表示をそろえる
function markActiveChip(minutes) {
  timerChips.forEach((chip) => {
    chip.classList.toggle("active", Number(chip.dataset.timer) === minutes);
  });
}

// ⏰ タイマーを解除する
function clearSleepTimer() {
  timerDeadline = null;
  if (timerTicker) {
    clearInterval(timerTicker);
    timerTicker = null;
  }
  timerStatusEl.textContent = "";
  markActiveChip(0);
}

// ⏰ タイマーを設定する（0 分は解除）
function setSleepTimer(minutes) {
  if (timerTicker) {
    clearInterval(timerTicker);
    timerTicker = null;
  }
  if (minutes <= 0) {
    clearSleepTimer();
    return;
  }
  timerDeadline = Date.now() + minutes * 60 * 1000;
  markActiveChip(minutes);
  const tick = () => {
    const remain = timerDeadline - Date.now();
    if (remain <= 0) {
      clearSleepTimer();
      stopAll();
      timerStatusEl.textContent = "スリープタイマーで停止しました";
      return;
    }
    timerStatusEl.textContent = Core.formatTimerText(remain);
  };
  tick();
  timerTicker = setInterval(tick, 500);
}

timerChips.forEach((chip) => {
  chip.addEventListener("click", () => setSleepTimer(Number(chip.dataset.timer)));
});

// ==========================================
// 🌙 テーマ切り替え（見た目のみ）
// ==========================================

(function initThemeToggle() {
  const root = document.documentElement;
  const button = document.getElementById("themeToggle");
  function render(theme) {
    root.setAttribute("data-theme", theme);
    if (button) button.textContent = theme === "light" ? "☀️" : "🌙";
  }
  // 🔆 先行スクリプトが付けた属性を優先し、なければ保存値を読む
  let current = root.getAttribute("data-theme");
  if (current !== "light" && current !== "dark") {
    try {
      current = localStorage.getItem(Core.THEME_KEY);
    } catch (e) {
      current = null;
    }
  }
  render(current === "light" ? "light" : "dark");
  if (button) {
    button.addEventListener("click", () => {
      const next = root.getAttribute("data-theme") === "light" ? "dark" : "light";
      render(next);
      try {
        localStorage.setItem(Core.THEME_KEY, next);
      } catch (e) { /* 保存できなくても切り替え自体は有効 */ }
    });
  }
})();

// ==========================================
// 🚀 初期化
// ==========================================

buildRows();
refreshUI();
clearSleepTimer();
