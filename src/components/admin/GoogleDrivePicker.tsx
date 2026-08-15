"use client";
import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { HardDrive, Loader2 } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import type { Lang } from "@/lib/i18n";

// Mirrors @/lib/google-drive's SUPPORTED_MIME_TYPES. Duplicated rather than
// imported because that module pulls in server-only parsers
// (unpdf/mammoth/officeparser) that have no business in a client bundle —
// this list only narrows what the Picker shows, the server route is what
// actually enforces support, so a drift here is a UX nit, not a security gap.
//
// Deliberately excludes native Google Docs/Sheets/Slides mime types
// (application/vnd.google-apps.*): Drive reports no size for them up front,
// so accepting them means downloading a full export before it's even known
// whether the result fits the size limit — a large Sheet/Doc turns one
// picked file into real wasted memory/time. See the plan doc / security
// review for the fuller reasoning. An admin who needs one of these can
// export it to PDF/DOCX/XLSX/PPTX from Drive first, then pick the export.
const PICKER_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
].join(",");

// Minimal shape of the two Google scripts this component loads at runtime —
// they attach to `window`, not to an npm package, so there is no first-party
// type for them.
declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string;
            scope: string;
            callback: (resp: { access_token?: string; error?: string }) => void;
          }): { requestAccessToken: () => void };
        };
      };
      picker: {
        PickerBuilder: new () => GooglePickerBuilder;
        DocsView: new () => GoogleDocsView;
        ViewId: { DOCS: unknown };
        Action: { PICKED: string; CANCEL: string };
        Feature: { MULTISELECT_ENABLED: string };
      };
    };
    gapi?: { load: (api: string, callback: () => void) => void };
  }
}

interface GoogleDocsView {
  setMimeTypes(mimeTypes: string): GoogleDocsView;
  setSelectFolderEnabled(enabled: boolean): GoogleDocsView;
}

// `docs` entries are typed as `unknown` fields rather than `string`, even
// though Google's own docs describe them as always present: this is a
// third-party API response, not data this codebase controls the shape of,
// and the fields are used unconditionally downstream (as an id spliced into
// a server request, as display text). See parsePickedDoc, which is what
// actually enforces the shape before anything is trusted.
interface PickerResult {
  action: string;
  docs?: { id?: unknown; name?: unknown; mimeType?: unknown }[];
}

