/**
 * Game joining / leaving via the web transport.
 */

export class GameJoin {
  constructor(transport) {
    this.transport = transport;
  }

  async joinGame(gameId) {
    return this.transport.joinGame(Number(gameId));
  }

  async joinUser(userId) {
    return this.transport.joinUser(Number(userId));
  }

  async joinServer(gameId, jobId) {
    return this.transport.joinServer(Number(gameId), String(jobId));
  }

  async leaveGame() {
    return this.transport.leaveGame();
  }

  async findServers(gameId, options = {}) {
    return this.transport.findServers(Number(gameId), options);
  }

  async joinFriend(username) {
    const friend = await this.transport.getFriendByUsername(username);
    if (!friend) {
      throw new Error(`Friend not found: ${username}`);
    }
    const result = await this.transport.joinUser(Number(friend.id));
    return { friend, ...result };
  }

  async listFriends() {
    return this.transport.getFriends();
  }
}

export default GameJoin;
