'use strict';
const fs = require('fs');
const path = require('path');
const { run, runStreaming } = require('./commands');

function validFolder(folder) {
  if (typeof folder !== 'string' || !folder.trim()) throw new Error('Укажите папку проекта.');
  const resolved = path.resolve(folder.trim());
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) throw new Error('Папка проекта не существует.');
  return resolved;
}

function repoName(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(value.trim())) throw new Error('Некорректный репозиторий GitHub.');
  return value.trim();
}

function progressParser(onProgress = () => {}) {
  return text => {
    const match = text.match(/(Receiving objects|Resolving deltas|Compressing objects):\s+(\d+)%/);
    if (match) onProgress({ stage: match[1], percent: Number(match[2]) });
  };
}

async function github(args, cwd, timeout = 60000, onProgress) {
  const result = onProgress ? await runStreaming('gh', args, timeout, cwd, progressParser(onProgress)) : await run('gh', args, timeout, cwd);
  if (!result.ok) throw new Error(result.error || 'Ошибка GitHub CLI.');
  return result.output;
}

async function status(folder) {
  const cwd = validFolder(folder);
  const result = await run('git', ['status', '--short', '--branch'], 30000, cwd);
  if (!result.ok) throw new Error(result.error || 'Папка не является Git-репозиторием.');
  const branch = result.output.split(/\r?\n/)[0] || '';
  const changes = result.output.split(/\r?\n/).slice(1).filter(Boolean);
  const remote = await run('git', ['remote', 'get-url', 'origin'], 30000, cwd);
  return { branch, changes, remote: remote.ok ? remote.output : '' };
}

async function list() {
  const output = await github(['repo', 'list', '--limit', '100', '--json', 'nameWithOwner,name,description,isPrivate,updatedAt'], process.cwd());
  try { return { repositories: JSON.parse(output || '[]') }; }
  catch { throw new Error('GitHub вернул некорректный список репозиториев.'); }
}

async function clone(repo, parentFolder, onProgress) {
  const parent = validFolder(parentFolder);
  const repoFull = repoName(repo);
  const name = repoFull.split('/')[1];
  const targetPath = path.join(parent, name);
  if (fs.existsSync(targetPath)) {
    throw new Error(`Папка ${name} уже существует в указанном каталоге.`);
  }
  await github(['repo', 'clone', repoFull, targetPath], process.cwd(), 300000, onProgress);
  return { path: targetPath };
}

async function pull(folder, onProgress) {
  const cwd = validFolder(folder);
  const result = await runStreaming('git', ['pull', '--ff-only', '--progress'], 300000, cwd, progressParser(onProgress));
  if (!result.ok) throw new Error(result.error || 'Не удалось загрузить изменения.');
  return { output: result.output || 'Изменения уже актуальны.' };
}

async function push(folder, message, onProgress) {
  const cwd = validFolder(folder);
  const add = await run('git', ['add', '-A'], 60000, cwd);
  if (!add.ok) throw new Error(add.error || 'Не удалось подготовить изменения.');
  const commitMessage = typeof message === 'string' && message.trim() ? message.trim().slice(0, 200) : 'Изменения из Hermes Launcher';
  const commit = await run('git', ['commit', '-m', commitMessage], 60000, cwd);
  if (!commit.ok && !/nothing to commit|nothing added/i.test(`${commit.output}\n${commit.error}`)) throw new Error(commit.error || 'Не удалось создать коммит.');
  const pushResult = await runStreaming('git', ['push', '--progress'], 300000, cwd, progressParser(onProgress));
  if (!pushResult.ok) throw new Error(pushResult.error || 'Не удалось отправить изменения.');
  return { output: [commit.output, pushResult.output].filter(Boolean).join('\n') || 'Изменения отправлены.' };
}

module.exports = { status, list, clone, pull, push };
