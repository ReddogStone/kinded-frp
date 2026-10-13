import assert from "node:assert/strict";

export const concat = (left, right) => [...left, ...right];

export const split = (width, row) => [row.slice(0, width), row.slice(width)];

export const empty = (shape) => shape.map(({ monoid }) => monoid.empty);

export const combine = (shape) => (older, newer) => {
  assert.equal(older.length, shape.length);
  assert.equal(newer.length, shape.length);
  return shape.map(({ monoid }, index) =>
    monoid.combine(older[index], newer[index]),
  );
};

export const monoid = (shape) => ({
  empty: empty(shape),
  combine: combine(shape),
});
