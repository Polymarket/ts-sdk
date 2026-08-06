import { readdir, readFile } from 'node:fs/promises';

const packagesDirectory = new URL('../../packages/', import.meta.url);
const packageDirectories = await readdir(packagesDirectory, {
  withFileTypes: true,
});
const unpublishedStableVersions = [];

for (const directory of packageDirectories) {
  if (!directory.isDirectory()) continue;

  const packageJsonPath = new URL(
    `${directory.name}/package.json`,
    packagesDirectory,
  );
  let packageJson;
  try {
    packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') continue;
    throw error;
  }

  if (packageJson.private || !packageJson.name || !packageJson.version)
    continue;

  const registryUrl = new URL(
    `${encodeURIComponent(packageJson.name)}/${encodeURIComponent(packageJson.version)}`,
    'https://registry.npmjs.org/',
  );
  const response = await fetch(registryUrl);

  if (response.ok) continue;
  if (response.status !== 404) {
    throw new Error(
      `npm registry returned ${response.status} for ${packageJson.name}@${packageJson.version}`,
    );
  }
  if (!packageJson.version.includes('-canary-')) {
    unpublishedStableVersions.push(
      `${packageJson.name}@${packageJson.version}`,
    );
  }
}

if (unpublishedStableVersions.length > 0) {
  throw new Error(
    `Canary publish refused unpublished stable versions: ${unpublishedStableVersions.join(', ')}`,
  );
}

console.log('Verified that every unpublished package is a canary snapshot.');
