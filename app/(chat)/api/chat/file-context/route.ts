import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/app/(auth)/auth";
import { setFileContext } from "@/lib/utils/file-context-store";

const tempFileSchema = z.object({
  tempId: z.string(),
  filename: z.string(),
  contentType: z.string(),
  size: z.number().int().nonnegative(),
  fileBuffer: z.string(),
});

const fileContextSchema = z.object({
  chatId: z.string().min(1),
  clientName: z.string().nullable().optional(),
  tempFiles: z.array(tempFileSchema).optional(),
});

export async function POST(request: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = fileContextSchema.safeParse(body);

    if (!parsed.success) {
      console.error("Invalid file context payload:", parsed.error.format());
      return NextResponse.json({ error: parsed.error.message }, { status: 400 });
    }

    if (!parsed.data.tempFiles || parsed.data.tempFiles.length === 0) {
      return NextResponse.json({ success: true });
    }

    setFileContext(parsed.data.chatId, {
      clientName: parsed.data.clientName ?? undefined,
      tempFiles: parsed.data.tempFiles,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to sync file context:", error);
    return NextResponse.json({
      error: "Unable to sync file context",
      details: error instanceof Error ? error.message : "Unknown error",
    }, { status: 500 });
  }
}
