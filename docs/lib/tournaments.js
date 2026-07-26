const powerOfTwoFloor = (value) => {
  const count = Math.max(2, Number(value) || 2);
  return 2 ** Math.floor(Math.log2(count));
};

const stage = (name, type, teamCount, advanceCount, source = "inferred") => ({
  name,
  type,
  team_count: Number(teamCount) || null,
  advance_count: Number(advanceCount) || null,
  source,
});

export function tournamentBlueprint(event = {}) {
  const format = event.format || {};
  const settings = format.settings || {};
  const label = String(format.label || "");
  const type = String(format.type || "mixed");
  const fieldSize = Number(event.participants?.length || event.teams || settings.team_count) || null;
  const declaredStages = (format.stages || []).map((row, index) => {
    if (typeof row === "string") return stage(row, "mixed", null, null, "published");
    return stage(row.name || row.label || `Stage ${index + 1}`, row.type || "mixed", row.team_count, row.advance_count, "published");
  });
  if (declaredStages.length) {
    const playoff = [...declaredStages].reverse().find((row) => ["single_elimination", "double_elimination"].includes(row.type));
    return {
      field_size: fieldSize,
      stages: declaredStages,
      playoff_type: playoff?.type || settings.playoff_type || "single_elimination",
      playoff_size: Number(playoff?.team_count || settings.playoff_teams) || null,
      source: "published",
    };
  }

  if (type === "single_elimination" || type === "double_elimination") {
    return {
      field_size: fieldSize,
      stages: [stage(type === "double_elimination" ? "Double-elimination bracket" : "Knockout bracket", type, fieldSize, 1)],
      playoff_type: type,
      playoff_size: fieldSize,
      source: "inferred",
    };
  }

  if (type === "swiss") {
    const swissCount = Number(settings.swiss_stages) || (/three[- ]stage swiss/i.test(label) ? 3 : 1);
    const stageField = Number(settings.stage_team_count) || Math.min(16, fieldSize || 16);
    const advance = Number(settings.advance_per_stage || settings.qualifying_teams) || Math.floor(stageField / 2);
    const stages = Array.from({ length: swissCount }, (_, index) => stage(`Stage ${index + 1} Swiss`, "swiss", stageField, advance));
    stages.push(stage("Playoffs", settings.playoff_type || "single_elimination", advance, 1));
    return { field_size: fieldSize, stages, playoff_type: settings.playoff_type || "single_elimination", playoff_size: advance, source: "inferred" };
  }

  if (type === "gsl") {
    const groupSize = Number(settings.group_size) || 4;
    const groupCount = Number(settings.group_count) || Math.max(1, Math.ceil((fieldSize || groupSize) / groupSize));
    const playoffSize = Number(settings.playoff_teams) || powerOfTwoFloor(groupCount * 2);
    return {
      field_size: fieldSize,
      stages: [stage("GSL groups", "gsl", fieldSize, playoffSize), stage("Playoffs", settings.playoff_type || "single_elimination", playoffSize, 1)],
      playoff_type: settings.playoff_type || "single_elimination",
      playoff_size: playoffSize,
      source: "inferred",
    };
  }

  if (type === "round_robin") {
    const playoffSize = Number(settings.playoff_teams) || Math.min(8, powerOfTwoFloor(fieldSize || 8));
    return {
      field_size: fieldSize,
      stages: [stage("League table", "round_robin", fieldSize, playoffSize), stage("Playoffs", settings.playoff_type || "single_elimination", playoffSize, 1)],
      playoff_type: settings.playoff_type || "single_elimination",
      playoff_size: playoffSize,
      source: "inferred",
    };
  }

  const hasGroups = /group|gsl/i.test(label);
  const hasOpening = /opening|play-in/i.test(label);
  const playoffType = /double[- ]elimination/i.test(label) ? "double_elimination" : "single_elimination";
  const playoffSize = Number(settings.playoff_teams) || Math.min(8, powerOfTwoFloor(fieldSize || 8));
  const openingType = hasGroups ? (settings.group_type || "round_robin") : hasOpening ? "opening_stage" : "mixed";
  const openingName = hasGroups ? "Group stage" : hasOpening ? "Opening stage" : "Event stage";
  return {
    field_size: fieldSize,
    stages: [stage(openingName, openingType, fieldSize, playoffSize), stage("Playoffs", playoffType, playoffSize, 1)],
    playoff_type: playoffType,
    playoff_size: playoffSize,
    source: "inferred",
  };
}

export function tournamentStageLabels(event) {
  return tournamentBlueprint(event).stages.map((row) => row.name);
}

export function tournamentPlayoffField(event, orderedTeams = []) {
  const blueprint = tournamentBlueprint(event);
  const field = [...orderedTeams];
  if (["single_elimination", "double_elimination"].includes(String(event?.format?.type || ""))) return field;
  const target = Number(blueprint.playoff_size) || Math.min(8, powerOfTwoFloor(field.length || 8));
  return field.slice(0, target);
}
