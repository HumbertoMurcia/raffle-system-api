import type { Database } from "bun:sqlite";
import type { IRaffle, IRaffleRepository, RaffleStatus } from "./raffle.types";

interface RaffleRow {
  id: string;
  name: string;
  description: string;
  ticket_price: number;
  max_tickets: number;
  tickets_sold: number;
  draw_date: string;
  status: RaffleStatus;
  winning_ticket_id: string | null;
  created_at: string;
  updated_at: string;
  prize_id: string;
  prize_name: string;
  prize_description: string;
  prize_value: number;
  prize_image_url: string | null;
}

const SELECT_RAFFLE = `
SELECT r.id, r.name, r.description, r.ticket_price, r.max_tickets, r.tickets_sold,
       r.draw_date, r.status, r.winning_ticket_id, r.created_at, r.updated_at,
       p.id AS prize_id, p.name AS prize_name, p.description AS prize_description,
       p.value AS prize_value, p.image_url AS prize_image_url
  FROM raffles r
  JOIN prizes p ON p.id = r.prize_id`;

const toRaffle = (row: RaffleRow): IRaffle => ({
  id: row.id,
  name: row.name,
  description: row.description,
  prize: {
    id: row.prize_id,
    name: row.prize_name,
    description: row.prize_description,
    value: row.prize_value,
    imageUrl: row.prize_image_url,
  },
  ticketPrice: row.ticket_price,
  maxTickets: row.max_tickets,
  ticketsSold: row.tickets_sold,
  drawDate: new Date(row.draw_date),
  status: row.status,
  winningTicketId: row.winning_ticket_id,
  createdAt: new Date(row.created_at),
  updatedAt: new Date(row.updated_at),
});

export const createSqliteRaffleRepository = (db: Database): IRaffleRepository => {
  const findByIdStmt = db.query<RaffleRow, [string]>(`${SELECT_RAFFLE} WHERE r.id = ?`);
  const listAllStmt = db.query<RaffleRow, []>(`${SELECT_RAFFLE} ORDER BY r.draw_date ASC`);
  const listByStatusStmt = db.query<RaffleRow, [string]>(
    `${SELECT_RAFFLE} WHERE r.status = ? ORDER BY r.draw_date ASC`,
  );
  const findDueStmt = db.query<RaffleRow, [string]>(
    `${SELECT_RAFFLE} WHERE r.status = 'active' AND r.draw_date <= ? ORDER BY r.draw_date ASC`,
  );
  const reserveStmt = db.query<{ tickets_sold: number }, [number, string, string, number]>(
    `UPDATE raffles
        SET tickets_sold = tickets_sold + ?, updated_at = ?
      WHERE id = ?
        AND status = 'active'
        AND tickets_sold + ? <= max_tickets
      RETURNING tickets_sold`,
  );
  const markDrawnStmt = db.prepare(
    `UPDATE raffles
        SET status = 'drawn', winning_ticket_id = ?, updated_at = ?
      WHERE id = ? AND status = 'active'`,
  );
  const markClosedStmt = db.prepare(
    "UPDATE raffles SET status = 'closed', updated_at = ? WHERE id = ? AND status = 'active'",
  );

  return {
    findById: (id) => {
      const row = findByIdStmt.get(id);
      return row ? toRaffle(row) : null;
    },

    list: (status) =>
      (status ? listByStatusStmt.all(status) : listAllStmt.all()).map(toRaffle),

    findDueForDraw: (now) => findDueStmt.all(now.toISOString()).map(toRaffle),

    reserveTicketSlots: (raffleId, quantity, now) =>
      reserveStmt.get(quantity, now.toISOString(), raffleId, quantity)?.tickets_sold ?? null,

    markDrawn: (raffleId, winningTicketId, now) =>
      markDrawnStmt.run(winningTicketId, now.toISOString(), raffleId).changes > 0,

    markClosed: (raffleId, now) =>
      markClosedStmt.run(now.toISOString(), raffleId).changes > 0,
  };
};
