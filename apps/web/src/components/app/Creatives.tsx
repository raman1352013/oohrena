import { useRef } from "react";
import { toast } from "sonner";
import { FileText, Paperclip } from "lucide-react";
import { CREATIVE_MIME } from "@oohrena/shared";
import { assetUrl } from "@/lib/api";
import { useAddCreative, type Creative } from "@/lib/deals-api";

const kb = (n: number) =>
  n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`;

/** Artwork on a work order. Admin can add files; the assigned vendor and Admin can open them. */
export function Creatives({
  workOrderId,
  files,
  canAdd = false,
}: {
  workOrderId: string;
  files: Creative[] | undefined;
  canAdd?: boolean;
}) {
  const add = useAddCreative();
  const input = useRef<HTMLInputElement>(null);
  if (!files?.length && !canAdd) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 text-[12px]">
      {files?.map((f) => (
        <a
          key={f.fileId}
          href={assetUrl(`/api/v1/files/${f.fileId}`)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md border border-line bg-card px-2 py-1 hover:border-saffron/50"
        >
          <FileText size={13} className="text-mute" />
          <span className="max-w-48 truncate">{f.name}</span>
          <span className="text-mute">{kb(f.size)}</span>
        </a>
      ))}
      {canAdd && (
        <>
          <button
            type="button"
            disabled={add.isPending}
            onClick={() => input.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-semibold text-saffron-deep hover:bg-saffron/10 disabled:opacity-50"
          >
            <Paperclip size={13} />
            {add.isPending ? "Uploading…" : "Add creative"}
          </button>
          <input
            ref={input}
            type="file"
            hidden
            accept={CREATIVE_MIME.join(",")}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file)
                add.mutate(
                  { workOrderId, file },
                  {
                    onSuccess: () => toast.success("Creative added"),
                    onError: (err) => toast.error(err.message),
                  },
                );
            }}
          />
        </>
      )}
    </div>
  );
}
