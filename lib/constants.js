'use strict';

const LIMITS = Object.freeze({
  maxTokens: Object.freeze({ min: 1, max: 2000000 }),
  contextLength: Object.freeze({ min: 64000, max: 2000000 })
});

const TIMINGS = Object.freeze({ autoSaveMs: 900, modelCacheMs: 5 * 60 * 1000, searchDebounceMs: 180 });

// Циклическая обрезка контекста, единая для всех моделей: при заполнении окна
// до THRESHOLD Hermes сбрасывает начало диалога, оставляя хвост
// TARGET_RATIO × THRESHOLD = 45% окна — то есть каждый цикл освобождает ~30% окна.
// THRESHOLD = 0.75: для окон меньше 512K Hermes всё равно поднимает порог до 0.75
// (floor, только вверх), поэтому меньшее значение было бы проигнорировано.
const COMPRESSION = Object.freeze({
  threshold: 0.75,
  targetRatio: 0.6,
  // legacy: хвост хранится дословно размером target_ratio × threshold;
  // lean зажал бы хвост до 2.5% окна и обрезал бы гораздо больше 30%.
  tailMode: 'legacy'
});

module.exports = { LIMITS, TIMINGS, COMPRESSION };
