import assert from "node:assert/strict";
import { Nothing, last } from "./monoid.js";
import { event, value, unit } from "./kind.js";
import { bind, done, read, write } from "./resumption.js";
import {
  cell,
  feedback,
  first,
  id,
  morphism,
  pipe,
  reorder,
  run,
} from "./arrow.js";

export const EVENT = event(last);
export const VALUE = value(last);

export const fired = (payload) => cell(unit, payload);
export const silent = cell(unit, Nothing);
export const hot = (current) => cell(current, current);
export const cold = (current) => cell(current, Nothing);
export const blank = cell(Nothing, Nothing);

export const isHot = ({ delta }) => delta !== Nothing;
export const present = ({ state }) => {
  assert.notEqual(state, Nothing);
  return state;
};

export const idle = read(() => idle);
export const forever = (reaction) =>
  read((cells) => write(reaction(cells), forever(reaction)));
const stateless = (inputs, outputs, reaction) =>
  morphism(inputs, outputs, forever(reaction));

export const constant = (current) =>
  morphism([], [VALUE], write([current], idle));

export const hold = (seed) =>
  morphism(
    [EVENT],
    [VALUE],
    write([seed], forever(([trigger]) => [trigger.delta])),
  );

const folding = (total, step) =>
  read(([trigger]) => {
    if (!isHot(trigger)) return write([Nothing], folding(total, step));
    const next = step(total, trigger.delta);
    return write([next], folding(next, step));
  });
export const fold = (seed, step) =>
  morphism([EVENT], [VALUE], write([seed], folding(seed, step)));

export const previous = (seed) =>
  morphism(
    [EVENT, VALUE],
    [VALUE],
    write(
      [seed],
      forever(([tick, current]) => [isHot(tick) ? present(current) : Nothing]),
    ),
  );

export const lift = (width, f) =>
  stateless(new Array(width).fill(VALUE), [VALUE], (cells) => [
    cells.some(isHot) ? f(...cells.map(present)) : Nothing,
  ]);

export const sample = stateless(
  [EVENT, VALUE],
  [EVENT],
  ([trigger, current]) => [
    isHot(trigger) ? [present(current), trigger.delta] : Nothing,
  ],
);

export const changes = stateless([VALUE], [EVENT], ([current]) => [
  current.delta,
]);

