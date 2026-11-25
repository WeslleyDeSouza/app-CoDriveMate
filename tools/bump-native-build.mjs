/**
 * Writes release version and build number into the native projects. Adapted
 * from llumi's bump-ios-build.mjs.
 *
 * - Version: `version` in package.json -> MARKETING_VERSION (iOS), versionName (Android)
 * - Build number: CI_BUILD_NUMBER (Capawesome Cloud, shallow clone), else the git
 *   commit count -> CURRENT_PROJECT_VERSION, versionCode
 *
 * Without either only the version is written.
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const git = (args) => execSync(`git ${args}`, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();

function buildNumber() {
  const ci = process.env.CI_BUILD_NUMBER;
  if (ci) {
    if (/^[1-9]\d*$/.test(ci)) return ci;
    console.error(`[bump] CI_BUILD_NUMBER "${ci}" is not a positive integer.`);
    process.exit(1);
  }
  try {
    git('rev-parse HEAD');
  } catch {
    console.warn('[bump] No git commits yet: build number left unchanged.');
    return undefined;
  }
  // A shallow clone counts only the fetched commits; the number could then drop.
  if (git('rev-parse --is-shallow-repository') === 'true') {
    console.error('[bump] Shallow clone and no CI_BUILD_NUMBER: build number unknown.');
    process.exit(1);
  }
  return git('rev-list --count HEAD');
}

function patch(file, replacements) {
  const path = resolve(root, file);
  if (!existsSync(path)) {
    console.warn(`[bump] ${file} not found, skipped.`);
    return;
  }
  let text = readFileSync(path, 'utf8');
  for (const [pattern, value] of replacements) text = text.replace(pattern, value);
  writeFileSync(path, text);
}

const { version } = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const build = buildNumber();

patch('ios/App/App.xcodeproj/project.pbxproj', [
  [/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${version};`],
  ...(build ? [[/CURRENT_PROJECT_VERSION = \d+;/g, `CURRENT_PROJECT_VERSION = ${build};`]] : []),
]);
patch('android/app/build.gradle', [
  [/versionName "[^"]+"/, `versionName "${version}"`],
  ...(build ? [[/versionCode \d+/, `versionCode ${build}`]] : []),
]);
console.log(`[bump] version ${version}, build ${build ?? '(unchanged)'}`);
