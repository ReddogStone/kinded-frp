export const unit = Symbol("unit");

export const kind = (monoid, initial, act) => ({ monoid, initial, act });

const forget = () => unit;

export const event = (monoid) => kind(monoid, unit, forget);

export const value = (monoid) => kind(monoid, monoid.empty, monoid.combine);
