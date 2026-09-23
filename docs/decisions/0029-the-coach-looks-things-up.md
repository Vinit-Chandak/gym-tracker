# The coach looks things up

A review asked the owner "What exact name did you save the Bayesian cable curl under? The
list I was given for this run came through empty." The exercise was in the library under
exactly that name. Two things had been true when it asked, on 19 September: the Bayesian
cable curl was not yet in the shared library (added the next day), and a programme review
with no gym of its own was sent an empty library and an empty machine list (fixed on 21
September). Both are fixed, but the shape that let it happen was not: every job's context
carried the whole library — 276 exercises, about 45,000 tokens pretty-printed, twice over for
a session preparation — and every machine at one gym, whether the run needed them or not.
And a list read once, at one moment, can be wrong in a way the reader cannot see: an empty
one looks exactly like an athlete with nothing.

## Decisions

1. **The library and the machines are lookups, not context.** The context keeps the
   athlete's locations and the location to use by default (`equipmentGymId`), and each
   session slot keeps its own machine and next loads. `catalogue`, `equipment`, and the
   session's `library` and `gym.machines` are gone.
2. **Two reads, for the live attempt only.** `exercises` searches the shared library and the
   athlete's own exercises; `machines` lists one location's machines with their known loads
   ([ADR 0028](0028-steps-learned-from-the-stack.md)). Both check that the caller holds the
   claimed job's lease, like a report download, and both refuse a location that is not the
   athlete's. `scripts/coach/workflow.ts exercises` and `machines` call them.
3. **Search in the athlete's words.** Case, punctuation, plurals and partial words do not
   matter, and results rank by how many of the words an exercise matches, name before muscle
   or pattern: "Bayesian bicep curls" finds the Bayesian cable curl first, with other curls
   below it. With a location, each result says whether it can be done there and on what.
   `muscle`, `pattern` and `available` browse without words, a page at a time.
4. **Search before asking.** The skill tells the coach never to ask what an exercise is
   called, or to say one is missing, without searching for it first in the athlete's own
   words; an empty search means no such exercise, never an empty library.
5. **Contract 6.** The context changed shape, so the contract version moved and only 6 is
   accepted: a routine on an older clone, which would still look for `catalogue`, is turned
   away before it claims anything, and the skill's first step fast-forwards it.

## Not changed

A question the coach has already asked stays asked until the athlete answers or withdraws
it. The one about the Bayesian cable curl is left for the owner to answer rather than
reopened by a migration, at their request; the next daily run reads the answer with the
lookups above.
