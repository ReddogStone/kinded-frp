export const Nothing = Symbol("nothing");

export const last = {
  empty: Nothing,
  combine: (older, newer) => (newer === Nothing ? older : newer),
};

export const sum = { empty: 0, combine: (a, b) => a + b };

export const any = { empty: false, combine: (a, b) => a || b };

export const list = { empty: [], combine: (a, b) => [...a, ...b] };
