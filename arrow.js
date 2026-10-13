import assert from "node:assert/strict";
import { category, read, write } from "./resumption.js";
import { unit } from "./kind.js";
import * as row from "./row.js";

export const morphism = (inputs, outputs, resumption) => ({
  inputs,
  outputs,
  resumption,
});

export const cell = (state, delta) => ({ state, delta });
const delta = ({ delta }) => delta;

const wiring = (shape, states, deltas) => ({
  cells: states.map((state, index) => cell(state, deltas[index])),
  step: (written) =>
    wiring(
      shape,
      shape.map(({ act }, index) => act(states[index], written[index])),
      written,
    ),
});
export const wire = (shape) =>
  wiring(
    shape,
    shape.map(({ initial }) => initial),
    row.empty(shape),
  );

export const rekindle = (shape, cells) =>
  cells.map((current, index) =>
    shape[index].initial === unit ? current : cell(current.state, current.state),
  );

export const feed = (f, cells) => {
  const { output, rest } = category(row.monoid(f.outputs)).feed(
    f.resumption,
    cells,
  );
  return { output, rest: { ...f, resumption: rest } };
};

const unlessDone = (f, next) =>
  f.resumption.type === "done" ? f.resumption : next;

export const stepping = (step) =>
  read((cells) => {
    const { output, rest } = step(cells);
    return write(output, rest);
  });
export const born = (shape, step) => {
  const { output, rest } = step(wire(shape).cells);
  return write(output, rest);
};

const piping = (f, wire, g) => (cells) => {
  const upstream = feed(f, cells);
  const wired = wire.step(upstream.output);
  const downstream = feed(g, wired.cells);
  return {
    output: downstream.output,
    rest: unlessDone(
      downstream.rest,
      unlessDone(
        upstream.rest,
        stepping(piping(upstream.rest, wired, downstream.rest)),
      ),
    ),
  };
};
export const pipe = (f, g) => {
  assert.deepEqual(f.outputs, g.inputs);
  return morphism(
    f.inputs,
    g.outputs,
    born(f.inputs, piping(f, wire(f.outputs), g)),
  );
};

const firsting = (f) => (cells) => {
  const [head, tail] = row.split(f.inputs.length, cells);
  const stepped = feed(f, head);
  return {
    output: row.concat(stepped.output, tail.map(delta)),
    rest: unlessDone(stepped.rest, stepping(firsting(stepped.rest))),
  };
};
export const first = (f, tail) => {
  const inputs = row.concat(f.inputs, tail);
  return morphism(inputs, row.concat(f.outputs, tail), born(inputs, firsting(f)));
};

const looping = (f, outputWidth, wire) => (cells) => {
  const stepped = feed(f, row.concat(cells, wire.cells));
  const [output, fed] = row.split(outputWidth, stepped.output);
  return {
    output,
    rest: unlessDone(
      stepped.rest,
      stepping(looping(stepped.rest, outputWidth, wire.step(fed))),
    ),
  };
};
export const feedback = (f, count) => {
  const inputWidth = f.inputs.length - count;
  const outputWidth = f.outputs.length - count;
  const inputs = f.inputs.slice(0, inputWidth);
  const fed = f.inputs.slice(inputWidth);
  assert.deepEqual(f.outputs.slice(outputWidth), fed);
  return morphism(
    inputs,
    f.outputs.slice(0, outputWidth),
    born(inputs, looping(f, outputWidth, wire(fed))),
  );
};

const forward = (pick) =>
  read((cells) => write(pick(cells).map(delta), forward(pick)));
export const id = (shape) => morphism(shape, shape, forward((cells) => cells));
export const reorder = (shape, indices) =>
  morphism(
    shape,
    indices.map((index) => shape[index]),
    forward((cells) => indices.map((index) => cells[index])),
  );

const running = (f, wire) => (cells) => {
  const stepped = feed(f, cells);
  const wired = wire.step(stepped.output);
  const { resumption } = stepped.rest;
  return {
    outputs: wired.cells,
    ended: resumption.type === "done" ? resumption : undefined,
    step: running(stepped.rest, wired),
  };
};
export const run = (f) => running(f, wire(f.outputs));
