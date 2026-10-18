import { createModule, provide } from "difunkt";
import { APP_CONFIG } from "../../core/config.providers";
import { CLOCK } from "../../core/platform.providers";
import { USER_REPOSITORY } from "../user/user.providers";
import { AUTH_SERVICE } from "./auth.providers";
import { createAuthService } from "./auth.service";
import { AuthRoutes } from "./auth.routes";

export const AuthModule = createModule({
  providers: [
    provide(AUTH_SERVICE, {
      factory: ({ inject }) =>
        createAuthService(inject(USER_REPOSITORY), inject(APP_CONFIG), inject(CLOCK)),
    }),
    AuthRoutes,
  ],
});
