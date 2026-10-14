import { NextRequest, NextResponse } from "next/server";
import { ContactRowSchema, composeName } from "@/lib/validation";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { verifyToken, ACCESS_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";

// Columns with special meaning — everything else becomes a template attribute.
const RESERVED = new Set(["phone", "name", "firstName", "lastName"]);

/**
 * POST /api/contacts/upload
 * multipart/form-data: file=<csv>, listId=<optional>
 * CSV header row required. Reserved columns: phone, name, firstName, lastName.
 * If `name` is absent it is composed from firstName + lastName. firstName and
 * lastName are also kept as attributes. All other columns → attributes.
 */
export async function POST(req: NextRequest) {
  const claims = await verifyToken(req.cookies.get(ACCESS_COOKIE)?.value, "access");
  if (!claims?.sub) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file");
  const listId = form.get("listId");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  // A supplied listId must exist — otherwise an uploader
  // could inject their contacts into a non-existent list.
  if (typeof listId === "string" && listId) {
    const owned = await prisma.contactList.findFirst({ where: { id: listId }, select: { id: true } });
    if (!owned) return NextResponse.json({ error: "list not found" }, { status: 404 });
  }

  const text = await file.text();
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    return NextResponse.json({ error: "CSV needs a header + ≥1 row" }, { status: 400 });
  }

  const header = parseCsvLine(lines[0]!).map((h) => h.trim());
  const phoneIdx = header.indexOf("phone");
  if (phoneIdx === -1) {
    return NextResponse.json({ error: "CSV must include a 'phone' column" }, { status: 400 });
  }
  const nameIdx = header.indexOf("name");
  const firstIdx = header.indexOf("firstName");
  const lastIdx = header.indexOf("lastName");

  const accepted: { phone: string; name?: string; attributes: Record<string, string> }[] = [];
  const rejected: { line: number; reason: string }[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]!);
    const attributes: Record<string, string> = {};
    header.forEach((h, idx) => {
      if (!RESERVED.has(h) && cols[idx] != null) {
        attributes[h] = cols[idx]!.trim();
      }
    });

    const firstName = firstIdx >= 0 ? cols[firstIdx]?.trim() : undefined;
    const lastName = lastIdx >= 0 ? cols[lastIdx]?.trim() : undefined;
    // Keep first/last as attributes too, so they work as template variables.
    if (firstName) attributes.firstName = firstName;
    if (lastName) attributes.lastName = lastName;

    const explicitName = nameIdx >= 0 ? cols[nameIdx]?.trim() : undefined;

    const parsed = ContactRowSchema.safeParse({
      phone: cols[phoneIdx] ?? "",
      name: explicitName || composeName(firstName, lastName),
      attributes,
    });

    if (!parsed.success) {
      rejected.push({ line: i + 1, reason: parsed.error.issues[0]?.message ?? "invalid" });
      continue;
    }
    accepted.push(parsed.data);
  }

  // Upsert contacts (dedupe by phone), optionally attach to list.
  let inserted = 0;
  for (const row of accepted) {
    const contact = await prisma.contact.upsert({
      where: { phone: row.phone },
      create: { phone: row.phone, name: row.name, attributes: row.attributes },
      update: { name: row.name, attributes: row.attributes },
    });
    inserted++;
    if (typeof listId === "string" && listId) {
      await prisma.contactListMembership.upsert({
        where: { contactId_listId: { contactId: contact.id, listId } },
        create: { contactId: contact.id, listId },
        update: {},
      });
    }
  }

  void audit(claims.sub, "contacts.imported", file.name || null, {
    inserted,
    rejected: rejected.length,
    ...(typeof listId === "string" && listId ? { listId } : {}),
  });
  return NextResponse.json({
    inserted,
    rejectedCount: rejected.length,
    rejected: rejected.slice(0, 50), // cap response size
  });
}

// Minimal CSV parser handling quoted fields with commas.
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}
