import { first, id, pipe, reorder } from "./arrow.js";
import * as row from "./row.js";

const indices = (count) => [...new Array(count).keys()];

export const graph = (inputs, build) => {
  let shape = inputs;
  let compiled = id(inputs);
  const use = (f, sources) => {
    const width = shape.length;
    const added = f.outputs.length;
    const gather = reorder(shape, [...sources, ...indices(width)]);
    const apply = first(f, shape);
    const append = reorder(row.concat(f.outputs, shape), [
      ...indices(width).map((index) => index + added),
      ...indices(added),
    ]);
    compiled = pipe(pipe(pipe(compiled, gather), apply), append);
    shape = row.concat(shape, f.outputs);
    return indices(added).map((index) => width + index);
  };
  const outputs = build(use, ...indices(inputs.length));
  return pipe(compiled, reorder(shape, outputs));
};

export const signal = (f, watcher) =>
  graph(f.inputs, (use, ...inputs) => {
    const outputs = use(f, inputs);
    use(watcher, [...inputs, ...outputs]);
    return outputs;
  });
