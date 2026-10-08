'use strict';

const fs = require('fs');
const path = require('path');

function resolveDefaultStateFile() {
  try {
    const electron = require('electron');
    const app = electron.app || (electron.remote && electron.remote.app);
    if (app && typeof app.getPath === 'function') {
      return path.join(app.getPath('userData'), '.hermes-state.json');
    }
  } catch (_) {}
  return path.join(process.cwd(), '.hermes-state.json');
}

const STATE_FILE = resolveDefaultStateFile();
let stateFile = STATE_FILE;

function setStateFile(file) {
  if (typeof file !== 'string' || !file.trim()) throw new TypeError('Некорректный путь к файлу состояния.');
  stateFile = path.resolve(file);
}

function readState() {
  try {
    return JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  } catch {
    return {};
  }
}

function writeState(state) {
  const directory = path.dirname(stateFile);
  fs.mkdirSync(directory, { recursive: true });
  const temporary = `${stateFile}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  fs.renameSync(temporary, stateFile);
}

function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

module.exports = { readState, writeState, isPidAlive, setStateFile, STATE_FILE };
