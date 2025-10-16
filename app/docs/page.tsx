export default function DocsPage() {
  return (
    <main style={{ height: "100vh", padding: 0, margin: 0 }}>
      <iframe
        src="/swagger" // ← panggil route HTML di atas
        style={{ border: "none", width: "100%", height: "100%" }}
        title="API Docs"
      />
    </main>
  );
}
