import { Buffer } from "node:buffer";
import { timingSafeEqual } from "node:crypto";

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

function safeEqualString(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

function adminBasicUnauthorized(): NextResponse {
  return new NextResponse("Unauthorized", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Arc Admin"',
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}

function adminBasicMisconfigured(message: string): NextResponse {
  return new NextResponse(message, {
    status: 503,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

function requiresAdminBasicAuth(pathname: string): boolean {
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    return true;
  }
  return pathname === "/api/arc" || pathname.startsWith("/api/arc/");
}

function verifyAdminBasicAuth(request: NextRequest): NextResponse | null {
  const expectedUser = process.env.ADMIN_USERNAME?.trim() ?? "";
  const expectedPass = process.env.ADMIN_PASSWORD?.trim() ?? "";

  if (!expectedUser || !expectedPass) {
    return adminBasicMisconfigured(
      "Service unavailable: ADMIN_USERNAME and ADMIN_PASSWORD must be set for admin routes.",
    );
  }

  const auth = request.headers.get("authorization");
  if (!auth) {
    return adminBasicUnauthorized();
  }

  const [scheme, encoded] = auth.split(/\s+/, 2);
  if (!scheme || !encoded || scheme.toLowerCase() !== "basic") {
    return adminBasicUnauthorized();
  }

  let decoded: string;
  try {
    decoded = Buffer.from(encoded, "base64").toString("utf8");
  } catch {
    return adminBasicUnauthorized();
  }

  const colon = decoded.indexOf(":");
  if (colon === -1) {
    return adminBasicUnauthorized();
  }

  const username = decoded.slice(0, colon);
  const password = decoded.slice(colon + 1);

  if (safeEqualString(username, expectedUser) && safeEqualString(password, expectedPass)) {
    return null;
  }

  return adminBasicUnauthorized();
}

export async function proxy(request: NextRequest) {
  if (requiresAdminBasicAuth(request.nextUrl.pathname)) {
    const authFailure = verifyAdminBasicAuth(request);
    if (authFailure) {
      return authFailure;
    }
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  await supabase.auth.getUser();

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
