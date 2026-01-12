# cdn-oss-bali (Storage Signer)

Next.js service untuk:

- **Bikin pre-signed URL upload (PUT)** ke MinIO/S3
- **Bikin pre-signed URL download (GET)**
- **Simpan metadata file** ke MySQL via Prisma

Endpoint utama:

- `POST /api/storage/create-upload` → return `{ uploadUrl, key, publicUrl }`
- `POST /api/storage/confirm` → HEAD object + update metadata (butuh API key)
- `POST /api/storage/create-download` → return `{ url }` (butuh API key)

## ENV yang wajib

```bash
DATABASE_URL=... # MySQL

S3_ENDPOINT=http://minio:9000
S3_REGION=us-east-1
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
S3_FORCE_PATH_STYLE=true
S3_BUCKET=oss

# URL publik CDN (untuk akses GET)
CDN_PUBLIC_BASE=https://s3.onestepsolutionbali.com

# Opsional (DEV only): izinkan create-upload tanpa API key
ALLOW_ANON_UPLOAD=false
```

## Buat API key

Script akan membuat `Project` (jika belum ada) dan menyimpan hash key. **Plaintext key hanya muncul sekali di output.**

```bash
DATABASE_URL='mysql://...' \
  npx tsx scripts/create-api-key.ts --project "OSS" --scopes upload,download
```

Panggil dari klien/backend:

```bash
curl -i -X POST https://storage.onestepsolutionbali.com/api/storage/create-upload \
  -H 'Content-Type: application/json' \
  -H 'x-api-key: <KEY>' \
  --data '{"mime":"application/pdf","ext":"pdf","folder":"uploads"}'
```

## Catatan penting tentang 403

Jika kamu dapat **403** dari endpoint storage:

- Pastikan API key punya scope yang sesuai (`upload` atau `download`).
- Jika kamu menggunakan `allowCIDRs`, pastikan formatnya benar (IPv4 atau CIDR). Contoh: `203.0.113.10` atau `10.0.0.0/24`.
