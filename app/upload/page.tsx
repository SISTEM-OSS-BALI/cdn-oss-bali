import Uploader from "../components/Uploader";


export default function Page() {
  return (
    <main className="p-6">
      <h1 className="text-xl font-semibold mb-4">Upload via Pre-signed URL</h1>
      <Uploader />
    </main>
  );
}
