# @limitkit/nest

## 1.2.0

### Minor Changes

- 95586c6: The Express middleware and Nest guard now emit the per-policy `RateLimit` and
  `RateLimit-Policy` structured fields from
  [draft-ietf-httpapi-ratelimit-headers](https://datatracker.ietf.org/doc/draft-ietf-httpapi-ratelimit-headers/),
  with one list member per evaluated rule
  (`"<name>";r=<remaining>;t=<seconds-to-reset>` and `"<name>";q=<limit>`). Unlike
  the single `RateLimit-Limit` / `RateLimit-Remaining` headers, this loses nothing
  when several limits apply. The window parameter (`w`) is not emitted.

  The existing single-policy headers are unchanged in name, but the rule they are
  derived from is now chosen correctly: `mostRestrictive` picks the rule with the
  lowest **absolute** `remaining` (fewest requests before a 429), tie-broken by
  later `resetAt` then lower `limit`. The previous `remaining / limit` ratio could
  let a large global limit with plenty of headroom mask a nearly-exhausted
  per-user limit, so `RateLimit-Remaining` could report more quota than the client
  actually had.

### Patch Changes

- Updated dependencies [95586c6]
  - @limitkit/core@1.4.0

## 1.1.0

### Minor Changes

- Add traffic shaper leaky bucket algorithm support

### Patch Changes

- Updated dependencies
  - @limitkit/core@1.1.0

## 1.0.0

- Initial working release
