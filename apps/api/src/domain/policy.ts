export type StaffRole = "kitchen" | "admin";

export type Permission = "kitchen:read" | "kitchen:transition" | "admin:read" | "admin:write";

const GRANTS: ReadonlyMap<string, ReadonlySet<Permission>> = new Map<StaffRole, ReadonlySet<Permission>>([
  ["kitchen", new Set<Permission>(["kitchen:read", "kitchen:transition"])],
  ["admin", new Set<Permission>(["kitchen:read", "kitchen:transition", "admin:read", "admin:write"])],
]);

/**
 * Single place that decides what each staff role may do. Unknown roles get nothing (deny by default).
 * A Map is used so that role names like "__proto__" or "constructor" can never resolve to inherited properties.
 */
export function can(role: string, permission: Permission): boolean {
  return GRANTS.get(role)?.has(permission) ?? false;
}
