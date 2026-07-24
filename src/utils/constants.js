/**
 * Epic / Fortnite API constants
 */

// Default: fortniteNewSwitchGameClient — supports device_code grant type.
// Fallback: fortnitePCGameClient (device_code NOT supported — use only if you manually set EPIC_CLIENT_ID/SECRET).
const EPIC_CLIENT_ID = process.env.EPIC_CLIENT_ID || '98f7e42c2e3a4f86a74eb43fbb41ed39';
const EPIC_CLIENT_SECRET = process.env.EPIC_CLIENT_SECRET || '0a2449a2-001a-451e-afec-3e812901c4d7';

function validateCredentials() {
  if (!EPIC_CLIENT_ID || !EPIC_CLIENT_SECRET) {
    throw new Error(
      'Missing EPIC_CLIENT_ID / EPIC_CLIENT_SECRET. You must provide working Fortnite client credentials. ' +
      'Set them in .env or in your Railway environment variables.'
    );
  }
}

module.exports = {
  EPIC_CLIENT_ID,
  EPIC_CLIENT_SECRET,
  validateCredentials,

  // Account endpoints
  EPIC_OAUTH_HOST: 'https://account-public-service-prod03.ol.epicgames.com',
  EPIC_FRIENDS_HOST: 'https://friends-public-service-prod06.ol.epicgames.com',
  EPIC_PERSONA_HOST: 'https://persona-public-service-prod06.ol.epicgames.com',

  // Fortnite MCP / matchmaking endpoints
  FORTNITE_MCP_HOST: 'https://fngw-mcp-gc-livefn.ol.epicgames.com/fortnite/api/game/v2',
  FORTNITE_CONTENT_HOST: 'https://fortnitecontent-website-prod07.ol.epicgames.com/content/api/pages/fortnite-game',

  // XMPP
  XMPP_HOST: 'xmpp-service-prod.ol.epicgames.com',
  XMPP_PORT: 5222,

  // Fortnite app identifiers
  FORTNITE_APP: 'Fortnite',
  FORTNITE_BUILD: '++Fortnite+Release-31.00-CL-35408995-Windows',
  FORTNITE_NET_CL: '8370893',

  // Party namespace
  PARTY_PROD_DOMAIN: 'party.prod.ol.epicgames.com',

  // Platform presence payload
  getPlatformPresence: (accountId) => ({
    Status: 'Playing Battle Royale',
    bIsPlaying: true,
    bIsJoinable: true,
    bHasVoiceSupport: false,
    SessionId: '',
    Properties: {
      GamePrivate: {},
      GameBasicInfo: {
        gameTitle: 'Fortnite',
        gameplayStat: 'Playing Battle Royale',
        playlistName: 'Battle Royale',
        eventId: '',
        serverPlayerCount: 1,
        gameStarted: true,
        matchStarted: true
      },
      GameState: {
        inGameState: true,
        gameStarted: true,
        matchStarted: true,
        lobbyState: 'InGame'
      },
      GameActivity: {
        score: 0,
        hasWon: false,
        numKills: 0,
        playerState: 'Playing',
        gameMode: 'Battle Royale'
      },
      FortniteLobby: {
        accountId,
        lobbyState: 'InGame',
        gameMode: 'Battle Royale',
        matchStarted: true,
        playlistName: 'Battle Royale'
      }
    }
  })
};
