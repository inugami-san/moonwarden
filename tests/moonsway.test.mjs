import assert from "node:assert/strict";
import test from "node:test";
import { GameRoom } from "../server/game-room.ts";
import { CENTER } from "../server/sanctuary-map.ts";
import { REPORTER_VOTE_DRIFT_CHANCE, resolveReporterVote } from "../server/match-rules.ts";

const living = ["reporter", "suspect", "other", "last"];

test("Moonsway has an exact 25% boundary and uniformly selects a different eligible player", () => {
  assert.equal(REPORTER_VOTE_DRIFT_CHANCE, .25);
  assert.deepEqual(resolveReporterVote("reporter", "suspect", living, "reporter", () => .25, true), { targetId: "suspect", shifted: false });
  let draws = [.2499, 0];
  assert.deepEqual(resolveReporterVote("reporter", "suspect", living, "reporter", () => draws.shift(), true), { targetId: "other", shifted: true });
  draws = [0, .999];
  assert.equal(resolveReporterVote("reporter", "suspect", living, "reporter", () => draws.shift(), true).targetId, "last");
  let shifted = 0;
  for (let i = 0; i < 10000; i++) {
    let draw = 0;
    if (resolveReporterVote("reporter", "suspect", living, "reporter", () => draw++ === 0 ? i / 10000 : 0, true).shifted) shifted++;
  }
  assert.equal(shifted, 2500);
});

test("skip, emergency, non-reporter, invalid, and no-alternative ballots never roll", () => {
  const never = () => { throw Error("This ballot must not consume a random roll"); };
  for (const [voter, target, candidates, reporter] of [
    ["reporter", null, living, "reporter"],
    ["reporter", "suspect", living, null],
    ["other", "suspect", living, "reporter"],
    ["reporter", "missing", living, "reporter"],
    ["missing", "suspect", living, "missing"],
    ["reporter", "suspect", ["reporter", "suspect"], "reporter"],
  ]) assert.deepEqual(resolveReporterVote(voter, target, candidates, reporter, never, true), { targetId: target, shifted: false });
});

function fixture(t) {
  const room = new GameRoom("SWAY");
  const clients = new Map();
  for (const id of ["a", "b", "c", "d", "e"]) {
    const client = { readyState: 1, messages: [], send(data) { this.messages.push(JSON.parse(data)); }, close() {} };
    clients.set(id, client);
    room.addClient(id, client, id.toUpperCase(), "#20d8ed", "hood");
  }
  t.after(() => room.destroy());
  room.handleMessage("a", { type: "START_MATCH", botFill: false, targetPlayers: 5, chaosMoonsway: true });
  for (const player of room.players.values()) {
    player.role = player.id === "b" ? "IMPOSTOR" : "CREWMATE";
    player.x = CENTER.x; player.y = CENTER.y;
  }
  room.phase = "ORDEAL";
  room.executeKill(room.players.get("e"), room.players.get("b"));
  for (const client of clients.values()) client.messages.length = 0;
  room.handleMessage("a", { type: "TRIGGER_REPORT" });
  room.votingOpensAt = 0; // These tests exercise ballots after discussion ends.
  return { room, clients, receipt: id => clients.get(id).messages.filter(message => message.type === "VOTE_RECEIPT").at(-1) };
}

