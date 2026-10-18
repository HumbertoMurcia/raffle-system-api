# Raffle System API

A REST API for a raffle ticket system, built with Bun, Elysia, Difunkt and
SQLite. Users browse raffles and buy tickets against a seeded balance, and a
scheduled job draws a winner for each raffle once its draw date passes.

## Setup

Requires [Bun](https://bun.com) 1.2 or later; developed and tested on 1.4.3.
There is no database server or other tooling to install.

```bash
bun install
```

Every setting has a working default, so there is no `.env` to create; see
[.env.example](.env.example) for the configurable surface. On first start the
server creates `./data/raffle.sqlite`, applies the schema and seeds demo data.
Delete that directory to start over.

## Running the API

```bash
bun run dev      # http://localhost:3000, with hot reload
bun start        # without hot reload
bun check        # type check
```

Seeded accounts are `alice@example.com` (50,000 cents), `bob@example.com`
(1,200) and `carol@example.com` (0, for the insufficient-funds path). Seeded
raffles are `raf_rig` and `raf_trip` (active), `raf_coffee` (draft) and
`raf_console`, whose draw date has already passed so the scheduled draw is
visible a few seconds after startup.

```bash
TOKEN=$(curl -s localhost:3000/auth/login -H 'content-type: application/json' \
  -d '{"email":"alice@example.com"}' | jq -r .token)

curl localhost:3000/raffles/raf_rig/tickets -H "Authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -H "Idempotency-Key: $(uuidgen)" \
  -d '{"quantity":3}'
```

## Running the tests

```bash
bun test
```

100 tests, no setup and no running server: each suite builds its own
application against an in-memory database.

- `raffle.rules.test.ts`: the domain rules as pure functions.
- `ticket-purchase.use-case.test.ts`: the purchase use case, with no database.
- `draw.use-case.test.ts`: winner selection, empty pools, idempotency.
- `draw.scheduler.test.ts`: the timer lifecycle, including the re-entrancy
  guard and a failing draw that must not kill the loop.
- `sqlite-guards.test.ts`: the conditional UPDATEs and the constraints behind them.
- `api.integration.test.ts`: the full stack over HTTP.

### Mocking with Difunkt

The purchase test boots only `TicketModule` and replaces every dependency it
declares through `createApplication`'s override list, so the service under test
is the real one assembled out of test doubles:

```ts
const resolve = await createApplication(TicketModule, {
  providers: [
    provide(APP_CONFIG,        { value: testConfig() }),
    provide(UNIT_OF_WORK,      { value: passthroughUnitOfWork }),
    provide(CLOCK,             { value: fixedClock(NOW) }),
    provide(ID_GENERATOR,      { value: createSequentialIds("tkt") }),
    provide(USER_REPOSITORY,   { value: users }),
    provide(RAFFLE_REPOSITORY, { value: raffleRepository }),
    provide(TICKET_REPOSITORY, { value: tickets }),
    provide(IDEMPOTENCY_STORE, { value: idempotency }),
  ],
});

const service = resolve(TICKET_SERVICE);
```

No database is opened and no clock is read, and nothing in `src/` changes to
make this possible. The same mechanism at the `AppModule` level
([tests/helpers/test-app.ts](tests/helpers/test-app.ts)) gives the integration
tests a frozen clock, sequential ids and a scripted winner over real SQLite.

## Postman

[postman/](postman/) holds a collection and a local environment, importable or
runnable against a running server:

```bash
postman collection run postman/raffle-api.postman_collection.json \
  -e postman/raffle-api.postman_environment.json
```

27 requests with assertions, in six folders that run in order: auth captures a
bearer token, the ticket folder buys and then retries the same purchase to show
it is charged once, and the admin folder triggers the draw. The run is
repeatable against the same server.

## API

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/health` | | Liveness |
| `POST` | `/auth/login` | | Exchange a known email for a bearer token |
| `GET` | `/raffles` | | List raffles; `?status=` filters, default `active` |
| `GET` | `/raffles/:id` | | A single raffle with its prize and remaining tickets |
| `POST` | `/raffles/:id/tickets` | Bearer + `Idempotency-Key` | Purchase `{ quantity }` tickets |
| `GET` | `/me` | Bearer | Current user and balance |
| `GET` | `/me/tickets` | Bearer | Tickets owned by the current user |
| `POST` | `/admin/draws/run` | `x-admin-key` | Draw every raffle past its draw date |
| `POST` | `/admin/raffles/:id/draw` | `x-admin-key` | Draw one raffle |

Requests and responses are validated with Elysia's TypeBox schemas, declared
alongside the entities in each feature's `*.types.ts`. All monetary amounts are
integer cents, never floats, at any layer.

Every failure returns the same envelope, with the status taken from the domain
error that raised it:

```json
{ "error": { "code": "INSUFFICIENT_BALANCE", "message": "...", "details": {} } }
```

## Architecture

Feature-based, with one Difunkt module per business domain.

```
interfaces.ts            provided domain models, unchanged
src/app.module.ts        root module          src/main.ts     bootstrap
src/core/                errors, config, clock/ids/random, database, idempotency
src/features/<feature>/  types, providers, repository, service, routes, module
src/plugins/             auth, error handling, logging
src/http/                HTTP composition root
```

Features are `user`, `auth`, `raffle`, `ticket` and `draw`. Dependencies point
one way: routes depend on a service contract, services on repository contracts.
A route never imports a repository and a service never imports a concrete one;
only `*.module.ts` knows which implementation satisfies a token.

```ts
// raffle.providers.ts
export const RAFFLE_REPOSITORY = createProviderToken<IRaffleRepository>("raffle.repository");

// raffle.module.ts
provide(RAFFLE_REPOSITORY, {
  factory: ({ inject }) => createSqliteRaffleRepository(inject(DATABASE)),
});

// raffle.service.ts knows only the contract
export const createRaffleService = (raffles: IRaffleRepository): IRaffleService => ({ ... });
```

Routes and plugins are providers too, so `HttpApp` injects them and is the only
file that knows the shape of the API surface. Three Elysia plugins carry the
cross-cutting concerns: an auth macro (`auth: true` resolves a loaded `user`
into the handler context, `adminKey: true` guards operational routes), a global
`onError` that renders domain errors from their own code and status, and
request logging. Authentication is mocked in that there are no passwords, but
the token is a real HMAC-SHA256 signed, expiring payload verified in constant
time.

## Design decisions and trade-offs

**Flat Difunkt modules rather than hierarchical.** The ticket purchase
legitimately needs the raffle and user repositories, and one shared container
keeps that cross-feature dependency explicit at the token level. Hierarchical
modules would enforce the boundary, but they scope `createApplication`'s
overrides to the root container, so a test could no longer swap a provider
owned by a feature module. The cost is that nothing stops a feature reaching
for another's token; that is held by convention, not by the container.

**Tokens for services and repositories, provider factories for Elysia
instances.** Services and repositories are swapped in tests, so they need an
interface-shaped seam. Elysia instances are not, and binding them to a token
would erase the inferred types that make `{ auth: true }` type-safe in a
handler.

**Business rules are pure functions** in
[raffle.rules.ts](src/features/raffle/raffle.rules.ts), separate from the
service that orchestrates them. The service decides what happens; the rules
decide whether it may, which is why they test with no container at all.

**Invariants are enforced in SQL, not only in the service.** Ticket slots are
claimed by a conditional UPDATE re-checking capacity and status in its `WHERE`
clause, and the balance debit is guarded the same way, so the read used for
validation may safely be stale. Ticket numbers come from the `tickets_sold`
total that UPDATE returns rather than a separate count, with
`UNIQUE (raffle_id, ticket_number)` as a backstop. Write transactions are
IMMEDIATE with a `busy_timeout`, so contending writers queue rather than fail.

**`Idempotency-Key` is required on purchase, not optional.** The usual
convention is optional, but an optional header guarantees nothing for a client
that forgets it, and this is the only endpoint that moves money. A retry with
the same key replays the stored result, reusing a key for a different request
is a 409, and a failed attempt records nothing so retrying it genuinely
re-attempts.

The key is written in the same transaction as the slot claim and the debit, so
there is no window where money moved but the key did not land: a process that
dies in between leaves an uncommitted transaction, and the retry is a clean
first attempt. A test asserts this by making the key write throw.

**Repository contracts are synchronous** because `bun:sqlite` is a synchronous
driver. Returning promises would be cosmetic and would break the transaction
boundary, since an `await` inside `db.transaction()` is not atomic. Services are
async and wrap their critical section in a synchronous callback.

The cost is that the contracts are shaped by the driver: moving to Postgres
would make every repository method return a promise and `UnitOfWork` become
async, touching every repository, service and in-memory double. The logic
ports unchanged, since the conditional UPDATEs and `RETURNING` work the same,
but SQLite's single-writer model is doing some work for free today; on
Postgres, row-level locking replaces the implicit serialisation of IMMEDIATE
transactions.

**The draw runs on a `setInterval`** started by a Difunkt runnable in
`DrawModule`, so no job wiring leaks into `main.ts`. The winner is written with
an `UPDATE ... WHERE status = 'active'`, so a re-run or an overlapping manual
trigger cannot overwrite one, and each tick is re-entrancy guarded so a slow
draw cannot pile up.

Across several instances the outcome is still correct but wasteful: each wakes
up, contends for the write lock, and all but one find every raffle already
drawn. Nothing is drawn twice. `DRAW_SCHEDULER_ENABLED` exists so only one
instance runs the job; past that it belongs behind a leader election or a
queue.

### Out of scope

- **Ticket reservation.** The `reserved`, `expired` and `refunded` statuses are
  honoured by the schema and the draw, but purchases settle immediately, so
  nothing issues a reserved ticket.
- **Payments.** `paymentId` groups the tickets bought in one call; the balance
  debit is the payment.
- **Idempotency key expiry.** The table is append-only.
- **Raffle administration.** Raffles arrive via the seed, and the admin
  endpoints use a shared-secret header rather than a user role.
