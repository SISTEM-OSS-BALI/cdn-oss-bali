"use client";

import { useRef, useState } from "react";

const API_KEY = process.env.NEXT_PUBLIC_STORAGE_API_KEY ?? ""; // ❗️demo only

function getExt(name: string) {
  const p = name.split(".");
  const raw = p.length > 1 ? (p.pop() as string) : "bin";
  const x = raw.replace(/^\./, "").trim().toLowerCase();
  return x.replace(/[^a-z0-9]+/g, "") || "bin";
}

// sha256 → { hex, base64 }
async function sha256(file: File) {
  const buf = await file.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", buf);
  const bytes = new Uint8Array(hash);

  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  // base64-url-safe? S3/MinIO minta base64 standar
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  const base64 = btoa(bin);
  return { hex, base64 };
}

type CreateUploadResp = {
  uploadUrl: string;
  key: string;
  publicUrl: string;
  expiresIn?: number;
};

export default function Uploader() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [log, setLog] = useState<string>("");

  async function createUpload(file: File): Promise<CreateUploadResp> {
    const { hex } = await sha256(file); // aktifkan checksum; bisa dimatikan jika tak perlu
    const res = await fetch("/api/storage/create-upload", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(API_KEY ? { "x-api-key": API_KEY } : {}),
      },
      body: JSON.stringify({
        mime: file.type || "application/octet-stream",
        ext: getExt(file.name),
        folder: "uploads",
        isPublic: true,
        checksum: hex, // route kamu akan set ChecksumSHA256 ke MinIO
        expiresIn: 60,
      }),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(
        `create-upload gagal: ${res.status} ${res.statusText}\n${txt}`
      );
    }
    return (await res.json()) as CreateUploadResp;
  }

  async function confirm(key: string) {
    const res = await fetch("/api/storage/confirm", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(API_KEY ? { "x-api-key": API_KEY } : {}),
      },
      body: JSON.stringify({ key }),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`confirm gagal: ${res.status} ${res.statusText}\n${txt}`);
    }
  }

  async function putToS3(
    uploadUrl: string,
    file: File,
    checksumBase64?: string
  ) {
    // Ketika server menandatangani dengan ChecksumSHA256,
    // request PUT harus menyertakan header `x-amz-checksum-sha256`.
    const headers: Record<string, string> = {
      "Content-Type": file.type || "application/octet-stream",
    };
    if (checksumBase64) headers["x-amz-checksum-sha256"] = checksumBase64;

    const res = await fetch(uploadUrl, { method: "PUT", headers, body: file });
    const text = await res.text().catch(() => "");
    if (!res.ok) {
      // deteksi “expired” (URL habis masa)
      const lower = `${res.status} ${res.statusText} ${text}`.toLowerCase();
      const expired =
        lower.includes("expired") ||
        lower.includes("request has expired") ||
        lower.includes("authorization header or parameters are expired") ||
        res.status === 403;

      const err: any = new Error(
        `PUT gagal: ${res.status} ${res.statusText}\n${text}`
      );
      err.expired = expired;
      throw err;
    }
  }

  async function handleSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setLog("🔑 Membuat pre-signed URL (dengan checksum)...");
      const { hex, base64 } = await sha256(file);

      let { uploadUrl, key, publicUrl } = await createUpload(file);

      setLog(
        (prev) => `${prev}\n⬆️ Upload PUT ke s3.onestepsolutionbali.com...`
      );
      try {
        await putToS3(uploadUrl, file, base64);
      } catch (err: any) {
        if (err?.expired) {
          setLog((prev) => `${prev}\n⏳ URL expired, coba refresh URL...`);
          // minta URL baru lalu retry satu kali
          const again = await createUpload(file);
          uploadUrl = again.uploadUrl;
          key = again.key; // kamu bisa pilih: pakai key lama atau baru; default: baru
          publicUrl = again.publicUrl;
          await putToS3(uploadUrl, file, base64);
        } else {
          throw err;
        }
      }

      setLog((prev) => `${prev}\n📦 Konfirmasi metadata ke server...`);
      await confirm(key);

      setLog((prev) => `${prev}\n✅ Sukses!\n${publicUrl}`);
    } catch (err: any) {
      setLog(`❌ ${err?.message || String(err)}`);
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="max-w-lg space-y-3">
      <input ref={inputRef} type="file" onChange={handleSelect} />
      <pre className="p-3 rounded border bg-gray-50 whitespace-pre-wrap text-sm min-h-24">
        {log}
      </pre>
      {!API_KEY && (
        <p className="text-xs text-amber-700">
          Peringatan: <code>NEXT_PUBLIC_STORAGE_API_KEY</code> kosong. Untuk
          demo, set variabel ini agar route mengizinkan request dari browser. Di
          produksi, panggil <code>/api/storage/*</code> dari server (bukan
          langsung client).
        </p>
      )}
    </div>
  );
}
