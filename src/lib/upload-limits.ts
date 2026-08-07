// The ceiling on an uploaded file, in one place because three layers have to
// agree on it: the dropzone that rejects a file before it is sent, the route
// that rejects one that arrives anyway, and the copy that tells the admin the
// number. They disagreed before — all three said 10 MB — and the number was
// wrong at every layer.
//
// It is wrong because our own limit is not the binding one. A Vercel Function
// rejects any request whose body exceeds **4.5 MB** with
// `413 FUNCTION_PAYLOAD_TOO_LARGE`, and it does so at the platform edge, before
// the handler runs. So a 6 MB scanned PDF never reached the code that would
// have accepted it: the admin saw a bare "Upload gagal" with no reason, nothing
// was written to the documents table, and the server logs held no trace of it
// either. Promising 10 MB was promising something only the platform got to
// answer for.
//
// (`experimental.serverActions.bodySizeLimit: "10mb"` in next.config.ts does not
// change this. That setting governs Server Actions; uploads go through a Route
// Handler, and neither it nor any Next.js option can raise a limit enforced
// before Next.js is reached.)
//
// 4 MB rather than 4.5: multipart encoding adds a boundary, headers and the
// field name around the file's bytes, so the request body is always somewhat
// larger than the file itself. The gap is a few hundred bytes in practice; half
// a megabyte of headroom means a file that passes the dropzone is never
// rejected by the platform.
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

// For copy. Kept next to the bytes so the two can never drift apart.
export const MAX_UPLOAD_MB = MAX_UPLOAD_BYTES / 1024 / 1024;
