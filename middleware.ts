import { type NextRequest, NextResponse } from "next/server";
import { auth } from "./app/(auth)/auth";
import { guestRegex } from "./lib/constants";
import { databaseService, DatabaseConfigLoader } from "./lib/db/database-factory";

// Initialize database service for middleware
let middlewareDbInitialized = false;
async function ensureMiddlewareDbInitialized() {
  if (!middlewareDbInitialized) {
    try {
      const config = DatabaseConfigLoader.loadFromEnvironment();
      await databaseService.initialize(config);
      middlewareDbInitialized = true;
      console.log('Middleware database service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize middleware database service:', error);
      // Don't throw here - let middleware continue to work
    }
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  /*
   * Playwright starts the dev server and requires a 200 status to
   * begin the tests, so this ensures that the tests can start
   */
  if (pathname.startsWith("/ping")) {
    return new Response("pong", { status: 200 });
  }

  if (pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  // Allow OpenPhone sync API routes without authentication for system operations
  if (pathname.startsWith("/api/openphone-sync")) {
    return NextResponse.next();
  }

  // Ensure database is initialized for middleware
  await ensureMiddlewareDbInitialized();

  // Check authentication using NextAuth v5 auth function
  const session = await auth();

  if (!session) {
    // Allow access to login and register pages for unauthenticated users
    if (["/login", "/register"].includes(pathname)) {
      return NextResponse.next();
    }

    // Redirect to login for protected routes
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const isGuest = guestRegex.test(session.user?.email ?? "");

  // Redirect authenticated users away from login/register pages
  if (session && !isGuest && ["/login", "/register"].includes(pathname)) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/chat/:id",
    "/api/:path*",
    "/login",
    "/register",

    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
