import { Client } from "../../models/client.model.js";
import { Lead } from "../../models/lead.model.js";
import { Brand } from "../../models/brand.model.js";
import { brandDepartmentIds } from "../brandDepartments.js";

/**
 * Read-only Client / Lead lookup scoped to a mailbox brand.
 * Brand linked departments are the source of truth for department alignment.
 * Never returns records belonging to other brands.
 *
 * @param {string} email
 * @param {{ brandId: import("mongoose").Types.ObjectId|string, departmentId?: import("mongoose").Types.ObjectId|string|null }} scope
 */
export async function lookupCrmByEmail(email, scope) {
  const addr = String(email || "")
    .trim()
    .toLowerCase();
  if (!addr || !addr.includes("@")) {
    return { client: null, lead: null };
  }

  const brandId = scope?.brandId ? String(scope.brandId) : null;
  if (!brandId) {
    return { client: null, lead: null };
  }

  const brand = await Brand.findById(brandId)
    .select("departmentId departmentIds name")
    .lean();
  if (!brand) {
    return { client: null, lead: null };
  }
  const deptIds = brandDepartmentIds(brand);

  const brandFilter = { brandId };
  const deptClause =
    deptIds.length > 0
      ? {
          $or: [
            { departmentId: { $in: deptIds } },
            { departmentId: null },
            { departmentId: { $exists: false } },
          ],
        }
      : {};

  const [client, lead] = await Promise.all([
    Client.findOne({ email: addr, ...brandFilter, ...deptClause })
      .select("_id name email phoneNo companyName brandId departmentId")
      .populate("brandId", "name")
      .lean(),
    Lead.findOne({ email: addr, ...brandFilter, ...deptClause })
      .select(
        "_id name email phoneNo brandName serialNo lastAction brandId departmentId agent",
      )
      .populate("brandId", "name")
      .lean(),
  ]);

  // Hard reject if somehow different brand
  const sameBrand = (doc) =>
    doc && String(doc.brandId?._id || doc.brandId) === brandId;

  return {
    client: sameBrand(client)
      ? {
          ...client,
          href: `/dashboard/client/${client._id}`,
        }
      : null,
    lead: sameBrand(lead)
      ? {
          ...lead,
          href: `/dashboard/lead/detail/${lead._id}`,
        }
      : null,
  };
}
