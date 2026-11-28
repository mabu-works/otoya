"use strict";

// 🧪 おとやの純粋ロジック（js/mixer-core.js）のテスト。
// 実行: npm test（node --test、依存パッケージなし）

const test = require("node:test");
const assert = require("node:assert/strict");
const Core = require("../js/mixer-core.js");

// 🔊 浮動小数点の近似比較
function closeTo(actual, expected) {
  assert.ok(
    Math.abs(actual - expected) < 1e-12,
    `expected ${actual} to be close to ${expected}`
  );
}

test("保存キーは既存ユーザーのデータを引き継ぐため固定", () => {
  assert.equal(Core.STORAGE_KEY, "otoya-settings-v1");
  assert.equal(Core.THEME_KEY, "otoya-theme");
});

test("サウンドは6種で順序と名前が固定", () => {
  assert.deepEqual(
    Core.SOUNDS.map((s) => s.id),
    ["rain", "waves", "wind", "bonfire", "train", "insects"]
  );
  assert.deepEqual(
    Core.SOUNDS.map((s) => s.name),
    ["🌧 雨", "🌊 波", "🍃 風", "🔥 焚き火", "🚃 電車", "🦗 夜の虫"]
  );
});

test("プリセット3種の値は正確に固定されている", () => {
  assert.deepEqual(Core.PRESETS, {
    focus: { rain: 55, wind: 25, waves: 0, bonfire: 0, train: 0, insects: 0 },
    relax: { waves: 60, bonfire: 45, insects: 25, wind: 15, rain: 0, train: 0 },
    sleep: { rain: 35, waves: 30, insects: 15, wind: 0, bonfire: 0, train: 0 },
  });
});

test("プリセットは全サウンドを過不足なくカバーする", () => {
  const ids = Core.SOUNDS.map((s) => s.id).sort();
  for (const preset of Object.values(Core.PRESETS)) {
    assert.deepEqual(Object.keys(preset).sort(), ids);
    for (const vol of Object.values(preset)) {
      assert.ok(Number.isInteger(vol) && vol >= 0 && vol <= 100);
    }
  }
});

test("タイマーの選択肢は 15 / 30 / 60 / オフ", () => {
  assert.deepEqual(Core.TIMER_MINUTES, [15, 30, 60, 0]);
});

test("volToGain は pow カーブ（指数 1.6、最大 0.9）", () => {
  assert.equal(Core.volToGain(0), 0);
  closeTo(Core.volToGain(100), 0.9);
  closeTo(Core.volToGain(50), Math.pow(0.5, 1.6) * 0.9);
  closeTo(Core.volToGain(25), Math.pow(0.25, 1.6) * 0.9);
});

test("volToGain は単調増加で 0〜0.9 の範囲に収まる", () => {
  let prev = -1;
  for (let vol = 0; vol <= 100; vol += 5) {
    const gain = Core.volToGain(vol);
    assert.ok(gain > prev, `gain(${vol}) should exceed previous`);
    assert.ok(gain >= 0 && gain <= 0.9);
    prev = gain;
  }
});

test("初期状態は雨のみ ON・音量55、それ以外は OFF・音量60", () => {
  const state = Core.defaultState();
  assert.deepEqual(state.rain, { on: true, vol: 55 });
  for (const id of ["waves", "wind", "bonfire", "train", "insects"]) {
    assert.deepEqual(state[id], { on: false, vol: 60 });
  }
  assert.deepEqual(Object.keys(state).sort(), ["bonfire", "insects", "rain", "train", "waves", "wind"]);
});

test("parseState は null / 空文字で初期状態を返す", () => {
  assert.deepEqual(Core.parseState(null), Core.defaultState());
  assert.deepEqual(Core.parseState(""), Core.defaultState());
  assert.deepEqual(Core.parseState(undefined), Core.defaultState());
});

test("parseState は壊れた JSON で初期状態を返す", () => {
  assert.deepEqual(Core.parseState("{not json"), Core.defaultState());
  assert.deepEqual(Core.parseState("42"), Core.defaultState());
  assert.deepEqual(Core.parseState('"text"'), Core.defaultState());
});

test("parseState は保存済みの値を復元する", () => {
  const raw = JSON.stringify({
    rain: { on: false, vol: 10 },
    waves: { on: true, vol: 80 },
  });
  const state = Core.parseState(raw);
  assert.deepEqual(state.rain, { on: false, vol: 10 });
  assert.deepEqual(state.waves, { on: true, vol: 80 });
  // 欠けているサウンドは初期値で補完される
  assert.deepEqual(state.wind, { on: false, vol: 60 });
});

