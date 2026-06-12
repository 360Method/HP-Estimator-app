/**
 * SignatureCapture — the signing block shared by the customer portal's
 * approve modal and the on-site close flow's sign step: name input,
 * type-or-draw signature, terms text, and the electronic-business consent
 * checkbox. Emits onSign(name, dataUrl) once valid; surrounding context
 * (option summary, deposit callout, attestation line) stays with the caller.
 */
import { useEffect, useRef, useState } from "react";
import SignaturePad from "signature_pad";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Pen, Type } from "lucide-react";
import { toast } from "sonner";

export default function SignatureCapture({
  busy,
  submitLabel,
  onSign,
  onCancel,
}: {
  busy?: boolean;
  submitLabel: string;
  onSign: (name: string, dataUrl: string) => void;
  onCancel?: () => void;
}) {
  const [signerName, setSignerName] = useState("");
  const [sigMode, setSigMode] = useState<"type" | "draw">("type");
  const [agreed, setAgreed] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sigPadRef = useRef<SignaturePad | null>(null);

  useEffect(() => {
    if (sigMode === "draw" && canvasRef.current) {
      sigPadRef.current = new SignaturePad(canvasRef.current, { backgroundColor: "rgb(255,255,255)" });
    }
    return () => { sigPadRef.current?.off(); sigPadRef.current = null; };
  }, [sigMode]);

  const handleSubmit = () => {
    if (!signerName.trim()) { toast.error("Please enter your name"); return; }
    if (!agreed) { toast.error("Please agree to conduct business electronically"); return; }
    let signatureData: string;
    if (sigMode === "draw") {
      if (!sigPadRef.current || sigPadRef.current.isEmpty()) { toast.error("Please draw your signature"); return; }
      signatureData = sigPadRef.current.toDataURL();
    } else {
      signatureData = `typed:${signerName}`;
    }
    onSign(signerName, signatureData);
  };

  return (
    <div>
      {/* Name */}
      <Input
        placeholder="Your full name *"
        value={signerName}
        onChange={(e) => setSignerName(e.target.value)}
        className="mb-4"
      />

      {/* Signature */}
      <p className="text-sm text-gray-600 mb-2">Confirm with your signature</p>
      <div className="flex gap-2 mb-3">
        <Button size="sm" variant={sigMode === "type" ? "default" : "outline"}
          className={sigMode === "type" ? "bg-[#1a2e1a] text-white" : ""}
          onClick={() => setSigMode("type")}
        >
          <Type className="w-3.5 h-3.5 mr-1" /> Type
        </Button>
        <Button size="sm" variant={sigMode === "draw" ? "default" : "outline"}
          className={sigMode === "draw" ? "bg-[#1a2e1a] text-white" : ""}
          onClick={() => setSigMode("draw")}
        >
          <Pen className="w-3.5 h-3.5 mr-1" /> Draw
        </Button>
      </div>

      {sigMode === "type" ? (
        <div className="border border-gray-200 rounded-lg p-4 mb-4 bg-white min-h-16 flex items-end">
          <span className="text-2xl text-gray-700" style={{ fontFamily: "Dancing Script, cursive", borderBottom: "1px solid #ccc", width: "100%" }}>
            {signerName || "Your name"}
          </span>
        </div>
      ) : (
        <div className="border border-gray-200 rounded-lg mb-4 bg-white overflow-hidden">
          <canvas ref={canvasRef} width={380} height={100} className="w-full" style={{ touchAction: "none" }} />
          <button className="text-xs text-gray-400 px-3 py-1 hover:text-gray-600" onClick={() => sigPadRef.current?.clear()}>
            Clear
          </button>
        </div>
      )}

      <p className="text-xs text-gray-500 mb-3">
        By signing, you accept this estimate, its associated costs, and the{" "}
        <a href="https://handypioneers.com/terms" className="text-blue-500 underline">Terms and Conditions</a>.
        Typing or drawing your signature here has the same legal force as a written signature.
      </p>

      <label className="flex items-start gap-2 text-xs text-gray-600 mb-4 cursor-pointer">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5" />
        I agree to conduct business electronically with Handy Pioneers
      </label>

      <div className="flex gap-3 justify-end">
        {onCancel && (
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
        )}
        <Button
          className="bg-[#1a2e1a] hover:bg-[#2d4a2d] text-white font-semibold"
          disabled={busy || !signerName || !agreed}
          onClick={handleSubmit}
        >
          {busy
            ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Approving…</>
            : submitLabel}
        </Button>
      </div>
    </div>
  );
}
