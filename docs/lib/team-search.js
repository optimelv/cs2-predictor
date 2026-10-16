// Keep all source spellings searchable while showing one row per known team.
// The caller supplies the same identity resolver used by team profiles.
export function groupTeamSearchNames(names, identityForName) {
  const teams = new Map();
  for (const name of names) {
    if (typeof name !== 'string' || !name.trim()) continue;
    const key = identityForName(name);
    if (!key) continue;
    if (!teams.has(key)) teams.set(key, { name, aliases: [] });
    const entry = teams.get(key);
    if (!entry.aliases.includes(name)) entry.aliases.push(name);
  }
  return [...teams.values()];
}
