import type { FastifyInstance } from "fastify";
import { transitionOrder } from "../../application/transition-order";
import { requireStaff } from "../auth-hooks";
import type { AppDeps } from "../deps";
import { idParamSchema, kitchenQuerySchema, transitionSchema } from "../schemas";

export function kitchenRoutes(deps: AppDeps) {
  return async (api: FastifyInstance): Promise<void> => {
    api.get("/kitchen/orders", { preHandler: requireStaff(deps.auth, "kitchen:read") }, async (req) => {
      const { status, branchId, limit } = kitchenQuerySchema.parse(req.query);
      const scope = req.staff!.branchId;
      // Branch-scoped staff only ever see their own branch, whatever they ask for.
      const effectiveBranch = scope ?? branchId;
      return {
        orders: await deps.orders.listByStatuses(status, {
          limit,
          ...(effectiveBranch !== undefined ? { branchId: effectiveBranch } : {}),
        }),
      };
    });

    api.post(
      "/kitchen/orders/:id/transition",
      { preHandler: requireStaff(deps.auth, "kitchen:transition") },
      async (req) => {
        const { id } = idParamSchema.parse(req.params);
        const { to, reason } = transitionSchema.parse(req.body);
        const staff = req.staff!;
        const event = await transitionOrder(
          { orders: deps.orders, events: deps.events },
          { orderId: id, to, actor: `staff:${staff.username}`, branchScope: staff.branchId, ...(reason ? { reason } : {}) },
        );
        return { event };
      },
    );
  };
}
