"use client";
import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { UploadCloud, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/use-toast";
import { admin as adminT } from "@/lib/i18n";
import type { Lang } from "@/lib/i18n";
import { MAX_UPLOAD_BYTES } from "@/lib/upload-limits";

// A bulk import is hundreds of files; listing every one turns the upload panel
// into a page-long scroll before the admin can even reach the button.
const MAX_LISTED_FILES = 8;

interface FileDropzoneProps {
  onUpload: (files: File[]) => void;
  isUploading: boolean;
  // What the upload is doing right now ("Mengupload 137 / 500"), shown on the
  // button while it runs. A 500-file import takes minutes; a button that only
  // says "Mengupload..." for that long is indistinguishable from a hung page.
  progressLabel?: string | null;
  lang?: Lang;
}

export function FileDropzone({ onUpload, isUploading, progressLabel = null, lang = "id" }: FileDropzoneProps) {
  const T = adminT[lang];
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  const onDrop = useCallback(
    (acceptedFiles: File[], rejectedFiles: { file: File; errors: readonly { message: string }[] }[]) => {
      if (rejectedFiles.length > 0) {
        rejectedFiles.forEach(({ file, errors }) => {
          const isTooLarge = errors.some((e) => e.message.includes("large") || e.message.includes("size"));
          if (isTooLarge || file.size > MAX_UPLOAD_BYTES) {
            toast({ variant: "destructive", title: T.fileTooLarge, description: `"${file.name}" ${T.fileTooLargeDesc}` });
          } else {
            toast({ variant: "destructive", title: T.formatNotSupported, description: `"${file.name}" ${T.formatNotSupportedDesc}` });
          }
        });
      }
      const validFiles = acceptedFiles.filter((f) => {
        if (f.size > MAX_UPLOAD_BYTES) {
          toast({ variant: "destructive", title: T.fileTooLarge, description: `"${f.name}" ${T.fileTooLargeDesc}` });
          return false;
        }
        return true;
      });
      if (validFiles.length > 0) setPendingFiles(validFiles);
    },
    [T]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
      "application/vnd.openxmlformats-officedocument.presentationml.presentation": [".pptx"],
    },
    maxSize: MAX_UPLOAD_BYTES,
    disabled: isUploading,
  });

  function handleUpload() {
    if (pendingFiles.length === 0) return;
    onUpload(pendingFiles);
    setPendingFiles([]);
  }

  function removeFile(name: string) {
    setPendingFiles((prev) => prev.filter((f) => f.name !== name));
  }

  return (
    <div className="space-y-3">
      <div
        {...getRootProps()}
        className={cn(
          "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors",
          isDragActive ? "border-blue-400 bg-blue-50" : "border-gray-200 hover:border-blue-300 hover:bg-gray-50",
          isUploading && "opacity-50 cursor-not-allowed"
        )}
      >
        <input {...getInputProps()} />
        <UploadCloud className={cn("mx-auto h-10 w-10 mb-3", isDragActive ? "text-blue-500" : "text-gray-300")} />
        <p className="text-sm font-medium text-gray-600">
          {isDragActive ? T.dropzoneActive : T.dropzone}
        </p>
        <p className="text-xs text-gray-400 mt-1">{T.dropzoneHint}</p>
      </div>
      {pendingFiles.length > 0 && (
        <div className="space-y-2">
          {pendingFiles.slice(0, MAX_LISTED_FILES).map((f) => (
            <div key={f.name} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm">
              <span className="truncate text-gray-700">{f.name}</span>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-gray-400">{(f.size / 1024 / 1024).toFixed(2)} MB</span>
                <button onClick={() => removeFile(f.name)} className="text-gray-400 hover:text-red-500">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
          {pendingFiles.length > MAX_LISTED_FILES && (
            <p className="text-xs text-gray-400 px-1">
              + {pendingFiles.length - MAX_LISTED_FILES} {T.moreFiles}
            </p>
          )}
          <button
            onClick={handleUpload}
            disabled={isUploading}
            className="w-full bg-blue-600 text-white text-sm rounded-lg py-2 font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {isUploading ? (progressLabel ?? T.uploading) : `${T.uploadBtn} ${pendingFiles.length} File`}
          </button>
        </div>
      )}
    </div>
  );
}
