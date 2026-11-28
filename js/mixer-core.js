"use strict";

// ==========================================
// 🎵 おとや ― 純粋ロジック
// DOM や Web Audio に触れない部分（サウンド一覧・プリセット・音量変換・
// 状態の保存形式・タイマー表示の計算）を切り出したモジュール。
// ブラウザでは window.OtoyaCore、Node では require で読み込む。
// ==========================================

(function (global) {
  // 💾 設定の保存キー（既存ユーザーのデータを引き継ぐため変更禁止）
  const STORAGE_KEY = "otoya-settings-v1";
  // 🌙 テーマの保存キー（変更禁止）
  const THEME_KEY = "otoya-theme";

  // 🎵 サウンド一覧（表示順＝この並び）
  const SOUNDS = [
    { id: "rain", name: "🌧 雨" },
    { id: "waves", name: "🌊 波" },
    { id: "wind", name: "🍃 風" },
    { id: "bonfire", name: "🔥 焚き火" },
    { id: "train", name: "🚃 電車" },
    { id: "insects", name: "🦗 夜の虫" },
  ];

  // 🎛️ プリセット（音量 0 は OFF を意味する）
  const PRESETS = {
    focus: { rain: 55, wind: 25, waves: 0, bonfire: 0, train: 0, insects: 0 },
    relax: { waves: 60, bonfire: 45, insects: 25, wind: 15, rain: 0, train: 0 },
    sleep: { rain: 35, waves: 30, insects: 15, wind: 0, bonfire: 0, train: 0 },
  };

  // ⏰ スリープタイマーの選択肢（分）。0 はオフ。
  const TIMER_MINUTES = [15, 30, 60, 0];

  // 📈 音量（0〜100）をゲインへ変換する（知覚に合わせたカーブ＋全体の余裕分）
  function volToGain(vol) {
    return Math.pow(vol / 100, 1.6) * 0.9;
  }

  // 🗂️ 初期状態（雨のみ ON・音量 55、それ以外は OFF・音量 60）
  function defaultState() {
    const state = {};
    for (const sound of SOUNDS) state[sound.id] = { on: false, vol: 60 };
    state.rain = { on: true, vol: 55 };
    return state;
  }

  // 🔊 音量を 0〜100 の数値へ丸める（数値化できない値は 0）
  function clampVol(value) {
    return Math.min(100, Math.max(0, Number(value) || 0));
  }

  // 💾 保存済み JSON 文字列を状態へ復元する（壊れたデータは初期状態）
  function parseState(raw) {
    const state = defaultState();
    if (!raw) return state;
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      return state;
    }
    if (!parsed || typeof parsed !== "object") return state;
    for (const sound of SOUNDS) {
      const entry = parsed[sound.id];
      if (entry) {
        state[sound.id] = { on: !!entry.on, vol: clampVol(entry.vol) };
      }
    }
    return state;
  }

  // 💾 状態を保存用 JSON 文字列にする
  function serializeState(state) {
    return JSON.stringify(state);
  }

  // 🎛️ プリセットを状態へ適用した新しい状態を返す
  // 音量が正のサウンドは ON になり音量も上書き、0 のサウンドは OFF に
  // なるが音量の値は保持する（スライダー位置を消さないための仕様）。
  function applyPreset(state, presetName) {
    const preset = PRESETS[presetName];
    if (!preset) return state;
    const next = {};
    for (const sound of SOUNDS) {
      const vol = preset[sound.id] || 0;
      next[sound.id] =
        vol > 0
          ? { on: true, vol: vol }
          : { on: false, vol: state[sound.id].vol };
    }
    return next;
  }

  // ⏰ 残りミリ秒からタイマー表示文を作る（秒は切り上げ）
  function formatTimerText(remainMs) {
    const sec = Math.ceil(remainMs / 1000);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return "あと " + m + ":" + String(s).padStart(2, "0") + " で自動停止します";
  }

  const core = {
    STORAGE_KEY,
    THEME_KEY,
    SOUNDS,
    PRESETS,
    TIMER_MINUTES,
    volToGain,
    defaultState,
    parseState,
    serializeState,
    applyPreset,
    formatTimerText,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = core;
  }
  global.OtoyaCore = core;
})(typeof window !== "undefined" ? window : globalThis);
