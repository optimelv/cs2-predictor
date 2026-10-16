import assert from 'node:assert/strict';
import { groupTeamSearchNames } from '../docs/lib/team-search.js';
import { ordinalRows } from '../docs/vendor/chart-engine.js';

const identity = (name) => name.toLowerCase() === 'navi' ? 'natus vincere' : name.toLowerCase();
const teams = groupTeamSearchNames(['NAVI', 'Natus Vincere', 'navi junior', 'NAVI Junior', 'Spirit', '', null], identity);
assert.deepEqual(teams.map((team) => team.name), ['NAVI', 'navi junior', 'Spirit']);
assert.equal(teams.filter((team) => team.aliases.some((name) => name.toLowerCase().includes('natus')))[0].name, 'NAVI', 'Full-name queries retain the same canonical result');
assert.equal(teams.filter((team) => team.aliases.some((name) => name.toLowerCase().includes('navi'))).length, 2, 'Academy and main teams remain separate');

assert.deepEqual(ordinalRows([
  { label: 'A', points: [{ value: 1 }, { value: 2 }, { value: 3 }] },
  { label: 'B', points: [{ value: 4 }, { value: 5 }] },
]), [{ ordinal: 0, series0: 1, series1: 4 }, { ordinal: .5, series0: 2 }, { ordinal: 1, series0: 3, series1: 5 }], 'Unequal histories retain all observations at their native ordinal positions');
assert.deepEqual(ordinalRows([{ label: 'A', points: [{ value: 7 }] }]), [{ ordinal: .5, series0: 7 }]);
assert.deepEqual(ordinalRows([]), []);
console.log('Team alias search and chart ordinal regression tests passed');
