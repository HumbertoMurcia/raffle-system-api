import type { Database } from "bun:sqlite";
import type { ITicket, ITicketRepository, TicketStatus } from "./ticket.types";

interface TicketRow {
  id: string;
  raffle_id: string;
  user_id: string;
  purchased_at: string;
  ticket_number: number;
  status: TicketStatus;
  reserved_until: string | null;
  payment_id: string | null;
}

const toTicket = (row: TicketRow): ITicket => ({
  id: row.id,
  raffleId: row.raffle_id,
  userId: row.user_id,
  purchasedAt: new Date(row.purchased_at),
  ticketNumber: row.ticket_number,
  status: row.status,
  reservedUntil: row.reserved_until ? new Date(row.reserved_until) : null,
  paymentId: row.payment_id,
});

export const createSqliteTicketRepository = (db: Database): ITicketRepository => {
  const insertStmt = db.prepare(
    `INSERT INTO tickets
       (id, raffle_id, user_id, purchased_at, ticket_number, status, reserved_until, payment_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const findByIdStmt = db.query<TicketRow, [string]>("SELECT * FROM tickets WHERE id = ?");
  const listByUserStmt = db.query<TicketRow, [string]>(
    "SELECT * FROM tickets WHERE user_id = ? ORDER BY purchased_at DESC, ticket_number ASC",
  );
  const listConfirmedStmt = db.query<TicketRow, [string]>(
    `SELECT * FROM tickets
      WHERE raffle_id = ? AND status = 'confirmed'
      ORDER BY ticket_number ASC`,
  );

  return {
    insertMany: (tickets) => {
      for (const ticket of tickets) {
        insertStmt.run(
          ticket.id,
          ticket.raffleId,
          ticket.userId,
          ticket.purchasedAt.toISOString(),
          ticket.ticketNumber,
          ticket.status,
          ticket.reservedUntil?.toISOString() ?? null,
          ticket.paymentId,
        );
      }
    },

    findById: (id) => {
      const row = findByIdStmt.get(id);
      return row ? toTicket(row) : null;
    },

    listByUser: (userId) => listByUserStmt.all(userId).map(toTicket),

    listConfirmedByRaffle: (raffleId) => listConfirmedStmt.all(raffleId).map(toTicket),
  };
};
