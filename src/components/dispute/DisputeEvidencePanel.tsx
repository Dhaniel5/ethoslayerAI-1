import { useRef, useState } from "react";
import { FileText, LinkIcon, Loader2, Paperclip, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  addDisputeEvidence, evidenceSignedUrl, uploadEvidenceFile, type DisputeEvidence,
} from "@/lib/disputes";
import { useToast } from "@/hooks/use-toast";

export default function DisputeEvidencePanel({
  disputeId, evidence, canSubmit, onAdded,
}: {
  disputeId: string;
  evidence: DisputeEvidence[];
  canSubmit: boolean;
  onAdded: () => void;
}) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [link, setLink] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  const submitFile = async (file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "File too large", description: "Maximum size is 10 MB.", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const path = await uploadEvidenceFile(disputeId, file);
      await addDisputeEvidence({
        disputeId, kind: "file", fileName: file.name, storagePath: path, description: description || null,
      });
      setDescription("");
      toast({ title: "Evidence added", description: file.name });
      onAdded();
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const submitLink = async () => {
    if (!link.trim()) return;
    setBusy(true);
    try {
      await addDisputeEvidence({ disputeId, kind: "link", linkUrl: link.trim(), description: description || null });
      setLink(""); setDescription("");
      toast({ title: "Evidence added" });
      onAdded();
    } catch (e: any) {
      toast({ title: "Could not add evidence", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const openFile = async (path: string) => {
    const url = await evidenceSignedUrl(path);
    if (url) window.open(url, "_blank", "noopener");
    else toast({ title: "File unavailable", variant: "destructive" });
  };

  const roleLabel = (r: string) => (r === "buyer" ? "Client / Buyer" : r === "seller" ? "Freelancer / Seller" : "System");

  return (
    <div className="space-y-5">
      {canSubmit && (
        <div className="space-y-3 rounded-lg border border-border p-4">
          <div className="space-y-2">
            <Label htmlFor="ev-desc">Description (optional)</Label>
            <Textarea
              id="ev-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this evidence show?"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileRef} type="file" className="hidden"
              accept="image/*,application/pdf,.txt,.doc,.docx,.csv"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) submitFile(f); }}
            />
            <Button variant="outline" disabled={busy} onClick={() => fileRef.current?.click()} className="gap-1.5">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Upload file
            </Button>
          </div>
          <div className="flex gap-2">
            <Input
              value={link} onChange={(e) => setLink(e.target.value)}
              placeholder="…or paste a link (repo, doc, delivery)"
            />
            <Button variant="outline" onClick={submitLink} disabled={busy || !link.trim()} className="gap-1.5">
              <LinkIcon className="h-4 w-4" /> Add
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Files are stored privately and only visible to you, the other party, and dispute reviewers.
          </p>
        </div>
      )}

      {evidence.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">No evidence submitted yet.</p>
      ) : (
        <div className="space-y-2">
          {evidence.map((e) => (
            <div key={e.id} className="flex items-start gap-3 rounded-lg border border-border p-3">
              {e.kind === "link" ? (
                <LinkIcon className="h-4 w-4 mt-0.5 text-primary shrink-0" />
              ) : (
                <FileText className="h-4 w-4 mt-0.5 text-primary shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{e.file_name || e.link_url || "Evidence"}</p>
                {e.description && <p className="text-xs text-muted-foreground">{e.description}</p>}
                <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                  {roleLabel(e.submitted_by_role)} · {new Date(e.created_at).toLocaleString()}
                </p>
              </div>
              {e.kind === "link" && e.link_url ? (
                <Button size="sm" variant="ghost" asChild>
                  <a href={e.link_url} target="_blank" rel="noopener noreferrer">Open</a>
                </Button>
              ) : e.storage_path ? (
                <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => openFile(e.storage_path!)}>
                  <Paperclip className="h-3.5 w-3.5" /> View
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
