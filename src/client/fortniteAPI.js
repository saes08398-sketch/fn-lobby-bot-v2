const axios = require('axios');
const {
  FORTNITE_MCP_HOST,
  EPIC_FRIENDS_HOST,
  EPIC_PERSONA_HOST
} = require('../utils/constants');

class FortniteAPI {
  constructor(tokenManager) {
    this.tokenManager = tokenManager;
  }

  authHeaders() {
    return {
      Authorization: `Bearer ${this.tokenManager.accessToken}`,
      'Content-Type': 'application/json'
    };
  }

  async getFriends() {
    const { data } = await axios.get(
      `${EPIC_FRIENDS_HOST}/v1/${this.tokenManager.accountId}/summary`,
      { headers: this.authHeaders() }
    );
    return data;
  }

  async getPersonaAccounts(accountIds) {
    const { data } = await axios.post(
      `${EPIC_PERSONA_HOST}/v1/users/namespace/global/bulk`,
      accountIds,
      { headers: this.authHeaders() }
    );
    return data;
  }

  async getProfile(profileId = 'athena') {
    const url = `${FORTNITE_MCP_HOST}/profile/${this.tokenManager.accountId}/client/QueryProfile?profileId=${profileId}&rvn=-1`;
    const { data } = await axios.post(url, {}, { headers: this.authHeaders() });
    return data;
  }

  async setLockerSlots(lockerItem, slots, profileId = 'athena') {
    // lockerItem is the GUID of the active locker.
    const url = `${FORTNITE_MCP_HOST}/profile/${this.tokenManager.accountId}/client/SetCosmeticLockerSlots?profileId=${profileId}&rvn=-1`;
    const body = {
      lockerItem,
      category: slots.category, // e.g. Character, Backpack, Pickaxe, Dance
      slotsToEquip: slots.slotsToEquip, // array of item template IDs
      slotIndex: slots.slotIndex ?? 0,
      shuffleItem: slots.shuffleItem ?? '',
      bannerIconTemplateName: slots.bannerIconTemplateName ?? '',
      bannerColorTemplateName: slots.bannerColorTemplateName ?? ''
    };
    const { data } = await axios.post(url, body, { headers: this.authHeaders() });
    return data;
  }

  async setItemFavoriteStatus(itemId, favorite = true, profileId = 'athena') {
    const url = `${FORTNITE_MCP_HOST}/profile/${this.tokenManager.accountId}/client/SetItemFavoriteStatus?profileId=${profileId}&rvn=-1`;
    const { data } = await axios.post(url, { itemIds: [itemId], itemFavStatus: [favorite] }, { headers: this.authHeaders() });
    return data;
  }

  async getFortniteGameContent() {
    const { data } = await axios.get('https://fortnitecontent-website-prod07.ol.epicgames.com/content/api/pages/fortnite-game');
    return data;
  }

  async sendMatchmakingPresence(presence) {
    // Placeholder for any future matchmaking endpoints.
    return presence;
  }
}

module.exports = FortniteAPI;
