'use strict';

const LIMITS = Object.freeze({
  maxTokens: Object.freeze({ min: 1, max: 2000000 }),
  contextLength: Object.freeze({ min: 64000, max: 2000000 })
});

const TIMINGS = Object.freeze({ autoSaveMs: 900, modelCacheMs: 5 * 60 * 1000, searchDebounceMs: 180 });

// «Новый чат с памятью о старом»: при заполнении окна до THRESHOLD Hermes
// заменяет почти весь диалог краткой сводкой и продолжает с короткого хвоста
// (режим lean), поэтому контекст каждый раз почти обнуляется, а не остаётся
// заполненным на 45%. Это резко сокращает токены, которые уходят с каждым запросом.
// THRESHOLD = 0.75: для окон меньше 512K Hermes всё равно поднимает порог до 0.75
// (floor, только вверх), поэтому меньшее значение было бы проигнорировано.
// Старые сессии остаются в базе Hermes и доступны агенту через session_search.
const COMPRESSION = Object.freeze({
  threshold: 0.75,
  targetRatio: 0.6,
  // lean: хвост зажимается до ~2.5% окна, остальное уходит в сводку.
  tailMode: 'lean'
});

module.exports = { LIMITS, TIMINGS, COMPRESSION };