test("only a real body reporter gets one authoritative role-blind roll and a private receipt", t => {
  const { room, clients, receipt } = fixture(t);
  const meeting = clients.get("a").messages.find(message => message.type === "MEETING_CALLED");
  assert.equal(meeting.bodyReporterId, "a");
  assert.ok(meeting.candidates.every(player => player.role === undefined));
  let rolls = 0;
  t.mock.method(Math, "random", () => { rolls++; return 0; });
  room.handleMessage("a", { type: "CAST_VOTE", targetId: "b" });
  assert.equal(room.votes.get("a"), "c");
  assert.deepEqual(receipt("a"), { type: "VOTE_RECEIPT", accepted: true, targetId: "c", shifted: true });
  assert.equal(rolls, 2, "one chance roll and one destination draw");
  room.handleMessage("a", { type: "CAST_VOTE", targetId: "d" });
  assert.equal(room.votes.get("a"), "c");
  assert.equal(rolls, 2, "a duplicate cannot reroll the accepted vote");
  assert.equal(room.votes.size, 1);
  for (const id of ["b", "c", "d", "e"]) {
    assert.equal(receipt(id), undefined, "another player cannot see a private destination");
    assert.deepEqual(clients.get(id).messages.find(message => message.type === "VOTE_CAST_ACK"), { type: "VOTE_CAST_ACK", voterId: "a" });
  }
});

test("a shifted vote is counted once at its destination and other voters keep their choices", t => {
  const { room, clients } = fixture(t);
  t.mock.method(Math, "random", () => 0);
  room.handleMessage("a", { type: "CAST_VOTE", targetId: "b" });
  for (const id of ["b", "c", "d"]) room.handleMessage(id, { type: "CAST_VOTE", targetId: null });
  const result = clients.get("a").messages.find(message => message.type === "MEETING_CONCLUDED");
  assert.equal(result.tally.find(entry => entry.targetId === "b").votes, 0);
  assert.equal(result.tally.find(entry => entry.targetId === "c").votes, 1);
  assert.equal(result.tally.find(entry => entry.targetId === null).votes, 3);
  assert.equal(result.tally.reduce((total, entry) => total + entry.votes, 0), 4);
  assert.equal(result.ejectedId, null);
});

test("drift does not depend on whether the selected suspect is actually Hollow", t => {
  const { room, receipt } = fixture(t);
  t.mock.method(Math, "random", () => 0);
  room.handleMessage("a", { type: "CAST_VOTE", targetId: "c" });
  assert.equal(room.players.get("c").role, "CREWMATE");
  assert.equal(receipt("a").shifted, true);
  assert.equal(receipt("a").targetId, "b");
});

test("skips, non-reporters, and the next emergency meeting are unaffected", t => {
  const { room, receipt } = fixture(t);
  t.mock.method(Math, "random", () => 0);
  room.handleMessage("c", { type: "CAST_VOTE", targetId: "b" });
  assert.equal(receipt("c").targetId, "b");
  assert.equal(receipt("c").shifted, false);
  room.handleMessage("a", { type: "CAST_VOTE", targetId: null });
  assert.equal(receipt("a").targetId, null);
  assert.equal(receipt("a").shifted, false);
  room.startMeeting("EMERGENCY MEETING CALLED", "A");
  room.votingOpensAt = 0;
  room.handleMessage("a", { type: "CAST_VOTE", targetId: "b" });
  assert.equal(receipt("a").targetId, "b");
  assert.equal(receipt("a").shifted, false);
});

test("invalid votes do not spend a roll and dead players cannot receive a shifted vote", t => {
  const { room, receipt } = fixture(t);
  room.players.get("c").alive = false;
  let rolls = 0;
  t.mock.method(Math, "random", () => { rolls++; return 0; });
  room.handleMessage("a", { type: "CAST_VOTE", targetId: "missing" });
  assert.equal(receipt("a").accepted, false);
  assert.equal(rolls, 0);
  room.handleMessage("a", { type: "CAST_VOTE", targetId: "b" });
  assert.equal(receipt("a").targetId, "d");
});

test("a departed destination becomes a skip and updates the voter's private receipt", t => {
  const { room, receipt } = fixture(t);
  t.mock.method(Math, "random", () => 0);
  room.handleMessage("a", { type: "CAST_VOTE", targetId: "b" });
  room.removeClient("c");
  assert.equal(room.votes.get("a"), null);
  assert.deepEqual(receipt("a"), { type: "VOTE_RECEIPT", accepted: true, targetId: null, shifted: false });
});
