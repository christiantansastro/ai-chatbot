import { NextResponse } from "next/server";
import { googleOAuth } from "@/lib/google/auth-oauth";

export async function GET(request: Request) {
  try {
    const requestUrl = new URL(request.url);
    const code = requestUrl.searchParams.get("code");
    const error = requestUrl.searchParams.get("error");

    if (error) {
      console.error("OAuth error:", error);
      return NextResponse.redirect(
        new URL(`/?oauth=error&error=${error}`, requestUrl.origin)
      );
    }

    if (!code) {
      return NextResponse.json(
        { error: "No authorization code provided" },
        { status: 400 }
      );
    }

    const tokens = await googleOAuth.exchangeCodeForTokens(code);

    // Store tokens securely (you should implement proper token storage)
    console.log("✅ OAuth tokens obtained successfully");
    console.log("Access Token:", tokens.access_token ? "Present" : "Missing");
    console.log("Refresh Token:", tokens.refresh_token ? "Present" : "Missing");

    // Redirect to success page with token info
    const successUrl = new URL("/?oauth=success", requestUrl.origin);
    if (tokens.access_token) {
      successUrl.searchParams.set("access_token", "present");
    }
    if (tokens.refresh_token) {
      successUrl.searchParams.set("refresh_token", "present");
    }

    return NextResponse.redirect(successUrl);
  } catch (error) {
    console.error("OAuth callback failed:", error);
    // For error case, we'll redirect to a generic error page
    return NextResponse.redirect(
      new URL("/?oauth=error", "https://ai-chatbot-sepia-ten.vercel.app")
    );
  }
}
