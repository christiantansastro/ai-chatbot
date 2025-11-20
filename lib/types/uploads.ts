export type PendingClientFile = {
  tempId: string;
  filename: string;
  contentType: string;
  size: number;
  fileBuffer: ArrayBuffer;
};
