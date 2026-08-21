import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements } from "better-auth/plugins/admin/access";

const statements = {
  ...defaultStatements,
  platform: ["lookup", "suspend", "sessions", "recover", "audit"],
} as const;

export const platformAccess = createAccessControl(statements);
export const userRole = platformAccess.newRole({
  user: [],
  session: [],
  platform: [],
});
export const platformOperatorRole = platformAccess.newRole({
  user: [],
  session: [],
  platform: ["lookup", "suspend", "sessions", "recover", "audit"],
});

export const platformRoles = {
  user: userRole,
  platform_operator: platformOperatorRole,
};

export function isPlatformOperator(role: string | null | undefined) {
  return role?.split(",").includes("platform_operator") ?? false;
}
