const { PARTY_PROD_DOMAIN } = require('../utils/constants');
const { createLogger } = require('../utils/logger');

const log = createLogger('Party');

class PartyManager {
  constructor(xmpp, api, state) {
    this.xmpp = xmpp;
    this.api = api;
    this.state = state;
    this.autoAccept = (process.env.AUTO_ACCEPT_INVITES || 'true').toLowerCase() === 'true';

    this.xmpp.on('partyInvite', this.onPartyInvite.bind(this));
    this.xmpp.on('memberJoined', this.onMemberJoined.bind(this));
    this.xmpp.on('memberLeft', this.onMemberLeft.bind(this));
    this.xmpp.on('partyUpdated', this.onPartyUpdated.bind(this));
    this.xmpp.on('memberStateUpdated', this.onMemberStateUpdated.bind(this));
  }

  async onPartyInvite(data) {
    const payload = data.payload || data;
    const partyId = payload.party_id || payload.partyId;
    const senderId = payload.sender_id || payload.accountId || payload.inviter_id;
    const senderName = payload.sender_dn || payload.displayName || senderId;

    log.info(`Party invite received from ${senderName} to party ${partyId}`);
    this.state.pushLog('info', `Invite from ${senderName}`);
    this.state.update({
      inviteQueue: [...this.state.get().inviteQueue, { partyId, senderId, senderName, time: Date.now() }]
    });

    if (this.autoAccept) {
      await this.joinParty(partyId, senderId);
    }
  }

  async joinParty(partyId, senderId) {
    log.info(`Joining party ${partyId}`);
    this.state.pushLog('info', `Joining party ${partyId}`);

    // Accept invite via XMPP.
    const accept = {
      type: 'com.epicgames.social.party.notification.v0.ACCEPT_INVITE',
      payload: {
        party_id: partyId,
        access_token: this.xmpp.tokenManager.accessToken
      }
    };
    await this.xmpp.sendMessage(senderId, JSON.stringify(accept), 'chat');

    // Also send a direct join IQ/message to the party room.
    const to = `p-${partyId}@${PARTY_PROD_DOMAIN}`;
    const join = {
      type: 'com.epicgames.social.party.notification.v0.JOIN',
      payload: {
        party_id: partyId,
        account_id: this.xmpp.tokenManager.accountId,
        access_token: this.xmpp.tokenManager.accessToken,
        join_data: {
          source_id: senderId,
          source_display_name: ''
        }
      }
    };
    await this.xmpp.sendPartyEvent(to, join);

    this.xmpp.partyId = partyId;
    this.state.update({ partyId });
  }

  async onMemberJoined(data) {
    const payload = data.payload || data;
    log.info('Member joined:', payload.account_id || payload.accountId);
    await this.refreshMembers();
  }

  async onMemberLeft(data) {
    const payload = data.payload || data;
    log.info('Member left:', payload.account_id || payload.accountId);
    await this.refreshMembers();
  }

  async onPartyUpdated(data) {
    const payload = data.payload || data;
    const partyId = payload.party_id || payload.id;
    if (partyId) {
      this.xmpp.partyId = partyId;
      this.state.update({ partyId });
    }
    await this.refreshMembers();
  }

  async onMemberStateUpdated(data) {
    await this.refreshMembers();
  }

  async refreshMembers() {
    // Best-effort list from stored state; party roster is tracked via notifications.
    // You can query Epic's party service here if you need live authoritative data.
    const current = this.state.get();
    this.state.update({
      partyMembers: current.partyMembers.length ? current.partyMembers : []
    });
  }

  async sendPartyMessage(text) {
    await this.xmpp.sendPartyMessage(text);
  }

  setAutoAccept(value) {
    this.autoAccept = !!value;
    this.state.update({ autoAccept: this.autoAccept });
  }
}

module.exports = PartyManager;
