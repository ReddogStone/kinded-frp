import { Nothing } from "./monoid.js";
import { bind, done, read, write } from "./resumption.js";
import { morphism, rekindle } from "./arrow.js";
import * as row from "./row.js";

const idling = read(() => idling);

const triggered = (cells) => cells.some(({ delta }) => delta !== Nothing);
const waiting = (condition) =>
  read((cells) =>
    triggered(cells) && condition(cells) ? done(cells) : waiting(condition),
  );

const newborn = (inputs, resumption) => {
  switch (resumption.type) {
    case "write":
      return write(resumption.output, newborn(inputs, resumption.next));
    case "read":
      return read((cells) => resumption.read(rekindle(inputs, cells)));
    case "done":
      return resumption;
  }
};

export const behaviour = (inputs, outputs) => {
  const phase = (resumption) => morphism(inputs, outputs, resumption);
  const pure = (value) => phase(done(value));
  const chain = (f, next) =>
    phase(
      bind(f.resumption, (result) => newborn(inputs, next(result).resumption)),
    );

  const flow = (start, ...steps) => steps.reduce((acc, step) => step(acc), start);
  const then = (next) => (acc) => chain(acc, next);
  const also = (make) => (acc) =>
    chain(acc, (context) => chain(make(context), () => pure(context)));
  const bindAs = (name, make) => (acc) =>
    chain(acc, (context) =>
      chain(make(context), (value) => pure({ ...context, [name]: value })),
    );

  const emit = (index, payload) =>
    phase(write(row.empty(outputs).with(index, payload), done()));
  const waitFor = (condition) => phase(waiting(condition));

  return {
    Do: pure({}),
    idle: phase(idling),
    flow,
    then,
    also,
    bindAs,
    emit,
    waitFor,
  };
};
