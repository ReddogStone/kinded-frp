import assert from "node:assert/strict";

export const done = (value) => ({ type: "done", value });
export const read = (next) => ({ type: "read", read: next });
export const write = (output, next) => ({ type: "write", output, next });
export const pure = done;

export const bind = (resumption, next) => {
  switch (resumption.type) {
    case "done":
      return next(resumption.value);
    case "read":
      return read((input) => bind(resumption.read(input), next));
    case "write":
      return write(resumption.output, bind(resumption.next, next));
  }
};

export const category = (monoid) => {
  const settle = (resumption, output = monoid.empty) =>
    resumption.type === "write"
      ? settle(resumption.next, monoid.combine(output, resumption.output))
      : { output, rest: resumption };

  const feed = (resumption, input) => {
    const pending = settle(resumption);
    return pending.rest.type === "read"
      ? settle(pending.rest.read(input), pending.output)
      : pending;
  };

  const id = read((input) => write(input, id));

  const lift = (f) => read((input) => write(f(input), lift(f)));

  const scan = (total = monoid.empty) =>
    read((input) => {
      const next = monoid.combine(total, input);
      return write(next, scan(next));
    });

  const pipe = (f, g) => {
    switch (g.type) {
      case "write":
        return write(g.output, pipe(f, g.next));
      case "done":
        return g;
      case "read": {
        if (f.type === "done") return f;
        const pending = settle(f);
        if (pending.rest.type === "done")
          return pipe(pending.rest, g.read(pending.output));
        return read((input) => {
          const { output, rest } = feed(f, input);
          return pipe(rest, g.read(output));
        });
      }
    }
  };

  return { settle, feed, id, lift, scan, pipe };
};

{
  const Sum = { empty: 0, combine: (a, b) => a + b };
  const Cat = { empty: [], combine: (a, b) => [...a, ...b] };
  const Any = { empty: false, combine: (a, b) => a || b };

  const trace = (monoid, resumption, inputs) => {
    const { feed } = category(monoid);
    return inputs.reduce(
      ({ outputs, resumption }, input) => {
        const { output, rest } = feed(resumption, input);
        return { outputs: [...outputs, output], resumption: rest };
      },
      { outputs: [], resumption },
    );
  };
  const same = (monoid, inputs, ...resumptiones) => {
    const [expected, ...others] = resumptiones.map(
      (resumption) => trace(monoid, resumption, inputs).outputs,
    );
    for (const outputs of others) assert.deepEqual(outputs, expected);
  };

  const twice = read((input) => write(input, write(input, twice)));
  const sums = category(Sum);
  assert.deepEqual(trace(Sum, sums.id, [1, 2, 3]).outputs, [1, 2, 3]);
  assert.deepEqual(trace(Sum, twice, [1, 2, 3]).outputs, [2, 4, 6]);
  assert.deepEqual(trace(Cat, twice, [[1], [2]]).outputs, [
    [1, 1],
    [2, 2],
  ]);
  assert.deepEqual(trace(Any, twice, [true, false]).outputs, [true, false]);
  assert.deepEqual(
    trace(
      Sum,
      sums.lift((x) => x * 10),
      [1, 2],
    ).outputs,
    [10, 20],
  );
  assert.deepEqual(trace(Sum, sums.scan(), [1, 2, 3]).outputs, [1, 3, 6]);
  assert.deepEqual(trace(Cat, category(Cat).scan(), [[1], [2]]).outputs, [
    [1],
    [1, 2],
  ]);

  assert.deepEqual(trace(Sum, sums.pipe(twice, twice), [1, 2]).outputs, [4, 8]);
  assert.deepEqual(trace(Cat, category(Cat).pipe(twice, twice), [[1]]).outputs, [
    [1, 1, 1, 1],
  ]);

  const inputs = [1, 2, 3, 4];
  same(
    Sum,
    inputs,
    twice,
    sums.pipe(sums.id, twice),
    sums.pipe(twice, sums.id),
  );
  const seeded = write(7, twice);
  const negate = sums.lift((x) => -x);
  same(
    Sum,
    inputs,
    sums.pipe(sums.pipe(seeded, sums.scan()), negate),
    sums.pipe(seeded, sums.pipe(sums.scan(), negate)),
  );
  assert.deepEqual(
    trace(Sum, sums.pipe(seeded, sums.scan()), inputs).outputs,
    [9, 13, 19, 27],
  );

  const until = (limit) =>
    read((input) =>
      input >= limit ? write(input, done(input)) : write(input, until(limit)),
    );
  const phased = bind(until(3), (value) => write(value * 10, sums.id));
  assert.deepEqual(trace(Sum, phased, inputs).outputs, [1, 2, 33, 4]);
  same(
    Sum,
    inputs,
    phased,
    bind(phased, pure),
    bind(pure(3), () => phased),
  );

  const once = read((input) => write(input, done("once")));
  const finished = ({ output, rest }) => [output, rest];
  assert.deepEqual(finished(sums.feed(once, 5)), [5, done("once")]);
  assert.deepEqual(finished(sums.feed(sums.pipe(once, sums.id), 5)), [
    5,
    done("once"),
  ]);
  assert.deepEqual(finished(sums.feed(sums.pipe(sums.id, once), 5)), [
    5,
    done("once"),
  ]);
  assert.deepEqual(
    finished(
      sums.settle(
        sums.pipe(
          write(3, done("pre")),
          sums.lift((x) => x * 2),
        ),
      ),
    ),
    [6, done("pre")],
  );
}

console.log("resumption ok");
