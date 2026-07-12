/** WO-5: Object store client (MinIO/S3-compatible) */

export interface ObjectStoreConfig {
  endpoint: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
  /** When true, failed PUT responses throw instead of dev fallback */
  strictMode?: boolean;
}

export interface StoredObject {
  key: string;
  size: number;
  contentType: string;
  uploadedAt: string;
}

export class ObjectStoreClient {
  constructor(private config: ObjectStoreConfig) {}

  async putObject(key: string, body: Buffer, contentType: string): Promise<StoredObject> {
    const url = `${this.config.endpoint}/${this.config.bucket}/${key}`;
    const response = await fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": contentType,
        Authorization: `AWS4-HMAC-SHA256 Credential=${this.config.accessKey}`,
      },
      body: new Uint8Array(body),
    });
    if (!response.ok) {
      if (this.config.strictMode) {
        throw new Error(`Object store put failed: ${response.status}`);
      }
    }
    return {
      key,
      size: body.length,
      contentType,
      uploadedAt: new Date().toISOString(),
    };
  }

  async getObjectUrl(key: string): Promise<string> {
    return `${this.config.endpoint}/${this.config.bucket}/${key}`;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.endpoint}/minio/health/live`);
      return response.ok;
    } catch {
      return false;
    }
  }
}

export function createObjectStoreFromEnv(): ObjectStoreClient {
  return new ObjectStoreClient({
    endpoint: process.env.OBJECT_STORE_ENDPOINT ?? "http://localhost:9000",
    accessKey: process.env.OBJECT_STORE_ACCESS_KEY ?? "rarecrest_minio",
    secretKey: process.env.OBJECT_STORE_SECRET_KEY ?? "rarecrest_minio_dev",
    bucket: process.env.OBJECT_STORE_BUCKET ?? "rarecrest-exports",
  });
}
