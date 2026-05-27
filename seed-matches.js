const axios = require('axios');
const api = axios.create({ baseURL: 'http://localhost:5000/api' });

async function seed() {
  try {
    // Get all teams
    const { data: teamData } = await api.get('/teams');
    const teams = teamData.teams.slice(0, 6);
    console.log('Teams:', teams.map(t => t.name));
    
    const matches = [
      { teamA: teams[0].name, teamB: teams[1].name, runs1: 155, runs2: 148 },
      { teamA: teams[2].name, teamB: teams[3].name, runs1: 162, runs2: 160 },
      { teamA: teams[4].name, teamB: teams[5].name, runs1: 140, runs2: 145 },
      { teamA: teams[1].name, teamB: teams[2].name, runs1: 175, runs2: 170 },
      { teamA: teams[0].name, teamB: teams[5].name, runs1: 180, runs2: 100 },
    ];
    
    for (const m of matches) {
      await api.post('/matches', {
        teamA: m.teamA,
        teamB: m.teamB,
        format: 't20',
        status: 'completed',
        innings1: { battingTeam: m.teamA, runs: m.runs1, balls: 120, wickets: 6 },
        innings2: { battingTeam: m.teamB, runs: m.runs2, balls: 118, wickets: 7 }
      });
      console.log('✓ Created match:', m.teamA, 'vs', m.teamB);
    }
    
    // Verify rankings
    const { data: rankings } = await api.get('/teams/rankings?format=t20');
    console.log('\nTeam Rankings:');
    rankings.teams.forEach((t, i) => {
      console.log(`${i+1}. ${t.name}: ${t.points} pts | ${t.wins}W-${t.losses}L | ${t.matches} matches`);
    });
  } catch (err) {
    console.error('Error:', err.response?.data || err.message);
  }
}

seed();
