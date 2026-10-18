/**
 * The whole application booted against an in-memory SQLite database: real
 * repositories, transactions and plugins, with only time, ids and randomness
 * swapped out. Requests go through `app.handle()`, so no port is bound.
 */
import { beforeEach, describe, expect, test } from "bun:test";
import { provide } from "difunkt";
import { DATABASE } from "../src/core/database/database.providers";
import { IDEMPOTENCY_STORE } from "../src/core/idempotency/idempotency.providers";
import { HttpApp } from "../src/http/http.module";
import { createTestApp } from "./helpers/test-app";

const json = async (response: Response) => (await response.json()) as any;

describe("raffle API", () => {
  let app: ReturnType<typeof HttpApp>;
  let resolve: Awaited<ReturnType<typeof createTestApp>>;

  const request = (path: string, init: RequestInit = {}): Promise<Response> =>
    app.handle(new Request(`http://localhost${path}`, init));

  const login = async (email: string): Promise<string> => {
    const response = await request("/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    return (await json(response)).token as string;
  };

  const authed = (token: string, init: RequestInit = {}): RequestInit => ({
    ...init,
    headers: {
      ...(init.headers as Record<string, string> | undefined),
      authorization: `Bearer ${token}`,
    },
  });

  let keyCounter = 0;
  const purchase = (
    token: string,
    raffleId: string,
    quantity: number,
    idempotencyKey = `itest-key-${++keyCounter}`,
  ) =>
    request(
      `/raffles/${raffleId}/tickets`,
      authed(token, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
        },
        body: JSON.stringify({ quantity }),
      }),
    );

  beforeEach(async () => {
    resolve = await createTestApp();
    app = resolve(HttpApp);
  });

  test("reports liveness", async () => {
    const response = await request("/health");
    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({ status: "ok" });
  });

  describe("browsing raffles", () => {
    test("lists only active raffles by default, with remaining capacity", async () => {
      const response = await request("/raffles");
      const { data } = await json(response);

      expect(response.status).toBe(200);
      expect(data.length).toBeGreaterThan(0);
      expect(data.every((raffle: any) => raffle.status === "active")).toBe(true);
      // The seeded draft raffle must not leak into the public listing.
      expect(data.some((raffle: any) => raffle.id === "raf_coffee")).toBe(false);

      const rig = data.find((raffle: any) => raffle.id === "raf_rig");
      expect(rig.ticketsRemaining).toBe(rig.maxTickets - rig.ticketsSold);
      expect(rig.prize.name).toBe("Gaming Rig");
    });

    test("`?status=draft` selects a different slice", async () => {
      const { data } = await json(await request("/raffles?status=draft"));
      expect(data.map((raffle: any) => raffle.id)).toEqual(["raf_coffee"]);
    });

    test("returns a single raffle by id", async () => {
      const response = await request("/raffles/raf_rig");
      expect(response.status).toBe(200);
      expect((await json(response)).name).toBe("Gaming Rig Giveaway");
    });

    test("an unknown raffle gets the standard error envelope", async () => {
      const response = await request("/raffles/raf_nope");
      expect(response.status).toBe(404);
      expect(await json(response)).toMatchObject({
        error: { code: "NOT_FOUND", details: { resource: "Raffle", id: "raf_nope" } },
      });
    });

    test("an unmatched route is also an error envelope, not Elysia's default", async () => {
      const response = await request("/does-not-exist");
      expect(response.status).toBe(404);
      expect((await json(response)).error.code).toBe("ROUTE_NOT_FOUND");
    });
  });

  describe("authentication plugin", () => {
    test("issues a token for a known account", async () => {
      const response = await request("/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "alice@example.com" }),
      });
      const payload = await json(response);

      expect(response.status).toBe(200);
      expect(payload.token).toBeString();
      expect(payload.user).toMatchObject({ id: "usr_alice", balance: 50_000 });
    });

    test("refuses an unknown account without revealing whether it exists", async () => {
      const response = await request("/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "nobody@example.com" }),
      });
      expect(response.status).toBe(401);
      expect((await json(response)).error.code).toBe("UNAUTHORIZED");
    });

    test.each([
      ["no header", undefined],
      ["wrong scheme", "Basic abc"],
      ["forged signature", "Bearer eyJzdWIiOiJ1c3JfYWxpY2UifQ.deadbeef"],
    ])("a protected route rejects %s", async (_label, authorization) => {
      const response = await request(
        "/me",
        authorization ? { headers: { authorization } } : {},
      );
      expect(response.status).toBe(401);
      expect((await json(response)).error.code).toBe("UNAUTHORIZED");
    });

    // Regression: Elysia populates `context.headers` with only the keys a
    // route's `headers` schema declares, which once hid the auth header.
    test("still authenticates a route that declares its own header schema", async () => {
      const token = await login("alice@example.com");
      const response = await purchase(token, "raf_rig", 1);

      expect(response.status).toBe(201);
    });

    test("a valid token resolves the user into the handler context", async () => {
      const token = await login("alice@example.com");
      const response = await request("/me", authed(token));

      expect(response.status).toBe(200);
      expect(await json(response)).toMatchObject({
        id: "usr_alice",
        email: "alice@example.com",
        balance: 50_000,
      });
    });
  });

  describe("purchasing tickets", () => {
    test("sells tickets, debits the balance and records them against the user", async () => {
      const token = await login("alice@example.com");

      const response = await purchase(token, "raf_rig", 3);
      const payload = await json(response);

      expect(response.status).toBe(201);
      expect(payload.tickets).toHaveLength(3);
      expect(payload.totalCost).toBe(1_500);
      expect(payload.remainingBalance).toBe(48_500);

      expect((await json(await request("/me", authed(token)))).balance).toBe(48_500);

      const { data: owned } = await json(await request("/me/tickets", authed(token)));
      expect(owned.filter((ticket: any) => ticket.raffleId === "raf_rig")).toHaveLength(3);

      const raffle = await json(await request("/raffles/raf_rig"));
      expect(raffle.ticketsSold).toBe(3);
      expect(raffle.ticketsRemaining).toBe(97);
    });

    test("a purchase the balance cannot cover is rolled back entirely", async () => {
      const token = await login("carol@example.com"); // seeded with a zero balance

      const response = await purchase(token, "raf_rig", 1);

      expect(response.status).toBe(402);
      expect((await json(response)).error.code).toBe("INSUFFICIENT_BALANCE");
      // The reservation happens before the debit, so without a rollback this
      // raffle would show a phantom sale.
      expect((await json(await request("/raffles/raf_rig"))).ticketsSold).toBe(0);
      expect((await json(await request("/me", authed(token)))).balance).toBe(0);
    });

    test("a raffle that is not yet active cannot be bought into", async () => {
      const token = await login("alice@example.com");
      const response = await purchase(token, "raf_coffee", 1);

      expect(response.status).toBe(409);
      expect((await json(response)).error.code).toBe("RAFFLE_NOT_ACTIVE");
    });

    test("a raffle past its draw date cannot be bought into", async () => {
      const token = await login("alice@example.com");
      const response = await purchase(token, "raf_console", 1);

      expect(response.status).toBe(409);
      expect((await json(response)).error.code).toBe("RAFFLE_DRAW_DATE_PASSED");
    });

    test("purchasing requires authentication", async () => {
      const response = await request("/raffles/raf_rig/tickets", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "itest-key-unauthed",
        },
        body: JSON.stringify({ quantity: 1 }),
      });
      expect(response.status).toBe(401);
    });

    test("purchasing requires an idempotency key", async () => {
      const token = await login("alice@example.com");
      const response = await request(
        "/raffles/raf_rig/tickets",
        authed(token, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ quantity: 1 }),
        }),
      );
      const payload = await json(response);

      expect(response.status).toBe(422);
      expect(payload.error.details[0].path).toBe("/idempotency-key");
      // Nothing was sold on the way to rejecting it.
      expect((await json(await request("/raffles/raf_rig"))).ticketsSold).toBe(0);
    });

    test("a malformed quantity is caught by schema validation, not the service", async () => {
      const token = await login("alice@example.com");
      const response = await purchase(token, "raf_rig", 0);
      const payload = await json(response);

      expect(response.status).toBe(422);
      expect(payload.error.code).toBe("VALIDATION_ERROR");
      expect(payload.error.details[0].path).toBe("/quantity");
    });
  });

  describe("the draw", () => {
    test("requires the admin key", async () => {
      const response = await request("/admin/draws/run", { method: "POST" });
      expect(response.status).toBe(403);
      expect((await json(response)).error.code).toBe("FORBIDDEN");
    });

    test("draws every raffle past its draw date and records the winner", async () => {
      const response = await request("/admin/draws/run", {
        method: "POST",
        headers: { "x-admin-key": "test-admin-key" },
      });
      const { data } = await json(response);

      expect(response.status).toBe(200);
      // Only the seeded raffle past its draw date is eligible.
      expect(data).toHaveLength(1);
      expect(data[0]).toMatchObject({ raffleId: "raf_console", outcome: "drawn" });

      const raffle = await json(await request("/raffles/raf_console"));
      expect(raffle.status).toBe("drawn");
      expect(raffle.winningTicketId).toBe(data[0].winningTicketId);

      // The winning ticket was actually sold for this raffle.
      const db = resolve(DATABASE);
      const row = db
        .query<{ raffle_id: string }, [string]>("SELECT raffle_id FROM tickets WHERE id = ?")
        .get(data[0].winningTicketId);
      expect(row?.raffle_id).toBe("raf_console");
    });

    test("a second run finds nothing left to draw", async () => {
      const headers = { "x-admin-key": "test-admin-key" };
      await request("/admin/draws/run", { method: "POST", headers });

      const { data } = await json(
        await request("/admin/draws/run", { method: "POST", headers }),
      );
      expect(data).toEqual([]);
    });
  });

  describe("retrying a purchase", () => {
    test("the same idempotency key is charged once and replays the result", async () => {
      const token = await login("alice@example.com");

      const first = await purchase(token, "raf_rig", 2, "retry-key-abc");
      const retry = await purchase(token, "raf_rig", 2, "retry-key-abc");

      const firstBody = await json(first);
      const retryBody = await json(retry);

      expect(first.status).toBe(201);
      expect(retry.status).toBe(201);
      expect(first.headers.get("idempotent-replay")).toBe("false");
      expect(retry.headers.get("idempotent-replay")).toBe("true");

      // Identical payload apart from the replay marker.
      expect({ ...retryBody, replayed: false }).toEqual(firstBody);

      // Charged once: 2 x 500 cents off a 50,000 balance.
      expect((await json(await request("/me", authed(token)))).balance).toBe(49_000);
      expect((await json(await request("/raffles/raf_rig"))).ticketsSold).toBe(2);
      const { data: owned } = await json(await request("/me/tickets", authed(token)));
      expect(owned.filter((ticket: any) => ticket.raffleId === "raf_rig")).toHaveLength(2);
    });

    test("a burst of identical retries still charges exactly once", async () => {
      const token = await login("alice@example.com");

      const responses = await Promise.all(
        Array.from({ length: 10 }, () => purchase(token, "raf_rig", 1, "burst-key-xyz")),
      );

      expect(responses.every((response) => response.status === 201)).toBe(true);
      const bodies = await Promise.all(responses.map(json));
      const paymentIds = new Set(bodies.map((body) => body.paymentId));
      expect(paymentIds.size).toBe(1);

      expect((await json(await request("/raffles/raf_rig"))).ticketsSold).toBe(1);
      expect((await json(await request("/me", authed(token)))).balance).toBe(49_500);
    });

    test("reusing a key for a different purchase is refused", async () => {
      const token = await login("alice@example.com");

      await purchase(token, "raf_rig", 1, "reused-key-abc");
      const conflict = await purchase(token, "raf_rig", 5, "reused-key-abc");

      expect(conflict.status).toBe(409);
      expect((await json(conflict)).error.code).toBe("IDEMPOTENCY_KEY_REUSED");
      expect((await json(await request("/raffles/raf_rig"))).ticketsSold).toBe(1);
    });

    // Answers "what if the process dies between claiming the slots and
    // recording the key?": both happen in one transaction, so neither sticks.
    test("a failure while recording the key rolls the whole purchase back", async () => {
      const sabotaged = await createTestApp([
        provide(IDEMPOTENCY_STORE, {
          value: {
            find: () => null,
            save: () => {
              throw new Error("process died before commit");
            },
          },
        }),
      ]);
      const sabotagedApp = sabotaged(HttpApp);
      const call = (path: string, init: RequestInit = {}) =>
        sabotagedApp.handle(new Request(`http://localhost${path}`, init));

      const token = ((await (
        await call("/auth/login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email: "alice@example.com" }),
        })
      ).json()) as any).token;

      const response = await call(
        "/raffles/raf_rig/tickets",
        authed(token, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "crash-key-abc",
          },
          body: JSON.stringify({ quantity: 2 }),
        }),
      );
      expect(response.status).toBe(500);

      const raffle = await json(await call("/raffles/raf_rig"));
      const me = await json(await call("/me", authed(token)));
      expect(raffle.ticketsSold).toBe(0);
      expect(me.balance).toBe(50_000);
      // Alice owns seeded tickets for another raffle; none for this one.
      const { data: owned } = await json(await call("/me/tickets", authed(token)));
      expect(owned.filter((ticket: any) => ticket.raffleId === "raf_rig")).toHaveLength(0);
    });

    test("retrying a failed purchase genuinely re-attempts it", async () => {
      const token = await login("carol@example.com"); // zero balance

      const failed = await purchase(token, "raf_rig", 1, "recovery-key-abc");
      expect(failed.status).toBe(402);

      // Top the account up, then retry with the same key.
      resolve(DATABASE).run("UPDATE users SET balance = 5000 WHERE id = 'usr_carol'");

      const retry = await purchase(token, "raf_rig", 1, "recovery-key-abc");
      expect(retry.status).toBe(201);
      expect((await json(retry)).replayed).toBe(false);
    });
  });

  describe("a raffle never sells more tickets than exist", () => {
    test("concurrent buyers racing for the last slots cannot oversell", async () => {
      const token = await login("alice@example.com");
      const db = resolve(DATABASE);
      // Shrink raf_rig to 6 slots so the race is cheap to run.
      db.run("UPDATE raffles SET max_tickets = 6 WHERE id = 'raf_rig'");

      const responses = await Promise.all(
        Array.from({ length: 25 }, (_, i) =>
          purchase(token, "raf_rig", 1, `race-key-${i}`),
        ),
      );
      const created = responses.filter((response) => response.status === 201);
      const refused = responses.filter((response) => response.status === 409);

      expect(created).toHaveLength(6);
      expect(refused).toHaveLength(19);
      expect((await json(await request("/raffles/raf_rig"))).ticketsRemaining).toBe(0);

      const rows = db
        .query<{ ticket_number: number }, []>(
          "SELECT ticket_number FROM tickets WHERE raffle_id = 'raf_rig'",
        )
        .all();
      const numbers = rows.map((row) => row.ticket_number);
      expect(numbers).toHaveLength(6);
      // Unique, contiguous, within capacity.
      expect([...numbers].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
      expect(new Set(numbers).size).toBe(6);
    });

    test("the database refuses a duplicate ticket number outright", async () => {
      const token = await login("alice@example.com");
      await purchase(token, "raf_rig", 1);

      const db = resolve(DATABASE);
      // Even a buggy service cannot create a collision.
      expect(() =>
        db.run(
          `INSERT INTO tickets (id, raffle_id, user_id, purchased_at, ticket_number, status)
           VALUES ('tkt_dupe', 'raf_rig', 'usr_alice', '2026-01-15T12:00:00.000Z', 1, 'confirmed')`,
        ),
      ).toThrow(/UNIQUE/i);
    });
  });
});
