import { createProviderToken } from "difunkt";
import type { IUserRepository, IUserService } from "./user.types";

export const USER_REPOSITORY = createProviderToken<IUserRepository>("user.repository");
export const USER_SERVICE = createProviderToken<IUserService>("user.service");
