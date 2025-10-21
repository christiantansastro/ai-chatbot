import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "crypto";

import { auth } from "@/app/(auth)/auth";

// Use Blob instead of File since File is not available in Node.js environment
const FileSchema = z.object({
  file: z
    .instanceof(Blob)
    .refine((file) => file.size <= 10 * 1024 * 1024, {
      message: "File size should be less than 10MB",
    })
    // Accept multiple file types including images, documents, and spreadsheets
    .refine(
      (file) =>
        [
          "image/jpeg",
          "image/png",
          "application/pdf",
          "application/msword",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "application/vnd.ms-excel",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "text/csv",
        ].includes(file.type),
      {
        message: "File type should be JPEG, PNG, PDF, DOC, DOCX, XLSX, or CSV",
      }
    ),
});

export async function POST(request: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      console.error('Authentication failed - no valid session');
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log('User authenticated:', session.user.id);

    if (request.body === null) {
      return NextResponse.json({ error: "Request body is empty" }, { status: 400 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as Blob;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    console.log('File received:', {
      type: file.type,
      size: file.size,
      isBlob: file instanceof Blob
    });

    const validatedFile = FileSchema.safeParse({ file });

    if (!validatedFile.success) {
      const errorMessage = validatedFile.error.errors
        .map((error) => error.message)
        .join(", ");

      console.error('File validation failed:', errorMessage);
      return NextResponse.json({ error: errorMessage }, { status: 400 });
    }

    // Get filename from formData
    let filename = formData.get("filename") as string;

    console.log('📁 UPLOAD DEBUG: Raw filename from formData:', filename);
    console.log('📁 UPLOAD DEBUG: File type:', file.type);
    console.log('📁 UPLOAD DEBUG: File size:', file.size);

    // If no filename provided, generate one based on timestamp and content type
    if (!filename || filename === 'null' || filename === 'undefined') {
      const timestamp = Date.now();
      const extension = file.type.split('/')[1] || 'bin';
      filename = `temp_${timestamp}.${extension}`;
      console.log('📁 UPLOAD DEBUG: Generated filename:', filename);
    } else {
      console.log('📁 UPLOAD DEBUG: Using provided filename:', filename);
    }

    // Generate proper UUID for temp file (consistent with database expectations)
    const tempFileId = randomUUID();

    const responseData = {
      tempId: tempFileId,
      filename: filename,
      contentType: file.type,
      size: file.size,
      // Don't store to Supabase Storage yet - wait for client confirmation
    };

    console.log('File validated and temp ID generated:', tempFileId);
    return NextResponse.json(responseData);
  } catch (error) {
    console.error('Request processing error:', error);
    return NextResponse.json(
      {
        error: "Failed to process request",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}
