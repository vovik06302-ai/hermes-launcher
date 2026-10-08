'use strict';

function toErrorMessage(error) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object') {
    if (typeof error.message === 'string' && error.message.trim()) return error.message;
    if (typeof error.error === 'string' && error.error.trim()) return error.error;
    try { return JSON.stringify(error); } catch (jsonError) { return String(jsonError); }
  }
  return String(error);
}

function normalizeResult(result) {
  if (result === undefined) return { ok: true };
  if (result && typeof result === 'object' && ('ok' in result || 'error' in result || 'code' in result)) {
    return result;
  }
  return result;
}

function buildErrorResult(error, code = 'IPC_ERROR', suggestion = 'Попробуйте снова.') {
  const message = toErrorMessage(error);
  return {
    ok: false,
    code,
    error: message,
    suggestion
  };
}

function buildSuccessResult(payload = {}) {
  if (payload && typeof payload === 'object' && 'ok' in payload) return payload;
  return { ok: true, ...payload };
}

module.exports = { toErrorMessage, normalizeResult, buildErrorResult, buildSuccessResult };
