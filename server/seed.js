const http = require('http');

function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 5000,
      path: '/api' + path,
      method: method,
      headers: { 'Content-Type': 'application/json' }
    };
    const r = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    });
    r.on('error', reject);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

async function seed() {
  try {
    const teamData = await req('GET', '/teams');
    const teams = teamData.teams.slice(0, 6);
    console.log('Teams:', teams.map(t => t.name));
    if (teams.length < 4) { console.log('Not enough teams'); return; }
    
    const matches = [
      { teamA: teams[0].name, teamB: teams[1].name, runs1: 155, runs2: 148 },
      { teamA: teams[2].name, teamB: teams[3].name, runs1: 162, runs2: 160 },
    ];
    
    if (teams.length >= 6) {
      matches.push(
        { teamA: teams[4].name, teamB: teams[5].name, runs1: 140, runs2: 145 },
        { teamA: teams[1].name, teamB: teams[2].name, runs1: 175, runs2: 170 },
        { teamA: teams[0].name, teamB: teams[5].name, runs1: 180, runs2: 100 }
      );
    } else if (teams.length >= 4) {
      matches.push(
        { teamA: teams[1].name, teamB: teams[2].name, runs1: 175, runs2: 170 },
        { teamA: teams[0].name, teamB: teams[3].name, runs1: 180, runs2: 100 }
      );
    }
    
    for (const m of matches) {
      await req('POST', '/matches', {
        teamA: m.teamA,
        teamB: m.teamB,
        format: 'T20I',
        status: 'completed',
        overs: 20,
        innings1: { battingTeam: m.teamA, runs: m.runs1, balls: 120, wickets: 6 },
        innings2: { battingTeam: m.teamB, runs: m.runs2, balls: 118, wickets: 7 }
      });
      console.log('Created:', m.teamA, 'vs', m.teamB);
    }
    
    const rankings = await req('GET', '/teams/rankings?format=T20I');
    console.log('\nTeam Rankings (T20I):');
    rankings.teams.forEach((t, i) => {
      console.log((i+1) + '. ' + t.name + ': ' + t.points + ' pts, ' + t.wins + 'W-' + t.losses + 'L');
    });
  } catch (err) {
    console.error('Error:', err.message);
  }
}

seed();
