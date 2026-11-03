'use strict';

// Проверка Origin для локального веб-сервера: разрешены запросы с той же
// страницы (origin совпадает с Host) и явные локальные адреса.
function isValidOrigin(originHeader, hostHeader) {
  if (!originHeader) return true;
  try {
    const originUrl = new URL(originHeader);
    if (hostHeader) {
      const host = String(hostHeader).split(',')[0].trim();
      if (originUrl.host === host) return true;
    }
    return ['127.0.0.1', 'localhost', '0.0.0.0'].includes(originUrl.hostname);
  } catch {
    return false;
  }
}

// Защита от перебора токена: после maxAttempts неудач с одного адреса
// за windowMs адрес блокируется на blockMs.
function createTokenRateLimiter({ maxAttempts = 10, windowMs = 60000, blockMs = 5 * 60000 } = {}) {
  const attempts = new Map();

  function sweep(now) {
    if (attempts.size <= 1000) return;
    for (const [key, value] of attempts) {
      const blocked = value.blockedUntil && now < value.blockedUntil;
      if (!blocked && now - value.windowStart > windowMs) attempts.delete(key);
    }
  }

  return {
    check(ip) {
      const record = attempts.get(ip);
      return !(record && record.blockedUntil && Date.now() < record.blockedUntil);
    },
    failure(ip) {
      const now = Date.now();
      let record = attempts.get(ip);
      if (!record || now - record.windowStart > windowMs) {
        record = { count: 0, windowStart: now, blockedUntil: 0 };
      }
      record.count += 1;
      if (record.count >= maxAttempts) {
        record.blockedUntil = now + blockMs;
        record.count = 0;
        record.windowStart = now;
      }
      attempts.set(ip, record);
      sweep(now);
    },
    success(ip) {
      attempts.delete(ip);
    }
  };
}

module.exports = { isValidOrigin, createTokenRateLimiter };
