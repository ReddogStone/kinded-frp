import assert from "node:assert/strict";
import { Nothing } from "./monoid.js";
import { kind } from "./kind.js";
import {
  born,
  feed,
  feedback,
  morphism,
  rekindle,
  run,
  stepping,
} from "./arrow.js";
import { behaviour } from "./behaviour.js";
import { graph, signal } from "./graph.js";
import {
  EVENT,
  VALUE,
  constant,
  fired,
  fold,
  idle,
  isHot,
  lift,
  sample,
  silent,
} from "./leaves.js";

const Gone = Symbol("gone");
const familyMonoid = {
  empty: new Map(),
  combine: (older, newer) => new Map([...older, ...newer]),
};
const applyFamily = (state, delta) => {
  const next = new Map(state);
  for (const [id, value] of delta) value === Gone ? next.delete(id) : next.set(id, value);
  return next;
};
const FAMILY = kind(familyMonoid, new Map(), applyFamily);

const pooling = (make, items, nextId) => (cells) => {
  const [birth, ...shared] = cells;
  const delta = new Map();
  const survivors = new Map();
  for (const [id, item] of items) {
    const stepped = feed(item, shared);
    const [position] = stepped.output;
    if (position !== Nothing) delta.set(id, position);
    if (stepped.rest.resumption.type === "done") delta.set(id, Gone);
    else survivors.set(id, stepped.rest);
  }
  let id = nextId;
  if (isHot(birth)) {
    const stepped = feed(make(birth.delta), rekindle(itemInputs, shared));
    delta.set(id, stepped.output[0]);
    if (stepped.rest.resumption.type !== "done") survivors.set(id, stepped.rest);
    id += 1;
  }
  return { output: [delta], rest: stepping(pooling(make, survivors, id)) };
};
const pool = (shared, make) => {
  const inputs = [EVENT, ...shared];
  return morphism(inputs, [FAMILY], born(inputs, pooling(make, new Map(), 0)));
};

const never = morphism([], [EVENT], idle);

const SPEED = 5;
const MAX_TURN = 0.5;
const HIT = 5;
const WORLD = 100;
const UP = -Math.PI / 2;

const distance = ([ax, ay], [bx, by]) => Math.hypot(ax - bx, ay - by);
const outside = ([x, y]) => x < 0 || x > WORLD || y < 0 || y > WORLD;
const advance = ({ position: [x, y], heading }, dt) => ({
  position: [x + Math.cos(heading) * SPEED * dt, y + Math.sin(heading) * SPEED * dt],
  heading,
});
const turnToward = ({ position, heading }, [tx, ty], dt) => {
  const desired = Math.atan2(ty - position[1], tx - position[0]);
  const difference = Math.atan2(Math.sin(desired - heading), Math.cos(desired - heading));
  const turn = Math.max(-MAX_TURN * dt, Math.min(MAX_TURN * dt, difference));
  return { position, heading: heading + turn };
};
const straight = (state) => state;

const itemInputs = [EVENT, VALUE, EVENT];
const itemOutputs = [VALUE, VALUE];

const flying = (start, steer) =>
  graph(itemInputs, (use, tick, target) => {
    const [aimed] = use(sample, [tick, target]);
    const [state] = use(
      fold(start, (current, [targetPosition, dt]) =>
        advance(steer(current, targetPosition, dt), dt),
      ),
      [aimed],
    );
    const [position] = use(lift(1, ({ position }) => position), [state]);
    const [heading] = use(lift(1, ({ heading }) => heading), [state]);
    return [position, heading];
  });

const watchingItem = behaviour([...itemInputs, ...itemOutputs], []);
const item = behaviour(itemInputs, itemOutputs);
const projectile = (start) =>
  item.flow(
    item.Do,
    item.bindAs("homing", () =>
      signal(
        flying({ position: start, heading: UP }, turnToward),
        watchingItem.waitFor(([, , died]) => isHot(died)),
      ),
    ),
    item.then(({ homing: [, , , position, heading] }) =>
      signal(
        flying({ position: position.state, heading: heading.state }, straight),
        watchingItem.waitFor(([, , , position]) => outside(position.state)),
      ),
    ),
  );

const CENTER = [50, 50];
const RADIUS = 20;
const ANGULAR = 0.1;

const targetInputs = [EVENT, FAMILY];
const targetOutputs = [VALUE, VALUE, EVENT];

const circling = graph(targetInputs, (use, tick) => {
  const [angle] = use(fold(0, (current, dt) => current + ANGULAR * dt), [tick]);
  const [position] = use(
    lift(1, (current) => [
      CENTER[0] + RADIUS * Math.cos(current),
      CENTER[1] + RADIUS * Math.sin(current),
    ]),
    [angle],
  );
  const [alive] = use(constant(true), []);
  return [position, alive, ...use(never, [])];
});
const dead = (position) =>
  graph(targetInputs, (use) => [
    ...use(constant(position), []),
    ...use(constant(false), []),
    ...use(never, []),
  ]);
const hitBy = (positions, position) =>
  [...positions.values()].some((other) => distance(other, position) < HIT);

const watchingTarget = behaviour([...targetInputs, ...targetOutputs], []);
const life = behaviour(targetInputs, targetOutputs);
const target = life.flow(
  life.Do,
  life.bindAs("alive", () =>
    signal(
      circling,
      watchingTarget.waitFor(([, positions, position]) =>
        hitBy(positions.state, position.state),
      ),
    ),
  ),
  life.also(() => life.emit(2, true)),
  life.then(({ alive: [, , position] }) => dead(position.state)),
);

const body = graph(
  [EVENT, EVENT, VALUE, FAMILY],
  (use, tick, click, previousTarget, previousPositions) => {
    const [targetPosition, alive, died] = use(target, [tick, previousPositions]);
    const [positions] = use(pool(itemInputs, projectile), [
      click,
      tick,
      previousTarget,
      died,
    ]);
    return [targetPosition, alive, positions, targetPosition, positions];
  },
);
const game = feedback(body, 2);

{
  assert.deepEqual(game.inputs, [EVENT, EVENT]);
  assert.deepEqual(game.outputs, [VALUE, VALUE, FAMILY]);

  const tick = [fired(1), silent];
  const click = (point) => [silent, fired(point)];
  const view = ({ outputs: [position, alive, positions] }) => ({
    target: position.state,
    alive: alive.state,
    flying: positions.state.size,
  });

  let world = run(game)([silent, silent]);
  assert.deepEqual(view(world), { target: [70, 50], alive: true, flying: 0 });

  world = world.step(tick);
  world = world.step(tick);
  assert.equal(view(world).flying, 0);

  world = world.step(click([50, 90]));
  assert.equal(view(world).flying, 1);
  assert.deepEqual(world.outputs[2].state.get(0), [50, 90]);

  let ticks = 0;
  while (view(world).alive && ticks < 200) {
    world = world.step(tick);
    ticks += 1;
  }
  assert.equal(view(world).alive, false);
  assert.equal(view(world).flying, 1);
  assert.ok(ticks < 40, `took ${ticks} ticks to hit`);

  const struck = view(world).target;
  while (view(world).flying > 0 && ticks < 200) {
    world = world.step(tick);
    ticks += 1;
  }
  assert.equal(view(world).flying, 0);
  assert.deepEqual(view(world).target, struck);
  assert.ok(ticks < 100, `took ${ticks} ticks in total`);
}

console.log("game ok");
