'use strict';
const childProcess = require('child_process');

function createChildProcessFallback(file, args, opts) {
  const child = childProcess.spawn(file, args, {
    cwd: opts && opts.cwd ? opts.cwd : process.cwd(),
    env: opts && opts.env ? opts.env : process.env,
    shell: false,
    stdio: ['pipe', 'pipe', 'pipe']
  });

  const dataListeners = new Set();
  const exitListeners = new Set();

  if (child.stdout) {
    child.stdout.on('data', chunk => {
      const text = chunk.toString();
      for (const cb of dataListeners) {
        try { cb(text); } catch (_) {}
      }
    });
  }

  if (child.stderr) {
    child.stderr.on('data', chunk => {
      const text = chunk.toString();
      for (const cb of dataListeners) {
        try { cb(text); } catch (_) {}
      }
    });
  }

  child.on('close', (code, signal) => {
    for (const cb of exitListeners) {
      try { cb({ exitCode: code ?? (signal ? 1 : 0) }); } catch (_) {}
    }
  });

  child.on('error', err => {
    const text = `\r\n\x1b[31m[Ошибка процесса]: ${err.message}\x1b[0m\r\n`;
    for (const cb of dataListeners) {
      try { cb(text); } catch (_) {}
    }
    for (const cb of exitListeners) {
      try { cb({ exitCode: 1 }); } catch (_) {}
    }
  });

  return {
    pid: child.pid,
    onData(cb) { dataListeners.add(cb); },
    onExit(cb) { exitListeners.add(cb); },
    write(data) {
      if (child.stdin && child.stdin.writable) {
        child.stdin.write(data);
      }
    },
    resize(_cols, _rows) {},
    kill(signal) {
      try { child.kill(signal); } catch (_) {}
    }
  };
}

class TerminalManager {
  constructor(notify, spawnTerminal) {
    this.notify = notify;
    this.spawnTerminal = spawnTerminal || ((file, args, opts) => {
      let pty;
      try {
        pty = require('node-pty');
      } catch (_) {
        pty = null;
      }
      if (pty && typeof pty.spawn === 'function') {
        try {
          return pty.spawn(file, args, opts);
        } catch (_) {
          // fallback to child_process
        }
      }
      return createChildProcessFallback(file, args, opts);
    });
    this.process = null;
    this.state = 'idle';
    this.cols = 100;
    this.rows = 28;
  }
  setState(state, extra = {}) { this.state = state; this.notify('terminal:state', { state, ...extra }); }
  async start(prepare) {
    if (this.state !== 'idle' && this.state !== 'error') throw new Error('Процесс уже запущен или запускается.');
    this.setState('starting');
    let cleanup = () => {};
    try {
      const prepared = await prepare();
      cleanup = prepared.cleanup || cleanup;
      const { file, args, cwd, env } = prepared;
      const child = this.spawnTerminal(file, args, { name: 'xterm-256color', cols: this.cols, rows: this.rows, cwd, env, useConpty: process.platform === 'win32', useConptyDll: process.platform === 'win32' });
      this.process = child;
      child.onData(data => this.notify('terminal:data', data));
      child.onExit(({ exitCode }) => {
        if (this.process !== child) return;
        this.process = null;
        cleanup();
        this.setState(exitCode === 0 || this.state === 'stopping' ? 'idle' : 'error', { exitCode });
        this.notify('terminal:exit', { exitCode });
      });
      this.setState('running');
      return { pid: child.pid };
    } catch (e) {
      cleanup();
      this.notify('terminal:data', `\r\n\x1b[31m[Ошибка терминала]: ${e.message}\x1b[0m\r\n`);
      this.setState('error', { error: e.message });
      throw e;
    }
  }
  stop() {
    if (!this.process) throw new Error('Нет запущенного процесса.');
    this.setState('stopping');
    try { this.process.kill(); } catch (e) { this.setState('running'); throw e; }
  }
  write(data) { if (this.process && typeof data === 'string' && data.length <= 65536) this.process.write(data); }
  resize(cols, rows) {
    if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 2 || rows < 1 || cols > 1000 || rows > 500) return;
    this.cols = cols; this.rows = rows;
    if (this.process) this.process.resize(cols, rows);
  }
}
module.exports = { TerminalManager };


