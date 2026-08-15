"use client";
import { useState, useRef, useMemo, Fragment } from "react";
import { admin as adminT } from "@/lib/i18n";
import type { Lang } from "@/lib/i18n";
import { FileDropzone } from "./FileDropzone";
import { GoogleDrivePicker, type DrivePickedFile } from "./GoogleDrivePicker";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2, FileText, ChevronDown, ChevronUp, Sparkles, AlertCircle, RefreshCw, Loader2 } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

export interface Document {
  id: string;
  name: string;
  status: "queued" | "processing" | "success" | "failed";
  errorMessage?: string | null;
  summary?: string | null;
  // The folder this document is filed under, or null for unfiled. Named after
  // the column rather than after the feature because that is what the API sends;
  // an individual account reads it as a folder, a company as the owning
  // department (see @/lib/db/schema).
  department?: string | null;
  expiresAt?: string | null;
  createdAt: string;
}

// What became of one file in a batch. `error` set means the file never reached
// the queue — it is the retryable half of an import.
export interface UploadOutcome {
  file: File;
  error?: string;
}

// The Drive equivalent of UploadOutcome — named by filename rather than by a
// File object, because a Drive-picked file was never bytes in the browser to
// begin with. That also means a failed Drive import can't offer the same
// resend-the-same-bytes retry as a failed manual upload; the admin re-picks
// it from Drive instead.
export interface DriveImportOutcome {
  name: string;
  error?: string;
}

export interface IndexProgress {
  remaining: number;
  // Documents this run has finished, successfully or not. Only ever grows.
  done: number;
  // The pass stopped on a provider rate limit and is sitting out a cooldown.
  waiting?: boolean;
  // Someone else is already draining this queue — another tab, or the nightly
  // cron. Not an error and not a reason to retry: the work is happening.
  busy?: boolean;
}

