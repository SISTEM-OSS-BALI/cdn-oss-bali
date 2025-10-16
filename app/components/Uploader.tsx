"use client";

import { useRef, useState } from "react";

function getExt(name: string) {
  const p = name.split(".");
  return p.length > 1 ? (p.pop() as string) : "bin";
}

export default function Uploader() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [log, setLog] = useState<string>("");

  async function handleSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setLog("Minta pre-signed URL...");
    const res = await fetch("/api/storage/create-upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mime: file.type, ext: getExt(file.name) }),
    });
    if (!res.ok) {
      setLog("Gagal membuat upload URL");
      return;
    }
    const { uploadUrl, key, publicUrl } = (await res.json()) as {
      uploadUrl: string;
      key: string;
      publicUrl: string;
    };

    setLog("Upload PUT ke MinIO (s3.*)...");
    const put = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type },
      body: file,
    });
    if (!put.ok) {
      setLog(`Upload gagal: ${put.status} ${put.statusText}`);
      return;
    }

    setLog("Konfirmasi metadata...");
    await fetch("/api/storage/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    });

    setLog(`Sukses!\n${publicUrl}`);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="max-w-lg space-y-3">
      <input ref={inputRef} type="file" onChange={handleSelect} />
      <pre className="p-3 rounded border bg-gray-50 whitespace-pre-wrap text-sm">
        {log}
      </pre>
    </div>
  );
}
