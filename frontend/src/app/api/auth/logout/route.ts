import { NextResponse } from "next/server";
import { createExpiredSessionCookie } from "@/metier/securite-auth";

export async function POST() {
    const response = NextResponse.json({ success: true });
    response.cookies.set(...createExpiredSessionCookie());
    return response;
}