test("parseState は音量を 0〜100 に丸め、真偽値を正規化する", () => {
  const state = Core.parseState(
    JSON.stringify({
      rain: { on: 1, vol: 150 },
      waves: { on: 0, vol: -5 },
      wind: { on: true, vol: "abc" },
      bonfire: { on: false, vol: "40" },
    })
  );
  assert.deepEqual(state.rain, { on: true, vol: 100 });
  assert.deepEqual(state.waves, { on: false, vol: 0 });
  assert.deepEqual(state.wind, { on: true, vol: 0 });
  assert.deepEqual(state.bonfire, { on: false, vol: 40 });
});

test("parseState は未知のサウンド ID を無視する", () => {
  const state = Core.parseState(
    JSON.stringify({ thunder: { on: true, vol: 90 } })
  );
  assert.equal("thunder" in state, false);
  assert.deepEqual(state, Core.defaultState());
});

test("serializeState と parseState で往復できる（保存形式の形状）", () => {
  const original = Core.defaultState();
  original.waves = { on: true, vol: 33 };
  original.insects = { on: true, vol: 7 };
  const raw = Core.serializeState(original);
  const parsed = JSON.parse(raw);
  // 形は {id: {on, vol}} のみで、余分なキーは入らない
  for (const value of Object.values(parsed)) {
    assert.deepEqual(Object.keys(value).sort(), ["on", "vol"]);
    assert.equal(typeof value.on, "boolean");
    assert.equal(typeof value.vol, "number");
  }
  assert.deepEqual(Core.parseState(raw), original);
});

test("applyPreset focus: 雨55と風25が ON、他は OFF で音量は保持", () => {
  const before = Core.defaultState();
  before.waves = { on: true, vol: 44 };
  const next = Core.applyPreset(before, "focus");
  assert.deepEqual(next.rain, { on: true, vol: 55 });
  assert.deepEqual(next.wind, { on: true, vol: 25 });
  assert.deepEqual(next.waves, { on: false, vol: 44 }); // 0 指定は音量を保持
  assert.deepEqual(next.bonfire, { on: false, vol: 60 });
  assert.deepEqual(next.train, { on: false, vol: 60 });
  assert.deepEqual(next.insects, { on: false, vol: 60 });
  // 元の状態は変更しない
  assert.deepEqual(before.waves, { on: true, vol: 44 });
});

test("applyPreset relax / sleep の ON 構成", () => {
  const relax = Core.applyPreset(Core.defaultState(), "relax");
  assert.deepEqual(
    Core.SOUNDS.filter((s) => relax[s.id].on).map((s) => s.id),
    ["waves", "wind", "bonfire", "insects"]
  );
  assert.equal(relax.waves.vol, 60);
  assert.equal(relax.bonfire.vol, 45);
  assert.equal(relax.insects.vol, 25);
  assert.equal(relax.wind.vol, 15);

  const sleep = Core.applyPreset(Core.defaultState(), "sleep");
  assert.deepEqual(
    Core.SOUNDS.filter((s) => sleep[s.id].on).map((s) => s.id),
    ["rain", "waves", "insects"]
  );
  assert.equal(sleep.rain.vol, 35);
  assert.equal(sleep.waves.vol, 30);
  assert.equal(sleep.insects.vol, 15);
});

test("applyPreset は未知のプリセット名で状態をそのまま返す", () => {
  const before = Core.defaultState();
  assert.equal(Core.applyPreset(before, "unknown"), before);
});

test("formatTimerText は分:秒（秒は切り上げ）で整形する", () => {
  assert.equal(Core.formatTimerText(15 * 60 * 1000), "あと 15:00 で自動停止します");
  assert.equal(Core.formatTimerText(60 * 1000), "あと 1:00 で自動停止します");
  assert.equal(Core.formatTimerText(61 * 1000), "あと 1:01 で自動停止します");
  assert.equal(Core.formatTimerText(59 * 1000), "あと 0:59 で自動停止します");
  // 切り上げ: 59.5 秒は 60 秒として表示される
  assert.equal(Core.formatTimerText(59500), "あと 1:00 で自動停止します");
  assert.equal(Core.formatTimerText(500), "あと 0:01 で自動停止します");
  assert.equal(Core.formatTimerText(90 * 60 * 1000), "あと 90:00 で自動停止します");
});
