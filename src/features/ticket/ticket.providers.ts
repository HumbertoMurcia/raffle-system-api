import { createProviderToken } from "difunkt";
import type { ITicketRepository, ITicketService } from "./ticket.types";

export const TICKET_REPOSITORY = createProviderToken<ITicketRepository>("ticket.repository");
export const TICKET_SERVICE = createProviderToken<ITicketService>("ticket.service");
