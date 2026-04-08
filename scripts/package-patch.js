const { spawnSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');

function run(command, args) {
  const result = spawnSync(process.env.comspec || 'cmd.exe', ['/d', '/s', '/c', [command, ...args].join(' ')], {
    cwd: rootDir,
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function commandExists(command) {
  const result = spawnSync(process.env.comspec || 'cmd.exe', ['/d', '/s', '/c', `where ${command}`], {
    cwd: rootDir,
    stdio: 'ignore',
  });

  return result.status === 0;
}

run('npm.cmd', ['version', 'patch', '--no-git-tag-version']);
run('npm.cmd', ['run', 'compile']);

const packageJsonPath = path.join(rootDir, 'package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
const vsixName = `${packageJson.name}-${packageJson.version}.vsix`;

const packageArgs = [
  'package',
  '--allow-missing-repository',
  '--skip-license',
  '--no-rewrite-relative-links',
  '--out',
  vsixName,
];

if (commandExists('vsce.cmd')) {
  run('vsce.cmd', packageArgs);
} else {
  run('npx.cmd', ['@vscode/vsce', ...packageArgs]);
}

console.log(`Created ${vsixName}`);
