import { createClient } from "@supabase/supabase-js";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { DUMMY_PASSWORD } from "@/lib/constants";
import {
  DatabaseConfigLoader,
  databaseService,
} from "@/lib/db/database-factory";

export type UserType = "guest" | "regular";

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    "Missing Supabase environment variables. Please check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your .env.local file."
  );
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Initialize database service
let databaseInitialized = false;
async function ensureDatabaseInitialized() {
  if (!databaseInitialized) {
    try {
      const config = DatabaseConfigLoader.loadFromEnvironment();
      await databaseService.initialize(config);
      databaseInitialized = true;
      console.log("Database service initialized successfully");
    } catch (error) {
      console.error("Failed to initialize database service:", error);
      throw error;
    }
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      id: "supabase",
      name: "Supabase",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        try {
          // Ensure database is initialized
          await ensureDatabaseInitialized();

          // Sign in with Supabase Auth
          const { data, error } = await supabase.auth.signInWithPassword({
            email: credentials.email as string,
            password: credentials.password as string,
          });

          if (error || !data.user) {
            console.error("Supabase auth error:", error);
            return null;
          }

          const supabaseUser = data.user;
          const userEmail = supabaseUser.email;

          if (!userEmail) {
            console.error("Supabase user email is missing");
            return null;
          }

          // Get user data from our database
          const users = await databaseService.getUser(userEmail);

          if (users.length === 0) {
            // Create user in our database if they don't exist
            try {
              const newUser = await databaseService.createUser({
                id: supabaseUser.id,
                email: userEmail,
                password: DUMMY_PASSWORD, // We don't store passwords in our DB since Supabase handles auth
                type: "regular" as const,
              });

              return {
                id: newUser.id,
                email: newUser.email,
                type: "regular" as UserType,
              };
            } catch (createError) {
              console.error("Failed to create user in database:", createError);
              // Return basic user info even if database creation fails
              return {
                id: supabaseUser.id,
                email: userEmail,
                type: "regular" as UserType,
              };
            }
          }

          const [user] = users;
          return {
            id: user.id || supabaseUser.id,
            email: user.email,
            type: "regular" as UserType,
          };
        } catch (error) {
          console.error("Auth error:", error);
          return null;
        }
      },
    }),
    Credentials({
      id: "guest",
      name: "Guest",
      credentials: {},
      async authorize() {
        try {
          // Ensure database is initialized
          await ensureDatabaseInitialized();

          // Create a guest user in Supabase Auth
          const { data, error } = await supabase.auth.signUp({
            email: `guest-${Date.now()}@guest.local`,
            password: DUMMY_PASSWORD,
            options: {
              data: {
                type: "guest",
              },
            },
          });

          if (error || !data.user) {
            console.error("Guest signup error:", error);
            throw error;
          }

          const guestUser = data.user;
          const guestEmail = guestUser.email;

          if (!guestEmail) {
            console.error("Guest user email is missing");
            throw new Error("Guest user email is missing");
          }

          // Create guest user in our database
          try {
            await databaseService.createUser({
              id: guestUser.id,
              email: guestEmail,
              password: DUMMY_PASSWORD,
              type: "guest" as const,
            });

            return {
              id: guestUser.id,
              email: guestEmail,
              type: "guest" as UserType,
            };
          } catch (createError) {
            console.error(
              "Failed to create guest user in database:",
              createError
            );
            // Return basic guest user info even if database creation fails
            return {
              id: guestUser.id,
              email: guestEmail,
              type: "guest" as UserType,
            };
          }
        } catch (error) {
          console.error("Guest auth error:", error);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }: any) {
      if (user) {
        token.id = user.id;
        token.type = user.type;
      }
      return token;
    },
    session({ session, token }: any) {
      if (session.user && token) {
        session.user.id = token.id as string;
        (session.user as any).type = token.type;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: {
    strategy: "jwt" as const,
  },
  secret: process.env.NEXTAUTH_SECRET,
});

// Export auth functions for use in API routes
export async function signUp(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });

  if (error) {
    throw error;
  }

  return data;
}

export { supabase };
