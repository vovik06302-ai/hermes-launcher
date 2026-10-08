'use strict';

const MAX_TERMINALS = 4;

class TerminalPool {
  constructor(factory) {
    this.factory = factory;
    this.terminals = new Map();
  }
  create(id, notify) {
    if (this.terminals.has(id)) return this.terminals.get(id);
    if (this.terminals.size >= MAX_TERMINALS) throw new Error(`Можно запустить не более ${MAX_TERMINALS} параллельных сессий.`);
    const terminal = this.factory(notify);
    this.terminals.set(id, terminal);
    return terminal;
  }
  get(id) { return this.terminals.get(id); }
  remove(id) {
    const terminal = this.terminals.get(id);
    if (terminal?.process) terminal.stop();
    return this.terminals.delete(id);
  }
  stopAll() {
    for (const terminal of this.terminals.values()) if (terminal.process) terminal.stop();
  }
}

module.exports = { TerminalPool, MAX_TERMINALS };
