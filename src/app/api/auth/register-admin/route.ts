import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { companies, users } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

export async function POST(req: NextRequest) {
  try {
    const { name, email, password, companyName } = await req.json() as {
      name: string;
      email: string;
      password: string;
      companyName: string;
    };

    if (!name || !email || !password || !companyName) {
      return NextResponse.json({ error: "Semua field wajib diisi." }, { status: 400 });
    }

    const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existing.length > 0) {
      return NextResponse.json({ error: "Email sudah terdaftar." }, { status: 409 });
    }

    const existingCompany = await db.select().from(companies).where(eq(companies.name, companyName)).limit(1);
    if (existingCompany.length > 0) {
      return NextResponse.json({ error: "Nama perusahaan sudah terdaftar." }, { status: 409 });
    }

    const companyId = randomUUID();
    await db.insert(companies).values({ id: companyId, name: companyName });

    await auth.api.signUpEmail({
      body: { name, email, password },
    });

    const [created] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (created) {
      await db.update(users)
        .set({ companyId, role: "admin" })
        .where(eq(users.id, created.id));
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[register-admin]", error);
    return NextResponse.json({ error: "Terjadi kesalahan internal." }, { status: 500 });
  }
}
