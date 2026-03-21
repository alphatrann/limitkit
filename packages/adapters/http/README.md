# `@limitkit/http`

## Overview

This is an internal package containing shared code logic with LimitKit adapters such as `@limitkit/express` and `@limitkit/nest`.

> Note: This package should not be published to `npm` or any other package registries.

## Structure
```
http/
├───src/
│   ├───index.ts
│   ├───utils/
│   └───types/
├───package.json
├───jest.config.ts
└───__tests__/
```

## Roles

`@limitkit/http` contains utils functions:

* [`mergeRules`](./src/utils/merge-rules.ts) function merges global rules and local rules, which is used to override global rules in a route or controller.
* [`mostRestrictive`](./src/utils/most-restrictive.ts) function selects the most restrictive rule, whose result is set in the rate limit headers.
* [`toRateLimitHeaders`](./src/utils/to-rate-limit-headers.ts) function returns an object representing the rate limit response headers, whose values are from `mostRestrictive`.

## Build

Since this is an internal package, its source code is built **inline** with public adapters.

For Express.js, this behavior is specified in [`tsup.config.ts`](../express/tsup.config.ts).

For NestJS, `tsup` build will break the DI behavior. Therefore, the script [`build.js`](../nest/build.js) is added to:
1. Copy the `http/src` to `nest/libs/limits/src/http`
2. Resolve all the imports in NestJS source code from `@limitkit/http` to `@limitkit/nest/http`. This is made possible by including this in `tsconfig.json`
```json
{
  "compilerOptions": {
    "paths": {
      "@limitkit/nest": ["libs/limit/src/index.ts"],
      "@limitkit/nest/*": ["libs/limit/src/*"]
    }
    // other configuration
  },
}
```

3. Run `nest build` to export to `dist/`
4. Revert the imports back to `@limitkit/http`
5. Delete `nest/libs/limits/src/http` directory