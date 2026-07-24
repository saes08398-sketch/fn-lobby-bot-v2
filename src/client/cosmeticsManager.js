const { createLogger } = require('../utils/logger');
const FortniteAPI = require('./fortniteAPI');

const log = createLogger('Cosmetics');

const SKIN_PREFIXES = ['Character_', 'CID_'];
const EMOTE_PREFIXES = ['Emote_', 'EID_'];
const BACKPACK_PREFIXES = ['Backpack_', 'BID_'];
const PICKAXE_PREFIXES = ['Pickaxe_', 'PID_'];

function normalizeItemId(input, category) {
  if (!input) return null;
  let id = input.trim();
  if (id.startsWith('Athena')) return id;

  const upper = id.toUpperCase();
  const prefixes = {
    Character: SKIN_PREFIXES,
    Dance: EMOTE_PREFIXES,
    Backpack: BACKPACK_PREFIXES,
    Pickaxe: PICKAXE_PREFIXES
  };

  for (const p of prefixes[category] || []) {
    if (upper.startsWith(p)) {
      return `Athena${category === 'Dance' ? 'Dance' : category}:${id}`;
    }
  }

  // If user passed just a number/short code, try common Fortnite template formats.
  if (category === 'Character') return `AthenaCharacter:${id}`;
  if (category === 'Dance') return `AthenaDance:${id}`;
  if (category === 'Backpack') return `AthenaBackpack:${id}`;
  if (category === 'Pickaxe') return `AthenaPickaxe:${id}`;
  return id;
}

class CosmeticsManager {
  constructor(tokenManager, state) {
    this.tokenManager = tokenManager;
    this.state = state;
    this.api = new FortniteAPI(tokenManager);
    this.lockerItem = null;
    this.itemsCache = null;
  }

  async init() {
    try {
      const profile = await this.api.getProfile('athena');
      const items = profile?.profileChanges?.[0]?.profile?.items || {};
      this.itemsCache = items;

      // Find the active locker.
      for (const [key, item] of Object.entries(items)) {
        if (item.templateId?.startsWith('CosmeticLocker:cosmeticlocker')) {
          this.lockerItem = key;
          break;
        }
      }

      log.info('Active locker:', this.lockerItem);
      this.state.pushLog('info', 'Cosmetics manager ready.');
    } catch (e) {
      log.error('Failed to load cosmetics profile:', e.message);
      this.state.pushLog('error', `Cosmetics init failed: ${e.message}`);
    }
  }

  async equipSkin(itemId) {
    const templateId = normalizeItemId(itemId, 'Character');
    await this.equip('Character', templateId);
    this.state.update({ currentSkin: templateId });
    this.state.pushLog('info', `Equipped skin: ${templateId}`);
    return templateId;
  }

  async equipBackpack(itemId) {
    const templateId = normalizeItemId(itemId, 'Backpack');
    await this.equip('Backpack', templateId);
    this.state.pushLog('info', `Equipped backpack: ${templateId}`);
    return templateId;
  }

  async equipPickaxe(itemId) {
    const templateId = normalizeItemId(itemId, 'Pickaxe');
    await this.equip('Pickaxe', templateId);
    this.state.pushLog('info', `Equipped pickaxe: ${templateId}`);
    return templateId;
  }

  async playEmote(itemId, section = 'Emote1') {
    const templateId = normalizeItemId(itemId, 'Dance');

    // Equip emote into the requested dance slot first.
    const slotIndex = ['Emote1', 'Emote2', 'Emote3', 'Emote4', 'Emote5', 'Emote6'].indexOf(section);
    await this.equip('Dance', templateId, slotIndex >= 0 ? slotIndex : 0);

    // Notify party that we started an emote.
    if (this.xmppClient && this.xmppClient.partyId) {
      const event = {
        type: 'com.epicgames.social.party.notification.v0.MEMBER_UPDATE_EMOTE',
        payload: {
          emoteItemDef: templateId,
          emoteSection: section
        }
      };
      await this.xmppClient.sendPartyEvent(
        `p-${this.xmppClient.partyId}@party.prod.ol.epicgames.com`,
        event
      );
    }

    this.state.update({ currentEmote: templateId });
    this.state.pushLog('info', `Playing emote: ${templateId}`);
    return templateId;
  }

  async equip(category, templateId, slotIndex = 0) {
    if (!this.lockerItem) {
      throw new Error('Locker not loaded. Call init() first.');
    }

    const slots = {
      category,
      slotsToEquip: [templateId],
      slotIndex,
      shuffleItem: '',
      bannerIconTemplateName: '',
      bannerColorTemplateName: ''
    };

    const res = await this.api.setLockerSlots(this.lockerItem, slots);
    log.info(`Equip ${category} response:`, res?.profileChanges?.length ? 'ok' : 'no changes');
    return res;
  }

  async setLoadout(loadout) {
    const tasks = [];
    if (loadout.skin) tasks.push(this.equipSkin(loadout.skin));
    if (loadout.backpack) tasks.push(this.equipBackpack(loadout.backpack));
    if (loadout.pickaxe) tasks.push(this.equipPickaxe(loadout.pickaxe));
    if (loadout.emote) tasks.push(this.playEmote(loadout.emote, loadout.emoteSection || 'Emote1'));
    await Promise.all(tasks);
  }

  bindXMPP(xmppClient) {
    this.xmppClient = xmppClient;
  }
}

module.exports = CosmeticsManager;
