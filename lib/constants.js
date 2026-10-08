'use strict';

const LIMITS = Object.freeze({
  maxTokens: Object.freeze({ min: 1, max: 2000000 }),
  contextLength: Object.freeze({ min: 64000, max: 2000000 })
});

const TIMINGS = Object.freeze({ autoSaveMs: 900, modelCacheMs: 5 * 60 * 1000, searchDebounceMs: 180 });

module.exports = { LIMITS, TIMINGS };