{
  const c0 = run(constant(5))([]);
  assert.deepEqual(c0.outputs, [hot(5)]);
  assert.deepEqual(c0.step([]).outputs, [cold(5)]);

  const h0 = run(hold(0))([silent]);
  assert.deepEqual(h0.outputs, [hot(0)]);
  const h1 = h0.step([fired(9)]);
  assert.deepEqual(h1.outputs, [hot(9)]);
  const h2 = h1.step([silent]);
  assert.deepEqual(h2.outputs, [cold(9)]);
  assert.deepEqual(h2.step([fired(9)]).outputs, [hot(9)]);
  assert.deepEqual(h1.step([silent]).outputs, h2.outputs);
  assert.deepEqual(run(hold(0))([fired(4)]).outputs, [hot(4)]);

  const f0 = run(fold(0, (count) => count + 1))([silent]);
  assert.deepEqual(f0.outputs, [hot(0)]);
  const f1 = f0.step([fired(true)]);
  assert.deepEqual(f1.outputs, [hot(1)]);
  assert.deepEqual(f1.step([silent]).outputs, [cold(1)]);

  const p0 = run(previous(-1))([silent, hot(7)]);
  assert.deepEqual(p0.outputs, [hot(-1)]);
  const p1 = p0.step([fired(true), cold(7)]);
  assert.deepEqual(p1.outputs, [hot(7)]);
  const p2 = p1.step([silent, hot(8)]);
  assert.deepEqual(p2.outputs, [cold(7)]);
  assert.deepEqual(p2.step([fired(true), hot(8)]).outputs, [hot(8)]);

  const add = lift(2, (a, b) => a + b);
  assert.deepEqual(add.inputs, [VALUE, VALUE]);
  const l0 = run(add)([hot(2), hot(1)]);
  assert.deepEqual(l0.outputs, [hot(3)]);
  const l1 = l0.step([hot(2), cold(1)]);
  assert.deepEqual(l1.outputs, [hot(3)]);
  const l2 = l1.step([cold(2), hot(5)]);
  assert.deepEqual(l2.outputs, [hot(7)]);
  assert.deepEqual(l2.step([cold(2), cold(5)]).outputs, [cold(7)]);
  assert.throws(() => run(add)([hot(1), blank]));

  const s0 = run(sample)([silent, hot(1)]);
  assert.deepEqual(s0.outputs, [silent]);
  assert.deepEqual(s0.step([fired("q"), cold(1)]).outputs, [fired([1, "q"])]);

  const g0 = run(changes)([hot(1)]);
  assert.deepEqual(g0.outputs, [fired(1)]);
  assert.deepEqual(g0.step([cold(1)]).outputs, [silent]);

  const i0 = run(id([EVENT, VALUE]))([silent, hot(1)]);
  assert.deepEqual(i0.outputs, [silent, hot(1)]);

  const chain = pipe(pipe(hold(0), changes), hold(-1));
  assert.deepEqual(chain.inputs, [EVENT]);
  assert.deepEqual(chain.outputs, [VALUE]);
  const q0 = run(chain)([silent]);
  assert.deepEqual(q0.outputs, [hot(0)]);
  const q1 = q0.step([fired(9)]);
  assert.deepEqual(q1.outputs, [hot(9)]);
  assert.deepEqual(q1.step([silent]).outputs, [cold(9)]);

  const through = pipe(pipe(constant(5), changes), hold("seed"));
  const k0 = run(through)([]);
  assert.deepEqual(k0.outputs, [hot(5)]);
  assert.deepEqual(k0.step([]).outputs, [cold(5)]);

  assert.throws(() => pipe(hold(0), hold(0)));
  assert.throws(() => pipe(changes, changes));

  const heldHead = first(hold(0), [EVENT]);
  assert.deepEqual(heldHead.inputs, [EVENT, EVENT]);
  assert.deepEqual(heldHead.outputs, [VALUE, EVENT]);
  const r0 = run(heldHead)([silent, fired("tail")]);
  assert.deepEqual(r0.outputs, [hot(0), fired("tail")]);
  assert.deepEqual(r0.step([fired(7), silent]).outputs, [hot(7), silent]);

  const both = pipe(
    pipe(
      pipe(heldHead, reorder([VALUE, EVENT], [1, 0])),
      first(hold(1), [VALUE]),
    ),
    reorder([VALUE, VALUE], [1, 0]),
  );
  assert.deepEqual(both.inputs, [EVENT, EVENT]);
  assert.deepEqual(both.outputs, [VALUE, VALUE]);
  const t0 = run(both)([silent, silent]);
  assert.deepEqual(t0.outputs, [hot(0), hot(1)]);
  assert.deepEqual(t0.step([fired(5), silent]).outputs, [hot(5), cold(1)]);
  assert.deepEqual(t0.step([silent, fired(6)]).outputs, [cold(0), hot(6)]);

  const summed = pipe(both, add);
  const v0 = run(summed)([silent, silent]);
  assert.deepEqual(v0.outputs, [hot(1)]);
  const v1 = v0.step([silent, silent]);
  assert.deepEqual(v1.outputs, [cold(1)]);
  const v2 = v1.step([fired(5), silent]);
  assert.deepEqual(v2.outputs, [hot(6)]);
  assert.deepEqual(v2.step([silent, silent]).outputs, [cold(6)]);

  const atClick = pipe(
    pipe(first(hold(0), [EVENT]), reorder([VALUE, EVENT], [1, 0])),
    sample,
  );
  const u0 = run(atClick)([silent, fired("down")]);
  assert.deepEqual(u0.outputs, [fired([0, "down"])]);
  assert.deepEqual(u0.step([fired(3), silent]).outputs, [silent]);
  assert.deepEqual(u0.step([fired(3), fired("down")]).outputs, [
    fired([3, "down"]),
  ]);

  const counter = feedback(
    pipe(first(hold(0), [VALUE]), reorder([VALUE, VALUE], [0, 1, 0])),
    1,
  );
  assert.deepEqual(counter.inputs, [EVENT]);
  assert.deepEqual(counter.outputs, [VALUE, VALUE]);
  const n0 = run(counter)([silent]);
  assert.deepEqual(n0.outputs, [hot(0), hot(0)]);
  const n1 = n0.step([fired(1)]);
  assert.deepEqual(n1.outputs, [hot(1), cold(0)]);
  const n2 = n1.step([fired(1)]);
  assert.deepEqual(n2.outputs, [hot(1), hot(1)]);
  const n3 = n2.step([fired(2)]);
  assert.deepEqual(n3.outputs, [hot(2), hot(1)]);
  const n4 = n3.step([silent]);
  assert.deepEqual(n4.outputs, [cold(2), hot(2)]);
  assert.deepEqual(n4.step([silent]).outputs, [cold(2), cold(2)]);

  assert.throws(() =>
    feedback(
      pipe(
        first(hold(0), [VALUE]),
        pipe(reorder([VALUE, VALUE], [0, 1, 0]), first(add, [VALUE])),
      ),
      1,
    ),
  );

  const ending = read(([trigger]) =>
    isHot(trigger) ? write([trigger.delta], done(trigger.delta)) : ending,
  );
  const once = morphism([EVENT], [EVENT], ending);
  const afterwards = (ending) =>
    morphism(
      ending.inputs,
      ending.outputs,
      bind(ending.resumption, (payload) =>
        forever(() => ending.outputs.map(() => payload)),
      ),
    );
  const twoInstants = (ending, ...rows) => {
    const born = run(afterwards(ending))(rows[0]);
    return [born.outputs, born.step(rows[1]).outputs];
  };
  assert.equal(run(hold(0))([silent]).ended, undefined);
  assert.deepEqual(run(once)([fired(1)]).ended, done(1));
  assert.deepEqual(run(pipe(once, id([EVENT])))([fired(1)]).ended, done(1));
  assert.deepEqual(run(first(once, [VALUE]))([fired(1), hot(2)]).ended, done(1));
  assert.deepEqual(twoInstants(once, [fired(1)], [silent]), [
    [fired(1)],
    [fired(1)],
  ]);
  assert.deepEqual(twoInstants(pipe(once, id([EVENT])), [fired(1)], [silent]), [
    [fired(1)],
    [fired(1)],
  ]);
  assert.deepEqual(twoInstants(pipe(id([EVENT]), once), [fired(1)], [silent]), [
    [fired(1)],
    [fired(1)],
  ]);
  assert.deepEqual(
    twoInstants(first(once, [VALUE]), [fired(1), hot(2)], [silent, cold(2)]),
    [
      [fired(1), hot(2)],
      [fired(1), hot(1)],
    ],
  );

  const until = (limit) =>
    read(([trigger]) =>
      isHot(trigger) && trigger.delta >= limit
        ? write([trigger.delta, Nothing], done(trigger.delta))
        : write([trigger.delta, Nothing], until(limit)),
    );
  const tenfold = forever(([trigger]) => [
    isHot(trigger) ? trigger.delta * 10 : Nothing,
    Nothing,
  ]);
  const phased = morphism(
    [EVENT],
    [VALUE, EVENT],
    write(
      [0, Nothing],
      bind(until(3), (total) => write([total * 10, "switched"], tenfold)),
    ),
  );
  const z0 = run(phased)([silent]);
  assert.deepEqual(z0.outputs, [hot(0), silent]);
  const z1 = z0.step([fired(1)]);
  assert.deepEqual(z1.outputs, [hot(1), silent]);
  const z2 = z1.step([fired(3)]);
  assert.deepEqual(z2.outputs, [hot(30), fired("switched")]);
  const z3 = z2.step([fired(4)]);
  assert.deepEqual(z3.outputs, [hot(40), silent]);
  assert.deepEqual(z3.step([silent]).outputs, [cold(40), silent]);
}

console.log("leaves ok");
