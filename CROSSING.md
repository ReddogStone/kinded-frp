# The crossing

A monad and a comonad on one morphism, and the kind that makes it finite.

Written against the files in this repository, 2026-10-13. Everything below is checked against that code; where the code and the
math differ, the difference is named.

## 0. The statement

A synchronous reactive program with switching is one object:

    Res_{S,T}(V)  ≅  ν R.  M_T × ( V  +  (C_S → R) )

a resumption that reads cells of shape `S`, writes deltas of shape `T`, and may end with
a value `V`. The three parts of that type are the three structures.

- **Along `V` it is a monad.** `bind` is phase switching. Its unit law forces the rule
  "writes before the first read belong to the first instant".
- **Along `(S, T)` with `V = 0` it is a category**, and that category is the co-Kleisli
  category of the causal-stream comonad (Uustalu–Vene). `pipe` is co-Kleisli
  composition, `id` is `extract`, and the category laws are the comonad laws.
- **`M_T` is a monoid**, the row monoid: a product of the columns' change monoids.
  Writes within one instant combine in it. For a plain value that is "last wins".

The kind is what makes the comonad finite. A kind `K = (M, X, i, act, replay)` is a
compression of the stream comonad: a map `φ_K : M⁺ → X × M` from histories to cells.
Its three laws do three jobs:

- (K1, K2) `act` is a monoid action, so compressing commutes with merging the writes of
  an instant: the instant quotient is invisible to memory.
- (K3) `act (replay x) i = x`, so compressing commutes with phase switching: a box born
  late sees a legitimate history (the latecomer lemma).

Because `pipe` is co-Kleisli composition, `extend extract = id` says a wire that follows
a wire adds nothing. Hence the memory of any program built by `pipe`, `first`,
`reorder` and `feedback` is exactly one `φ_K` per column, and nothing else is state.
That is the flat row.

The rest of this note proves these, in order: kinds (§1), the comonad (§2), resumptions
and the monad (§3), the category and `pipe` (§4), the latecomer lemma (§5), the flat row
(§6), `feedback` and `pre` (§7), ending and `signal` (§8), what is still open (§9).

## 1. Kinds

A **kind** is `K = (M, X, i, act, replay)` with

- `(M, <>, e)` a monoid, the *changes*;
- `X` a set, the *memories*, with `i ∈ X` the initial memory;
- `act : M → X → X` such that
  - (K1) `act e = id_X`,
  - (K2) `act (a <> b) = act b ∘ act a`;
- `replay : X → M` such that
  - (K3) `act (replay x) i = x`.

(K1, K2) say `act` is a right monoid action: `X` is an `M`-set. (K3) says every memory
is reachable from `i` in one step; it is the half of Cai and Giarrusso's `⊖` that
starts at `i`. A change action in the sense of Alvarez-Picallo and Ong is (K1, K2);
(K3) is ours.

The two constructors in `kind.js`:

- `event(M)`: `X = 1`, `i = ()`, `act _ () = ()`. (K1, K2) are trivial. `replay () = e`;
  (K3): `act e i = i` by (K1). An event has no memory, so its replay is the empty change.
- `value(M)`: `X = M`, `i = e`, `act = flip (<>)`, i.e. `act m x = x <> m`. (K1) by the
  unit law, (K2) by associativity. `replay = id`; (K3): `act x e = e <> x = x`.

So for both constructors `replay` is forced. The code's `rekindle` uses
`initial === unit ? cell : cell(state, state)`, which is exactly `replay` for both:
`e` for events (the cell is left cold) and `id` for values (`delta := state`). The
hack in the code is the theorem's own formula. The `FAMILY` kind in `game.js` is a
`value` over right-biased map union with `Gone` as deletion; (K1, K2) hold because
applying the older map and then the newer equals applying the union where the newer
wins, and `replay` is the map itself.

A **shape** is a list of kinds `S = [K_1, …, K_n]`. It is itself a kind, the product:
`M_S = ∏ M_j` (pointwise, unit `(e_1, …, e_n)`), `X_S = ∏ X_j`, `act_S`, `i_S`,
`replay_S` pointwise. (K1–K3) hold pointwise. This is `row.js`: `empty(shape)` is the
unit, `combine(shape)` the product operation. The row is "a monoid of monoids" in
exactly this sense. The shape is the type of the row, and `pipe` asserting
`f.outputs == g.inputs` is the only typing the probe has.

