'use strict';

const { createComparisonPlan } = require('./model-compare');
const { parseSessions } = require('./commands');
const { MAX_TERMINALS } = require('./terminal-pool');

function createSessionServices({ startHermes, runHermesCommand, resolveHermes, normalize, logger }) {
  async function listSessions(cfg) {
    const file = await resolveHermes(normalize(cfg));
    const result = await runHermesCommand(file, ['sessions', 'list', '--limit', '50']);
    if (!result.ok) throw new Error(result.error);
    return { sessions: parseSessions(result.output) };
  }

  async function deleteSession(input, session, terminalState, confirmAction) {
    if (!session || !/^[a-zA-Z0-9_-]+$/.test(session.id)) throw new Error('Некорректная сессия.');
    if (['starting', 'running', 'stopping'].includes(terminalState)) throw new Error('Сначала остановите сессию.');
    const choice = await confirmAction({
      type: 'question',
      buttons: ['Отмена', 'Удалить'],
      defaultId: 0,
      cancelId: 0,
      message: 'Удалить сессию?',
      detail: String(session.title || session.id)
    });
    if (choice.response !== 1) return { canceled: true };
    const file = await resolveHermes(normalize(input));
    const result = await runHermesCommand(file, ['sessions', 'delete', session.id, '--yes'], 30000);
    if (!result.ok) throw new Error(result.error);
    return { deleted: true };
  }

  function buildComparisonPlan(input, models) {
    return { plan: createComparisonPlan(normalize(input), models) };
  }

  async function runComparisonPlan(plan, comparisonQueue) {
    if (!Array.isArray(plan) || !plan.length) throw new Error('Пустой план сравнения.');
    const maxAllowed = MAX_TERMINALS - 1;
    if (plan.length > maxAllowed) {
      throw new Error(`Для сравнения можно выбрать не более ${maxAllowed} моделей одновременно.`);
    }
    const results = [];
    for (const item of plan) {
      const res = await comparisonQueue.add(item.id, () => startHermes(item.config, null, item.id));
      results.push(res);
    }
    return { results, queue: comparisonQueue.snapshot() };
  }

  return { listSessions, deleteSession, buildComparisonPlan, runComparisonPlan };
}

module.exports = { createSessionServices };
