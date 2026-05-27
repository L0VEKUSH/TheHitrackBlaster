const { calculateWinProbability } = require("./winProbabilityModel");

const scenarios = [
  {
    name: "First innings strong start",
    match: { status: "live", overs: 20, currentInnings: 1, innings1: { runs: 80, wickets: 1, balls: 48 } }
  },
  {
    name: "First innings slow start",
    match: { status: "live", overs: 20, currentInnings: 1, innings1: { runs: 24, wickets: 3, balls: 36 } }
  },
  {
    name: "Second innings easy chase",
    match: { status: "live", overs: 20, currentInnings: 2, target: 140, innings2: { runs: 70, wickets: 2, balls: 54 } }
  },
  {
    name: "Second innings difficult chase",
    match: { status: "live", overs: 20, currentInnings: 2, target: 180, innings2: { runs: 42, wickets: 5, balls: 48 } }
  },
  {
    name: "Second innings last over finishable",
    match: { status: "live", overs: 20, currentInnings: 2, target: 150, innings2: { runs: 145, wickets: 4, balls: 114 } }
  },
  {
    name: "Second innings near impossible",
    match: { status: "live", overs: 20, currentInnings: 2, target: 200, innings2: { runs: 90, wickets: 7, balls: 96 } }
  }
];

for (const scenario of scenarios) {
  const prob = calculateWinProbability(scenario.match);
  console.log(`${scenario.name}:`, prob, `(${scenario.match.currentInnings === 2 ? 'chase' : 'batting'} team)`);
}
