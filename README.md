# The crossing

A synchronous reactive core in nine small JavaScript files, with one idea in it:
the memory of a column is a *kind*, a per-column quotient of the causal-stream
comonad, and kinds of different shape coexist in one program.

    node game.js

prints `resumption ok`, `leaves ok`, `game ok`. The tests are inline and are the
laws. No dependencies beyond Node.

## The four definitions

    kind K = (M, X, i, act, replay)        M a monoid of changes, X a set of memories
      act e        = id                     (K1)
      act (a <> b) = act b . act a          (K2)
      act (replay x) i = x                  (K3)

    phi_K : M+ -> X x M                    a history of changes to a cell
      phi (m1 .. mn) = (act mn (.. (act m1 i)), mn)

    wire_K  = extend phi_K                 the stream comonad's extend, per kind
    pipe f g = g . extend f                co-Kleisli composition; never looks in a column

A box reads cells `(state, delta)` of shape `S` (a list of kinds), writes deltas of
shape `T`, and may end with a value `V`:

    Res_{S,T}(V)  =  nu R.  M_T x ( V + (C_S -> R) )

`V` is the monad (phases, `bind`), `(S, T)` is the category (`pipe`), `M_T` is the
row monoid (writes within an instant combine). `CROSSING.md` has the proofs.

## Files

| file            | holds                                                              |
|-----------------|--------------------------------------------------------------------|
| `monoid.js`     | `last`, `sum`, `any`, `list`; `Nothing` is `last.empty`            |
| `kind.js`       | `kind(monoid, initial, act)`; `event(m)`, `value(m)`               |
| `row.js`        | shapes as lists of kinds; the product monoid                       |
| `resumption.js` | `done | read | write`, `bind`; `category(monoid)`; the laws        |
| `arrow.js`      | morphism, cell, wire, `pipe`, `first`, `feedback`, `id`, `reorder` |
| `graph.js`      | graph notation over the arrow; `signal(f, watcher)`                |
| `behaviour.js`  | do-notation over morphisms of one shape; `rekindle` on switch      |
| `leaves.js`     | `constant`, `hold`, `fold`, `previous`, `lift`, `sample`, `changes`|
| `game.js`       | a circling target, homing projectiles born at clicks, a pool       |

Each file imports only the ones above it.
