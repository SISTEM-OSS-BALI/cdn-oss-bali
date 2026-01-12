export const runtime = "nodejs";

import { NextResponse } from "next/server";

export async function GET() {
  const spec = {
    openapi: "3.0.3",
    info: {
      title: "OSS Bali Storage API",
      version: "1.0.0",
    },
    servers: [
      { url: "/", description: "Same-origin (local/prod)" },
      {
        url: "https://storage.onestepsolutionbali.com",
        description: "Production",
      },
    ],
    security: [{ ApiKeyAuth: [] }],
    paths: {
      "/api/storage/create-upload": {
        post: {
          summary: "Buat pre-signed URL untuk upload (PUT)",
          operationId: "createUpload",
          tags: ["Storage"],
          security: [{ ApiKeyAuth: [] }], // eksplisit
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CreateUploadRequest" },
                example: {
                  mime: "image/jpeg",
                  ext: "jpg",
                  folder: "uploads",
                  isPublic: true,
                  checksum: "d4735e3a265e16eee03f59718b9b5d03…", // sha256 hex (opsional)
                  expiresIn: 60,
                },
              },
            },
          },
          responses: {
            "200": {
              description: "URL siap dipakai untuk PUT + URL publik CDN",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/CreateUploadResponse" },
                },
              },
            },
            "400": { $ref: "#/components/responses/BadRequest" },
            "401": { $ref: "#/components/responses/Unauthorized" },
            "403": { $ref: "#/components/responses/Forbidden" },
          },
        },
      },
      "/api/storage/create-download": {
        post: {
          summary: "Buat pre-signed URL (GET) untuk unduh file",
          operationId: "createDownload",
          tags: ["Storage"],
          security: [{ ApiKeyAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CreateDownloadRequest" },
                example: { key: "uploads/2025-10-16/uuid.jpg", expiresIn: 120 },
              },
            },
          },
          responses: {
            "200": {
              description: "URL sementara (GET) untuk download",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/CreateDownloadResponse",
                  },
                },
              },
            },
            "400": { $ref: "#/components/responses/BadRequest" },
            "401": { $ref: "#/components/responses/Unauthorized" },
            "403": { $ref: "#/components/responses/Forbidden" },
            "404": { $ref: "#/components/responses/NotFound" },
          },
        },
      },
      "/api/storage/confirm": {
        post: {
          summary:
            "Konfirmasi upload; ambil ETag/size via HEAD dan simpan ke DB",
          operationId: "confirmUpload",
          tags: ["Storage"],
          security: [{ ApiKeyAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ConfirmRequest" },
                example: { key: "uploads/2025-10-16/uuid.jpg" },
              },
            },
          },
          responses: {
            "200": {
              description: "Metadata tersimpan",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ConfirmResponse" },
                },
              },
            },
            "400": { $ref: "#/components/responses/BadRequest" },
            "401": { $ref: "#/components/responses/Unauthorized" },
            "403": { $ref: "#/components/responses/Forbidden" },
            "404": { $ref: "#/components/responses/NotFound" },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        // Header x-api-key (default)
        ApiKeyAuth: {
          type: "apiKey",
          in: "header",
          name: "x-api-key",
          description: "API key format: sk_live_xxx.yyy",
        },
        // Alternatif: Authorization: Bearer <key> (jika mau dukung)
        BearerAuth: { type: "http", scheme: "bearer", bearerFormat: "APIKey" },
      },
      responses: {
        BadRequest: {
          description: "Bad Request",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Error" },
            },
          },
        },
        Unauthorized: {
          description: "Unauthorized (API key hilang/tidak valid)",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Error" },
            },
          },
        },
        Forbidden: {
          description:
            "Forbidden (scope tidak cukup atau tidak berhak atas resource)",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Error" },
            },
          },
        },
        NotFound: {
          description: "Resource tidak ditemukan",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Error" },
            },
          },
        },
      },
      schemas: {
        CreateUploadRequest: {
          type: "object",
          properties: {
            mime: {
              type: "string",
              description: "MIME type file",
              example: "image/jpeg",
            },
            ext: {
              type: "string",
              description: "Ekstensi tanpa titik",
              example: "jpg",
            },
            folder: { type: "string", default: "uploads" },
            isPublic: { type: "boolean", default: true },
            checksum: {
              type: "string",
              description: "opsional: sha256 hex (64 lowercase hex)",
            },
            expiresIn: {
              type: "integer",
              default: 60,
              minimum: 10,
              maximum: 600,
            },
          },
        },
        CreateUploadResponse: {
          type: "object",
          required: ["uploadUrl", "key", "publicUrl"],
          properties: {
            uploadUrl: {
              type: "string",
              description: "Pre-signed URL (PUT) ke s3.*",
            },
            key: { type: "string", description: "Object key di bucket" },
            publicUrl: {
              type: "string",
              description: "URL publik via cdn.* (jika public)",
            },
            expiresIn: {
              type: "integer",
              description: "Masa berlaku URL upload (detik)",
            },
          },
        },
        CreateDownloadRequest: {
          type: "object",
          required: ["key"],
          properties: {
            key: {
              type: "string",
              description: "Object key",
              example: "uploads/2025-10-16/uuid.jpg",
            },
            expiresIn: {
              type: "integer",
              default: 60,
              minimum: 10,
              maximum: 600,
            },
          },
        },
        CreateDownloadResponse: {
          type: "object",
          required: ["url"],
          properties: {
            url: { type: "string", description: "Pre-signed GET URL" },
            expiresIn: {
              type: "integer",
              description: "Masa berlaku URL download (detik)",
            },
            key: { type: "string" },
          },
        },
        ConfirmRequest: {
          type: "object",
          required: ["key"],
          properties: {
            key: {
              type: "string",
              description: "Object key yang baru diupload",
            },
          },
        },
        ConfirmResponse: {
          type: "object",
          required: ["ok"],
          properties: {
            ok: { type: "boolean" },
            size: { type: "integer", nullable: true },
            etag: { type: "string", nullable: true },
            key: { type: "string" },
          },
        },
        Error: {
          type: "object",
          properties: {
            error: { type: "string" },
            code: { type: "string", nullable: true },
            detail: { type: "string", nullable: true },
          },
        },
      },
    },
    tags: [
      { name: "Storage", description: "Upload/download via pre-signed URL" },
    ],
  };

  return NextResponse.json(spec);
}
