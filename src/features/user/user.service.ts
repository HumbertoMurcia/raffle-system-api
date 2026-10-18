import { NotFoundError } from "../../core/errors";
import type { IUserRepository, IUserService } from "./user.types";

export const createUserService = (users: IUserRepository): IUserService => ({
  async getById(id) {
    const user = users.findById(id);
    if (!user) throw new NotFoundError("User", id);
    return user;
  },

  async getByEmail(email) {
    const user = users.findByEmail(email);
    if (!user) throw new NotFoundError("User", email);
    return user;
  },
});