interface GooglePickerBuilder {
  addView(view: GoogleDocsView): GooglePickerBuilder;
  setOAuthToken(token: string): GooglePickerBuilder;
  setDeveloperKey(key: string): GooglePickerBuilder;
  enableFeature(feature: string): GooglePickerBuilder;
  setCallback(cb: (result: PickerResult) => void): GooglePickerBuilder;
  build(): { setVisible(visible: boolean): void };
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Gagal memuat ${src}`));
    document.head.appendChild(script);
  });
}

export interface DrivePickedFile {
  id: string;
  mimeType: string;
  name: string;
}

// Rejects a Picker result entry that is missing any of the three fields this
// codebase actually relies on, instead of letting `undefined` flow into
// `DrivePickedFile` (typed as `string`, so nothing downstream would expect
// it) and fail somewhere less obvious — an empty id spliced into the Drive
// API URL in the import route, or "undefined" shown as a file name in a
// toast.
function parsePickedDoc(d: { id?: unknown; name?: unknown; mimeType?: unknown }): DrivePickedFile | null {
  if (typeof d.id !== "string" || d.id.length === 0) return null;
  if (typeof d.name !== "string" || d.name.length === 0) return null;
  if (typeof d.mimeType !== "string" || d.mimeType.length === 0) return null;
  return { id: d.id, name: d.name, mimeType: d.mimeType };
}

interface GoogleDrivePickerProps {
  lang?: Lang;
  disabled?: boolean;
  onFilesPicked: (accessToken: string, files: DrivePickedFile[]) => Promise<void>;
}

export function GoogleDrivePicker({ lang = "id", disabled, onFilesPicked }: GoogleDrivePickerProps) {
  const [busy, setBusy] = useState(false);
  // Guards against a double-click opening two consent popups while the
  // scripts for the first one are still loading.
  const openingRef = useRef(false);

  const handleClick = useCallback(async () => {
    if (openingRef.current) return;
    openingRef.current = true;
    setBusy(true);
    try {
      const clientId = process.env.NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID;
      const apiKey = process.env.NEXT_PUBLIC_GOOGLE_DRIVE_API_KEY;
      if (!clientId || !apiKey) {
        console.error("[GoogleDrivePicker] NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID / _API_KEY not configured");
        toast({
          variant: "destructive",
          title: lang === "en" ? "Google Drive import is not configured yet." : "Impor Google Drive belum dikonfigurasi.",
        });
        return;
      }

      await Promise.all([
        loadScript("https://accounts.google.com/gsi/client"),
        loadScript("https://apis.google.com/js/api.js"),
      ]);

      await new Promise<void>((resolve) => window.gapi!.load("picker", () => resolve()));

      const accessToken = await new Promise<string | null>((resolve) => {
        const tokenClient = window.google!.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: "https://www.googleapis.com/auth/drive.file",
          callback: (resp) => {
            // access_denied (user declined the consent screen) and
            // popup_closed_by_user (closed it) are both ordinary exits, not
            // failures worth a toast over — anything else (e.g. a
            // misconfigured OAuth client rejected by Google) is.
            if (resp.error && resp.error !== "access_denied" && resp.error !== "popup_closed_by_user") {
              console.error("[GoogleDrivePicker] token client error:", resp.error);
              toast({
                variant: "destructive",
                title: lang === "en" ? "Could not connect to Google Drive." : "Gagal terhubung ke Google Drive.",
                description: resp.error,
              });
            }
            resolve(resp.access_token ?? null);
          },
        });
        tokenClient.requestAccessToken();
      });
      if (!accessToken) return; // Consent denied or popup closed — already reported above if it was a real error.

      const { valid: picked, rawCount } = await new Promise<{ valid: DrivePickedFile[]; rawCount: number }>((resolve) => {
        const view = new window.google!.picker.DocsView()
          .setMimeTypes(PICKER_MIME_TYPES)
          // Folder import is a fast-follow (see the plan doc): picking a
          // folder's contents under the narrow `drive.file` scope needs to be
          // verified hands-on before it's relied on, so file selection only
          // for now.
          .setSelectFolderEnabled(false);
        const picker = new window.google!.picker.PickerBuilder()
          .addView(view)
          .setOAuthToken(accessToken)
          .setDeveloperKey(apiKey)
          .enableFeature(window.google!.picker.Feature.MULTISELECT_ENABLED)
          .setCallback((result) => {
            if (result.action === window.google!.picker.Action.PICKED && result.docs) {
              const valid = result.docs.map(parsePickedDoc).filter((f): f is DrivePickedFile => f !== null);
              if (valid.length < result.docs.length) {
                console.error("[GoogleDrivePicker] Picker returned malformed doc entries:", result.docs);
              }
              resolve({ valid, rawCount: result.docs.length });
            } else if (result.action === window.google!.picker.Action.CANCEL) {
              resolve({ valid: [], rawCount: 0 });
            }
          })
          .build();
        picker.setVisible(true);
      });

      if (picked.length > 0) {
        await onFilesPicked(accessToken, picked);
      } else if (rawCount > 0) {
        // Reached only if every entry Picker returned failed validation —
        // practically never (parsePickedDoc's fields are ones Google's own
        // docs say are always present), but a silently-swallowed "nothing
        // happened" is exactly the failure mode this component's error
        // handling was written to eliminate everywhere else.
        toast({
          variant: "destructive",
          title: lang === "en" ? "Google Drive returned unusable file data." : "Google Drive mengembalikan data file yang tidak bisa dipakai.",
        });
      }
    } catch (err) {
      // Covers loadScript rejecting (script blocked by an ad-blocker/CSP,
      // network failure) and gapi.load throwing — anything that isn't
      // already handled as an ordinary Google-side outcome above.
      console.error("[GoogleDrivePicker] failed to open the Drive picker:", err);
      toast({
        variant: "destructive",
        title: lang === "en" ? "Could not open Google Drive." : "Gagal membuka Google Drive.",
        description: lang === "en"
          ? "This can happen if a browser extension blocks Google's scripts. Try disabling ad/privacy blockers for this site."
          : "Ini bisa terjadi kalau ekstensi browser (ad blocker/privacy) memblokir script Google. Coba nonaktifkan untuk situs ini.",
      });
    } finally {
      openingRef.current = false;
      setBusy(false);
    }
  }, [lang, onFilesPicked]);

  return (
    <Button
      type="button"
      variant="outline"
      onClick={handleClick}
      disabled={disabled || busy}
      className="gap-1.5"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <HardDrive className="h-4 w-4" />}
      {lang === "en" ? "Import from Google Drive" : "Impor dari Google Drive"}
    </Button>
  );
}
