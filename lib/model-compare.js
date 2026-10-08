'use strict';

function createComparisonPlan(config, models) {
  if (!config || typeof config !== 'object') throw new Error('Некорректная конфигурация сравнения.');
  if (!Array.isArray(models) || models.length < 2) throw new Error('Для сравнения нужны минимум две модели.');
  const unique = [...new Set(models.map(model => String(model).trim()).filter(Boolean))];
  if (unique.length < 2) throw new Error('Модели сравнения должны отличаться.');
  return unique.map((model, index) => ({
    id: `compare-${index + 1}`,
    model,
    config: { ...config, model, autoApprove: false }
  }));
}

module.exports = { createComparisonPlan };
