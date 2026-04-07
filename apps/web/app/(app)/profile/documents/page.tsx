/**
 * /profile/documents — Phase 1 personal-document page.
 *
 * Server Component. Renders the upload form and the caller's
 * document list. Initial documents are fetched via a direct
 * Drizzle query against the authenticated user's own rows — the
 * layout above already redirected unauthenticated users to /login,
 * so ctx resolution is safe to assume here.
 *
 * Intentionally minimal UI — Phase 1 is about proving the stack,
 * not styling. Banned-term lint still applies.
 */
import { redirect } from 'next/navigation';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { db, documents } from '@part61/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { UploadForm } from './UploadForm';
import { DocumentList } from './DocumentList';

export const dynamic = 'force-dynamic';

export default async function DocumentsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const rows = await db
    .select()
    .from(documents)
    .where(and(eq(documents.userId, user.id), isNull(documents.deletedAt)))
    .orderBy(desc(documents.uploadedAt));

  // Serialize Date → ISO string for Client Component props.
  const initialDocuments = rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    storagePath: r.storagePath,
    mimeType: r.mimeType,
    byteSize: r.byteSize,
    expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
    uploadedAt: r.uploadedAt.toISOString(),
  }));

  return (
    <main style={{ padding: '1rem', maxWidth: 720 }}>
      <h1>Your documents</h1>
      <p>
        Upload a medical, pilot license, government ID, or insurance document. Files are stored
        privately and retrieved only through short-lived download links.
      </p>
      <UploadForm />
      <DocumentList initialDocuments={initialDocuments} />
    </main>
  );
}
