import fetch from 'node-fetch';
import { writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const tokens = [
    '8bxu5GXjZQsgJ5VbEMVU2wriRHayGus2.56baa9dd6af1bb716d7a0f68a308ee49190269a241ffcfd7621dab9540ed3ff5',
    'fEXgdaNWRKuBQJxkSjaUnKexHQVvvVJB.3f43128cefee3a8e5af823c509255c1d92de8e024a522b54a7a74b8b61520ef4'
];

const baseUrl = 'https://api.callbell.eu/v1/teams';

// Para obtener el path de la carpeta actual (ESM)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function getTeams(token) {
    const response = await fetch(baseUrl, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    });
    if (!response.ok) {
        throw new Error(`Error: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    return data.teams || [];
}

async function getTeamMembers(token, teamUuid) {
    const url = `${baseUrl}/${teamUuid}/members`;
    const response = await fetch(url, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    });
    if (!response.ok) {
        throw new Error(`Error members: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    return data.users || [];
}

async function getAllTeamsWithMembers() {
    const results = {};
    for (const token of tokens) {
        try {
            const teams = await getTeams(token);
            for (const team of teams) {
                try {
                    team.membersList = await getTeamMembers(token, team.uuid);
                } catch (err) {
                    console.error(`Error obteniendo miembros para team ${team.name}:`, err.message);
                    team.membersList = [];
                }
            }
            results[token.slice(-6)] = teams;
            console.log(`Token ...${token.slice(-6)}: ${teams.length} equipos`);
        } catch (error) {
            console.error(`Error con token ...${token.slice(-6)}:`, error.message);
            results[token.slice(-6)] = [];
        }
    }
    // Guarda el JSON en la misma carpeta que este script
    const rutaArchivo = path.join(__dirname, 'equipos.json');
    await writeFile(rutaArchivo, JSON.stringify(results, null, 2), 'utf8');
    console.log('Resultado combinado guardado en equipos.json');
}

getAllTeamsWithMembers();