**Cells.** `C_K = X × M`, a state and the delta that just produced it. The **fold**

    φ_K : M⁺ → C_K
    φ_K (m_1 … m_n) = ( act m_n (… (act m_1 i) …),  m_n )

sends a non-empty history of changes to the cell it leaves behind. Write `fold w` for
its first component. By (K2), `fold (w · a · b) = fold (w · (a <> b))`: histories that
differ only by merging adjacent changes have the same fold. By (K1), inserting `e`
anywhere does not change the fold.

**Hot and cold.** A cell is *cold* when its delta is `e` and *hot* otherwise. For
`last`, `e = Nothing`, which is the code's `isHot`. Hot is a property of the delta, not
of the state, and it is per kind.

## 2. The comonad

Let `LV A = A⁺`, non-empty lists, with

    extract (a_1 … a_n)  = a_n
    extend f (a_1 … a_n) = ( f (a_1),  f (a_1 a_2),  …,  f (a_1 … a_n) )

This is the causal-stream comonad of Uustalu and Vene ("The Essence of Dataflow
Programming", 2005). Its co-Kleisli arrows `A⁺ → B` are exactly the causal stream
functions: the output at time `n` depends on the inputs at times `1 … n`. The comonad
laws are

    extend extract        = id
    extract ∘ extend f    = f
    extend f ∘ extend g   = extend (f ∘ extend g)

and co-Kleisli composition `g ∘̂ f = g ∘ extend f` is a category with identity
`extract`.

**The wire is `extend φ_K`.** A wire of kind `K` (`wire` in `arrow.js`) has state
`x ∈ X`, starts at `i`, and on input `m` moves to `act m x` and shows the cell
`(act m x, m)`. After inputs `m_1 … m_n` it shows `φ_K (m_1 … m_n)`, by induction on
`n` from the definition of `φ_K`. So the stream of cells a wire shows over time is
`extend φ_K` applied to the stream of deltas. The wire is the comonad's `extend`,
specialised to the kind's fold. It is the only place `act` is called, in the code and
in the math.

**The kind compresses the comonad.** A box reads cells, so a box of input kind `K` is a
function `b : C_K → …`, and as a stream function it is `b ∘ φ_K : M⁺ → …`, a co-Kleisli
arrow of `LV` that *factors through* `φ_K`. Two histories with the same fold and the
same last change are indistinguishable to every box of that kind. That is the
compression: `φ_K` is a quotient of `M⁺`, chosen per column.

- `event`: `φ (w) = ((), last w)`. Everything but the current change is forgotten.
- `value(last)`: `φ (w) = (last non-`Nothing` of w, last w)`. The newest survives.
- `value(sum)`: the total survives.
- `value(list)`: `φ (w) = (w, last w)`. Nothing is forgotten; `φ` is injective and the
  quotient is trivial. This is Uustalu and Vene's own comonad, as one kind among others.

Space is the point. `LV` keeps `n` elements after `n` instants; a kind keeps one `X`.
The kind says, per column, which `X` and how much of `M⁺` it may forget.

## 3. Resumptions and the monad

`resumption.js` defines, for a monoid `M` of writes and a set `I` of inputs,

    Res(V) = ν R.  V  +  (I → R)  +  (M × R)          done | read | write

together with the laws the category `category(monoid)` imposes through `settle`:

    write a (write b r) = write (a <> b) r
    write e r           = r

These two equations have a normal form. Every resumption is, up to them, uniquely

    NF(V) = ν R.  M × ( V + (I → R) )

a pending write followed by either an end or a read:

    nf (done v)    = (e, inl v)
    nf (read k)    = (e, inr (nf ∘ k))
    nf (write a r) = let (m, c) = nf r in (a <> m, c)

The map is well defined on the quotient because `<>` is associative with unit `e`, and
it is a bijection coinductively. An **instant** is the `M` between two reads: the
writes since the last read, merged. "An emit is an assignment, not an occurrence"
is the case `M = last`.

**Monad.** On normal forms:

    return v                  = (e, inl v)
    (m, inl v)   >>= k        = let (m', c) = k v in (m <> m', c)
    (m, inr f)   >>= k        = (m, inr (λ cells. f cells >>= k))

This is the writer monad `M × –` composed with the completely iterative monad over the
reader functor `I → –`; the writer distributes over it, so the composite is a monad.
Directly: left unit, `return v >>= k = (e <> m', c) = k v`; right unit, `(m, inl v)
>>= return = (m <> e, inl v)`, and the read case by coinduction; associativity, because
merging writes is associative.

The first clause is the rule found empirically in `behaviour.js`: the writes a new
phase makes before its first read (its seeds, since `born` has already consumed its
blank instant 0) are merged into the instant in which the old phase ended. The
alternative, delivering them as an instant of their own, would be
`(m, inl v) >>= k = (m, inr (λ _. k v))`, which inserts a read. Then
`return v >>= k ≠ k v`: the unit law fails, and associativity with it. The summary's
phrase "breaks associativity" is this.

**Morphisms.** A morphism `f : S → T` with result `V` is `Res_{S,T}(V)`: input `I =
C_S` and write monoid `M = M_T`. `morphism(inputs, outputs, resumption)` in `arrow.js`
is this triple. A **behaviour** (`behaviour.js`) fixes `(S, T)` and exposes the monad:
`Do = return {}`, `then`, `also`, `bindAs` are `>>=` with bookkeeping. Every phase has
the same `(S, T)`: the static-shape law is the statement that `>>=` lives inside one
`Res_{S,T}`. Partiality (ignore inputs, write `e`) makes sharing one interface free.

## 4. Endless morphisms are co-Kleisli arrows; `pipe` is co-Kleisli composition

Take `V = 0`. Then `Res_{S,T}(0) = ν R. M_T × (C_S → R)`: a pending write and a step.
This is a Mealy machine with input `C_S` and output `M_T`, except for the initial
pending write `m_0`.

**Instant 0.** The probe resolves `m_0` by convention: every morphism undergoes an
imaginary read of the blank row `(i_S, e_S)` at construction (`born`), and the
top-level driver's first feed is a blank cold row (`run(game)([silent, silent])`).
So time starts at instant 0 with a blank read, `m_0` is the output at instant 0, and
nothing is special afterwards. Under this convention an endless morphism is exactly a
Mealy machine `C_S → M_T` run from instant 0, hence a causal stream function
`C_S^ω → M_T^ω`.

**Denotation.** Fix input deltas `w = (m_0, m_1, …)` with `m_0 = e_S`. The cells the
morphism reads are `c_n = φ_S (m_0 … m_n)`. Define

    ⟦f⟧ : M_S⁺ → M_T,      ⟦f⟧ (m_0 … m_n) = the output of f at instant n.

`⟦f⟧` is causal, so it is a co-Kleisli arrow of `LV`. It factors through `φ_S` only if
`f` keeps no state of its own; in general it is any causal function (a resumption can
remember every delta it has seen). So `⟦–⟧ : Res_{S,T}(0) → coKleisli(LV)(M_S, M_T)` is
onto: every causal function is some morphism. It is not one-to-one: different machines
can denote the same function. The theorems below are about denotations.

**Theorem (pipe).** `⟦pipe(f, g)⟧ = ⟦g⟧ ∘ extend ⟦f⟧`.

*Proof.* `piping` in `arrow.js` does, at every instant: feed `f`, step the wire of kind
`T` with `f`'s output, feed `g` with the wire's cells. By §2 the wire's cells at
instant `n` are `φ_T (⟦f⟧(m_0), ⟦f⟧(m_0 m_1), …, ⟦f⟧(m_0 … m_n)) = φ_T (extend ⟦f⟧ w)`,
and `⟦g⟧` applied to the `T`-history `extend ⟦f⟧ w` is by definition `g`'s output on
those cells. `born` runs instant 0 of the composite at construction, which feeds `f`
the blank row and `g` the wire after `f`'s seeds, so the composite's instant 0 is the
composite of the instants 0, as required. ∎

**Theorem (identity).** `⟦id_S⟧ = extract`, and `⟦reorder(S, π)⟧ = π ∘ extract`.

*Proof.* `forward` writes the deltas of the cells it reads: the last change of the
history, permuted. ∎

**Corollary (category).** Endless morphisms up to denotation form a category with
objects shapes, composition `pipe`, identity `id`. Associativity and the unit laws are
the comonad laws of `LV`:

    ⟦pipe(id, g)⟧            = ⟦g⟧ ∘ extend extract            = ⟦g⟧
    ⟦pipe(f, id)⟧            = extract ∘ extend ⟦f⟧            = ⟦f⟧
    ⟦pipe(pipe(f, g), h)⟧    = ⟦h⟧ ∘ extend (⟦g⟧ ∘ extend ⟦f⟧) = ⟦h⟧ ∘ extend ⟦g⟧ ∘ extend ⟦f⟧
                             = ⟦pipe(f, pipe(g, h))⟧

The tests in `leaves.js` (identity, associativity with `seeded = write(7, twice)`) are
instances.

**`first`.** `⟦first(f, U)⟧ (w) = (⟦f⟧ (w|_S), extract (w|_U))`: `f` on the head
columns, `extract` on the tail. This is the arrow `first` of the co-Kleisli category
over the product shape; it is not an operation of the one-object category
`category(monoid)` in `resumption.js`, which has no products, which is the finding that
moved `first` to `arrow.js`.

## 5. The latecomer lemma

A phase `g` that starts at absolute instant `k` through `>>=` has done its blank
instant 0 at construction. Its first real read is instant `k + 1`. What should it
see? A box that has lived since 0 sees `φ_S (m_0 … m_{k+1})`. The latecomer has no
history, and the state `x_{k+1} = fold (m_0 … m_{k+1})` arrives in a cell whose delta
`m_{k+1}` is whatever happened just now, often cold. A box that waits for a hot delta
would wait forever on a value that stopped changing before it was born. That was the
bug in `game.js` (the cruising phase never saw the target position), and `rekindle` was
the fix: deliver `(x_{k+1}, replay x_{k+1})`.

**Lemma.** Under (K3), a phase born at `k` and rekindled at `k + 1` reads, at every
instant `n ≥ k + 1`, the cell `φ_S (replay x_{k+1}, m_{k+2}, …, m_n)`.

*Proof.* At `n = k + 1` the cell is `(x_{k+1}, replay x_{k+1})`, and
`φ_S (replay x_{k+1}) = (act (replay x_{k+1}) i, replay x_{k+1}) = (x_{k+1}, replay
x_{k+1})` by (K3). For `n > k + 1` the wire continues from `x_{k+1}` with the real
deltas, and `fold (replay x_{k+1} · m_{k+2} … m_n) = act m_n (… (act m_{k+2} x_{k+1}))
= x_n` by (K3) and the definition of `fold`. ∎

So the latecomer is a co-Kleisli arrow of `LV` fed with a history that is a
compression of the real one: the whole past as one change, then the future as it
comes. This is why `replay` is the fourth operation of a kind and not a convenience:
without it `>>=` is not a stream function of the deltas, and phases could not be
composed with `pipe` as if they had always been there. Monotone kinds (`any`, `list`)
have `replay` and no `⊖`; `last`, `event` and `FAMILY` have both. Only `replay` is
needed here.

The code applies `rekindle` in `chain` (phase switch) and at pool births; both are
births at `k > 0`. The top-level program is born at `k = 0`, where `replay i = e` for
both constructors and the lemma is empty.

## 6. The flat row

`graph.js` compiles `use(f, sources)` to `pipe(pipe(pipe(compiled, gather), apply),
append)` with `gather`, `append` reorders and `apply = first(f, shape)`. Each `pipe`
inserts a wire, so an `n`-node graph runs `3n` wires. Only `n` of them hold anything.

**Theorem (flat row).** `⟦pipe(reorder, g)⟧ = ⟦g⟧ ∘ π`: the wire after a reorder shows
the same cells, permuted, as the wire before it.

*Proof.* `⟦pipe(reorder, g)⟧ = ⟦g⟧ ∘ extend (π ∘ extract) = ⟦g⟧ ∘ π ∘ extend extract
= ⟦g⟧ ∘ π`, using that `extend` of a pointwise map commutes with the permutation and
`extend extract = id`. ∎

So the compiled graph denotes the same stream function as: one wire per column of the
final shape (inputs and every `use`'s outputs), and each leaf reading cells by index.
That is the implementation `graph.js` should have and does not need, since the
denotation is already right. `extend extract = id` is the whole proof: a wire fed from
a wire is the same wire.

**Nothing else is state.** A leaf may keep state in its closure (`fold` keeps its
total). Any Mealy machine with state `Q` is a stateless cell function plus one column
of kind `value(last)` over `Q` read through `pre` (§7): `fold(seed, step) =
feedback(lift over [in, pre acc] ↦ [acc, acc])`. So every program is, up to
denotation, stateless steps over a row, and the row's kinds are the complete inventory
of its memory. "The graph is the row."

## 7. `feedback` and `pre`

`feedback(f, k)` feeds the last `k` outputs of `f` back to its last `k` inputs through
a wire of the fed kinds. `looping` reads the wire's cells *before* stepping it with
this instant's fed outputs, so the fed cells at instant `n` are `φ (m_0 … m_{n-1})`:
a unit delay. That is `pre`. Operationally no fixed point is ever computed: the step
is a function of the previous instant's wire and the current inputs, for any `f`.

The graph discipline, "the source graph minus `pre` edges is acyclic", holds by
construction in `graph.js`: `use` can only name columns that already exist, so every
same-instant dependency is resolved in `use` order, and any cycle must close through
`feedback`. A cycle with several value edges may be cut at any of them; `game.js` cuts
at `pre positions` and `pre target`, leaving `died` a current event.

"`pre` only on values" is a design rule, not a theorem. Mathematically a pre'd event
cell is `((), m_{n-1})`, the previous instant's occurrence, and nothing breaks. The
rule exists because the model has no notion of "the same event, later": an occurrence
delivered one instant late is a new occurrence with a stale payload, while a delayed
state is still a state. The rule removes the one place where that could be mistaken.

## 8. Ending, and `signal`

With `V ≠ 0`, `pipe` must say what happens when a stage ends. `arrow.js`:
`unlessDone(downstream, unlessDone(upstream, continue))`. So

    pipe : Res_{S,T}(V) × Res_{T,U}(V') → Res_{S,U}(V + V')

ends in the first instant in which either ends, with the downstream value on a tie.
This is associative: in `pipe(pipe(f, g), h)` and `pipe(f, pipe(g, h))` the priority on
ties is `h > g > f` either way, and `(V + V') + V'' ≅ V + (V' + V'')`.

`signal(f, watcher)` is the two-node graph where `f` is endless and `watcher :
[S ++ T] → []` ends with `V`. The signal ends when the watcher does, with the watcher's
value: its last row. In `game.js` every phase of a projectile and of the target is a
`signal`; the watcher reads the same cells as the phase (the row after `use`), so a
phase ends in the instant its condition holds, and the `>>=` of §3 starts the next
phase in that same instant, with its seeds merged in (§3) and its first read rekindled
(§5).

Behaviours step only on triggered rows (`waiting` guards with `triggered`): a watcher
is a function of hot cells, so on a cold row it does nothing. This is a consequence of
`born`: every composite's instant 0 is a blank read, so every reader must be inert on a
blank row, or construction would observe something.

## 9. What is proved, what is not

Proved above, against the code:

1. `event` and `value` are kinds, and their `replay` is forced (§1).
2. The wire is `extend φ_K` (§2).
3. The write equations have a normal form; the normal form is a monad; the seed rule is
   its unit law (§3).
4. Endless morphisms denote causal stream functions; `pipe` denotes co-Kleisli
   composition; `id` denotes `extract`; the category laws are the comonad laws (§4).
5. The latecomer lemma: `rekindle` is sound exactly under (K3) (§5).
6. The flat row: wires after reorders are redundant, by `extend extract = id`; all
   state is columns (§6).
7. `pipe` with ends is associative (§8).

Not proved, or not claimed:

- The comonad is `LV`, and the kinds are quotient maps out of it. There is no
  kind-indexed comonad on cells, and none is needed; a reader expecting "`W_K` is a
  comonad on `Set`" will be right to object, and the answer is §2.
- Denotations are quotients. Two morphisms with the same `⟦–⟧` may differ in when
  they end if `V ≠ 0`; §4 is for `V = 0`, §8 for the ending rule only.
- `FAMILY` mixes two clocks (structure and content) and should be a product of a
  structure kind and a content kind. It satisfies (K1–K3) as written, but its `isHot`
  fires on both.
- Hot should be `delta ≠ e` per kind. The code tests `delta !== Nothing`, which is
  `last`'s `e` only.
- Time and space of the compiled `graph.js` are not the flat row's; the theorem says
  they could be.

## 10. Where this sits

Uustalu and Vene (2005, 2006) showed dataflow is comonadic and stream functions are
co-Kleisli arrows; §4 is their theorem with our names. Kmett's `machines` has `Moore`
as a `Comonad`; the wire is a Moore machine, and §2 says which comonad it is an
instance of. Harrison's resumption monads are §3 without the quotient by writes.
Cai, Giarrusso et al. and Alvarez-Picallo and Ong give the laws of §1, minus (K3).

What is not in any of them is the crossing: one type whose `M_T` is the monoid, whose
`C_S → –` is the comonad's image under a chosen compression, and whose `V` is the
monad; with the kind's third law being the exact condition under which the monad
(switching) and the comonad (history) commute. And the consequence that the memory of
a whole program is one fold per column, with the kind as the only knob.
