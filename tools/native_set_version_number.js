/**
 * Setzt die Release-Version (Marketing-Version) der nativen App. Aus llumi übernommen.
 *
 *   node tools/native_set_version_number 1.0.10   -> Version setzen und syncen
 *   node tools/native_set_version_number          -> aktuelle Version anzeigen
 *
 * Einzige Quelle der Version ist `package.json`. `tools/bump-native-build.mjs`
 * trägt sie in MARKETING_VERSION (iOS) und versionName (Android) nach.
 */
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const pkgPath = path.join(root, 'package.json');
const raw = fs.readFileSync(pkgPath, 'utf8');
const current = JSON.parse(raw).version;
const next = process.argv[2];

if (!next) {
  console.log(`Aktuelle Version: ${current}`);
  console.log('Aufruf: npm run version:set <version>   (z. B. 1.0.3)');
  process.exit(0);
}

// Apple erlaubt bis zu drei durch Punkt getrennte Zahlen, kein Suffix wie "-beta".
if (!/^\d{1,3}(\.\d{1,3}){1,2}$/.test(next)) {
  console.error(`FEHLER: "${next}" ist keine gültige Version. Erwartet: 1.0.3`);
  process.exit(1);
}

if (next !== current) {
  // Nur das erste "version"-Feld ersetzen, damit die Formatierung erhalten bleibt.
  fs.writeFileSync(pkgPath, raw.replace(/"version":\s*"[^"]+"/, `"version": "${next}"`));
  console.log(`package.json: ${current} -> ${next}`);
}

const sync = spawnSync(process.execPath, [path.join(__dirname, 'bump-native-build.mjs')], {
  cwd: root,
  stdio: 'inherit',
});
process.exit(sync.status ?? 1);
