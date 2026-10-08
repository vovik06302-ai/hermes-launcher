'use strict';

class TaskQueue {
  constructor(concurrency = 1) {
    if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error('Некорректный размер очереди.');
    this.concurrency = concurrency;
    this.running = 0;
    this.pending = [];
  }
  add(id, task) {
    if (typeof task !== 'function') throw new Error('Задача должна быть функцией.');
    return new Promise((resolve, reject) => {
      this.pending.push({ id, task, resolve, reject });
      this.#drain();
    });
  }
  cancel(id) {
    const index = this.pending.findIndex(item => item.id === id);
    if (index < 0) return false;
    const [item] = this.pending.splice(index, 1);
    item.reject(new Error('Задача отменена.'));
    return true;
  }
  snapshot() { return { running: this.running, pending: this.pending.map(item => item.id) }; }
  #drain() {
    while (this.running < this.concurrency && this.pending.length) {
      const item = this.pending.shift(); this.running++;
      Promise.resolve().then(item.task).then(item.resolve, item.reject).finally(() => { this.running--; this.#drain(); });
    }
  }
}

module.exports = { TaskQueue };
