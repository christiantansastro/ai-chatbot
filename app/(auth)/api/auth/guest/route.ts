import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { DUMMY_PASSWORD } from "@/lib/constants";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const redirectUrl = searchParams.get("redirectUrl") || "/";

  // Initialize Supabase client
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase environment variables");
    return NextResponse.redirect(new URL("/login?error=config", request.url));
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Check if user already has a session
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  try {
    // Create a guest user in Supabase Auth
    const { error } = await supabase.auth.signUp({
      email: `guest-${Date.now()}@guest.local`,
      password: DUMMY_PASSWORD,
      options: {
        data: {
          type: "guest",
        },
      },
    });

    if (error) {
      throw error;
    }

    // Sign in the guest user
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: `guest-${Date.now()}@guest.local`,
      password: DUMMY_PASSWORD,
    });

    if (signInError) {
      throw signInError;
    }

    return NextResponse.redirect(new URL(redirectUrl, request.url));
  } catch (error) {
    console.error("Guest authentication error:", error);
    return NextResponse.redirect(new URL("/login", request.url));
  }
}