interface DocumentsTabProps {
  documents: Document[];
  onUpload: (files: File[], folder: string | null, onProgress: (done: number) => void) => Promise<UploadOutcome[]>;
  onIndex: (onProgress: (progress: IndexProgress) => void) => Promise<void>;
  onReindex: (documentId: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  // Moves a document between folders; null unfiles it.
  onSetFolder: (id: string, folder: string | null) => Promise<void>;
  // Only present for company accounts on Professional/Enterprise — see
  // AdminPage's gating, which mirrors the server-side check in
  // /api/admin/google-drive/import. Its absence is what hides the button,
  // not a disabled prop, so there is nothing to wire up for plans that can't
  // use it.
  onImportFromDrive?: (accessToken: string, files: DrivePickedFile[], folder: string | null) => Promise<DriveImportOutcome[]>;
  // Folders are shown for individual accounts only. The column behind them means
  // something else for a company — which department may read the document — and
  // handing an admin a "folder" control that quietly changes who can see a file
  // is the one way to turn an organising feature into an access-control bug.
  showFolders?: boolean;
  lang?: Lang;
}

const STATUS_MAP = {
  queued: { variant: "secondary" as const },
  processing: { variant: "warning" as const },
  success: { variant: "success" as const },
  failed: { variant: "destructive" as const },
};

export function DocumentsTab({ documents, onUpload, onIndex, onReindex, onDelete, onSetFolder, onImportFromDrive, showFolders = false, lang = "id" }: DocumentsTabProps) {
  const T = adminT[lang];
  const STATUS_LABELS = {
    queued: T.statusQueued,
    success: T.statusSuccess,
    processing: T.statusProcessing,
    failed: T.statusFailed,
  };
  const [isUploading, setIsUploading] = useState(false);
  // A pass driven by the "Lanjutkan" button rather than by an upload. Tracked
  // separately from isUploading so that button can disable itself: without it,
  // a second click starts a second client-side loop against the same queue.
  const [isIndexing, setIsIndexing] = useState(false);
  // The guard is a ref, not the state above: two clicks inside one frame would
  // both read the same stale `false` from state and both start a loop.
  const indexingRef = useRef(false);
  // What is happening right now, rendered as its own row under the dropzone.
  //
  // It used to be passed into FileDropzone and shown on its upload button, which
  // never worked: the dropzone clears its pending-file list the moment an upload
  // starts, and that list is what the button is rendered inside. The button —
  // and with it every "Mengupload 137 / 500" — unmounted at the exact moment it
  // had something to say. A long import looked identical to a frozen page.
  const [progress, setProgress] = useState<{ label: string; percent: number | null } | null>(null);
  // Files that never made it into the queue, kept as File objects so the retry
  // button can send the very same bytes without asking the admin to find them
  // in the file picker again.
  const [failedFiles, setFailedFiles] = useState<UploadOutcome[]>([]);
  const [isImportingDrive, setIsImportingDrive] = useState(false);
  const [driveFailed, setDriveFailed] = useState<DriveImportOutcome[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [reindexingId, setReindexingId] = useState<string | null>(null);
  const [expandedSummary, setExpandedSummary] = useState<string | null>(null);
  // The folder the next upload goes into. A free-text field with a datalist
  // rather than a picker, because typing a name that does not exist yet is how a
  // folder is created — there is nothing to create it in beforehand.
  const [uploadFolder, setUploadFolder] = useState("");
  // Which folder the list is showing. `null` is every document; the empty string
  // is the unfiled ones, which is a filter in its own right — "what have I not
  // put away yet" is the question this whole feature exists to make answerable.
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);

  // Derived from the documents rather than fetched: a folder *is* its documents
  // (see /api/folders), so the list on screen cannot go stale against the table
  // under it — moving the last document out of a folder makes the folder
  // disappear in the same render.
  const folders = useMemo(
    () => [...new Set(documents.map((d) => d.department).filter((f): f is string => !!f))]
      .sort((a, b) => a.localeCompare(b, lang === "en" ? "en" : "id")),
    [documents, lang],
  );

  // A filter can outlive the thing it filters on: move the last document out of
  // "Riset" and that folder stops existing, but the state still points at it.
  // The chip row is derived from `folders`, so the chip for it is gone too —
  // leaving the list empty, no chip highlighted, and no obvious way back.
  // Falling back to "everything" when the selection no longer exists costs a
  // comparison and removes the dead end. Same for the unfiled filter once
  // nothing is unfiled.
  const hasUnfiled = documents.some((d) => !d.department);
  const effectiveFolder =
    activeFolder === null ? null
      : activeFolder === "" ? (hasUnfiled ? "" : null)
        : folders.includes(activeFolder) ? activeFolder : null;

  const visibleDocuments = useMemo(() => {
    if (!showFolders || effectiveFolder === null) return documents;
    if (effectiveFolder === "") return documents.filter((d) => !d.department);
    return documents.filter((d) => d.department === effectiveFolder);
  }, [documents, effectiveFolder, showFolders]);

  async function handleUpload(files: File[]) {
    setIsUploading(true);
    setFailedFiles([]);
    setProgress({ label: `${T.uploadProgress} 0 / ${files.length}`, percent: 0 });
    // Read once, at the start: the field stays editable during a long import and
    // a folder renamed mid-batch would otherwise split it across two folders.
    const folder = showFolders ? uploadFolder.trim() || null : null;
    try {
      const outcomes = await onUpload(files, folder, (done) => {
        setProgress({
          label: `${T.uploadProgress} ${done} / ${files.length}`,
          percent: Math.round((done / files.length) * 100),
        });
      });

      const failed = outcomes.filter((o) => o.error);
      setFailedFiles(failed);
      const stored = outcomes.length - failed.length;

      if (stored > 0) {
        toast({ title: "Berhasil!", description: `${stored} ${T.uploadedCount} ${T.indexingContinues}` });
      }
      if (failed.length > 0) {
        toast({
          variant: "destructive",
          title: "Upload Gagal",
          // One reason in full; several would not fit, and each is listed under
          // the dropzone with its own file name anyway.
          description: failed.length === 1
            ? `"${failed[0].file.name}": ${failed[0].error}`
            : `${failed.length} dari ${outcomes.length} file gagal diupload.`,
        });
      }

      // Only worth driving the indexer if something actually reached the queue.
      if (stored > 0) await runIndexing();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan saat mengupload.";
      toast({ variant: "destructive", title: "Upload Gagal", description: msg });
    } finally {
      setProgress(null);
      setIsUploading(false);
    }
  }

  async function handleDriveFilesPicked(accessToken: string, files: DrivePickedFile[]) {
    if (!onImportFromDrive) return;
    setIsImportingDrive(true);
    setDriveFailed([]);
    // No fractional "x / N" here, unlike handleUpload — this is one atomic
    // request for the whole batch (see handleGoogleDriveImport), so there is
    // no intermediate count to report; a static "0 / N" would just be a
    // number that never moves until the whole thing finishes.
    setProgress({ label: `${T.driveImportProgress} (${files.length})`, percent: null });
    const folder = showFolders ? uploadFolder.trim() || null : null;
    try {
      const outcomes = await onImportFromDrive(accessToken, files, folder);
      const failed = outcomes.filter((o) => o.error);
      setDriveFailed(failed);
      const stored = outcomes.length - failed.length;

      if (stored > 0) {
        toast({ title: "Berhasil!", description: `${stored} ${T.uploadedCount} ${T.indexingContinues}` });
      }
      if (failed.length > 0) {
        toast({
          variant: "destructive",
          title: T.driveImportFailedTitle,
          description: failed.length === 1
            ? `"${failed[0].name}": ${failed[0].error}`
            : `${failed.length} dari ${outcomes.length} file gagal diimpor.`,
        });
      }

      if (stored > 0) await runIndexing();
    } catch (err) {
      const msg = err instanceof Error ? err.message : T.driveImportGenericError;
      toast({ variant: "destructive", title: T.driveImportFailedTitle, description: msg });
    } finally {
      setProgress(null);
      setIsImportingDrive(false);
    }
  }

  async function runIndexing() {
    // Re-entrancy guard. Two loops against one queue do not corrupt anything —
    // documents are claimed atomically server-side — but they double the request
    // rate for no gain, and the progress row would flicker between them.
    if (indexingRef.current) return;
    indexingRef.current = true;
    setIsIndexing(true);
    // The queue only ever shrinks during a pass, so the largest number seen is
    // the total this run started with — which is what turns "sisa 137" into a
    // progress bar.
    let lastRemaining = 0;
    let handedOff = false;
    try {
      await onIndex(({ remaining, done, waiting, busy }) => {
        lastRemaining = remaining;
        handedOff = !!busy;
        // Measured against the work this run has finished plus the work still
        // waiting, rather than against the queue size remembered from the first
        // pass. The old version kept the largest `remaining` it had ever seen and
        // treated it as the total, which quietly assumed the queue only shrinks —
        // and it does not: a second admin uploading mid-import, or a document
        // handed back after a rate limit, pushes `remaining` above that total and
        // sends the bar back to zero. Counting what is done cannot do that; the
        // bar slows down when work is added instead of jumping backwards.
        const scope = done + remaining;
        setProgress(
          remaining === 0 && !waiting
            ? null
            : {
                label: `${waiting ? T.indexWaiting : busy ? T.indexElsewhere : T.indexProgress} · ${remaining}`,
                percent: scope > 0 ? Math.round((done / scope) * 100) : null,
              }
        );
      });

      // Two different reasons to stop with documents still queued, and they call
      // for opposite actions from the admin. Silence would read as "it finished"
      // for both.
      if (handedOff) {
        // Nothing is wrong and nothing needs doing: another tab or the cron owns
        // the queue and is draining it. Pressing Resume again would only be told
        // the same thing.
        toast({ title: T.indexElsewhere, description: T.indexElsewhereDesc });
      } else if (lastRemaining > 0) {
        // The loop gives up after a few rate-limit cooldowns rather than keeping
        // the admin's tab busy for an hour.
        toast({ title: T.indexPaused, description: T.indexPausedDesc });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Pengindeksan gagal dijalankan.";
      toast({ variant: "destructive", title: "Indexing", description: msg });
    } finally {
      setProgress(null);
      setIsIndexing(false);
      indexingRef.current = false;
    }
  }

  async function handleRetryFailedFiles() {
    const files = failedFiles.map((o) => o.file);
    if (files.length > 0) await handleUpload(files);
  }

  async function handleReindex(id: string) {
    setReindexingId(id);
    try {
      await onReindex(id);
      toast({ title: T.reindexStarted });
      await runIndexing();
    } catch (err) {
      const msg = err instanceof Error ? err.message : T.reindexFailed;
      toast({ variant: "destructive", title: T.reindexFailed, description: msg });
    } finally {
      setReindexingId(null);
    }
  }

  const queuedCount = documents.filter((d) => d.status === "queued").length;

  async function handleMove(id: string, folder: string | null) {
    setMovingId(id);
    try {
      await onSetFolder(id, folder);
      toast({ title: T.folderMoved });
    } catch (err) {
      const msg = err instanceof Error ? err.message : T.folderMoveFailed;
      toast({ variant: "destructive", title: T.folderMoveFailed, description: msg });
    } finally {
      setMovingId(null);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await onDelete(id);
      toast({ title: "Dokumen dihapus." });
    } catch {
      toast({ variant: "destructive", title: "Gagal menghapus dokumen." });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-1">{T.uploadTitle}</h2>
        <p className="text-sm text-gray-500 mb-4">{showFolders ? T.uploadDescIndividual : T.uploadDesc}</p>
        {showFolders && (
          // Above the dropzone, not inside it: the dropzone unmounts its own
          // controls the moment an upload starts (see the note on the progress
          // row below), and a field whose value is being used cannot live in a
          // component that disappears while it is used.
          <div className="mb-3 space-y-1">
            <label htmlFor="upload-folder" className="text-sm font-medium text-gray-700">{T.folderLabel}</label>
            <input
              id="upload-folder"
              list="upload-folder-options"
              value={uploadFolder}
              onChange={(e) => setUploadFolder(e.target.value)}
              maxLength={100}
              placeholder={T.folderPlaceholder}
              disabled={isUploading}
              className="flex h-10 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 disabled:opacity-50"
            />
            {/* Existing folders are suggestions, not the only choices — the same
                field creates a new one by being typed into. */}
            <datalist id="upload-folder-options">
              {folders.map((f) => <option key={f} value={f} />)}
            </datalist>
            <p className="text-xs text-gray-400">{T.folderHint}</p>
          </div>
        )}
        <FileDropzone onUpload={handleUpload} isUploading={isUploading || isImportingDrive} lang={lang} />
        {onImportFromDrive && (
          <div className="mt-3">
            <GoogleDrivePicker
              lang={lang}
              disabled={isUploading || isImportingDrive}
              onFilesPicked={handleDriveFilesPicked}
            />
          </div>
        )}
        {progress && (
          // Its own row, outside the dropzone, so nothing about the dropzone's
          // internal state can take it off the screen.
          <div className="mt-3 rounded-xl border bg-white p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm text-gray-700">
              <Loader2 className="h-4 w-4 animate-spin text-teal-600 shrink-0" />
              <span>{progress.label}</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                className={cn(
                  "h-full rounded-full bg-teal-600 transition-all duration-300",
                  // No percentage to show yet (the first indexing pass has not
                  // reported a queue size): a full-width bar would read as
                  // "finished", so show a thin sliver that says "started".
                  progress.percent === null && "w-1/6 animate-pulse"
                )}
                style={progress.percent === null ? undefined : { width: `${progress.percent}%` }}
              />
            </div>
          </div>
        )}
        {failedFiles.length > 0 && !isUploading && (
          <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 space-y-2">
            <p className="text-sm font-medium text-red-700">
              {T.failedPanelTitle} ({failedFiles.length})
            </p>
            <ul className="space-y-1">
              {failedFiles.map(({ file, error }, i) => (
                <li key={`${file.name}-${i}`} className="text-xs text-red-700">
                  <span className="font-medium">{file.name}</span> — {error}
                </li>
              ))}
            </ul>
            <Button size="sm" variant="outline" onClick={handleRetryFailedFiles} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" />
              {T.retryFailedBtn}
            </Button>
          </div>
        )}
        {driveFailed.length > 0 && !isImportingDrive && (
          // No retry button here, unlike the manual-upload failure panel: a
          // Drive import never held onto file bytes to resend, so retrying
          // means re-opening the picker and choosing the file again.
          <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 space-y-2">
            <p className="text-sm font-medium text-red-700">
              {T.failedPanelTitle} ({driveFailed.length})
            </p>
            <ul className="space-y-1">
              {driveFailed.map(({ name, error }, i) => (
                <li key={`${name}-${i}`} className="text-xs text-red-700">
                  <span className="font-medium">{name}</span> — {error}
                </li>
              ))}
            </ul>
          </div>
        )}
        {queuedCount > 0 && !isUploading && !isIndexing && (
          // The queue survives a closed tab, so an admin coming back to a
          // half-finished import needs a way to pick it up that does not involve
          // waiting for tonight's cron.
          //
          // Hidden while a pass is already running — the progress row above is
          // showing it, and a second click would only start a redundant loop.
          <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border bg-gray-50 p-3">
            <p className="text-sm text-gray-600">
              {T.indexQueued} · {queuedCount}
            </p>
            <Button size="sm" variant="outline" onClick={() => runIndexing()} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" />
              {T.resumeIndexBtn}
            </Button>
          </div>
        )}
      </div>
      <div>
        <h2 className="text-lg font-semibold mb-3">{T.docList}</h2>
        {showFolders && folders.length > 0 && (
          // Only once there is something to filter. A row of one chip reading
          // "Semua" is a control that cannot do anything.
          <div className="mb-3 flex flex-wrap gap-2">
            {[
              { key: null, label: `${T.folderAll} (${documents.length})` },
              ...folders.map((f) => ({
                key: f,
                label: `${f} (${documents.filter((d) => d.department === f).length})`,
              })),
              // Last, and only when there is anything unfiled — on a tidy account
              // this chip would always read "(0)".
              ...(hasUnfiled
                ? [{ key: "", label: `${T.folderNone} (${documents.filter((d) => !d.department).length})` }]
                : []),
            ].map(({ key, label }) => (
              <button
                key={key ?? "__all__"}
                onClick={() => setActiveFolder(key)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  effectiveFolder === key
                    ? "border-teal-600 bg-teal-600 text-white"
                    : "border-gray-200 bg-white text-gray-600 hover:border-teal-200 hover:text-teal-700",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {documents.length === 0 ? (
          <div className="text-center py-10 text-gray-400 border rounded-xl">
            <FileText className="h-8 w-8 mx-auto mb-2" />
            <p className="text-sm">{T.noDoc}</p>
          </div>
        ) : visibleDocuments.length === 0 ? (
          // A filter that hides everything is not an empty knowledge base, and
          // saying "belum ada dokumen" here would read as one.
          <div className="text-center py-10 text-gray-400 border rounded-xl">
            <FileText className="h-8 w-8 mx-auto mb-2" />
            <p className="text-sm">{T.folderEmpty}</p>
          </div>
        ) : (
          <div className="rounded-xl border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{T.colName}</TableHead>
                  {showFolders && <TableHead>{T.colFolder}</TableHead>}
                  <TableHead>{T.colStatus}</TableHead>
                  <TableHead>{T.colDate}</TableHead>
                  <TableHead className="w-16">{T.colAction}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleDocuments.map((doc) => {
                  // Defaulted, because this maps a value that arrives from the
                  // server: a status this build has not heard of would otherwise
                  // take the whole document list down with a TypeError.
                  const s = {
                    variant: STATUS_MAP[doc.status]?.variant ?? "secondary" as const,
                    label: STATUS_LABELS[doc.status] ?? doc.status,
                  };
                  const isExpanded = expandedSummary === doc.id;
                  return (
                    <Fragment key={doc.id}>
                      <TableRow>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-gray-400 shrink-0" />
                            <span>{doc.name}</span>
                            {doc.summary && (
                              <button
                                onClick={() => setExpandedSummary(isExpanded ? null : doc.id)}
                                className="ml-1 flex items-center gap-1 text-xs text-teal-500 hover:text-teal-700"
                              >
                                <Sparkles className="h-3 w-3" />
                                {T.aiSummary}
                                {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                              </button>
                            )}
                          </div>
                        </TableCell>
                        {showFolders && (
                          <TableCell>
                            {/* Moving between folders, not creating them: a new
                                folder is made by typing its name at upload. A
                                select cannot offer a name that does not exist
                                yet, and bolting a prompt() onto it to fake one
                                would put two different interactions behind one
                                control. */}
                            <select
                              value={doc.department ?? ""}
                              disabled={movingId === doc.id}
                              onChange={(e) => handleMove(doc.id, e.target.value || null)}
                              className="max-w-[10rem] truncate rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 disabled:opacity-50"
                            >
                              <option value="">{T.folderNone}</option>
                              {/* The document's own folder is included even when
                                  `folders` is momentarily behind — a select whose
                                  value matches no option renders blank, which
                                  reads as "unfiled" for a document that is not. */}
                              {[...new Set([...folders, ...(doc.department ? [doc.department] : [])])]
                                .sort((a, b) => a.localeCompare(b, lang === "en" ? "en" : "id"))
                                .map((f) => <option key={f} value={f}>{f}</option>)}
                            </select>
                          </TableCell>
                        )}
                        <TableCell>
                          <Badge variant={s.variant}>{s.label}</Badge>
                        </TableCell>
                        <TableCell className="text-gray-500 text-sm">
                          {new Date(doc.createdAt).toLocaleDateString("id-ID")}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-gray-400 hover:text-red-500"
                            onClick={() => handleDelete(doc.id)}
                            disabled={deletingId === doc.id}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                      {doc.status === "failed" && doc.errorMessage && (
                        <TableRow>
                          <TableCell colSpan={showFolders ? 5 : 4} className="bg-red-50 border-t-0">
                            <div className="flex items-start gap-2 py-1">
                              <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                              <div className="text-sm text-red-700">{doc.errorMessage}</div>
                              {/* Offered on every failed row, including the ones
                                  whose text was never stored: the server answers
                                  for which of those can be retried, and it is the
                                  only place that knows. */}
                              <Button
                                variant="outline"
                                size="sm"
                                className="ml-auto shrink-0 gap-1.5"
                                onClick={() => handleReindex(doc.id)}
                                disabled={reindexingId === doc.id}
                              >
                                <RefreshCw className="h-3.5 w-3.5" />
                                {T.reindexBtn}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                      {isExpanded && doc.summary && (
                        <TableRow>
                          <TableCell colSpan={showFolders ? 5 : 4} className="bg-teal-50 border-t-0">
                            <div className="flex items-start gap-2 py-1">
                              <Sparkles className="h-4 w-4 text-teal-500 mt-0.5 shrink-0" />
                              <div className="text-sm text-gray-700 whitespace-pre-line">{doc.summary}</div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
