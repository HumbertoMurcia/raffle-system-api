import { createProviderToken } from "difunkt";
import type { IAuthService } from "./auth.types";

export const AUTH_SERVICE = createProviderToken<IAuthService>("auth.service");
