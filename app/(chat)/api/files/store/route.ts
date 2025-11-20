import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from '@supabase/supabase-js';

import { auth } from "@/app/(auth)/auth";
import { createFileRecord } from "@/lib/db/queries";
import { validateClientForFileStorage, extractClientNameFromQuery } from "@/lib/utils/client-validation";

const StoreFileSchema = z.object({
  tempId: z.string(),
  filename: z.string(),
  contentType: z.string(),
  size: z.number(),
  fileBuffer: z.string(), // base64 encoded file data
  clientId: z.string().optional(),
  clientName: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    console.log('📁 STORE DEBUG: Request body:', {
      hasTempId: !!body.tempId,
      hasFilename: !!body.filename,
      hasContentType: !!body.contentType,
      hasSize: !!body.size,
      hasFileBuffer: !!body.fileBuffer,
      filename: body.filename,
      contentType: body.contentType,
      size: body.size,
      bufferSize: body.fileBuffer?.length || 0
    });

    const validatedData = StoreFileSchema.safeParse(body);

    if (!validatedData.success) {
      const errorMessage = validatedData.error.errors
        .map((error) => error.message)
        .join(", ");

      console.error('📁 STORE DEBUG: Validation failed:', errorMessage);
      console.error('📁 STORE DEBUG: Validation errors:', validatedData.error.errors);

      return NextResponse.json({ error: errorMessage }, { status: 400 });
    }

    const { tempId, filename, contentType, size, fileBuffer, clientName } = validatedData.data;

    console.log('📁 STORE DEBUG: Validated data:', {
      tempId,
      filename,
      contentType,
      size,
      clientName,
      bufferLength: fileBuffer.length,
      userId: session.user.id
    });

    console.log('Storing file for user:', session.user.id, 'client:', clientName );

    // Validate client name if provided
    const requestedClientName = clientName?.trim();
    let validatedClientName: string | null = requestedClientName || null;
    let fileStatus: 'assigned' | 'temp_queue' = 'temp_queue';

    if (requestedClientName) {
      try {
        const validation = await validateClientForFileStorage(requestedClientName);

        if (!validation.isValid) {
          console.warn('Client validation failed:', validation.error);
          validatedClientName = requestedClientName;
          fileStatus = 'temp_queue';
        } else {
          const resolvedClientName = validation.clientName ?? requestedClientName;
          validatedClientName = resolvedClientName ?? null;
          fileStatus = 'assigned';
          console.log('Client validated successfully:', validatedClientName);
        }
      } catch (error) {
        console.error('Error validating client name:', error);
        return NextResponse.json({
          error: "Client validation error",
          details: error instanceof Error ? error.message : "Unknown error"
        }, { status: 500 });
      }
    }
    // If no client name provided, we'll store in temp queue
    // This allows files to be uploaded without immediate client association

    const storedClientName = validatedClientName || requestedClientName || 'Unassigned';

    // Initialize Supabase client
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Convert base64 to buffer
    console.log('📁 STORE DEBUG: Converting base64 to buffer, length:', fileBuffer.length);
    const fileBufferBinary = Buffer.from(fileBuffer, 'base64');
    console.log('📁 STORE DEBUG: Buffer converted, binary length:', fileBufferBinary.length);

    // Upload file to Supabase Storage
    console.log('📁 STORE DEBUG: Uploading to storage path: uploads/' + filename);
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('files')
      .upload(`uploads/${filename}`, fileBufferBinary, {
        contentType: contentType,
        upsert: true
      });

    if (uploadError) {
      console.error('📁 STORE DEBUG: Supabase Storage upload error:', uploadError);
      return NextResponse.json({
        error: "Failed to store file",
        details: uploadError.message
      }, { status: 500 });
    }

    console.log('📁 STORE DEBUG: Storage upload successful:', uploadData.path);

    // Get public URL for the uploaded file
    const { data: urlData } = supabase.storage
      .from('files')
      .getPublicUrl(uploadData.path);

    // Create database record with validated client name
    const fileRecord = await createFileRecord({
      id: tempId,
      clientName: storedClientName,
      status: fileStatus,
      fileName: filename,
      fileType: contentType,
      fileSize: size,
      fileUrl: urlData.publicUrl,
    });

    console.log('File stored successfully:', {
      id: fileRecord.id,
      url: urlData.publicUrl,
      clientName: validatedClientName
    });

    return NextResponse.json({
      success: true,
      fileId: fileRecord.id,
      url: urlData.publicUrl,
      pathname: uploadData.path,
      contentType: contentType,
      clientName: validatedClientName || 'Unassigned',
    });
  } catch (error) {
    console.error('File store error:', error);
    return NextResponse.json(
      {
        error: "Failed to store file",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}
