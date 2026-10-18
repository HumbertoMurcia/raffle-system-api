import { createModule, provide } from "difunkt";
import { DATABASE } from "../../core/database/database.providers";
import { USER_REPOSITORY, USER_SERVICE } from "./user.providers";
import { createSqliteUserRepository } from "./user.repository";
import { createUserService } from "./user.service";
import { UserRoutes } from "./user.routes";

export const UserModule = createModule({
  providers: [
    provide(USER_REPOSITORY, {
      factory: ({ inject }) => createSqliteUserRepository(inject(DATABASE)),
    }),
    provide(USER_SERVICE, {
      factory: ({ inject }) => createUserService(inject(USER_REPOSITORY)),
    }),
    UserRoutes,
  ],
});
