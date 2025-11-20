"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import { useEffect, useState } from "react";

import { AuthForm } from "@/components/auth-form";
import { SubmitButton } from "@/components/submit-button";
import { toast } from "@/components/toast";

export default function Page() {
  const router = useRouter();
  const { data: session, status } = useSession();

  const [email, setEmail] = useState("");
  const [isSuccessful, setIsSuccessful] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (session && status === "authenticated") {
      router.push("/");
    }
  }, [session, status, router]);

  const handleSubmit = async (formData: FormData) => {
    setIsLoading(true);
    const formEmail = formData.get("email") as string;
    const formPassword = formData.get("password") as string;

    setEmail(formEmail);

    try {
      const result = await signIn("supabase", {
        email: formEmail,
        password: formPassword,
        redirect: false,
      });

      if (result?.error) {
        throw new Error(result.error);
      }

      setIsSuccessful(true);
      toast({
        type: "success",
        description: "Successfully signed in!",
      });

      // Small delay to ensure session is updated
      setTimeout(() => {
        router.push("/");
      }, 100);
    } catch (error) {
      console.error("Sign in error:", error);
      toast({
        type: "error",
        description: "Invalid credentials or sign in failed!",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-dvh w-screen items-start justify-center bg-background pt-12 md:items-center md:pt-0">
      <div className="flex w-full max-w-md flex-col gap-12 overflow-hidden rounded-2xl">
        <div className="flex flex-col items-center justify-center gap-2 px-4 text-center sm:px-16">
          <h3 className="font-semibold text-xl dark:text-zinc-50">Sign In</h3>
          <p className="text-gray-500 text-sm dark:text-zinc-400">
            Use your email and password to sign in
          </p>
        </div>
        <AuthForm action={handleSubmit} defaultEmail={email}>
          <SubmitButton isSuccessful={isSuccessful}>
            {isLoading ? "Signing in..." : "Sign in"}
          </SubmitButton>
          <p className="mt-4 text-center text-gray-600 text-sm dark:text-zinc-400">
            {"Don't have an account? "}
            <Link
              className="font-semibold text-gray-800 hover:underline dark:text-zinc-200"
              href="/register"
            >
              Sign up
            </Link>
            {" for free."}
          </p>
        </AuthForm>
      </div>
    </div>
  );
}
