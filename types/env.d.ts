declare namespace NodeJS {
  interface ProcessEnv {
    S3_ENDPOINT: string;
    S3_REGION: string;
    S3_BUCKET: string;
    S3_ACCESS_KEY: string;
    S3_SECRET_KEY: string;
    S3_FORCE_PATH_STYLE?: "true" | "false";

    CDN_PUBLIC_BASE: string;

    DATABASE_URL: string;
  }
}
